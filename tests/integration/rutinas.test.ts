import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { resetDb } from "../../scripts/reset-db";
import { generateToken, hashToken } from "@/lib/tokens";

const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL, max: 2 });
const app = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await app.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
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
const q = (u: string, sql: string, p: unknown[] = []) => asUser(u, (c) => c.query(sql, p));
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
};

const ids = { ptA: "rpt-a", ptB: "rpt-b", s1: "rst-1", s2: "rst-2", sB: "rst-b" };
const days = (n = 2) =>
  JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      title: `Día ${i + 1}`,
      exercises: [
        { name: "Sentadilla", sets: 4, reps: "8-10", note: "Pausa abajo" },
        { name: "Press banca", sets: 3, reps: "10", note: "" },
      ],
    })),
  );
const save = (u: string, id: string | null, stu: string, name: string, d = days(), notes = "") =>
  q(u, "select save_routine($1,$2,$3,$4,$5::jsonb) as id", [id, stu, name, notes, d]).then((r) => r.rows[0].id as string);

async function addStudent(pt: string, id: string, email: string) {
  const t = generateToken();
  await q(pt, `insert into invitations (pt_id,email,name,token_hash,expires_at) values ($1,$2,$3,$4,now()+interval '7 days')`, [pt, email, id, hashToken(t)]);
  await app.query("select accept_invitation($1,$2,'hash')", [hashToken(t), id]);
}

beforeAll(async () => {
  await resetDb(process.env.ADMIN_DATABASE_URL!, process.env.APP_DB_PASSWORD!, process.env.AUTH_DB_PASSWORD!);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptA, "ra@pt.cl", "PT A", "h", null]);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptB, "rb@pt.cl", "PT B", "h", null]);
  await addStudent(ids.ptA, ids.s1, "r1@x.cl");
  await addStudent(ids.ptA, ids.s2, "r2@x.cl");
  await addStudent(ids.ptB, ids.sB, "rb1@x.cl");
});
afterAll(async () => {
  await Promise.all([admin.end(), app.end()]);
});

describe("crear y editar rutinas", () => {
  let id = "";
  it("el PT crea una rutina con días y ejercicios en orden", async () => {
    id = await save(ids.ptA, null, ids.s1, "Fuerza 4 semanas", days(2), "Calentar 10 min");
    const r = await q(ids.ptA, `select d.position as dp, d.title, e.position as ep, e.name, e.sets, e.reps, e.note
      from routine_days d join routine_exercises e on e.day_id = d.id where d.routine_id = $1 order by d.position, e.position`, [id]);
    expect(r.rowCount).toBe(4);
    expect(r.rows[0]).toMatchObject({ dp: 1, title: "Día 1", ep: 1, name: "Sentadilla", sets: 4, reps: "8-10", note: "Pausa abajo" });
    expect(r.rows[1]).toMatchObject({ ep: 2, name: "Press banca", note: null });
    expect(r.rows[2].dp).toBe(2);
  });

  it("editar reemplaza el contenido completo y deja auditoría", async () => {
    await save(ids.ptA, id, ids.s1, "Fuerza 6 semanas", days(1));
    const r = await q(ids.ptA, "select name from routines where id=$1", [id]);
    expect(r.rows[0].name).toBe("Fuerza 6 semanas");
    expect((await q(ids.ptA, "select 1 from routine_days where routine_id=$1", [id])).rowCount).toBe(1);
    const a = await admin.query("select action from audit_log where entity='routine' order by id");
    expect(a.rows.map((x) => x.action)).toEqual(["routine.created", "routine.updated"]);
  });

  it("una rutina nueva archiva la anterior: solo una activa por alumno", async () => {
    const id2 = await save(ids.ptA, null, ids.s1, "Hipertrofia");
    const act = await admin.query("select id from routines where student_id=$1 and active", [ids.s1]);
    expect(act.rows.map((x) => x.id)).toEqual([id2]);
    // Reactivar la primera archiva la segunda.
    await q(ids.ptA, "select set_routine_active($1, true)", [id]);
    const act2 = await admin.query("select id from routines where student_id=$1 and active", [ids.s1]);
    expect(act2.rows.map((x) => x.id)).toEqual([id]);
    await q(ids.ptA, "select set_routine_active($1, false)", [id]);
    expect((await admin.query("select 1 from routines where student_id=$1 and active", [ids.s1])).rowCount).toBe(0);
    await q(ids.ptA, "select set_routine_active($1, true)", [id2]);
  });

  it("guarda el peso de cada ejercicio, acepta vacío y lo conserva al copiar", async () => {
    const d = JSON.stringify([
      {
        title: "Peso",
        exercises: [
          { name: "Hip thrust", sets: 4, reps: "8", weight: 62.5, note: "" },
          { name: "Plancha", sets: 3, reps: "40 s", weight: null, note: "" },
          { name: "Remo con barra", sets: 3, reps: "10", weight: "", note: "" },
          { name: "Peso muerto", sets: 3, reps: "5", weight: "100", note: "" },
        ],
      },
    ]);
    // Alumnos propios de esta prueba, para no alterar lo que revisan las demás.
    await addStudent(ids.ptA, "rst-w1", "w1@x.cl");
    await addStudent(ids.ptA, "rst-w2", "w2@x.cl");
    const id = await save(ids.ptA, null, "rst-w1", "Con pesos", d);
    const rows = async (rid: string) =>
      (await admin.query("select name, weight_kg::float8 as w from routine_exercises where routine_id=$1 order by position", [rid])).rows;
    expect(await rows(id)).toEqual([
      { name: "Hip thrust", w: 62.5 },
      { name: "Plancha", w: null },
      { name: "Remo con barra", w: null },
      { name: "Peso muerto", w: 100 },
    ]);
    const copy = (await q(ids.ptA, "select copy_routine($1,$2) as id", [id, "rst-w2"])).rows[0].id;
    expect((await rows(copy)).map((r) => r.w)).toEqual([62.5, null, null, 100]);
    await admin.query("delete from routines where student_id in ('rst-w1','rst-w2')");
  });

  it("rechaza pesos negativos, con letras, con tres decimales o de más de 999,99 kg", async () => {
    const bad = async (weight: unknown) =>
      code(save(ids.ptA, null, ids.s2, "Peso malo", JSON.stringify([{ title: "A", exercises: [{ name: "X", sets: 3, reps: "10", weight, note: "" }] }])));
    for (const w of [-5, "-5", "abc", "62,5", 62.555, 1000, "1000"]) {
      expect(await bad(w)).toMatch(/routine_invalid/);
    }
  });

  it("valida nombre, días, ejercicios, series y largos", async () => {
    const bad = async (d: unknown, name = "Ok") => code(save(ids.ptA, null, ids.s2, name, JSON.stringify(d)));
    const ex = { name: "X", sets: 3, reps: "10", note: "" };
    expect(await bad([])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [] }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "", exercises: [ex] }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [{ ...ex, sets: 0 }] }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [{ ...ex, sets: 21 }] }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [{ ...ex, sets: "abc" }] }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [{ ...ex, reps: "" }] }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [{ ...ex, name: "x".repeat(81) }] }])).toMatch(/routine_invalid/);
    expect(await bad(Array.from({ length: 8 }, () => ({ title: "A", exercises: [ex] })))).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: Array.from({ length: 21 }, () => ex) }])).toMatch(/routine_invalid/);
    expect(await bad([{ title: "A", exercises: [ex] }], "   ")).toMatch(/routine_invalid/);
    expect(await code(q(ids.ptA, "select save_routine(null,$1,'X','', '{\"a\":1}'::jsonb)", [ids.s2]))).toMatch(/routine_invalid/);
    // Nada se guardó por los intentos fallidos.
    expect((await admin.query("select 1 from routines where student_id=$1", [ids.s2])).rowCount).toBe(0);
  });
});

describe("permisos y visibilidad", () => {
  it("un PT no crea ni toca rutinas de alumnos o rutinas de otro PT; un alumno no puede crear", async () => {
    expect(await code(save(ids.ptB, null, ids.s1, "Intruso"))).toMatch(/student_not_found/);
    const mine = (await admin.query("select id from routines where student_id=$1 and active", [ids.s1])).rows[0].id;
    expect(await code(save(ids.ptB, mine, ids.s1, "Robo"))).toMatch(/routine_not_found/);
    expect(await code(q(ids.ptB, "select set_routine_active($1,false)", [mine]))).toMatch(/routine_not_found/);
    expect(await code(q(ids.ptB, "select copy_routine($1,$2)", [mine, ids.sB]))).toMatch(/routine_not_found/);
    expect(await code(save(ids.s1, null, ids.s1, "Yo mismo"))).toMatch(/not_pt/);
  });

  it("el alumno ve solo su rutina activa (con días y ejercicios); el otro PT no ve nada", async () => {
    const own = await q(ids.s1, "select id, active from routines");
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].active).toBe(true);
    expect((await q(ids.s1, "select * from routine_exercises")).rowCount).toBeGreaterThan(0);
    expect((await q(ids.s2, "select * from routines")).rowCount).toBe(0);
    expect((await q(ids.ptB, "select * from routines")).rowCount).toBe(0);
    expect((await q(ids.ptB, "select * from routine_exercises")).rowCount).toBe(0);
    // Las archivadas las ve el PT pero no el alumno.
    expect((await q(ids.ptA, "select * from routines")).rowCount).toBeGreaterThan(1);
  });

  it("nadie escribe directo en las tablas de rutinas", async () => {
    for (const sql of [
      "insert into routines (pt_id,student_id,name) values ('a','b','x')",
      "update routines set name='x'",
      "delete from routine_days",
      "update routine_exercises set sets=20",
    ]) {
      expect(await code(q(ids.ptA, sql))).toMatch(/permission denied/);
    }
  });
});

describe("copiar rutinas", () => {
  it("el PT copia una rutina a otro de sus alumnos; no a alumnos de otro PT", async () => {
    const src = (await admin.query("select id from routines where student_id=$1 and active", [ids.s1])).rows[0].id;
    const copy = (await q(ids.ptA, "select copy_routine($1,$2) as id", [src, ids.s2])).rows[0].id;
    const a = await admin.query("select count(*)::int as n from routine_exercises where routine_id=$1", [copy]);
    const b = await admin.query("select count(*)::int as n from routine_exercises where routine_id=$1", [src]);
    expect(a.rows[0].n).toBe(b.rows[0].n);
    expect((await admin.query("select 1 from routines where student_id=$1 and active", [ids.s2])).rowCount).toBe(1);
    expect(await code(q(ids.ptA, "select copy_routine($1,$2)", [src, ids.sB]))).toMatch(/student_not_found/);
  });
});
