import { Pool, type PoolClient } from "pg";

/**
 * Dos pools, dos roles de Postgres:
 *  - appPool  (ptagenda_app):  la aplicación, siempre bajo Row Level Security.
 *  - authPool (ptagenda_auth): solo Better Auth, sobre sus propias tablas.
 */
const g = globalThis as unknown as { __ptAppPool?: Pool; __ptAuthPool?: Pool };

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export function appPool(): Pool {
  g.__ptAppPool ??= new Pool({ connectionString: required("DATABASE_URL"), max: 10 });
  return g.__ptAppPool;
}

export function authPool(): Pool {
  g.__ptAuthPool ??= new Pool({ connectionString: required("AUTH_DATABASE_URL"), max: 5 });
  return g.__ptAuthPool;
}

/** Ejecuta `fn` en una transacción como el usuario dado: Postgres aplica RLS con app.user_id. */
export async function withUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Transacción sin usuario: solo para funciones SECURITY DEFINER (registro, invitaciones). */
export async function withSystem<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function audit(
  c: PoolClient,
  actorId: string,
  action: string,
  entity?: string,
  entityId?: string,
  meta: Record<string, unknown> = {},
) {
  await c.query("select log_audit($1, $2, $3, $4, $5::jsonb)", [
    actorId,
    action,
    entity ?? null,
    entityId ?? null,
    JSON.stringify(meta),
  ]);
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
