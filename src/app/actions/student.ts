"use server";

import { revalidatePath } from "next/cache";
import { dbCode, withUser } from "@/lib/db";
import { requireStudent } from "@/lib/session";
import { notifyBooking } from "@/lib/agenda-mail";
import { str, type ActionState } from "@/lib/action-state";

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
