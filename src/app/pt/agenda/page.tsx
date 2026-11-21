import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BlockSlotButton, PtCancelForm } from "@/components/agenda";
import { listSlots, type SlotRow } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { addDays, dayShort, hourLabel, todayLocal, weekDays, weekFromParam, weekRangeLabel } from "@/lib/dates";

export const metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const user = await requirePt();
  const { semana } = await searchParams;
  const monday = weekFromParam(semana);
  const days = weekDays(monday);
  const today = todayLocal();
  const thisMonday = weekFromParam(undefined);

  const rows = await listSlots(user.id, days[0], days[4]);
  const byDay = new Map<string, Map<number, SlotRow>>();
  for (const r of rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, new Map());
    byDay.get(r.date)!.set(r.hour, r);
  }
  const hours = [...new Set(rows.map((r) => r.hour))].sort((a, b) => a - b);
  const booked = rows.filter((r) => r.state === "booked").length;
  const free = rows.filter((r) => r.state === "free").length;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Agenda</h1>
          <p className="mt-2 text-muted">
            Semana del {weekRangeLabel(monday)}.{" "}
            {rows.length > 0 && (
              <>
                {booked} {booked === 1 ? "clase reservada" : "clases reservadas"}, {free}{" "}
                {free === 1 ? "horario libre" : "horarios libres"}.
              </>
            )}
          </p>
        </div>
        <nav aria-label="Cambiar de semana" className="flex items-center gap-2">
          <Link href={`/pt/agenda?semana=${addDays(monday, -7)}`} className="btn btn-quiet btn-sm" aria-label="Semana anterior">
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <Link
            href="/pt/agenda"
            className="btn btn-quiet btn-sm"
            aria-current={monday === thisMonday ? "page" : undefined}
          >
            Esta semana
          </Link>
          <Link href={`/pt/agenda?semana=${addDays(monday, 7)}`} className="btn btn-quiet btn-sm" aria-label="Semana siguiente">
            <ChevronRight size={16} aria-hidden />
          </Link>
        </nav>
      </header>

      {hours.length === 0 ? (
        <section className="panel panel-pad">
          <h2>No hay horarios publicados esta semana</h2>
          <p className="mt-2 max-w-md text-muted">
            Define en qué días y horas atiendes y tus alumnos podrán reservar.
          </p>
          <p className="mt-4">
            <Link href="/pt/disponibilidad" className="btn btn-primary">
              Configurar disponibilidad
            </Link>
          </p>
        </section>
      ) : (
        <div className="grid gap-5 md:grid-cols-5 md:gap-2">
          {days.map((date) => {
            const slots = byDay.get(date) ?? new Map<number, SlotRow>();
            const freeCount = [...slots.values()].filter((s) => s.state === "free").length;
            const visibleOnMobile = [...slots.values()].filter((s) => s.state === "booked" || s.state === "blocked").length;
            return (
              <section key={date} aria-labelledby={`d-${date}`} className="min-w-0">
                <h2
                  id={`d-${date}`}
                  className={`mb-2 flex items-center gap-2 border-b-2 pb-1 text-base first-cap ${
                    date === today ? "border-ink" : "border-line"
                  }`}
                >
                  {dayShort(date)}
                  {date === today && <span className="tag tag-volt normal-case">Hoy</span>}
                </h2>
                {visibleOnMobile === 0 && (
                  <p className="text-sm text-muted md:hidden">
                    {freeCount > 0 ? `Sin clases. ${freeCount} horarios libres.` : "Sin clases."}
                  </p>
                )}
                <ul className="grid gap-1.5">
                  {hours.map((h) => {
                    const s = slots.get(h);
                    if (!s) return <li key={h} aria-hidden className="cell cell-empty max-md:hidden" />;
                    if (s.state === "booked") {
                      return (
                        <li key={h} className={`cell cell-booked relative ${s.start < new Date() ? "opacity-70" : ""}`}>
                          <div className="min-w-0">
                            <p className="truncate text-xs">
                              {hourLabel(h)}
                              {s.locationName ? ` · ${s.locationName}` : ""}
                            </p>
                            <p className="truncate font-semibold">{s.studentName}</p>
                          </div>
                          {!s.start || s.start > new Date() ? (
                            <PtCancelForm id={s.bookingId!} who={s.studentName ?? "este alumno"} />
                          ) : null}
                        </li>
                      );
                    }
                    if (s.state === "blocked") {
                      return (
                        <li key={h} className="cell cell-blocked">
                          <span>{hourLabel(h)}</span>
                          <span className="text-xs">Bloqueado</span>
                        </li>
                      );
                    }
                    if (s.state === "past") {
                      return (
                        <li key={h} className="cell cell-past max-md:hidden">
                          <span className="text-muted">{hourLabel(h)}</span>
                        </li>
                      );
                    }
                    return (
                      <li key={h} className="cell max-md:hidden">
                        <span className="font-medium">{hourLabel(h)}</span>
                        <BlockSlotButton date={date} hour={h} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-sm text-muted">
        Para cambiar los días y horas en que atiendes, o bloquear vacaciones, ve a{" "}
        <Link href="/pt/disponibilidad" className="font-semibold text-ink underline underline-offset-4">
          Disponibilidad
        </Link>
        .
      </p>
    </div>
  );
}
