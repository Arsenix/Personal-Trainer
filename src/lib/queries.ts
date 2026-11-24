import { withUser, withSystem } from "./db";
import { hashToken } from "./tokens";
import type { LocationKind } from "./validation";

export type LocationRow = {
  id: string;
  name: string;
  kind: LocationKind;
  address: string | null;
  archived: boolean;
  students: number;
};

export type StudentRow = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  joinedAt: Date;
  locationId: string | null;
  locationName: string | null;
};

export type InvitationRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  locationName: string | null;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
};

export type PtProfile = {
  displayName: string;
  phone: string | null;
  transferHolder: string | null;
  transferRut: string | null;
  transferBank: string | null;
  transferType: string | null;
  transferNumber: string | null;
  transferEmail: string | null;
};

export async function listLocations(ptId: string): Promise<LocationRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select l.id, l.name, l.kind, l.address, l.archived_at is not null as archived,
              (select count(*) from students s where s.location_id = l.id)::int as students
         from locations l
        order by (l.archived_at is not null), lower(l.name)`,
    );
    return rows;
  });
}

export async function listStudents(ptId: string): Promise<StudentRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select s.user_id as "userId", u.name, u.email, s.phone, s.created_at as "joinedAt",
              l.id as "locationId", l.name as "locationName"
         from students s
         join "user" u on u.id = s.user_id
         left join locations l on l.id = s.location_id
        order by lower(u.name)`,
    );
    return rows;
  });
}

export async function listPendingInvitations(ptId: string): Promise<InvitationRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select i.id, i.name, i.email, i.phone, l.name as "locationName",
              i.created_at as "createdAt", i.expires_at as "expiresAt",
              i.expires_at <= now() as expired
         from invitations i
         left join locations l on l.id = i.location_id
        where i.accepted_at is null and i.revoked_at is null
        order by i.created_at desc`,
    );
    return rows;
  });
}

export async function getPtProfile(ptId: string): Promise<PtProfile | null> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select display_name as "displayName", phone,
              transfer_holder as "transferHolder", transfer_rut as "transferRut",
              transfer_bank as "transferBank", transfer_type as "transferType",
              transfer_number as "transferNumber", transfer_email as "transferEmail"
         from pt_profiles where user_id = $1`,
      [ptId],
    );
    return rows[0] ?? null;
  });
}

export type StudentHome = {
  ptName: string;
  ptPhone: string | null;
  locationName: string | null;
  locationKind: LocationKind | null;
  locationAddress: string | null;
  transfer: Pick<
    PtProfile,
    "transferHolder" | "transferRut" | "transferBank" | "transferType" | "transferNumber" | "transferEmail"
  >;
};

export async function getStudentHome(studentId: string): Promise<StudentHome | null> {
  return withUser(studentId, async (c) => {
    const { rows } = await c.query(
      `select p.display_name as "ptName", p.phone as "ptPhone",
              l.name as "locationName", l.kind as "locationKind", l.address as "locationAddress",
              p.transfer_holder as "transferHolder", p.transfer_rut as "transferRut",
              p.transfer_bank as "transferBank", p.transfer_type as "transferType",
              p.transfer_number as "transferNumber", p.transfer_email as "transferEmail"
         from students s
         join pt_profiles p on p.user_id = s.pt_id
         left join locations l on l.id = s.location_id
        where s.user_id = $1`,
      [studentId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      ptName: r.ptName,
      ptPhone: r.ptPhone,
      locationName: r.locationName,
      locationKind: r.locationKind,
      locationAddress: r.locationAddress,
      transfer: {
        transferHolder: r.transferHolder,
        transferRut: r.transferRut,
        transferBank: r.transferBank,
        transferType: r.transferType,
        transferNumber: r.transferNumber,
        transferEmail: r.transferEmail,
      },
    };
  });
}

export type AuditRow = {
  id: string;
  at: Date;
  action: string;
  actorName: string | null;
  meta: Record<string, unknown>;
};

export async function listAudit(ptId: string, limit = 100): Promise<AuditRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select a.id::text, a.at, a.action, u.name as "actorName", a.meta
         from audit_log a
         left join "user" u on u.id = a.actor_id
        order by a.at desc, a.id desc
        limit $1`,
      [limit],
    );
    return rows;
  });
}

export type InvitationPreview = {
  inviteeName: string;
  email: string;
  ptName: string;
  state: "valid" | "used" | "revoked" | "expired";
};

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return withSystem(async (c) => {
    const { rows } = await c.query(
      `select invitee_name as "inviteeName", email, pt_name as "ptName", state
         from invitation_preview($1)`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  });
}

// ---------------------------------------------------------------------------
// Agenda (iteración 2)
// ---------------------------------------------------------------------------
export type SlotState = "free" | "booked" | "mine" | "blocked" | "unavailable" | "past";

export type SlotRow = {
  start: Date;
  date: string;
  hour: number;
  state: SlotState;
  bookingId: string | null;
  studentId: string | null;
  studentName: string | null;
  locationName: string | null;
};

/** Horarios entre dos fechas locales (ambas incluidas). Quién ve qué lo decide la base (list_slots). */
export async function listSlots(userId: string, from: string, to: string): Promise<SlotRow[]> {
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      `select slot_start as start, slot_date::text as date, slot_hour as hour, slot_state as state,
              slot_booking_id as "bookingId", slot_student_id as "studentId",
              slot_student_name as "studentName", slot_location_name as "locationName"
         from list_slots($1::date, $2::date)`,
      [from, to],
    );
    return rows;
  });
}

export type RuleRow = { id: string; weekday: number; start: number; end: number };

export async function listRules(ptId: string): Promise<RuleRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select id, weekday, start_hour as start, end_hour as "end"
         from availability_rules order by weekday, start_hour`,
    );
    return rows;
  });
}

export type BlockRow = { id: string; date: string; start: number; end: number; reason: string | null };

/** Bloqueos de hoy en adelante (fecha local de Santiago). */
export async function listBlocks(ptId: string): Promise<BlockRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select id, block_date::text as date, start_hour as start, end_hour as "end", reason
         from availability_blocks
        where block_date >= (now() at time zone app_tz())::date
        order by block_date, start_hour`,
    );
    return rows;
  });
}

export type BookingStatus = "booked" | "cancelled_student" | "cancelled_pt";

export type StudentBooking = {
  id: string;
  start: Date;
  status: BookingStatus;
  cancelReason: string | null;
  locationName: string | null;
};

/** Clases del alumno: las próximas vigentes y las últimas pasadas o canceladas. */
export async function listStudentBookings(
  studentId: string,
): Promise<{ upcoming: StudentBooking[]; history: StudentBooking[] }> {
  return withUser(studentId, async (c) => {
    const sql = `select b.id, b.start_at as start, b.status, b.cancel_reason as "cancelReason", l.name as "locationName"
                   from bookings b left join locations l on l.id = b.location_id`;
    const upcoming = await c.query(`${sql} where b.status = 'booked' and b.end_at > now() order by b.start_at`);
    const history = await c.query(
      `${sql} where not (b.status = 'booked' and b.end_at > now()) order by b.start_at desc limit 8`,
    );
    return { upcoming: upcoming.rows, history: history.rows };
  });
}

export type BookingContact = {
  start: Date;
  cancelReason: string | null;
  locationName: string | null;
  ptEmail: string;
  ptName: string;
  studentEmail: string;
  studentName: string;
};

/** Datos de una clase para armar los correos. Lo lee quien está involucrado (PT o alumno). */
export async function getBookingContact(userId: string, bookingId: string): Promise<BookingContact | null> {
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      `select b.start_at as start, b.cancel_reason as "cancelReason", l.name as "locationName",
              pu.email as "ptEmail", p.display_name as "ptName",
              su.email as "studentEmail", su.name as "studentName"
         from bookings b
         join pt_profiles p on p.user_id = b.pt_id
         join "user" pu on pu.id = b.pt_id
         join "user" su on su.id = b.student_id
         left join locations l on l.id = b.location_id
        where b.id = $1`,
      [bookingId],
    );
    return rows[0] ?? null;
  });
}

// ---------------------------------------------------------------------------
// Planes, meses y créditos (iteración 3)
// ---------------------------------------------------------------------------
export type PlanRow = { id: string; name: string; credits: number; priceClp: number; active: boolean };

export async function listPlans(ptId: string): Promise<PlanRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select id, name, credits, price_clp as "priceClp", active from plans order by active desc, lower(name)`,
    );
    return rows;
  });
}

export type MonthRow = {
  studentId: string;
  month: string;
  planName: string;
  priceClp: number;
  /** Créditos cargados en el mes (plan más ajustes). */
  loaded: number;
  /** Créditos que quedan para reservar. */
  balance: number;
};

const MONTH_SELECT = `
  select m.student_id as "studentId", to_char(m.month, 'YYYY-MM-DD') as month,
         m.plan_name as "planName", m.price_clp as "priceClp",
         coalesce(sum(l.delta) filter (where l.reason in ('activation', 'adjustment')), 0)::int as loaded,
         coalesce(sum(l.delta), 0)::int as balance
    from student_months m
    left join credit_ledger l on l.student_id = m.student_id and l.month = m.month`;

/** Meses activados de los alumnos del PT (la RLS limita a los suyos). */
export async function listMonthsForPt(ptId: string, months: string[]): Promise<MonthRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `${MONTH_SELECT} where m.month = any($1::date[]) group by m.id`,
      [months],
    );
    return rows;
  });
}

export async function listMonthsForStudent(studentId: string, months: string[]): Promise<MonthRow[]> {
  return withUser(studentId, async (c) => {
    const { rows } = await c.query(
      `${MONTH_SELECT} where m.student_id = $2 and m.month = any($1::date[]) group by m.id`,
      [months, studentId],
    );
    return rows;
  });
}

export type ProofStatus = "pending" | "accepted" | "rejected";
export type ProofRow = {
  id: string;
  studentId: string;
  month: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  status: ProofStatus;
  note: string | null;
  createdAt: Date;
};

const PROOF_SELECT = `
  select id, student_id as "studentId", to_char(month, 'YYYY-MM-DD') as month, file_name as "fileName",
         mime, size_bytes as "sizeBytes", status, note, created_at as "createdAt"
    from payment_proofs`;

/** Comprobantes pendientes de revisar de todos los alumnos del PT. */
export async function listPendingProofs(ptId: string): Promise<ProofRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(`${PROOF_SELECT} where status = 'pending' order by created_at`);
    return rows;
  });
}

export async function listProofsForStudent(studentId: string, months: string[]): Promise<ProofRow[]> {
  return withUser(studentId, async (c) => {
    const { rows } = await c.query(
      `${PROOF_SELECT} where student_id = $2 and month = any($1::date[]) order by created_at desc`,
      [months, studentId],
    );
    return rows;
  });
}

export type LedgerRow = {
  studentId: string;
  month: string;
  delta: number;
  reason: "activation" | "adjustment" | "booking" | "refund";
  note: string | null;
  createdAt: Date;
};

export async function listLedger(userId: string, months: string[], studentId?: string): Promise<LedgerRow[]> {
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      `select student_id as "studentId", to_char(month, 'YYYY-MM-DD') as month, delta, reason, note,
              created_at as "createdAt"
         from credit_ledger
        where month = any($1::date[]) and ($2::text is null or student_id = $2)
        order by created_at desc, id desc`,
      [months, studentId ?? null],
    );
    return rows;
  });
}

export type ProofFile = { fileName: string; mime: string; data: Buffer };

export async function getProofFile(userId: string, id: string): Promise<ProofFile | null> {
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      `select file_name as "fileName", mime, data from payment_proofs where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });
}

// ---------------------------------------------------------------------------
// Rutinas (iteración 4)
// ---------------------------------------------------------------------------
export type RoutineListRow = {
  id: string;
  studentId: string;
  studentName: string;
  name: string;
  active: boolean;
  updatedAt: Date;
  days: number;
  exercises: number;
};

export async function listRoutinesForPt(ptId: string): Promise<RoutineListRow[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select r.id, r.student_id as "studentId", u.name as "studentName", r.name, r.active,
              r.updated_at as "updatedAt",
              (select count(*) from routine_days d where d.routine_id = r.id)::int as days,
              (select count(*) from routine_exercises e where e.routine_id = r.id)::int as exercises
         from routines r join "user" u on u.id = r.student_id
        order by r.active desc, lower(u.name), r.updated_at desc`,
    );
    return rows;
  });
}

export type RoutineExercise = { name: string; sets: number; reps: string; weight: number | null; note: string };
export type RoutineDay = { title: string; exercises: RoutineExercise[] };
export type RoutineFull = {
  id: string;
  studentId: string;
  studentName: string;
  name: string;
  notes: string;
  active: boolean;
  updatedAt: Date;
  days: RoutineDay[];
};

async function loadRoutine(c: import("pg").PoolClient, where: string, params: unknown[]): Promise<RoutineFull | null> {
  const { rows } = await c.query(
    `select r.id, r.student_id as "studentId", u.name as "studentName", r.name, coalesce(r.notes, '') as notes,
            r.active, r.updated_at as "updatedAt"
       from routines r join "user" u on u.id = r.student_id where ${where} limit 1`,
    params,
  );
  const r = rows[0];
  if (!r) return null;
  const { rows: items } = await c.query(
    `select d.position as dp, d.title, e.position as ep, e.name, e.sets, e.reps, e.weight_kg::float8 as weight, coalesce(e.note, '') as note
       from routine_days d left join routine_exercises e on e.day_id = d.id
      where d.routine_id = $1 order by d.position, e.position`,
    [r.id],
  );
  const days: RoutineDay[] = [];
  for (const it of items) {
    if (!days[it.dp - 1]) days[it.dp - 1] = { title: it.title, exercises: [] };
    if (it.name) days[it.dp - 1].exercises.push({ name: it.name, sets: it.sets, reps: it.reps, weight: it.weight, note: it.note });
  }
  return { ...r, days: days.filter(Boolean) };
}

export async function getRoutine(userId: string, id: string): Promise<RoutineFull | null> {
  return withUser(userId, (c) => loadRoutine(c, "r.id = $1", [id]));
}

/** La rutina activa de un alumno (la base solo le deja ver la suya). */
export async function getActiveRoutine(studentId: string): Promise<RoutineFull | null> {
  return withUser(studentId, (c) => loadRoutine(c, "r.student_id = $1 and r.active", [studentId]));
}

/** Nombres de ejercicios ya usados por el PT, para sugerirlos al escribir. */
export async function listExerciseNames(ptId: string): Promise<string[]> {
  return withUser(ptId, async (c) => {
    const { rows } = await c.query(
      `select name from routine_exercises group by name order by count(*) desc, name limit 200`,
    );
    return rows.map((r) => r.name as string);
  });
}

export type StudentContact = { studentName: string; studentEmail: string; ptName: string; ptEmail: string };

/** Contacto de un alumno y su PT, para los correos. Lo puede leer el propio alumno o su PT. */
export async function getStudentContact(userId: string, studentId: string): Promise<StudentContact | null> {
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      `select su.name as "studentName", su.email as "studentEmail", p.display_name as "ptName", pu.email as "ptEmail"
         from students s
         join "user" su on su.id = s.user_id
         join "user" pu on pu.id = s.pt_id
         join pt_profiles p on p.user_id = s.pt_id
        where s.user_id = $1`,
      [studentId],
    );
    return rows[0] ?? null;
  });
}
