"use server";

import { revalidatePath } from "next/cache";
import { dbCode, withUser } from "@/lib/db";
import { requireStudent } from "@/lib/session";
import { notifyBooking } from "@/lib/agenda-mail";
import { notifyProofUploaded } from "@/lib/credit-mail";
import { str, type ActionState } from "@/lib/action-state";
import { currentMonth, nextMonthOf } from "@/lib/dates";
import { MAX_PROOF_BYTES, safeFileName, sniffProof } from "@/lib/files";

function refresh() {
  revalidatePath("/alumno", "layout");
  revalidatePath("/pt/agenda");
}

export async function bookClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStudent();
  const iso = str(fd, "start");
  const start = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(start.getTime())) {
    return { error: "Elige un horario." };
  }
  let id: string;
  try {
    id = await withUser(user.id, async (c) => {
      const { rows } = await c.query("select book_class($1) as id", [start]);
      return rows[0].id as string;
    });
  } catch (e) {
    switch (dbCode(e)) {
      case "slot_taken":
        refresh();
        return { error: "Ese horario se acaba de ocupar. Elige otro." };
      case "slot_unavailable":
        refresh();
        return { error: "Ese horario ya no está disponible. Elige otro." };
      case "slot_past":
        return { error: "Ese horario ya pasó." };
      case "slot_too_far":
        return { error: "Todavía no se puede reservar tan adelante." };
      case "month_not_active":
        return { error: "Tu PT todavía no activa el mes de esa clase. Paga tu plan y sube el comprobante en Inicio." };
      case "no_credits":
        return { error: "No te quedan créditos en ese mes. Habla con tu PT si necesitas más clases." };
      default:
        console.error("bookClass", e);
        return { error: "No pudimos reservar. Intenta de nuevo." };
    }
  }
  await notifyBooking(user.id, id, "created");
  refresh();
  return { ok: true, message: "Clase reservada. Le avisamos a tu PT." };
}

export async function cancelBookingAsStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStudent();
  const id = str(fd, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Clase no válida." };
  try {
    await withUser(user.id, (c) => c.query("select cancel_booking($1, null)", [id]));
  } catch (e) {
    switch (dbCode(e)) {
      case "too_late":
        refresh();
        return {
          error:
            "Faltan menos de 24 horas, así que ya no se puede cancelar desde aquí. Si no puedes ir, avísale a tu PT.",
        };
      case "booking_not_active":
        refresh();
        return { error: "Esa clase ya estaba cancelada." };
      case "booking_not_found":
        return { error: "No encontramos esa clase." };
      default:
        console.error("cancelBookingAsStudent", e);
        return { error: "No pudimos cancelar. Intenta de nuevo." };
    }
  }
  await notifyBooking(user.id, id, "cancelled_by_student");
  refresh();
  return { ok: true, message: "Clase cancelada." };
}

export async function uploadProof(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStudent();
  const month = str(fd, "month");
  const now = currentMonth();
  if (month !== now && month !== nextMonthOf(now)) return { error: "Elige el mes que estás pagando." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el archivo del comprobante." };
  if (file.size > MAX_PROOF_BYTES) return { error: "El archivo pesa más de 5 MB. Sube una imagen o PDF más liviano." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffProof(bytes);
  if (!mime) return { error: "Solo se aceptan fotos (JPG, PNG, WebP) o PDF." };

  try {
    await withUser(user.id, (c) =>
      c.query("select upload_proof($1, $2, $3, $4)", [month, safeFileName(file.name, mime), mime, Buffer.from(bytes)]),
    );
  } catch (e) {
    if (dbCode(e) === "too_many_proofs") {
      return { error: "Ya subiste varios comprobantes de este mes. Espera a que tu PT los revise." };
    }
    console.error("uploadProof", e);
    return { error: "No pudimos guardar el comprobante. Intenta de nuevo." };
  }
  await notifyProofUploaded(user.id, month);
  revalidatePath("/alumno", "layout");
  revalidatePath("/pt", "layout");
  return { ok: true, message: "Comprobante enviado. Tu PT lo revisará y activará el mes." };
}
