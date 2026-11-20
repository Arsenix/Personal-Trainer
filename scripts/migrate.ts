/**
 * Aplica las migraciones de db/migrations con el rol dueño (admin).
 *
 *   ADMIN_DATABASE_URL  conexión del dueño de la base (crea tablas y roles)
 *   APP_DB_PASSWORD     clave del rol ptagenda_app (usado por la aplicación)
 *   AUTH_DB_PASSWORD    clave del rol ptagenda_auth (usado por Better Auth)
 *
 * Es idempotente: solo aplica las migraciones que faltan.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export async function migrate(opts?: {
  adminUrl?: string;
  appPassword?: string;
  authPassword?: string;
  quiet?: boolean;
}) {
  const adminUrl = opts?.adminUrl ?? process.env.ADMIN_DATABASE_URL;
  const appPassword = opts?.appPassword ?? process.env.APP_DB_PASSWORD;
  const authPassword = opts?.authPassword ?? process.env.AUTH_DB_PASSWORD;
  if (!adminUrl || !appPassword || !authPassword) {
    throw new Error("Faltan ADMIN_DATABASE_URL, APP_DB_PASSWORD o AUTH_DB_PASSWORD");
  }
  const log = (m: string) => {
    if (!opts?.quiet) console.log(m);
  };

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // Los roles son del cluster: se crean una vez y luego solo se actualiza la clave.
    for (const [role, password] of [
      ["ptagenda_app", appPassword],
      ["ptagenda_auth", authPassword],
    ] as const) {
      const exists = await client.query("select 1 from pg_roles where rolname = $1", [role]);
      const pw = await client.query("select quote_literal($1) as q", [password]);
      const sql = exists.rowCount
        ? `alter role ${role} login nosuperuser nobypassrls password ${pw.rows[0].q}`
        : `create role ${role} login nosuperuser nobypassrls password ${pw.rows[0].q}`;
      await client.query(sql);
    }
    const db = (await client.query("select current_database() as d")).rows[0].d as string;
    await client.query(`grant connect on database "${db}" to ptagenda_app, ptagenda_auth`);
    await client.query("grant usage on schema public to ptagenda_app, ptagenda_auth");

    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set(
      (await client.query("select name from schema_migrations")).rows.map((r) => r.name as string),
    );
    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      log(`Aplicando ${file}…`);
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, file), "utf8"));
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
    log("Migraciones al día.");
  } finally {
    await client.end();
  }
}

// Ejecución directa: pnpm db:migrate
if (process.argv[1] && /migrate\.ts$/.test(process.argv[1])) {
  import("dotenv").then(({ config }) => {
    config({ path: ".env.local" });
    config();
    migrate().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  });
}
