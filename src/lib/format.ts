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
  "availability.updated": "Cambió su horario de atención",
  "availability.blocked": "Bloqueó horas de su agenda",
  "availability.unblocked": "Quitó un bloqueo de su agenda",
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
