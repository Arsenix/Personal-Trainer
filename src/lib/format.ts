const TZ = "America/Santiago";

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(d);
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: TZ }).format(d);
}

const AUDIT_LABELS: Record<string, string> = {
  "pt.registered": "Creó su cuenta de PT",
  "auth.login": "Inició sesión",
  "invitation.created": "Creó una invitación",
  "invitation.revoked": "Revocó una invitación",
  "student.joined": "Aceptó la invitación y creó su cuenta",
  "student.location_set": "Cambió el lugar de un alumno",
  "location.created": "Agregó un lugar",
  "location.updated": "Editó un lugar",
  "location.archived": "Archivó un lugar",
  "location.restored": "Restauró un lugar",
  "profile.updated": "Actualizó su perfil y datos de transferencia",
  "booking.created": "Reservó una clase",
  "booking.cancelled_by_student": "Canceló una clase",
  "booking.cancelled_by_pt": "Canceló clases",
  "plan.created": "Creó un plan",
  "plan.updated": "Editó un plan",
  "month.activated": "Activó el mes de un alumno",
  "credits.adjusted": "Ajustó los créditos de un alumno",
  "proof.uploaded": "Subió un comprobante de pago",
  "proof.rejected": "Rechazó un comprobante de pago",
  "routine.created": "Creó una rutina",
  "routine.updated": "Editó una rutina",
  "routine.archived": "Archivó una rutina",
  "routine.restored": "Reactivó una rutina",
  "availability.updated": "Cambió su horario de atención",
  "availability.blocked": "Bloqueó horas de su agenda",
  "availability.unblocked": "Quitó un bloqueo de su agenda",
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

export function formatClp(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

/** 62.5 → "62,5 kg"; 60 → "60 kg". */
export function formatKg(kg: number): string {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(kg)} kg`;
}
