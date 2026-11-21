"use server";

import { revalidatePath } from "next/cache";
import { audit, dbCode, isUniqueViolation, withUser } from "@/lib/db";
import { requirePt } from "@/lib/session";
import { generateToken, hashToken, INVITATION_TTL_DAYS } from "@/lib/tokens";
import { appUrl, sendMail } from "@/lib/mail";
import {
  activateSchema,
  adjustSchema,
  blockSchema,
  fieldErrors,
  inviteSchema,
  locationSchema,
  parseHourRanges,
  planSchema,
  profileSchema,
} from "@/lib/validation";
import { notifyBooking } from "@/lib/agenda-mail";
import { todayLocal } from "@/lib/dates";
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

// ---------------------------------------------------------------------------
// Agenda (iteración 2)
// ---------------------------------------------------------------------------
const UUID = /^[0-9a-f-]{36}$/;

function refreshAgenda() {
  revalidatePath("/pt/agenda");
  revalidatePath("/pt/disponibilidad");
  revalidatePath("/alumno", "layout");
}

export async function saveDayRules(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const weekday = Number(str(fd, "weekday"));
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) return { error: "Día no válido." };
  const parsed = parseHourRanges(
    fd.getAll("from").map(String),
    fd.getAll("to").map(String),
  );
  if ("error" in parsed) return { error: parsed.error };
  await withUser(user.id, async (c) => {
    await c.query("delete from availability_rules where weekday = $1", [weekday]);
    for (const r of parsed.ranges) {
      await c.query(
        "insert into availability_rules (pt_id, weekday, start_hour, end_hour) values ($1, $2, $3, $4)",
        [user.id, weekday, r.start, r.end],
      );
    }
    await audit(c, user.id, "availability.updated", "availability_rules", String(weekday), {
      weekday,
      ranges: parsed.ranges.length,
    });
  });
  refreshAgenda();
  return {
    ok: true,
    message: parsed.ranges.length === 0 ? "Ese día quedó sin atención." : "Horario guardado.",
  };
}

export async function resetDefaultRules(): Promise<ActionState> {
  const user = await requirePt();
  await withUser(user.id, async (c) => {
    await c.query("delete from availability_rules");
    await c.query(
      `insert into availability_rules (pt_id, weekday, start_hour, end_hour)
       select $1, d, 6, 22 from generate_series(1, 5) as d`,
      [user.id],
    );
    await audit(c, user.id, "availability.updated", "availability_rules", undefined, {
      reset: true,
    });
  });
  refreshAgenda();
  return { ok: true, message: "Horario restablecido: lunes a viernes, de 06:00 a 22:00." };
}

/** Bloquea horas de una fecha. Si caen clases reservadas, pide confirmación antes de cancelarlas. */
export async function createBlock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const values = formValues(fd);
  const parsed = blockSchema.safeParse({
    date: str(fd, "date"),
    from: str(fd, "from"),
    to: str(fd, "to"),
    reason: str(fd, "reason"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { date, from, to, reason } = parsed.data;
  if (date < todayLocal()) return { errors: { date: "Esa fecha ya pasó" }, values };

  const conflicts = await withUser(user.id, async (c) => {
    const { rows } = await c.query("select count_block_conflicts($1::date, $2, $3) as n", [date, from, to]);
    return rows[0].n as number;
  });
  if (conflicts > 0 && str(fd, "confirm") !== "1") {
    return { conflicts, values };
  }

  try {
    const cancelled = await withUser(user.id, async (c) => {
      const { rows } = await c.query(
        `select cancelled_booking as id from block_range($1::date, $2, $3, $4)`,
        [date, from, to, reason],
      );
      return rows.map((r) => r.id as string);
    });
    await Promise.all(cancelled.map((id) => notifyBooking(user.id, id, "cancelled_by_pt")));
    refreshAgenda();
    return {
      ok: true,
      message:
        cancelled.length > 0
          ? `Horario bloqueado. Cancelamos ${cancelled.length} ${cancelled.length === 1 ? "clase" : "clases"} y avisamos por correo.`
          : "Horario bloqueado.",
    };
  } catch (e) {
    const code = dbCode(e);
    if (code === "block_past") return { errors: { date: "Esa fecha ya pasó" }, values };
    if (code === "block_invalid") return { error: "Revisa las horas del bloqueo.", values };
    console.error("createBlock", e);
    return { error: "No pudimos bloquear ese horario.", values };
  }
}

/** Bloquea una sola hora libre desde la agenda. */
export async function blockSlot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const date = str(fd, "date");
  const hour = Number(str(fd, "hour"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { error: "Horario no válido." };
  }
  try {
    const cancelled = await withUser(user.id, async (c) => {
      const { rows: n } = await c.query("select count_block_conflicts($1::date, $2, $3) as n", [date, hour, hour + 1]);
      if (n[0].n > 0) return null;
      await c.query("select * from block_range($1::date, $2, $3, null)", [date, hour, hour + 1]);
      return true;
    });
    if (cancelled === null) return { error: "Ahora hay una clase reservada en ese horario. Revisa la agenda." };
  } catch (e) {
    if (dbCode(e) === "block_past") return { error: "Ese horario ya pasó." };
    console.error("blockSlot", e);
    return { error: "No pudimos bloquear ese horario." };
  }
  refreshAgenda();
  return { ok: true };
}

export async function removeBlock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  if (!UUID.test(id)) return { error: "Bloqueo no válido." };
  await withUser(user.id, async (c) => {
    const { rowCount } = await c.query("delete from availability_blocks where id = $1", [id]);
    if (rowCount) await audit(c, user.id, "availability.unblocked", "availability_block", id);
  });
  refreshAgenda();
  return { ok: true };
}

export async function cancelBookingAsPt(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  const reason = str(fd, "reason").slice(0, 200);
  if (!UUID.test(id)) return { error: "Clase no válida." };
  try {
    await withUser(user.id, (c) => c.query("select cancel_booking($1, $2)", [id, reason]));
  } catch (e) {
    const code = dbCode(e);
    if (code === "booking_not_active") return { error: "Esa clase ya estaba cancelada." };
    if (code === "booking_past") return { error: "Esa clase ya pasó." };
    if (code === "booking_not_found") return { error: "No encontramos esa clase." };
    console.error("cancelBookingAsPt", e);
    return { error: "No pudimos cancelar la clase." };
  }
  await notifyBooking(user.id, id, "cancelled_by_pt");
  refreshAgenda();
  return { ok: true, message: "Clase cancelada. Le avisamos al alumno por correo." };
}

// ---------------------------------------------------------------------------
// Planes, activación del mes y créditos (iteración 3)
// ---------------------------------------------------------------------------
function refreshCredits() {
  revalidatePath("/pt", "layout");
  revalidatePath("/alumno", "layout");
}

export async function savePlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const parsed = planSchema.safeParse({ name: str(fd, "name"), credits: str(fd, "credits"), price: str(fd, "price") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(fd) };
  const id = str(fd, "id") || null;
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Plan no válido." };
  try {
    await withUser(user.id, (c) =>
      c.query("select save_plan($1, $2, $3, $4, null)", [id, parsed.data.name, parsed.data.credits, parsed.data.price]),
    );
  } catch (e) {
    if (dbCode(e) === "plan_name_taken") {
      return { errors: { name: "Ya tienes un plan con ese nombre." }, values: formValues(fd) };
    }
    console.error("savePlan", e);
    return { error: "No pudimos guardar el plan. Intenta de nuevo." };
  }
  refreshCredits();
  return { ok: true, message: id ? "Plan actualizado." : "Plan creado." };
}

export async function setPlanActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  const active = str(fd, "active") === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Plan no válido." };
  try {
    await withUser(user.id, async (c) => {
      const { rows } = await c.query("select name, credits, price_clp from plans where id = $1", [id]);
      if (!rows[0]) throw new Error("plan_not_found");
      await c.query("select save_plan($1, $2, $3, $4, $5)", [id, rows[0].name, rows[0].credits, rows[0].price_clp, active]);
    });
  } catch (e) {
    console.error("setPlanActive", e);
    return { error: "No pudimos cambiar el plan." };
  }
  refreshCredits();
  return { ok: true, message: active ? "Plan restaurado." : "Plan archivado." };
}

export async function activateMonth(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const parsed = activateSchema.safeParse({ student: str(fd, "student"), month: str(fd, "month"), plan: str(fd, "plan") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(fd) };
  try {
    await withUser(user.id, (c) =>
      c.query("select activate_month($1, $2, $3)", [parsed.data.student, parsed.data.month, parsed.data.plan]),
    );
  } catch (e) {
    switch (dbCode(e)) {
      case "already_active":
        refreshCredits();
        return { error: "Ese mes ya estaba activado." };
      case "plan_not_found":
        return { errors: { plan: "Ese plan ya no está disponible." } };
      case "month_invalid":
        return { error: "Solo se puede activar el mes en curso o el siguiente." };
      case "student_not_found":
        return { error: "No encontramos a ese alumno." };
      default:
        console.error("activateMonth", e);
        return { error: "No pudimos activar el mes. Intenta de nuevo." };
    }
  }
  refreshCredits();
  return { ok: true, message: "Mes activado. Los créditos ya están cargados." };
}

export async function adjustCredits(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const parsed = adjustSchema.safeParse({
    student: str(fd, "student"),
    month: str(fd, "month"),
    delta: str(fd, "delta"),
    note: str(fd, "note"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(fd) };
  try {
    await withUser(user.id, (c) =>
      c.query("select adjust_credits($1, $2, $3, $4)", [
        parsed.data.student,
        parsed.data.month,
        parsed.data.delta,
        parsed.data.note,
      ]),
    );
  } catch (e) {
    switch (dbCode(e)) {
      case "balance_negative":
        return { errors: { delta: "El alumno no tiene tantos créditos para descontar." }, values: formValues(fd) };
      case "month_not_active":
        return { error: "Ese mes no está activado." };
      default:
        console.error("adjustCredits", e);
        return { error: "No pudimos ajustar los créditos. Intenta de nuevo." };
    }
  }
  refreshCredits();
  return { ok: true, message: "Créditos ajustados." };
}

export async function rejectProof(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePt();
  const id = str(fd, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Comprobante no válido." };
  try {
    await withUser(user.id, (c) => c.query("select reject_proof($1, $2)", [id, str(fd, "note").slice(0, 200)]));
  } catch (e) {
    if (dbCode(e) === "proof_not_found") {
      refreshCredits();
      return { error: "Ese comprobante ya fue revisado." };
    }
    console.error("rejectProof", e);
    return { error: "No pudimos rechazar el comprobante." };
  }
  refreshCredits();
  return { ok: true, message: "Comprobante rechazado." };
}
