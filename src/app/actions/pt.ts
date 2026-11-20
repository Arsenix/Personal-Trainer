"use server";

import { revalidatePath } from "next/cache";
import { audit, isUniqueViolation, withUser } from "@/lib/db";
import { requirePt } from "@/lib/session";
import { generateToken, hashToken, INVITATION_TTL_DAYS } from "@/lib/tokens";
import { appUrl, sendMail } from "@/lib/mail";
import {
  fieldErrors,
  inviteSchema,
  locationSchema,
  profileSchema,
} from "@/lib/validation";
import { formValues, str, type ActionState } from "@/lib/action-state";
import { allow } from "@/lib/rate-limit";

type InviteData = { name: string; email: string; phone: string | null; locationId: string | null };

/** Revoca invitaciones pendientes del mismo correo y crea una nueva. Devuelve el token en claro. */
async function issueInvitation(ptId: string, data: InviteData) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const ptName = await withUser(ptId, async (c) => {
    const { rows: prof } = await c.query("select display_name from pt_profiles where user_id = $1", [ptId]);
    await c.query(
      `update invitations set revoked_at = now()
        where lower(email) = lower($1) and accepted_at is null and revoked_at is null`,
      [data.email],
    );
    const { rows } = await c.query(
      `insert into invitations (pt_id, email, name, phone, location_id, token_hash, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [ptId, data.email, data.name, data.phone, data.locationId, hashToken(token), expiresAt],
    );
    await audit(c, ptId, "invitation.created", "invitation", rows[0].id, { email: data.email });
    return prof[0].display_name as string;
  });
  const link = `${appUrl()}/invitacion/${token}`;
  const mailed = await sendMail({
    to: data.email,
    subject: `${ptName} te invitó a reservar tus clases`,
    text:
      `Hola ${data.name},\n\n${ptName} te invitó a su agenda de clases.\n` +
      `Crea tu contraseña desde este link (vale ${INVITATION_TTL_DAYS} días):\n\n${link}\n\n` +
      `Si no esperabas este correo, puedes ignorarlo.`,
  });
  return { link, mailed };
}

export async function inviteStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const values = formValues(fd);
  if (!(await allow(`invite:${user.id}`, 30, 60 * 60_000))) {
    return { error: "Enviaste muchas invitaciones seguidas. Espera un rato y vuelve a probar.", values };
  }
  const parsed = inviteSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    locationId: str(fd, "locationId"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    const inUse = await withUser(user.id, async (c) => {
      const { rows } = await c.query("select email_in_use($1) as used", [parsed.data.email]);
      return rows[0].used as boolean;
    });
    if (inUse) {
      return {
        errors: { email: "Este correo ya tiene una cuenta. Un alumno solo puede estar con un PT." },
        values,
      };
    }
    const { link, mailed } = await issueInvitation(user.id, parsed.data);
    revalidatePath("/pt");
    return { ok: true, link, mailed, message: `Invitación lista para ${parsed.data.name}.` };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Ya hay una invitación pendiente para este correo.", values };
    if (e instanceof Error && /violates foreign key/.test(e.message)) {
      return { errors: { locationId: "Ese lugar no existe" }, values };
    }
    console.error("inviteStudent", e);
    return { error: "No pudimos crear la invitación. Intenta de nuevo.", values };
  }
}

export async function resendInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Invitación no válida" };
  const inv = await withUser(user.id, async (c) => {
    const { rows } = await c.query(
      `select name, email, phone, location_id as "locationId" from invitations
        where id = $1 and accepted_at is null and revoked_at is null`,
      [id],
    );
    return rows[0] as InviteData | undefined;
  });
  if (!inv) return { error: "Esa invitación ya no está pendiente." };
  const { link, mailed } = await issueInvitation(user.id, inv);
  revalidatePath("/pt");
  return { ok: true, link, mailed, message: `Nuevo link para ${inv.name}. El anterior dejó de funcionar.` };
}

export async function revokeInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Invitación no válida" };
  await withUser(user.id, async (c) => {
    const { rowCount } = await c.query(
      `update invitations set revoked_at = now()
        where id = $1 and accepted_at is null and revoked_at is null`,
      [id],
    );
    if (rowCount) await audit(c, user.id, "invitation.revoked", "invitation", id);
  });
  revalidatePath("/pt");
  return { ok: true };
}

export async function createLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const values = formValues(fd);
  const parsed = locationSchema.safeParse({
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    address: str(fd, "address"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await withUser(user.id, async (c) => {
      const { rows } = await c.query(
        `insert into locations (pt_id, name, kind, address) values ($1, $2, $3, $4) returning id`,
        [user.id, parsed.data.name, parsed.data.kind, parsed.data.address],
      );
      await audit(c, user.id, "location.created", "location", rows[0].id, { name: parsed.data.name });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { name: "Ya tienes un lugar con ese nombre" }, values };
    console.error("createLocation", e);
    return { error: "No pudimos guardar el lugar.", values };
  }
  revalidatePath("/pt/lugares");
  revalidatePath("/pt");
  return { ok: true, message: "Lugar agregado." };
}

export async function updateLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  const values = formValues(fd);
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Lugar no válido", values };
  const parsed = locationSchema.safeParse({
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    address: str(fd, "address"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await withUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `update locations set name = $2, kind = $3, address = $4 where id = $1`,
        [id, parsed.data.name, parsed.data.kind, parsed.data.address],
      );
      if (rowCount) await audit(c, user.id, "location.updated", "location", id);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { name: "Ya tienes un lugar con ese nombre" }, values };
    console.error("updateLocation", e);
    return { error: "No pudimos guardar los cambios.", values };
  }
  revalidatePath("/pt/lugares");
  revalidatePath("/pt");
  return { ok: true, message: "Cambios guardados." };
}

export async function setLocationArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  const archive = str(fd, "archive") === "1";
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Lugar no válido" };
  try {
    await withUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `update locations set archived_at = case when $2 then now() else null end where id = $1`,
        [id, archive],
      );
      if (rowCount) {
        await audit(c, user.id, archive ? "location.archived" : "location.restored", "location", id);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { error: "Ya existe un lugar activo con ese nombre. Cámbiale el nombre antes de restaurarlo." };
    }
    throw e;
  }
  revalidatePath("/pt/lugares");
  revalidatePath("/pt");
  return { ok: true };
}

export async function setStudentLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const studentId = str(fd, "studentId");
  const raw = str(fd, "locationId");
  const locationId = raw === "" ? null : raw;
  if (!studentId || (locationId && !/^[0-9a-f-]{36}$/.test(locationId))) {
    return { error: "Datos no válidos" };
  }
  try {
    const changed = await withUser(user.id, async (c) => {
      if (locationId) {
        const { rowCount } = await c.query(
          "select 1 from locations where id = $1 and archived_at is null",
          [locationId],
        );
        if (!rowCount) return "missing" as const;
      }
      const { rowCount } = await c.query("update students set location_id = $2 where user_id = $1", [
        studentId,
        locationId,
      ]);
      if (!rowCount) return "missing" as const;
      await audit(c, user.id, "student.location_set", "student", studentId, { locationId });
      return "ok" as const;
    });
    if (changed === "missing") return { error: "No encontramos ese alumno o ese lugar." };
  } catch (e) {
    console.error("setStudentLocation", e);
    return { error: "No pudimos cambiar el lugar." };
  }
  revalidatePath("/pt");
  return { ok: true };
}

export async function updateProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const values = formValues(fd);
  const parsed = profileSchema.safeParse({
    displayName: str(fd, "displayName"),
    phone: str(fd, "phone"),
    transferHolder: str(fd, "transferHolder"),
    transferRut: str(fd, "transferRut"),
    transferBank: str(fd, "transferBank"),
    transferType: str(fd, "transferType"),
    transferNumber: str(fd, "transferNumber"),
    transferEmail: str(fd, "transferEmail"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const d = parsed.data;
  await withUser(user.id, async (c) => {
    await c.query(
      `update pt_profiles set display_name = $2, phone = $3, transfer_holder = $4, transfer_rut = $5,
              transfer_bank = $6, transfer_type = $7, transfer_number = $8, transfer_email = $9,
              updated_at = now()
        where user_id = $1`,
      [
        user.id,
        d.displayName,
        d.phone,
        d.transferHolder,
        d.transferRut,
        d.transferBank,
        d.transferType,
        d.transferNumber,
        d.transferEmail,
      ],
    );
    // Sin el contenido: la auditoría no debe copiar datos bancarios.
    await audit(c, user.id, "profile.updated", "pt_profile", user.id);
  });
  revalidatePath("/pt", "layout");
  return { ok: true, message: "Perfil guardado.", values };
}
