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

const ids = { ptA: "wpt-a", ptB: "wpt-b", s1: "wst-1", s2: "wst-2", sB: "wst-b" };
const routineDays = JSON.stringify([
  {
    title: "Piernas",
    exercises: [
      { name: "Sentadilla", sets: 3, reps: "8-10", weight: 60, note: "" },
      { name: "Hip thrust", sets: 2, reps: "12", note: "" },
    ],
  },
  { title: "Empuje", exercises: [{ name: "Press banca", sets: 3, reps: "10", weight: 40, note: "" }] },
]);

const today = async () => (await app.query("select (now() at time zone app_tz())::date::text as d")).rows[0].d as string;
const dayId = async (student: string, pos: number) =>
  (await q(student, `select d.id from routine_days d join routines r on r.id = d.routine_id where r.student_id = $1 and r.active and d.position = $2`, [student, pos])).rows[0].id as string;
const set = (reps: number | string, weight: number | string, done = true) => ({ reps, weight, done });
const save = (u: string, day: string, date: string, data: unknown) =>
  q(u, "select save_workout($1, $2::date, $3::jsonb) as id", [day, date, JSON.stringify(data)]).then((r) => r.rows[0].id as string);

async function addStudent(pt: string, id: string, email: string) {
  const t = generateToken();
  await q(pt, `insert into invitations (pt_id,email,name,token_hash,expires_at) values ($1,$2,$3,$4,now()+interval '7 days')`, [pt, email, id, hashToken(t)]);
  await app.query("select accept_invitation($1,$2,'hash')", [hashToken(t), id]);
}

beforeAll(async () => {
  await resetDb(process.env.ADMIN_DATABASE_URL!, process.env.APP_DB_PASSWORD!, process.env.AUTH_DB_PASSWORD!);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptA, "wa@pt.cl", "PT A", "h", null]);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptB, "wb@pt.cl", "PT B", "h", null]);
  await addStudent(ids.ptA, ids.s1, "w1@x.cl");
  await addStudent(ids.ptA, ids.s2, "w2@x.cl");
  await addStudent(ids.ptB, ids.sB, "wb1@x.cl");
  await q(ids.ptA, "select save_routine(null,$1,'Fuerza','',$2::jsonb)", [ids.s1, routineDays]);
  await q(ids.ptA, "select save_routine(null,$1,'Fuerza s2','',$2::jsonb)", [ids.s2, routineDays]);
});
afterAll(async () => {
  await Promise.all([admin.end(), app.end()]);
});

describe("registro de series", () => {
  it("guarda lo hecho junto con una copia de lo planificado", async () => {
    const d = await today();
    const day = await dayId(ids.s1, 1);
    await save(ids.s1, day, d, [
      { position: 1, note: "Costó la última", sets: [set(10, 60), set(10, 60), set(8, 62.5)] },
      { position: 2, note: "", sets: [set(12, "", true), set("", "", false)] },
    ]);
    const r = await q(
      ids.s1,
      `select e.position, e.name, e.planned_sets, e.planned_reps, e.planned_weight_kg::float8 as pw, e.note,
              (select jsonb_agg(jsonb_build_object('reps', st.reps, 'w', st.weight_kg::float8, 'done', st.done) order by st.set_number)
                 from workout_sets st where st.exercise_id = e.id) as sets
         from workout_exercises e join workout_sessions s on s.id = e.session_id
        where s.student_id = $1 and s.performed_on = $2::date order by e.position`,
      [ids.s1, d],
    );
    expect(r.rows[0]).toMatchObject({ name: "Sentadilla", planned_sets: 3, planned_reps: "8-10", pw: 60, note: "Costó la última" });
    expect(r.rows[0].sets[2]).toEqual({ reps: 8, w: 62.5, done: true });
    expect(r.rows[1].sets[0]).toEqual({ reps: 12, w: null, done: true });
    expect(r.rows[1].sets[1]).toEqual({ reps: null, w: null, done: false });
  });

  it("guardar de nuevo el mismo día reemplaza el registro, no lo duplica", async () => {
    const d = await today();
    const day = await dayId(ids.s1, 1);
    await save(ids.s1, day, d, [{ position: 1, note: "", sets: [set(10, 65)] }]);
    const n = await q(ids.s1, "select count(*)::int as n from workout_sessions where student_id = $1 and performed_on = $2::date", [ids.s1, d]);
    expect(n.rows[0].n).toBe(1);
    const e = await q(ids.s1, "select count(*)::int as n from workout_exercises e join workout_sessions s on s.id = e.session_id where s.student_id = $1", [ids.s1]);
    expect(e.rows[0].n).toBe(1);
  });

  it("el historial sobrevive aunque el PT cambie la rutina", async () => {
    const before = (await q(ids.s1, "select count(*)::int as n from workout_exercises e join workout_sessions s on s.id = e.session_id where s.student_id = $1", [ids.s1])).rows[0].n;
    await q(ids.ptA, "select save_routine(null,$1,'Otra rutina','',$2::jsonb)", [ids.s1, routineDays]);
    const after = (await q(ids.s1, "select count(*)::int as n from workout_exercises e join workout_sessions s on s.id = e.session_id where s.student_id = $1", [ids.s1])).rows[0].n;
    expect(after).toBe(before);
    const s = await q(ids.s1, "select routine_id from workout_sessions where student_id = $1", [ids.s1]);
    expect(s.rows[0].routine_id).not.toBeNull();
  });

  it("valida las fechas, los números y las posiciones", async () => {
    const d = await today();
    const day = await dayId(ids.s1, 2);
    const ok = [{ position: 1, note: "", sets: [set(10, 40)] }];
    expect(await code(save(ids.s1, day, "2999-01-01", ok))).toMatch(/date_invalid/);
    expect(await code(save(ids.s1, day, "2000-01-01", ok))).toMatch(/date_invalid/);
    expect(await code(save(ids.s1, day, d, [{ position: 1, note: "", sets: [set("abc", 40)] }]))).toMatch(/workout_invalid/);
    expect(await code(save(ids.s1, day, d, [{ position: 1, note: "", sets: [set(10, "1234")] }]))).toMatch(/workout_invalid/);
    expect(await code(save(ids.s1, day, d, [{ position: 1, note: "", sets: [set(10, "40.123")] }]))).toMatch(/workout_invalid/);
    expect(await code(save(ids.s1, day, d, [{ position: 9, note: "", sets: [set(10, 40)] }]))).toMatch(/workout_invalid/);
    expect(await code(save(ids.s1, day, d, [{ position: 1, note: "", sets: [] }]))).toMatch(/workout_invalid/);
    expect(await code(save(ids.s1, day, d, [{ position: 1, note: "", sets: [{ reps: 10, weight: 40 }] }]))).toMatch(/workout_invalid/);
    expect(
      await code(save(ids.s1, day, d, [{ position: 1, note: "", sets: [set(1, 1)] }, { position: 1, note: "", sets: [set(1, 1)] }])),
    ).toMatch(/workout_invalid/);
    expect(await code(save(ids.s1, day, d, ok))).toBe("ok");
  });

  it("acepta una fecha de hasta seis días atrás", async () => {
    const day = await dayId(ids.s1, 2);
    const past = (await app.query("select ((now() at time zone app_tz())::date - 3)::text as d")).rows[0].d;
    expect(await code(save(ids.s1, day, past, [{ position: 1, note: "", sets: [set(10, 40)] }]))).toBe("ok");
  });
});

describe("quién puede ver y guardar", () => {
  it("un alumno no puede registrar el día de la rutina de otro", async () => {
    const d = await today();
    const dayOfS2 = await dayId(ids.s2, 1);
    expect(await code(save(ids.s1, dayOfS2, d, [{ position: 1, note: "", sets: [set(10, 40)] }]))).toMatch(/routine_not_found/);
  });

  it("un PT no puede guardar entrenamientos (solo los alumnos)", async () => {
    const d = await today();
    const day = await dayId(ids.s1, 1);
    expect(await code(save(ids.ptA, day, d, [{ position: 1, note: "", sets: [set(10, 40)] }]))).toMatch(/not_student/);
  });

  it("no se puede escribir directo en las tablas", async () => {
    expect(await code(q(ids.s1, "insert into workout_sessions (student_id, pt_id, day_title, performed_on) values ($1,$2,'x',current_date)", [ids.s1, ids.ptA]))).toMatch(/permission denied/);
    expect(await code(q(ids.s1, "update workout_sets set reps = 99"))).toMatch(/permission denied/);
  });

  it("el alumno ve solo lo suyo y su PT ve lo de sus alumnos; otro PT no ve nada", async () => {
    const d = await today();
    await save(ids.s2, await dayId(ids.s2, 1), d, [{ position: 1, note: "", sets: [set(8, 50)] }]);
    const own = await q(ids.s1, "select distinct student_id from workout_sessions");
    expect(own.rows.map((r) => r.student_id)).toEqual([ids.s1]);
    const pt = await q(ids.ptA, "select distinct student_id from workout_sessions order by 1");
    expect(pt.rows.map((r) => r.student_id)).toEqual([ids.s1, ids.s2]);
    expect((await q(ids.ptB, "select 1 from workout_sessions")).rowCount).toBe(0);
    expect((await q(ids.ptB, "select 1 from workout_sets")).rowCount).toBe(0);
    expect((await q(ids.sB, "select 1 from workout_exercises")).rowCount).toBe(0);
  });
});
