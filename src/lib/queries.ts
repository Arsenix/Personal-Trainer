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
