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
