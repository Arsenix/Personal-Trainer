import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReserveWeek, type ReserveDay } from "@/components/agenda";
import { getStudentHome, listMonthsForStudent, listSlots } from "@/lib/queries";
import { requireStudent } from "@/lib/session";
import { addDays, currentMonth, dayLong, monthLabel, nextMonthOf, mondayOf, slotLong, todayLocal, weekDays, weekFromParam, weekRangeLabel } from "@/lib/dates";

export const metadata = { title: "Reservar clase" };

const MAX_WEEKS_AHEAD = 8;

export default async function ReservarPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const user = await requireStudent();
  const { semana } = await searchParams;
  const thisMonday = mondayOf(todayLocal());
  const lastMonday = addDays(thisMonday, 7 * MAX_WEEKS_AHEAD);
  let monday = weekFromParam(semana);
  if (monday < thisMonday) monday = thisMonday;
  if (monday > lastMonday) monday = lastMonday;

  const months = [currentMonth(), nextMonthOf(currentMonth())];
  const [home, rows, monthRows] = await Promise.all([
    getStudentHome(user.id),
    listSlots(user.id, monday, addDays(monday, 4)),
    listMonthsForStudent(user.id, months),
  ]);

  const days: ReserveDay[] = weekDays(monday).map((date) => ({
    date,
    label: dayLong(date),
    slots: rows
      .filter((r) => r.date === date && (r.state === "free" || r.state === "mine"))
      .map((r) => ({ start: r.start.toISOString(), hour: r.hour, state: r.state as "free" | "mine", long: slotLong(r.start) })),
  }));
  const anyFree = days.some((d) => d.slots.some((s) => s.state === "free"));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Reservar clase</h1>
          <p className="mt-2 text-muted">
            Semana del {weekRangeLabel(monday)}
            {home ? ` · horarios de ${home.ptName}` : ""}.
          </p>
        </div>
        <nav aria-label="Cambiar de semana" className="flex items-center gap-2">
          {monday > thisMonday ? (
            <Link href={`/alumno/reservar?semana=${addDays(monday, -7)}`} className="btn btn-quiet btn-sm" aria-label="Semana anterior">
              <ChevronLeft size={16} aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-quiet btn-sm" aria-disabled="true">
              <ChevronLeft size={16} aria-hidden />
            </span>
          )}
          <Link href="/alumno/reservar" className="btn btn-quiet btn-sm">
            Esta semana
          </Link>
          {monday < lastMonday ? (
            <Link href={`/alumno/reservar?semana=${addDays(monday, 7)}`} className="btn btn-quiet btn-sm" aria-label="Semana siguiente">
              <ChevronRight size={16} aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-quiet btn-sm" aria-disabled="true">
              <ChevronRight size={16} aria-hidden />
            </span>
          )}
        </nav>
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
      {!anyFree && days.every((d) => d.slots.length === 0) && (
        <p className="panel panel-pad text-muted">No hay horarios libres esta semana. Prueba con la siguiente.</p>
      )}
      <ReserveWeek days={days} />
      <p className="text-sm text-muted">
        Puedes cancelar una clase hasta 24 horas antes. Después ya no se puede cancelar desde aquí.
      </p>
    </div>
  );
}
