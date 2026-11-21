import { getStudentContact, type StudentContact } from "./queries";
import { monthLabel } from "./dates";
import { appUrl, sendMail, type Mail } from "./mail";

const first = (name: string) => name.split(" ")[0];

// Plantillas puras: reciben los datos y devuelven el correo, así se pueden probar sin base ni red.
export function proofUploadedMail(c: StudentContact, month: string): Mail {
  return {
    to: c.ptEmail,
    subject: `Comprobante de pago: ${c.studentName}, ${monthLabel(month)}`,
    text:
      `${c.studentName} subió un comprobante de transferencia para ${monthLabel(month)}.\n\n` +
      `Revísalo y activa su mes desde Alumnos:\n${appUrl()}/pt/alumnos`,
  };
}

export function monthActivatedMail(c: StudentContact, month: string, planName: string, credits: number): Mail {
  return {
    to: c.studentEmail,
    subject: `Tu mes de ${monthLabel(month)} está activo`,
    text:
      `Hola ${first(c.studentName)},\n\n${c.ptName} activó tu mes de ${monthLabel(month)} con el plan ${planName}: ` +
      `${credits} ${credits === 1 ? "clase disponible" : "clases disponibles"}.\n\n` +
      `Reserva tus horarios aquí:\n${appUrl()}/alumno/reservar`,
  };
}

export function proofRejectedMail(c: StudentContact, month: string, note: string | null): Mail {
  return {
    to: c.studentEmail,
    subject: `Tu comprobante de ${monthLabel(month)} necesita una revisión`,
    text:
      `Hola ${first(c.studentName)},\n\n${c.ptName} no pudo aceptar el comprobante que subiste para ${monthLabel(month)}.` +
      `${note ? `\nMotivo: ${note}` : ""}\n\nPuedes subir uno nuevo desde tu cuenta:\n${appUrl()}/alumno`,
  };
}

/** Envía sin romper nunca la acción principal: si algo falla, solo se registra. */
async function deliver(label: string, build: () => Promise<Mail | null>) {
  try {
    const mail = await build();
    if (mail) await sendMail(mail);
  } catch (e) {
    console.error(label, e);
  }
}

export const notifyProofUploaded = (studentId: string, month: string) =>
  deliver("notifyProofUploaded", async () => {
    const c = await getStudentContact(studentId, studentId);
    return c && proofUploadedMail(c, month);
  });

export const notifyMonthActivated = (ptId: string, studentId: string, month: string, planName: string, credits: number) =>
  deliver("notifyMonthActivated", async () => {
    const c = await getStudentContact(ptId, studentId);
    return c && monthActivatedMail(c, month, planName, credits);
  });

export const notifyProofRejected = (ptId: string, studentId: string, month: string, note: string | null) =>
  deliver("notifyProofRejected", async () => {
    const c = await getStudentContact(ptId, studentId);
    return c && proofRejectedMail(c, month, note);
  });
