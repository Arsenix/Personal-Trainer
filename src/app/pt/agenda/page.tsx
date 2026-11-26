import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BlockSlotButton, PtCancelForm } from "@/components/agenda";
import { listSlots, type SlotRow } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { WEEKDAYS } from "@/lib/schedule";
import { addDays, dayShort, hourLabel, isDateString, todayLocal, weekFromParam, weekRangeLabel } from "@/lib/dates";

export const metadata = { title: "Agenda" };

const COLS: Record<number, string> = { 5: "md:grid-cols-5", 6: "md:grid-cols-6", 7: "md:grid-cols-7" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string; dia?: string }> }) {
  const user = await requirePt();
  const { semana, dia } = await searchParams;
  const monday = weekFromParam(semana);
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
  const today = todayLocal();
  const thisMonday = weekFromParam(undefined);

  const rows = await listSlots(user.id, week[0], week[6]);
  const byDay = new Map<string, Map<number, SlotRow>>();
  for (const r of rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, new Map());
    byDay.get(r.date)!.set(r.hour, r);
  }
  // Lunes a viernes siempre; sábado y domingo solo si el PT atiende esos días.
  const days = week.filter((d, i) => i < 5 || byDay.has(d));
  const hours = [...new Set(rows.map((r) => r.hour))].sort((a, b) => a - b);
  const booked = rows.filter((r) => r.state === "booked").length;
  const free = rows.filter((r) => r.state === "free").length;
  // En el celular se ve un día a la vez: el pedido, si no hoy, si no el primero de la semana.
  const selected = isDateString(dia) && days.includes(dia) ? dia : days.includes(today) ? today : days[0];
  const bookedOn = (d: string) => [...(byDay.get(d)?.values() ?? [])].filter((s) => s.state === "booked").length;

  return (
    <div className="grid gap-5">
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
        <>
          {/* Celular: elegir el día arriba y ver solo ese. En escritorio se ven todos a la vez. */}
          <nav
            aria-label="Elegir día"
            className="grid gap-1 md:hidden"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((d) => {
              const n = bookedOn(d);
              const on = d === selected;
              return (
                <Link
                  key={d}
                  href={`/pt/agenda?semana=${monday}&dia=${d}`}
                  replace
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  aria-label={`${dayShort(d)}: ${n === 0 ? "sin clases" : n === 1 ? "1 clase" : `${n} clases`}`}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-[var(--radius-field)] border text-center ${
                    on ? "border-ink bg-ink text-paper" : d === today ? "border-ink bg-paper" : "border-line bg-paper"
                  }`}
                >
                  <span className="text-[11px] leading-none">{WEEKDAYS[week.indexOf(d)].short}</span>
                  <span className="mt-1 text-base font-semibold leading-none tabular-nums">{Number(d.slice(8))}</span>
                  <span
                    aria-hidden
                    className={`mt-1 h-1.5 w-1.5 rounded-full ${n > 0 ? (on ? "bg-volt" : "bg-volt-deep") : "bg-transparent"}`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className={`grid gap-3 md:gap-2 ${COLS[days.length] ?? "md:grid-cols-5"}`}>
            {days.map((date) => {
              const slots = byDay.get(date) ?? new Map<number, SlotRow>();
              return (
                <section
                  key={date}
                  aria-labelledby={`d-${date}`}
                  className={`min-w-0 ${date === selected ? "" : "max-md:hidden"}`}
                >
                  <h2
                    id={`d-${date}`}
                    className={`mb-1.5 flex h-9 items-center gap-2 border-b-2 text-base ${
                      date === today ? "border-ink" : "border-line"
                    }`}
                  >
                    <span className="first-cap">{dayShort(date)}</span>
                    {date === today && <span className="tag tag-volt normal-case !py-0 !text-[11px]">Hoy</span>}
                  </h2>
                  {slots.size === 0 && <p className="text-sm text-muted md:hidden">No atiendes este día.</p>}
                  <ul className="grid grid-cols-1 gap-1">
                    {hours.map((h) => {
                      const s = slots.get(h);
                      if (!s) return <li key={h} aria-hidden className="cell cell-empty max-md:!hidden" />;
                      if (s.state === "booked") {
                        const label = s.locationName ? `${s.studentName} · ${s.locationName}` : (s.studentName ?? "");
                        return (
                          <li
                            key={h}
                            title={label}
                            className={`cell cell-booked relative ${s.start < new Date() ? "opacity-70" : ""}`}
                          >
                            <div className="min-w-0">
                              <p className="truncate">
                                <span className="text-xs tabular-nums">{hourLabel(h)}</span>{" "}
                                <span className="font-semibold">{s.studentName}</span>
                              </p>
                              {s.locationName && <p className="truncate text-xs md:hidden">{s.locationName}</p>}
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
                            <span className="tabular-nums">{hourLabel(h)}</span>
                            <span className="text-xs">Bloqueado</span>
                          </li>
                        );
                      }
                      if (s.state === "past") {
                        return (
                          <li key={h} className="cell cell-past max-md:!hidden">
                            <span className="tabular-nums text-muted">{hourLabel(h)}</span>
                          </li>
                        );
                      }
                      return (
                        <li key={h} className="cell">
                          <span className="font-medium tabular-nums">{hourLabel(h)}</span>
                          <BlockSlotButton date={date} hour={h} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
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
