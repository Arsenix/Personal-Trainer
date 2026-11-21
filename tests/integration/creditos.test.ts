import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { resetDb } from "../../scripts/reset-db";
import { generateToken, hashToken } from "@/lib/tokens";

/** Planes, mes activado, créditos y comprobantes, contra PostgreSQL real con el rol de la aplicación. */
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL, max: 2 });
const app = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const TZ = "America/Santiago";

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

const ids = { ptA: "cpt-a", ptB: "cpt-b", st1: "cst-1", st2: "cst-2", stB: "cst-b" };
let thisMonth = "";
let nextMonth = "";
let planA = "";
let planB = "";

/** Fecha local (YYYY-MM-DD) a `days` días desde hoy; si cae en fin de semana, pasa al lunes (el PT atiende de lunes a viernes). */
async function dayStr(days: number): Promise<string> {
  const r = await admin.query(
    `select (d + case extract(isodow from d)::int when 6 then 2 when 7 then 1 else 0 end)::text as d
       from (select (now() at time zone $1)::date + $2::int as d) x`,
    [TZ, days],
  );
  return r.rows[0].d;
}
/** Instante de una hora local en un día hábil a `days` días desde hoy (hora de Chile). */
async function inDays(days: number, hour: number): Promise<Date> {
  const r = await admin.query(`select (($1::date + make_interval(hours => $2::int)) at time zone $3) as t`, [
    await dayStr(days),
    hour,
    TZ,
  ]);
  return r.rows[0].t as Date;
}
async function monthOf(t: Date): Promise<string> {
  return (await admin.query(`select date_trunc('month', $1::timestamptz at time zone $2)::date::text as m`, [t, TZ])).rows[0].m;
}

const q = (user: string, sql: string, params: unknown[] = []) => asUser(user, (c) => c.query(sql, params));
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
};
const book = (u: string, t: Date) => q(u, "select book_class($1) as id", [t]).then((r) => r.rows[0].id as string);
const cancel = (u: string, id: string) => q(u, "select cancel_booking($1, 'x')", [id]);
const balance = async (st: string, month: string) =>
  Number((await admin.query("select coalesce(sum(delta),0) as b from credit_ledger where student_id=$1 and month=$2", [st, month])).rows[0].b);
const activate = (pt: string, st: string, month: string, plan: string) =>
  q(pt, "select activate_month($1,$2,$3) as id", [st, month, plan]);

async function addStudent(ptId: string, studentId: string, email: string) {
  const token = generateToken();
  await q(ptId, `insert into invitations (pt_id, email, name, token_hash, expires_at) values ($1,$2,$3,$4, now() + interval '7 days')`, [
    ptId, email, studentId, hashToken(token),
  ]);
  await app.query("select accept_invitation($1,$2,'hash')", [hashToken(token), studentId]);
}

beforeAll(async () => {
  await resetDb(process.env.ADMIN_DATABASE_URL!, process.env.APP_DB_PASSWORD!, process.env.AUTH_DB_PASSWORD!);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptA, "ca@pt.cl", "PT A", "h", null]);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptB, "cb@pt.cl", "PT B", "h", null]);
  await addStudent(ids.ptA, ids.st1, "c1@x.cl");
  await addStudent(ids.ptA, ids.st2, "c2@x.cl");
  await addStudent(ids.ptB, ids.stB, "cb1@x.cl");
  const m = (await admin.query(`select (date_trunc('month', now() at time zone $1))::date::text as a,
     (date_trunc('month', now() at time zone $1) + interval '1 month')::date::text as b`, [TZ])).rows[0];
  thisMonth = m.a;
  nextMonth = m.b;
  planA = (await q(ids.ptA, "select save_plan(null,'Plan 8',8,80000,true) as id")).rows[0].id;
  planB = (await q(ids.ptB, "select save_plan(null,'Plan B',4,50000,true) as id")).rows[0].id;
});

afterAll(async () => {
  await Promise.all([admin.end(), app.end()]);
});

describe("planes del PT", () => {
  it("cada PT ve solo sus planes y puede repetir nombre que otro PT", async () => {
    await q(ids.ptB, "select save_plan(null,'Plan 8',8,70000,true)");
    expect((await q(ids.ptA, "select name from plans")).rows).toHaveLength(1);
    expect((await q(ids.ptB, "select name from plans")).rows).toHaveLength(2);
    expect((await q(ids.st1, "select * from plans")).rows).toHaveLength(0);
  });

  it("valida nombre repetido, créditos y precio; un alumno no puede crear planes", async () => {
    expect(await code(q(ids.ptA, "select save_plan(null,'plan 8',4,1000,true)"))).toMatch(/plan_name_taken/);
    expect(await code(q(ids.ptA, "select save_plan(null,'X',0,1000,true)"))).toMatch(/check/);
    expect(await code(q(ids.ptA, "select save_plan(null,'X',4,-1,true)"))).toMatch(/check/);
    expect(await code(q(ids.st1, "select save_plan(null,'X',4,1000,true)"))).toMatch(/not_pt/);
    expect(await code(q(ids.ptA, "select save_plan($1,'Otro',4,1000,true)", [planB]))).toMatch(/plan_not_found/);
    expect(await code(q(ids.ptA, "insert into plans (pt_id,name,credits,price_clp) values ($1,'Z',1,1)", [ids.ptA]))).toMatch(/permission denied/);
  });
});

describe("activar el mes", () => {
  it("sin mes activado no se puede reservar", async () => {
    const t = await inDays(3, 10);
    expect(await code(book(ids.st1, t))).toMatch(/month_not_active/);
  });

  it("el PT activa el mes: copia plan y precio, carga los créditos y queda auditado", async () => {
    await activate(ids.ptA, ids.st1, thisMonth, planA);
    const m = (await q(ids.st1, "select plan_name, price_clp, credits from student_months")).rows[0];
    expect(m).toEqual({ plan_name: "Plan 8", price_clp: 80000, credits: 8 });
    expect(await balance(ids.st1, thisMonth)).toBe(8);
    const a = await admin.query("select 1 from audit_log where action='month.activated' and pt_id=$1", [ids.ptA]);
    expect(a.rowCount).toBe(1);
  });

  it("cambiar el plan después no altera lo ya activado", async () => {
    await q(ids.ptA, "select save_plan($1,'Plan 8 nuevo',12,99000,true)", [planA]);
    const m = (await q(ids.st1, "select plan_name, price_clp, credits from student_months where month=$1", [thisMonth])).rows[0];
    expect(m).toEqual({ plan_name: "Plan 8", price_clp: 80000, credits: 8 });
    await q(ids.ptA, "select save_plan($1,'Plan 8',8,80000,true)", [planA]);
  });

  it("no se activa dos veces el mismo mes, ni meses pasados o lejanos, ni planes ajenos o archivados", async () => {
    expect(await code(activate(ids.ptA, ids.st1, thisMonth, planA))).toMatch(/already_active/);
    const past = (await admin.query(`select ($1::date - interval '1 month')::date::text as d`, [thisMonth])).rows[0].d;
    const far = (await admin.query(`select ($1::date + interval '2 month')::date::text as d`, [thisMonth])).rows[0].d;
    expect(await code(activate(ids.ptA, ids.st2, past, planA))).toMatch(/month_invalid/);
    expect(await code(activate(ids.ptA, ids.st2, far, planA))).toMatch(/month_invalid/);
    expect(await code(activate(ids.ptA, ids.st2, thisMonth.replace(/-01$/, "-15"), planA))).toMatch(/month_invalid/);
    expect(await code(activate(ids.ptA, ids.st2, thisMonth, planB))).toMatch(/plan_not_found/);
    const arch = (await q(ids.ptA, "select save_plan(null,'Archivado',2,1000,false) as id")).rows[0].id;
    expect(await code(activate(ids.ptA, ids.st2, thisMonth, arch))).toMatch(/plan_not_found/);
  });

  it("un PT no activa alumnos de otro PT y un alumno no activa nada", async () => {
    expect(await code(activate(ids.ptB, ids.st1, nextMonth, planB))).toMatch(/student_not_found/);
    expect(await code(activate(ids.st1, ids.st1, nextMonth, planA))).toMatch(/not_pt/);
  });
});

describe("créditos y reservas", () => {
  let bookingId = "";

  it("reservar gasta un crédito del mes de la clase", async () => {
    const t = await inDays(5, 10);
    // La clase debe caer en el mes activado; si cruza de mes, se activa también el siguiente.
    const m = await monthOf(t);
    if (m !== thisMonth) await activate(ids.ptA, ids.st1, m, planA);
    const before = await balance(ids.st1, m);
    bookingId = await book(ids.st1, t);
    expect(await balance(ids.st1, m)).toBe(before - 1);
    const b = await admin.query("select credit_month::text as m from bookings where id=$1", [bookingId]);
    expect(b.rows[0].m).toBe(m);
  });

  it("el alumno cancela con más de 24 horas y el crédito vuelve", async () => {
    const m = (await admin.query("select credit_month::text as m from bookings where id=$1", [bookingId])).rows[0].m;
    const before = await balance(ids.st1, m);
    await cancel(ids.st1, bookingId);
    expect(await balance(ids.st1, m)).toBe(before + 1);
  });

  it("cancelar dos veces no devuelve dos créditos", async () => {
    const m = (await admin.query("select credit_month::text as m from bookings where id=$1", [bookingId])).rows[0].m;
    const before = await balance(ids.st1, m);
    expect(await code(cancel(ids.st1, bookingId))).toMatch(/booking_not_active/);
    expect(await balance(ids.st1, m)).toBe(before);
  });

  it("con menos de 24 horas no se cancela y el crédito queda consumido", async () => {
    const soon = await admin.query(`select date_trunc('hour', now()) + interval '10 hours' as t`);
    const t = soon.rows[0].t as Date;
    const m = await monthOf(t);
    // Inserta una clase próxima (<24 h) por la vía administrativa, con su movimiento de crédito.
    const loc = null;
    const b = await admin.query(
      `insert into bookings (pt_id, student_id, location_id, start_at, end_at, credit_month)
       values ($1,$2,$3,$4,$4::timestamptz + interval '1 hour',$5) returning id`,
      [ids.ptA, ids.st1, loc, t, m],
    );
    await admin.query(`insert into credit_ledger (student_id, pt_id, month, delta, reason, booking_id) values ($1,$2,$3,-1,'booking',$4)`, [ids.st1, ids.ptA, m, b.rows[0].id]);
    const before = await balance(ids.st1, m);
    expect(await code(cancel(ids.st1, b.rows[0].id))).toMatch(/too_late/);
    expect(await balance(ids.st1, m)).toBe(before);
    // Si la cancela el PT, el crédito siempre vuelve.
    await cancel(ids.ptA, b.rows[0].id);
    expect(await balance(ids.st1, m)).toBe(before + 1);
  });

  it("sin créditos no se reserva, y los créditos de un mes no sirven en otro", async () => {
    await activate(ids.ptA, ids.st2, thisMonth, (await q(ids.ptA, "select save_plan(null,'Un crédito',1,10000,true) as id")).rows[0].id);
    const t1 = await inDays(6, 9);
    const m = await monthOf(t1);
    if (m !== thisMonth) {
      // La clase cae en el mes siguiente, que no está activado para st2.
      expect(await code(book(ids.st2, t1))).toMatch(/month_not_active/);
      return;
    }
    await book(ids.st2, t1);
    expect(await code(book(ids.st2, await inDays(6, 11)))).toMatch(/no_credits/);
    expect(await balance(ids.st2, thisMonth)).toBe(0);
  });

  it("reservas simultáneas con un solo crédito: solo una pasa y el saldo nunca queda negativo", async () => {
    const plan1 = (await q(ids.ptA, "select save_plan(null,'Uno',1,5000,true) as id")).rows[0].id;
    const st = "cst-3";
    await addStudent(ids.ptA, st, "c3@x.cl");
    const t0 = await inDays(7, 12);
    const m = await monthOf(t0);
    if (m !== thisMonth) await activate(ids.ptA, st, thisMonth, plan1);
    await activate(ids.ptA, st, m === thisMonth ? thisMonth : m, plan1).catch(() => {});
    const results = await Promise.all(
      [13, 14, 15, 16, 17].map(async (h) => code(book(st, await inDays(7, h)))),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(await balance(st, m)).toBe(0);
  });

  it("al bloquear el día, las clases se cancelan y cada crédito vuelve", async () => {
    const plan = (await q(ids.ptA, "select save_plan(null,'Cuatro',4,40000,true) as id")).rows[0].id;
    const st = "cst-4";
    await addStudent(ids.ptA, st, "c4@x.cl");
    const t = await inDays(9, 8);
    const m = await monthOf(t);
    await activate(ids.ptA, st, m, plan);
    await book(st, t);
    await book(st, await inDays(9, 9));
    expect(await balance(st, m)).toBe(2);
    const d = await dayStr(9);
    const r = await q(ids.ptA, "select * from block_range($1, 0, 24, 'Vacaciones')", [d]);
    expect(r.rowCount).toBe(2);
    expect(await balance(st, m)).toBe(4);
  });

  it("el libro de créditos coincide con las clases vigentes de cada mes", async () => {
    const r = await admin.query(`
      select l.student_id, l.month,
             sum(l.delta) filter (where l.reason in ('activation','adjustment')) as cargados,
             sum(l.delta) as saldo,
             (select count(*) from bookings b where b.student_id = l.student_id and b.credit_month = l.month and b.status = 'booked') as vigentes
        from credit_ledger l group by l.student_id, l.month`);
    for (const row of r.rows) expect(Number(row.cargados) - Number(row.vigentes)).toBe(Number(row.saldo));
  });
});

describe("ajustes manuales", () => {
  it("el PT suma y resta con motivo, sin dejar el saldo negativo", async () => {
    const before = await balance(ids.st1, thisMonth);
    const r = await q(ids.ptA, "select adjust_credits($1,$2,2,'Clase de cortesía') as b", [ids.st1, thisMonth]);
    expect(r.rows[0].b).toBe(before + 2);
    expect(await code(q(ids.ptA, "select adjust_credits($1,$2,-100,'x')", [ids.st1, thisMonth]))).toMatch(/adjust_invalid/);
    expect(await code(q(ids.ptA, "select adjust_credits($1,$2,-60,'x')", [ids.st1, thisMonth]))).toMatch(/balance_negative/);
    expect(await code(q(ids.ptA, "select adjust_credits($1,$2,1,'')", [ids.st1, thisMonth]))).toMatch(/adjust_invalid/);
    expect(await code(q(ids.ptA, "select adjust_credits($1,$2,0,'x')", [ids.st1, thisMonth]))).toMatch(/adjust_invalid/);
  });

  it("no se ajusta un mes no activado ni un alumno ajeno; el alumno no puede ajustar", async () => {
    const far = (await admin.query(`select ($1::date + interval '1 month')::date::text as d`, [thisMonth])).rows[0].d;
    expect(await code(q(ids.ptA, "select adjust_credits($1,$2,1,'x')", [ids.st2, far]))).toMatch(/month_not_active/);
    expect(await code(q(ids.ptB, "select adjust_credits($1,$2,1,'x')", [ids.st1, thisMonth]))).toMatch(/student_not_found/);
    expect(await code(q(ids.st1, "select adjust_credits($1,$2,5,'x')", [ids.st1, thisMonth]))).toMatch(/not_pt/);
  });
});

describe("visibilidad y permisos", () => {
  it("cada alumno ve solo sus meses y movimientos; el PT ve los de sus alumnos; otro PT no ve nada", async () => {
    const own = await q(ids.st2, "select distinct student_id from credit_ledger");
    expect(own.rows.map((r) => r.student_id)).toEqual([ids.st2]);
    const pt = await q(ids.ptA, "select distinct student_id from student_months");
    expect(pt.rows.map((r) => r.student_id).sort()).toContain(ids.st1);
    expect((await q(ids.ptB, "select * from student_months where student_id <> $1", [ids.stB])).rowCount).toBe(0);
    expect((await q(ids.ptB, "select * from credit_ledger where student_id <> $1", [ids.stB])).rowCount).toBe(0);
  });

  it("nadie escribe directo en meses, libro ni comprobantes", async () => {
    for (const sql of [
      "insert into student_months (pt_id,student_id,month,plan_name,price_clp,credits) values ('a','b','2026-01-01','x',0,1)",
      "insert into credit_ledger (student_id,pt_id,month,delta,reason) values ('a','b','2026-01-01',5,'adjustment')",
      "update credit_ledger set delta = 99",
      "delete from credit_ledger",
      "update student_months set credits = 60",
    ]) {
      expect(await code(q(ids.ptA, sql))).toMatch(/permission denied/);
    }
  });
});

describe("comprobantes de transferencia", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d", "hex");
  const up = (u: string, month: string, name = "comp.png", mime = "image/png", data: Buffer = png) =>
    q(u, "select upload_proof($1,$2,$3,$4) as id", [month, name, mime, data]).then((r) => r.rows[0].id as string);

  it("el alumno sube un comprobante y su PT lo ve; otro PT y otros alumnos no", async () => {
    const id = await up(ids.st2, nextMonth);
    expect((await q(ids.ptA, "select id from payment_proofs where id=$1", [id])).rowCount).toBe(1);
    expect((await q(ids.st1, "select id from payment_proofs where id=$1", [id])).rowCount).toBe(0);
    expect((await q(ids.ptB, "select id from payment_proofs where id=$1", [id])).rowCount).toBe(0);
  });

  it("rechaza tipos no permitidos, archivos vacíos o sobre 5 MB, y meses fuera de rango", async () => {
    expect(await code(up(ids.st2, nextMonth, "a.exe", "application/x-msdownload"))).toMatch(/proof_invalid/);
    expect(await code(up(ids.st2, nextMonth, "a.png", "image/png", Buffer.alloc(0)))).toMatch(/proof_invalid/);
    expect(await code(up(ids.st2, nextMonth, "a.png", "image/png", Buffer.alloc(5 * 1024 * 1024 + 1)))).toMatch(/proof_invalid/);
    const far = (await admin.query(`select ($1::date + interval '3 month')::date::text as d`, [thisMonth])).rows[0].d;
    expect(await code(up(ids.st2, far))).toMatch(/month_invalid/);
    expect(await code(up(ids.ptA, nextMonth))).toMatch(/not_student/);
  });

  it("hay un máximo de comprobantes pendientes por mes", async () => {
    const st = "cst-5";
    await addStudent(ids.ptA, st, "c5@x.cl");
    for (let i = 0; i < 5; i++) await up(st, nextMonth, `c${i}.png`);
    expect(await code(up(st, nextMonth, "otro.png"))).toMatch(/too_many_proofs/);
  });

  it("al activar el mes, los comprobantes pendientes pasan a aceptados; el PT puede rechazar otros", async () => {
    const st = "cst-6";
    await addStudent(ids.ptA, st, "c6@x.cl");
    const a = await up(st, nextMonth, "a.png");
    const rej = await up(st, nextMonth, "b.png");
    await q(ids.ptA, "select reject_proof($1,'No se ve el monto')", [rej]);
    const st1 = (await q(st, "select status, note from payment_proofs where id=$1", [rej])).rows[0];
    expect(st1).toEqual({ status: "rejected", note: "No se ve el monto" });
    expect(await code(q(ids.ptA, "select reject_proof($1,'x')", [rej]))).toMatch(/proof_not_found/);
    expect(await code(q(ids.ptB, "select reject_proof($1,'x')", [a]))).toMatch(/proof_not_found/);
    await activate(ids.ptA, st, nextMonth, planA);
    expect((await q(st, "select status from payment_proofs where id=$1", [a])).rows[0].status).toBe("accepted");
  });
});
