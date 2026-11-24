import Link from "next/link";
import { ReserveCalendar, type ReserveSlot } from "@/components/reserve-calendar";
import { getStudentHome, listMonthsForStudent, listSlots } from "@/lib/queries";
import { requireStudent } from "@/lib/session";
import {
  addDays,
  currentMonth,
  dayLong,
  isDateString,
  monthEndOf,
  monthLabel,
  monthStartOf,
  monthWeeks,
  nextMonthOf,
  prevMonthOf,
  slotLong,
  todayLocal,
} from "@/lib/dates";

export const metadata = { title: "Reservar clase" };

/** Cuánto hacia adelante se puede reservar (coincide con el horizonte de la base). */
const MAX_DAYS_AHEAD = 55;

export default async function ReservarPage({ searchParams }: { searchParams: Promise<{ mes?: string; dia?: string }> }) {
  const user = await requireStudent();
  const { mes, dia } = await searchParams;

  const today = todayLocal();
  const lastDay = addDays(today, MAX_DAYS_AHEAD);
  const firstMonth = monthStartOf(today);
  const lastMonth = monthStartOf(lastDay);

  // Mes pedido: ?dia=… manda; si no, ?mes=YYYY-MM; si no, el actual. Siempre dentro de lo reservable.
  let month = isDateString(dia) ? monthStartOf(dia) : /^\d{4}-\d{2}$/.test(mes ?? "") ? `${mes}-01` : firstMonth;
  if (month < firstMonth) month = firstMonth;
  if (month > lastMonth) month = lastMonth;

  const from = month === firstMonth ? today : month;
  const monthEnd = monthEndOf(month);
  const to = monthEnd < lastDay ? monthEnd : lastDay;

  const months = [currentMonth(), nextMonthOf(currentMonth())];
  const [home, rows, monthRows] = await Promise.all([
    getStudentHome(user.id),
    listSlots(user.id, from, to),
    listMonthsForStudent(user.id, months),
  ]);

  const slotsByDay: Record<string, ReserveSlot[]> = {};
  for (const r of rows) {
    if (r.state !== "free" && r.state !== "mine") continue;
    (slotsByDay[r.date] ??= []).push({
      start: r.start.toISOString(),
      hour: r.hour,
      state: r.state,
      long: slotLong(r.start),
    });
  }

  const weeks = monthWeeks(month);
  const labels: Record<string, string> = {};
  for (const d of weeks.flat()) labels[d] = dayLong(d);

  // Día abierto al entrar: el pedido si tiene horarios; si no, el primero con horarios libres del mes.
  const withSlots = Object.keys(slotsByDay).sort();
  const initialDay =
    isDateString(dia) && slotsByDay[dia] ? dia : (withSlots.find((d) => slotsByDay[d].some((s) => s.state === "free")) ?? null);

  return (
    <div className="grid gap-6">
      <header>
        <h1>Reservar clase</h1>
        <p className="mt-2 text-muted">
          Elige un día en el calendario{home ? ` para ver los horarios de ${home.ptName}` : ""}.
        </p>
      </header>

      <p className="panel panel-pad text-sm" aria-label="Tus clases disponibles">
        {months.map((m, i) => {
          const r = monthRows.find((x) => x.month === m);
          return (
            <span key={m}>
              {i > 0 && <span className="text-muted"> · </span>}
              <span className="first-cap">{monthLabel(m)}</span>:{" "}
              {r ? (
                <strong className="tabular-nums">
                  {r.balance} {r.balance === 1 ? "clase disponible" : "clases disponibles"}
                </strong>
              ) : (
                <span className="text-muted">sin activar</span>
              )}
            </span>
          );
        })}
        {monthRows.length < months.length && (
          <>
            {" "}
            <Link href="/alumno" className="underline underline-offset-4">
              Sube tu comprobante
            </Link>{" "}
            para activar un mes.
          </>
        )}
      </p>

      <ReserveCalendar
        key={month}
        month={month}
        monthTitle={monthLabel(month)}
        weeks={weeks}
        slotsByDay={slotsByDay}
        labels={labels}
        today={today}
        initialDay={initialDay}
        prevHref={month > firstMonth ? `/alumno/reservar?mes=${prevMonthOf(month).slice(0, 7)}` : null}
        nextHref={month < lastMonth ? `/alumno/reservar?mes=${nextMonthOf(month).slice(0, 7)}` : null}
      />

      <p className="text-sm text-muted">
        Puedes cancelar una clase hasta 24 horas antes. Después ya no se puede cancelar desde aquí.
      </p>
    </div>
  );
}
