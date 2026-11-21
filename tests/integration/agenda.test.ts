import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { resetDb } from "../../scripts/reset-db";
import { generateToken, hashToken } from "@/lib/tokens";

/**
 * Disponibilidad, bloqueos y reservas, contra PostgreSQL real con el rol de la aplicación.
 * Todas las fechas se calculan a partir de "ahora" para que la prueba no caduque.
 */
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL, max: 2 });
const app = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
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

const ids = { ptA: "pt-a", ptB: "pt-b", stA1: "st-a1", stA2: "st-a2", stB1: "st-b1" };
let nextMonday = ""; // fecha local (YYYY-MM-DD) del lunes de la próxima semana
let locA = "";

/** Instante (timestamptz) de una hora local: lunes de la próxima semana + dayOffset días, a las `hour`. */
async function slot(dayOffset: number, hour: number): Promise<Date> {
  const r = await admin.query(
    `select (($1::date + $2::int) + make_interval(hours => $3::int)) at time zone $4 as t`,
    [nextMonday, dayOffset, hour, TZ],
  );
  return r.rows[0].t as Date;
}

const book = (user: string, start: Date) =>
  asUser(user, (c) => c.query("select book_class($1) as id", [start]).then((r) => r.rows[0].id as string));
const cancel = (user: string, id: string, reason?: string) =>
  asUser(user, (c) => c.query("select cancel_booking($1, $2) as s", [id, reason ?? null]).then((r) => r.rows[0].s as string));

async function acceptStudent(ptId: string, studentId: string, email: string, locationId: string | null) {
  const token = generateToken();
  await asUser(ptId, (c) =>
    c.query(
      `insert into invitations (pt_id, email, name, location_id, token_hash, expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '7 days')`,
      [ptId, email, `Alumno ${studentId}`, locationId, hashToken(token)],
    ),
  );
  await app.query("select accept_invitation($1, $2, 'hash')", [hashToken(token), studentId]);
}

beforeAll(async () => {
  await resetDb(process.env.ADMIN_DATABASE_URL!, process.env.APP_DB_PASSWORD!, process.env.AUTH_DB_PASSWORD!);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptA, "a@pt.cl", "PT Alfa", "h", null]);
  await app.query("select register_pt($1,$2,$3,$4,$5)", [ids.ptB, "b@pt.cl", "PT Beta", "h", null]);
  locA = (
    await asUser(ids.ptA, (c) =>
      c.query("insert into locations (pt_id, name, kind) values ($1,'Gym A','gym') returning id", [ids.ptA]),
    )
  ).rows[0].id;
  await acceptStudent(ids.ptA, ids.stA1, "a1@x.cl", locA);
  await acceptStudent(ids.ptA, ids.stA2, "a2@x.cl", null);
  await acceptStudent(ids.ptB, ids.stB1, "b1@x.cl", null);
  nextMonday = (
    await admin.query(`select (date_trunc('week', now() at time zone $1) + interval '7 days')::date::text as d`, [TZ])
  ).rows[0].d;
  // Estas pruebas son de agenda, no de créditos: todos los alumnos parten con créditos de sobra en los
  // meses que alcanza el horizonte de reserva (los créditos se prueban en creditos.test.ts).
  for (const [pt, st] of [
    [ids.ptA, ids.stA1],
    [ids.ptA, ids.stA2],
    [ids.ptB, ids.stB1],
  ]) {
    for (const k of [0, 1, 2]) {
      const m = (
        await admin.query(
          `select (date_trunc('month', now() at time zone $1) + make_interval(months => $2))::date::text as m`,
          [TZ, k],
        )
      ).rows[0].m;
      await admin.query(
        `insert into student_months (pt_id, student_id, month, plan_name, price_clp, credits) values ($1,$2,$3,'Prueba',0,60)`,
        [pt, st, m],
      );
      await admin.query(
        `insert into credit_ledger (student_id, pt_id, month, delta, reason) values ($1,$2,$3,60,'activation')`,
        [st, pt, m],
      );
    }
  }
});

afterAll(async () => {
  await Promise.all([admin.end(), app.end()]);
});

describe("horario por defecto", () => {
  it("cada PT nuevo parte de lunes a viernes, de 06:00 a 22:00", async () => {
    const r = await asUser(ids.ptA, (c) =>
      c.query("select weekday, start_hour, end_hour from availability_rules order by weekday"),
    );
    expect(r.rows).toEqual([1, 2, 3, 4, 5].map((d) => ({ weekday: d, start_hour: 6, end_hour: 22 })));
  });

  it("la semana completa tiene 16 horarios libres por día, 80 en total", async () => {
    const r = await asUser(ids.ptA, (c) =>
      c.query("select * from list_slots($1::date, ($1::date + 6))", [nextMonday]),
    );
    expect(r.rowCount).toBe(80);
    expect(new Set(r.rows.map((x) => x.slot_state))).toEqual(new Set(["free"]));
    expect(Math.min(...r.rows.map((x) => x.slot_hour))).toBe(6);
    expect(Math.max(...r.rows.map((x) => x.slot_hour))).toBe(21);
  });

  it("los tramos de un mismo día no pueden pisarse, pero sí quedar uno junto al otro", async () => {
    await expect(
      asUser(ids.ptA, (c) =>
        c.query("insert into availability_rules (pt_id, weekday, start_hour, end_hour) values ($1, 1, 10, 12)", [ids.ptA]),
      ),
    ).rejects.toThrow(/exclusion|conflicting/);
    await asUser(ids.ptB, async (c) => {
      await c.query("delete from availability_rules where weekday = 1");
      await c.query("insert into availability_rules (pt_id, weekday, start_hour, end_hour) values ($1,1,6,12),($1,1,13,22)", [
        ids.ptB,
      ]);
    });
    const r = await asUser(ids.ptB, (c) =>
      c.query("select slot_hour from list_slots($1::date, $1::date)", [nextMonday]),
    );
    expect(r.rows.map((x) => x.slot_hour)).toEqual([6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });
});

describe("zona horaria", () => {
  it("07:00 en Santiago es 11:00 UTC en invierno y 10:00 UTC en verano", async () => {
    const winter = await asUser(ids.ptA, (c) => c.query("select * from list_slots('2026-07-06','2026-07-06') where slot_hour = 7"));
    expect(winter.rows[0].slot_start.getUTCHours()).toBe(11);
    const summer = await asUser(ids.ptA, (c) => c.query("select * from list_slots('2026-12-07','2026-12-07') where slot_hour = 7"));
    expect(summer.rows[0].slot_start.getUTCHours()).toBe(10);
  });
});

describe("reservar", () => {
  it("el alumno reserva un horario libre y queda con el lugar que tenía", async () => {
    const start = await slot(2, 10); // miércoles 10:00
    const id = await book(ids.stA1, start);
    const row = await admin.query("select * from bookings where id = $1", [id]);
    expect(row.rows[0]).toMatchObject({ pt_id: ids.ptA, student_id: ids.stA1, location_id: locA, status: "booked" });
    expect(row.rows[0].end_at.getTime() - row.rows[0].start_at.getTime()).toBe(3_600_000);
  });

  it("nadie más puede tomar ese horario, ni siquiera de forma simultánea", async () => {
    await expect(book(ids.stA2, await slot(2, 10))).rejects.toThrow(/slot_taken/);
    const start = await slot(2, 11);
    const results = await Promise.allSettled([book(ids.stA1, start), book(ids.stA2, start)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(failed.reason)).toMatch(/slot_taken/);
    expect((await admin.query("select 1 from bookings where start_at = $1 and status = 'booked'", [start])).rowCount).toBe(1);
  });

  it("los PT son independientes: el mismo horario sigue libre para el alumno de otro PT", async () => {
    await expect(book(ids.stB1, await slot(2, 10))).resolves.toBeTruthy();
  });

  it("rechaza horarios fuera del tramo, de fin de semana, pasados, muy lejanos o con minutos", async () => {
    await expect(book(ids.stA2, await slot(1, 5))).rejects.toThrow(/slot_unavailable/); // 05:00
    await expect(book(ids.stA2, await slot(1, 22))).rejects.toThrow(/slot_unavailable/); // 22:00 ya no
    await expect(book(ids.stA2, await slot(5, 10))).rejects.toThrow(/slot_unavailable/); // sábado
    await expect(book(ids.stA2, new Date(Date.now() - 3_600_000))).rejects.toThrow(/slot_past|slot_invalid/);
    const past = (await admin.query(`select date_trunc('hour', now()) - interval '2 hours' as t`)).rows[0].t;
    await expect(book(ids.stA2, past)).rejects.toThrow(/slot_past/);
    const far = (await admin.query(`select date_trunc('hour', now()) + interval '60 days' as t`)).rows[0].t;
    await expect(book(ids.stA2, far)).rejects.toThrow(/slot_too_far/);
    const half = new Date((await slot(1, 9)).getTime() + 30 * 60_000);
    await expect(book(ids.stA2, half)).rejects.toThrow(/slot_invalid/);
  });

  it("un PT no puede reservar como alumno, ni un usuario sin sesión", async () => {
    await expect(book(ids.ptA, await slot(3, 9))).rejects.toThrow(/not_student/);
    await expect(asUser(null, (c) => c.query("select book_class($1)", [new Date(Date.now() + 86_400_000)]))).rejects.toThrow(
      /not_student/,
    );
  });
});

describe("lo que ve cada uno", () => {
  it("el PT ve el alumno y el lugar de cada clase", async () => {
    const r = await asUser(ids.ptA, (c) =>
      c.query("select * from list_slots($1::date, ($1::date + 4)) where slot_state = 'booked' order by slot_start", [
        nextMonday,
      ]),
    );
    expect(r.rows.map((x) => x.slot_student_id)).toEqual([ids.stA1, expect.any(String)]);
    expect(r.rows[0]).toMatchObject({ slot_student_name: `Alumno ${ids.stA1}`, slot_location_name: "Gym A", slot_hour: 10 });
  });

  it("el alumno ve libres, su clase y 'no disponible', sin datos de otros alumnos", async () => {
    const r = await asUser(ids.stA2, (c) =>
      c.query("select * from list_slots($1::date, ($1::date + 4))", [nextMonday]),
    );
    const states = new Set(r.rows.map((x) => x.slot_state));
    expect(states.has("free")).toBe(true);
    expect(states.has("unavailable")).toBe(true);
    expect(states.has("booked")).toBe(false);
    expect(states.has("blocked")).toBe(false);
    for (const row of r.rows) {
      expect(row.slot_student_name).toBeNull();
      expect(row.slot_location_name).toBeNull();
    }
    const mine = await asUser(ids.stA1, (c) =>
      c.query("select slot_state from list_slots($1::date, ($1::date + 4)) where slot_hour = 10 and slot_date = ($1::date + 2)", [
        nextMonday,
      ]),
    );
    expect(mine.rows[0].slot_state).toBe("mine");
  });

  it("el alumno no ve horarios pasados ni más allá de 56 días", async () => {
    const r = await asUser(ids.stA2, (c) =>
      c.query("select slot_start from list_slots((now() at time zone $1)::date - 3, (now() at time zone $1)::date + 59)", [TZ]),
    );
    const now = Date.now();
    expect(r.rowCount).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.slot_start.getTime()).toBeGreaterThan(now);
      expect(row.slot_start.getTime()).toBeLessThanOrEqual(now + 56 * 86_400_000);
    }
  });

  it("sin sesión no se ve ningún horario y los rangos absurdos se rechazan", async () => {
    expect((await asUser(null, (c) => c.query("select * from list_slots('2030-01-01','2030-01-07')"))).rowCount).toBe(0);
    await expect(asUser(ids.ptA, (c) => c.query("select * from list_slots('2030-01-01','2030-06-01')"))).rejects.toThrow(
      /range_invalid/,
    );
  });
});

describe("cancelar", () => {
  async function insertBooking(student: string, pt: string, hoursFromNow: number, loc: string | null = null) {
    const r = await admin.query(
      `insert into bookings (pt_id, student_id, location_id, start_at, end_at)
       values ($1, $2, $3, now() + make_interval(mins => $4::int), now() + make_interval(mins => $4::int) + interval '1 hour')
       returning id`,
      [pt, student, loc, Math.round(hoursFromNow * 60)],
    );
    return r.rows[0].id as string;
  }

  it("el alumno cancela con 24 horas o más; con menos, no", async () => {
    const ok = await insertBooking(ids.stA1, ids.ptA, 25);
    await expect(cancel(ids.stA1, ok)).resolves.toBe("cancelled_student");
    const late = await insertBooking(ids.stA1, ids.ptA, 23.9);
    await expect(cancel(ids.stA1, late)).rejects.toThrow(/too_late/);
    // Justo pasado el límite de 24 horas (otro PT, para no pisar la clase anterior).
    const edge = await insertBooking(ids.stB1, ids.ptB, 24.05);
    await expect(cancel(ids.stB1, edge)).resolves.toBe("cancelled_student");
    expect((await admin.query("select status from bookings where id = $1", [late])).rows[0].status).toBe("booked");
  });

  it("no se puede cancelar la clase de otro ni una ya cancelada", async () => {
    const id = await insertBooking(ids.stA1, ids.ptA, 72);
    await expect(cancel(ids.stA2, id)).rejects.toThrow(/booking_not_found/);
    await expect(cancel(ids.ptB, id)).rejects.toThrow(/booking_not_found/);
    await cancel(ids.stA1, id);
    await expect(cancel(ids.stA1, id)).rejects.toThrow(/booking_not_active/);
    await expect(cancel(ids.stA1, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/booking_not_found/);
  });

  it("el PT cancela una clase futura en cualquier momento y deja el motivo; no una pasada", async () => {
    const soon = await insertBooking(ids.stA1, ids.ptA, 2);
    await expect(cancel(ids.ptA, soon, "  Me enfermé  ")).resolves.toBe("cancelled_pt");
    const row = await admin.query("select status, cancel_reason, cancelled_at from bookings where id = $1", [soon]);
    expect(row.rows[0]).toMatchObject({ status: "cancelled_pt", cancel_reason: "Me enfermé" });
    expect(row.rows[0].cancelled_at).not.toBeNull();
    const past = await insertBooking(ids.stA1, ids.ptA, -3);
    await expect(cancel(ids.ptA, past)).rejects.toThrow(/booking_past/);
  });

  it("un horario cancelado queda libre para otro alumno", async () => {
    const start = await slot(1, 15);
    const id = await book(ids.stA1, start);
    await cancel(ids.stA1, id);
    await expect(book(ids.stA2, start)).resolves.toBeTruthy();
  });
});

describe("bloqueos", () => {
  it("avisa cuántas clases caen en el bloqueo y, al confirmar, las cancela y bloquea el horario", async () => {
    const date = (await admin.query(`select ($1::date + 3)::text as d`, [nextMonday])).rows[0].d; // jueves
    const booked = await book(ids.stA1, await slot(3, 14));
    const conflicts = await asUser(ids.ptA, (c) =>
      c.query("select count_block_conflicts($1::date, 13, 16) as n", [date]).then((r) => r.rows[0].n),
    );
    expect(conflicts).toBe(1);

    const res = await asUser(ids.ptA, (c) => c.query("select * from block_range($1::date, 13, 16, 'Trámite')", [date]));
    expect(res.rows).toEqual([
      { cancelled_booking: booked, cancelled_student: ids.stA1, cancelled_start: await slot(3, 14) },
    ]);
    const row = await admin.query("select status, cancel_reason from bookings where id = $1", [booked]);
    expect(row.rows[0]).toEqual({ status: "cancelled_pt", cancel_reason: "Trámite" });

    // El PT lo ve bloqueado; el alumno, no disponible; nadie puede reservarlo.
    const pt = await asUser(ids.ptA, (c) => c.query("select slot_hour, slot_state from list_slots($1::date,$1::date) where slot_hour between 12 and 16", [date]));
    expect(pt.rows.map((r) => r.slot_state)).toEqual(["free", "blocked", "blocked", "blocked", "free"]);
    const st = await asUser(ids.stA2, (c) => c.query("select slot_hour, slot_state from list_slots($1::date,$1::date) where slot_hour between 12 and 16", [date]));
    expect(st.rows.map((r) => r.slot_state)).toEqual(["free", "unavailable", "unavailable", "unavailable", "free"]);
    await expect(book(ids.stA2, await slot(3, 14))).rejects.toThrow(/slot_unavailable/);

    // Quitar el bloqueo libera los horarios.
    await asUser(ids.ptA, (c) => c.query("delete from availability_blocks where block_date = $1::date", [date]));
    await expect(book(ids.stA2, await slot(3, 14))).resolves.toBeTruthy();
  });

  it("valida el rango y no permite bloquear fechas pasadas ni como alumno", async () => {
    await expect(asUser(ids.ptA, (c) => c.query("select * from block_range($1::date, 10, 10)", [nextMonday]))).rejects.toThrow(/block_invalid/);
    await expect(asUser(ids.ptA, (c) => c.query("select * from block_range($1::date, 0, 25)", [nextMonday]))).rejects.toThrow(/block_invalid/);
    await expect(asUser(ids.ptA, (c) => c.query("select * from block_range('2020-01-06', 8, 9)"))).rejects.toThrow(/block_past/);
    await expect(asUser(ids.stA1, (c) => c.query("select * from block_range($1::date, 8, 9)", [nextMonday]))).rejects.toThrow(/not_pt/);
    await expect(asUser(ids.stA1, (c) => c.query("select count_block_conflicts($1::date, 8, 9)", [nextMonday]))).rejects.toThrow(/not_pt/);
  });

  it("una clase reservada fuera del horario nuevo sigue apareciendo en la agenda del PT", async () => {
    const start = await slot(4, 20); // viernes 20:00
    const id = await book(ids.stA2, start);
    await asUser(ids.ptA, async (c) => {
      await c.query("delete from availability_rules where weekday = 5");
      await c.query("insert into availability_rules (pt_id, weekday, start_hour, end_hour) values ($1, 5, 6, 12)", [ids.ptA]);
    });
    const r = await asUser(ids.ptA, (c) =>
      c.query("select slot_hour, slot_state from list_slots($1::date + 4, $1::date + 4) where slot_hour >= 12", [nextMonday]),
    );
    expect(r.rows).toEqual([{ slot_hour: 20, slot_state: "booked" }]);
    await cancel(ids.ptA, id);
  });
});

describe("permisos y aislamiento", () => {
  it("nadie escribe en bookings directamente; cada uno lee solo las suyas", async () => {
    await expect(
      asUser(ids.stA1, (c) =>
        c.query("insert into bookings (pt_id, student_id, start_at, end_at) values ($1,$2, now(), now() + interval '1 hour')", [
          ids.ptA,
          ids.stA1,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(ids.ptA, (c) => c.query("update bookings set status = 'booked'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(ids.ptA, (c) => c.query("delete from bookings"))).rejects.toThrow(/permission denied/);

    const a1 = await asUser(ids.stA1, (c) => c.query("select distinct student_id from bookings"));
    expect(a1.rows.map((r) => r.student_id)).toEqual([ids.stA1]);
    const b = await asUser(ids.ptB, (c) => c.query("select distinct pt_id from bookings"));
    expect(b.rows.map((r) => r.pt_id)).toEqual([ids.ptB]);
    expect((await asUser(null, (c) => c.query("select 1 from bookings"))).rowCount).toBe(0);
  });

  it("el alumno no ve ni toca los tramos o bloqueos; un PT no toca los de otro", async () => {
    expect((await asUser(ids.stA1, (c) => c.query("select 1 from availability_rules"))).rowCount).toBe(0);
    expect((await asUser(ids.stA1, (c) => c.query("select 1 from availability_blocks"))).rowCount).toBe(0);
    await expect(
      asUser(ids.stA1, (c) => c.query("insert into availability_rules (pt_id, weekday, start_hour, end_hour) values ($1, 6, 8, 9)", [ids.ptA])),
    ).rejects.toThrow(/row-level security/);
    const del = await asUser(ids.ptB, (c) => c.query("delete from availability_rules where pt_id = $1", [ids.ptA]));
    expect(del.rowCount).toBe(0);
    await expect(
      asUser(ids.ptB, (c) => c.query("insert into availability_blocks (pt_id, block_date, start_hour, end_hour) values ($1, now(), 8, 9)", [ids.ptA])),
    ).rejects.toThrow(/row-level security/);
  });

  it("las reservas y cancelaciones quedan en la auditoría del PT", async () => {
    const r = await asUser(ids.ptA, (c) =>
      c.query("select distinct action from audit_log where action like 'booking.%' or action like 'availability.%'"),
    );
    const actions = r.rows.map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining(["booking.created", "booking.cancelled_by_student", "booking.cancelled_by_pt", "availability.blocked"]),
    );
    const other = await asUser(ids.ptB, (c) => c.query("select count(*)::int as n from audit_log where action = 'availability.blocked'"));
    expect(other.rows[0].n).toBe(0);
  });
});
