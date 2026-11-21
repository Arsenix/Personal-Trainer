import { getBookingContact } from "./queries";
import { slotLong } from "./dates";
import { sendMail } from "./mail";

export type BookingEvent = "created" | "cancelled_by_student" | "cancelled_by_pt";

/**
 * Avisa por correo a la otra parte. Nunca rompe la acción principal: si algo falla, solo se registra.
 *  created / cancelled_by_student → al PT.   cancelled_by_pt → al alumno.
 */
export async function notifyBooking(actorId: string, bookingId: string, event: BookingEvent): Promise<void> {
  try {
    const b = await getBookingContact(actorId, bookingId);
    if (!b) return;
    const when = slotLong(b.start);
    const where = b.locationName ? `\nLugar: ${b.locationName}` : "";

    if (event === "created") {
      await sendMail({
        to: b.ptEmail,
        subject: `Nueva clase: ${b.studentName}, ${when}`,
        text: `${b.studentName} reservó una clase contigo.\n\nCuándo: ${when}${where}\n\nLa ves en tu agenda.`,
      });
    } else if (event === "cancelled_by_student") {
      await sendMail({
        to: b.ptEmail,
        subject: `Clase cancelada: ${b.studentName}, ${when}`,
        text: `${b.studentName} canceló su clase del ${when}.${where}\n\nEl horario quedó libre en tu agenda.`,
      });
    } else {
      const reason = b.cancelReason ? `\nMotivo: ${b.cancelReason}` : "";
      await sendMail({
        to: b.studentEmail,
        subject: `${b.ptName} canceló tu clase del ${when}`,
        text:
          `Hola ${b.studentName.split(" ")[0]},\n\n${b.ptName} canceló tu clase del ${when}.${reason}\n\n` +
          `Puedes reservar otro horario desde tu cuenta.`,
      });
    }
  } catch (e) {
    console.error("notifyBooking", event, e);
  }
}
