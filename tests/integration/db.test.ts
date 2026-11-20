import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { resetDb } from "../../scripts/reset-db";
import { hashToken, generateToken } from "@/lib/tokens";

/**
 * Pruebas contra PostgreSQL real, conectándose con los mismos roles de producción:
 * ptagenda_app (sujeto a RLS) y ptagenda_auth (solo Better Auth).
 */
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL, max: 2 });
const app = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const authRole = new Pool({ connectionString: process.env.AUTH_DATABASE_URL, max: 2 });

async function asUser<T>(userId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await app.connect();
  try {
    await c.query("begin");
    if (userId) await c.query("select set_config('app.user_id', $1, true)", [userId]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const ids = { ptA: "pt-a", ptB: "pt-b", stA1: "st-a1", stA2: "st-a2", stB1: "st-b1" };
const loc: Record<string, string> = {};
const tokens: Record<string, string> = {};

async function sys(sql: string, params: unknown[] = []) {
  return app.query(sql, params);
}

async function invite(ptId: string, email: string, name: string, locationId: string | null, ttl = "7 days") {
  const token = generateToken();
  await asUser(ptId, (c) =>
    c.query(
      `insert into invitations (pt_id, email, name, location_id, token_hash, expires_at)
       values ($1, $2, $3, $4, $5, now() + $6::interval)`,
      [ptId, email, name, locationId, hashToken(token), ttl],
    ),
  );
  tokens[email] = token;
  return token;
}

beforeAll(async () => {
  await resetDb(process.env.ADMIN_DATABASE_URL!, process.env.APP_DB_PASSWORD!, process.env.AUTH_DB_PASSWORD!);

  await sys("select register_pt($1,$2,$3,$4,$5)", [ids.ptA, "a@pt.cl", "PT Alfa", "hash", null]);
  await sys("select register_pt($1,$2,$3,$4,$5)", [ids.ptB, "b@pt.cl", "PT Beta", "hash", null]);

  for (const [pt, name] of [[ids.ptA, "Gym A"], [ids.ptA, "Casa A"], [ids.ptB, "Gym B"]] as const) {
    const r = await asUser(pt, (c) =>
      c.query("insert into locations (pt_id, name, kind) values ($1,$2,'gym') returning id", [pt, name]),
    );
    loc[name] = r.rows[0].id;
  }

  await invite(ids.ptA, "a1@x.cl", "Alumno A1", loc["Gym A"]);
  await invite(ids.ptA, "a2@x.cl", "Alumno A2", null);
  await invite(ids.ptB, "b1@x.cl", "Alumno B1", loc["Gym B"]);
  await sys("select accept_invitation($1,$2,$3)", [hashToken(tokens["a1@x.cl"]), ids.stA1, "hash"]);
  await sys("select accept_invitation($1,$2,$3)", [hashToken(tokens["a2@x.cl"]), ids.stA2, "hash"]);
  await sys("select accept_invitation($1,$2,$3)", [hashToken(tokens["b1@x.cl"]), ids.stB1, "hash"]);
});

afterAll(async () => {
  await Promise.all([admin.end(), app.end(), authRole.end()]);
});

describe("aislamiento entre PT (RLS)", () => {
  it("cada PT ve solo a sus alumnos", async () => {
    const a = await asUser(ids.ptA, (c) => c.query("select user_id from students order by user_id"));
    expect(a.rows.map((r) => r.user_id)).toEqual([ids.stA1, ids.stA2]);
    const b = await asUser(ids.ptB, (c) => c.query("select user_id from students"));
    expect(b.rows.map((r) => r.user_id)).toEqual([ids.stB1]);
  });

  it("cada PT ve solo sus lugares, perfiles y usuarios relacionados", async () => {
    const l = await asUser(ids.ptA, (c) => c.query("select name from locations order by name"));
    expect(l.rows.map((r) => r.name)).toEqual(["Casa A", "Gym A"]);
    const p = await asUser(ids.ptA, (c) => c.query("select user_id from pt_profiles"));
    expect(p.rows.map((r) => r.user_id)).toEqual([ids.ptA]);
    const u = await asUser(ids.ptA, (c) => c.query('select id from "user" order by id'));
    expect(u.rows.map((r) => r.id)).toEqual([ids.ptA, ids.stA1, ids.stA2].sort());
  });

  it("sin app.user_id no se ve nada", async () => {
    for (const t of ["students", "locations", "pt_profiles", "invitations", "audit_log", '"user"']) {
      const r = await asUser(null, (c) => c.query(`select 1 from ${t}`));
      expect(r.rowCount, t).toBe(0);
    }
  });

  it("un PT no puede modificar el perfil, los lugares ni los alumnos de otro", async () => {
    const p = await asUser(ids.ptA, (c) =>
      c.query("update pt_profiles set display_name = 'hackeado' where user_id = $1", [ids.ptB]),
    );
    expect(p.rowCount).toBe(0);
    const l = await asUser(ids.ptA, (c) =>
      c.query("update locations set name = 'hackeado' where id = $1", [loc["Gym B"]]),
    );
    expect(l.rowCount).toBe(0);
    const s = await asUser(ids.ptA, (c) =>
      c.query("update students set phone = '1' where user_id = $1", [ids.stB1]),
    );
    expect(s.rowCount).toBe(0);
  });

  it("un PT no puede crear lugares ni invitaciones a nombre de otro", async () => {
    await expect(
      asUser(ids.ptA, (c) =>
        c.query("insert into locations (pt_id, name, kind) values ($1, 'Falso', 'gym')", [ids.ptB]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(ids.ptA, (c) =>
        c.query(
          "insert into invitations (pt_id, email, name, token_hash, expires_at) values ($1,'z@z.cl','Z Z','h', now())",
          [ids.ptB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("un alumno no puede asignarse un lugar de otro PT (clave foránea compuesta)", async () => {
    await expect(
      asUser(ids.ptA, (c) =>
        c.query("update students set location_id = $2 where user_id = $1", [ids.stA1, loc["Gym B"]]),
      ),
    ).rejects.toThrow(/foreign key/);
    // Y el PT puede asignar uno propio.
    const ok = await asUser(ids.ptA, (c) =>
      c.query("update students set location_id = $2 where user_id = $1", [ids.stA2, loc["Casa A"]]),
    );
    expect(ok.rowCount).toBe(1);
  });

  it("no se puede cambiar el PT de un alumno ni el rol de un usuario", async () => {
    await expect(
      asUser(ids.ptA, (c) => c.query("update students set pt_id = $2 where user_id = $1", [ids.stA1, ids.ptB])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(ids.ptA, (c) => c.query(`update "user" set role = 'pt' where id = $1`, [ids.stA1])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("alumno", () => {
  it("ve solo su fila, su PT y su lugar", async () => {
    const s = await asUser(ids.stA1, (c) => c.query("select user_id from students"));
    expect(s.rows.map((r) => r.user_id)).toEqual([ids.stA1]);
    const p = await asUser(ids.stA1, (c) => c.query("select user_id from pt_profiles"));
    expect(p.rows.map((r) => r.user_id)).toEqual([ids.ptA]);
    const l = await asUser(ids.stA1, (c) => c.query("select name from locations"));
    expect(l.rows.map((r) => r.name)).toEqual(["Gym A"]);
    const u = await asUser(ids.stA1, (c) => c.query('select id from "user" order by id'));
    expect(u.rows.map((r) => r.id)).toEqual([ids.ptA, ids.stA1].sort());
  });

  it("no ve invitaciones ni auditoría, y no puede escribir en nada", async () => {
    expect((await asUser(ids.stA1, (c) => c.query("select 1 from invitations"))).rowCount).toBe(0);
    expect((await asUser(ids.stA1, (c) => c.query("select 1 from audit_log"))).rowCount).toBe(0);
    expect(
      (await asUser(ids.stA1, (c) => c.query("update students set phone = '9' where user_id = $1", [ids.stA1])))
        .rowCount,
    ).toBe(0);
    expect(
      (await asUser(ids.stA1, (c) => c.query("update pt_profiles set display_name = 'x' where user_id = $1", [ids.ptA])))
        .rowCount,
    ).toBe(0);
    await expect(
      asUser(ids.stA1, (c) => c.query("insert into locations (pt_id, name, kind) values ($1,'X1','gym')", [ids.ptA])),
    ).rejects.toThrow(/row-level security/);
  });

  it("el alumno de un PT no ve a los de otro", async () => {
    const r = await asUser(ids.stB1, (c) => c.query("select user_id from students"));
    expect(r.rows.map((x) => x.user_id)).toEqual([ids.stB1]);
  });
});

describe("invitaciones", () => {
  it("el token no queda en claro y la vista previa dice el estado", async () => {
    const token = await invite(ids.ptA, "prev@x.cl", "Persona Previa", null);
    const stored = await admin.query("select token_hash from invitations where email = 'prev@x.cl'");
    expect(stored.rows[0].token_hash).toBe(hashToken(token));
    expect(stored.rows[0].token_hash).not.toContain(token);
    const pv = await sys("select * from invitation_preview($1)", [hashToken(token)]);
    expect(pv.rows[0]).toMatchObject({ invitee_name: "Persona Previa", pt_name: "PT Alfa", state: "valid" });
    expect((await sys("select * from invitation_preview($1)", [hashToken("nada")])).rowCount).toBe(0);
  });

  it("aceptar crea usuario, credencial y alumno una sola vez", async () => {
    const token = await invite(ids.ptA, "nuevo@x.cl", "Nuevo Alumno", loc["Gym A"]);
    await sys("select accept_invitation($1,$2,$3)", [hashToken(token), "st-nuevo", "hash-scrypt"]);
    const u = await admin.query(`select role, "emailVerified" from "user" where id = 'st-nuevo'`);
    expect(u.rows[0]).toEqual({ role: "student", emailVerified: false });
    expect((await admin.query(`select 1 from account where "userId" = 'st-nuevo' and password = 'hash-scrypt'`)).rowCount).toBe(1);
    const s = await admin.query("select pt_id, location_id from students where user_id = 'st-nuevo'");
    expect(s.rows[0]).toEqual({ pt_id: ids.ptA, location_id: loc["Gym A"] });
    await expect(sys("select accept_invitation($1,$2,$3)", [hashToken(token), "st-otra", "h"])).rejects.toThrow(
      /invitation_invalid/,
    );
    const pv = await sys("select state from invitation_preview($1)", [hashToken(token)]);
    expect(pv.rows[0].state).toBe("used");
  });

  it("rechaza invitaciones vencidas y revocadas", async () => {
    const expired = await invite(ids.ptA, "venc@x.cl", "Vencida", null, "-1 hour");
    await expect(sys("select accept_invitation($1,$2,$3)", [hashToken(expired), "st-v", "h"])).rejects.toThrow(
      /invitation_invalid/,
    );
    expect((await sys("select state from invitation_preview($1)", [hashToken(expired)])).rows[0].state).toBe("expired");

    const revoked = await invite(ids.ptA, "rev@x.cl", "Revocada", null);
    await asUser(ids.ptA, (c) => c.query("update invitations set revoked_at = now() where email = 'rev@x.cl'"));
    await expect(sys("select accept_invitation($1,$2,$3)", [hashToken(revoked), "st-r", "h"])).rejects.toThrow(
      /invitation_invalid/,
    );
  });

  it("no crea una segunda cuenta con un correo que ya existe (sin distinguir mayúsculas)", async () => {
    const token = await invite(ids.ptA, "Repetido@X.cl", "Repetido", null);
    await sys("select register_pt($1,$2,$3,$4,$5)", ["pt-rep", "repetido@x.cl", "Otro PT", "h", null]).catch(() => {});
    await expect(sys("select accept_invitation($1,$2,$3)", [hashToken(token), "st-rep", "h"])).rejects.toThrow(
      /email_taken/,
    );
    expect((await sys("select email_in_use($1) as u", ["REPETIDO@x.CL"])).rows[0].u).toBe(true);
    expect((await sys("select email_in_use($1) as u", ["libre@x.cl"])).rows[0].u).toBe(false);
  });

  it("solo puede haber una invitación pendiente por PT y correo", async () => {
    await invite(ids.ptB, "dup@x.cl", "Dup Uno", null);
    await expect(invite(ids.ptB, "DUP@x.cl", "Dup Dos", null)).rejects.toThrow(/invitations_pending_key|duplicate/);
  });

  it("un PT no ve las invitaciones de otro", async () => {
    const r = await asUser(ids.ptB, (c) => c.query("select email from invitations"));
    expect(r.rows.every((x) => !["a1@x.cl", "prev@x.cl"].includes(x.email))).toBe(true);
  });

  it("no se puede registrar un PT con un correo ya usado", async () => {
    await expect(sys("select register_pt($1,$2,$3,$4,$5)", ["pt-dup", "A@PT.CL", "Dup", "h", null])).rejects.toMatchObject({
      code: "23505",
    });
  });
});

describe("auditoría", () => {
  it("es append-only: ni UPDATE, ni DELETE, ni TRUNCATE, ni siquiera como dueño", async () => {
    await expect(admin.query("update audit_log set action = 'x'")).rejects.toThrow(/solo lectura/);
    await expect(admin.query("delete from audit_log")).rejects.toThrow(/solo lectura/);
    await expect(admin.query("truncate audit_log")).rejects.toThrow(/solo lectura/);
  });

  it("la aplicación no puede insertar directo, solo con log_audit", async () => {
    await expect(
      asUser(ids.ptA, (c) => c.query("insert into audit_log (action) values ('falso')")),
    ).rejects.toThrow(/permission denied/);
    await asUser(ids.ptA, (c) => c.query("select log_audit($1,'prueba','x','1','{}'::jsonb)", [ids.ptA]));
    const r = await asUser(ids.ptA, (c) => c.query("select actor_role, pt_id from audit_log where action = 'prueba'"));
    expect(r.rows[0]).toEqual({ actor_role: "pt", pt_id: ids.ptA });
  });

  it("el PT ve su ámbito (incluye a sus alumnos) y no el de otro PT", async () => {
    const a = await asUser(ids.ptA, (c) => c.query("select distinct pt_id from audit_log"));
    expect(a.rows.map((r) => r.pt_id)).toEqual([ids.ptA]);
    const joined = await asUser(ids.ptA, (c) => c.query("select actor_id from audit_log where action = 'student.joined'"));
    expect(joined.rows.map((r) => r.actor_id)).toContain(ids.stA1);
    expect(joined.rows.map((r) => r.actor_id)).not.toContain(ids.stB1);
  });

  it("el alta de PT y de alumno quedan registradas", async () => {
    const r = await admin.query("select action from audit_log where action in ('pt.registered','student.joined')");
    expect(r.rowCount).toBeGreaterThanOrEqual(5);
  });
});

describe("rol de Better Auth", () => {
  it("lee usuarios y sesiones, pero no toca datos de la aplicación", async () => {
    expect((await authRole.query(`select id from "user" where id = $1`, [ids.ptA])).rowCount).toBe(1);
    await expect(authRole.query("select * from students")).rejects.toThrow(/permission denied/);
    await expect(authRole.query("select * from audit_log")).rejects.toThrow(/permission denied/);
    await expect(authRole.query(`update "user" set role = 'pt' where id = $1`, [ids.stA1])).rejects.toThrow(/permission denied/);
    await expect(authRole.query(`insert into "user" (id,name,email,role) values ('x','x','x@x.cl','pt')`)).rejects.toThrow(
      /permission denied/,
    );
    const upd = await authRole.query(`update "user" set "emailVerified" = true where id = $1`, [ids.ptA]);
    expect(upd.rowCount).toBe(1);
  });

  it("las sesiones se borran al borrar el usuario", async () => {
    await authRole.query(
      `insert into session (id, "expiresAt", token, "userId") values ('s1', now() + interval '1 day', 'tok-1', $1)`,
      [ids.stA2],
    );
    await admin.query(`delete from "user" where id = $1`, [ids.stA2]);
    expect((await admin.query("select 1 from session where id = 's1'")).rowCount).toBe(0);
    expect((await admin.query("select 1 from students where user_id = $1", [ids.stA2])).rowCount).toBe(0);
  });
});
