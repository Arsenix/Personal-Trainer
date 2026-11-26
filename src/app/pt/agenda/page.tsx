import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BlockSlotButton, PtCancelForm } from "@/components/agenda";
import { listSlots, type SlotRow } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import {
  dayLong,
  hourLabel,
  isDateString,
  isMonthString,
  monthLabel,
  monthStartOf,
  monthWeeks,
  nextMonthOf,
  prevMonthOf,
  todayLocal,
} from "@/lib/dates";

export const metadata = { title: "Agenda" };

const HEADS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; mes?: string; semana?: string }>;
}) {
  const user = await requirePt();
  const { dia, mes, semana } = await searchParams;
  const today = todayLocal();

  // El mes sale de ?mes=, o del día pedido, o de hoy. (?semana= se mantiene por los enlaces antiguos.)
  const asked = isDateString(dia) ? dia : isDateString(semana) ? semana : null;
  const month = isMonthString(mes) ? mes : monthStartOf(asked ?? today);
  const weeks = monthWeeks(month);
  const rows = await listSlots(user.id, weeks[0][0], weeks[weeks.length - 1][6]);

  const byDay = new Map<string, SlotRow[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const inMonth = (d: string) => d.slice(0, 7) === month.slice(0, 7);
  const hasSlots = (d: string) => (byDay.get(d)?.length ?? 0) > 0;

  // Día elegido: el pedido; si no, hoy (si está en este mes); si no, el primero del mes con horarios.
  const firstWithSlots = weeks.flat().find((d) => inMonth(d) && hasSlots(d));
  const selected =
    asked && inMonth(asked) ? asked : inMonth(today) ? today : (firstWithSlots ?? month);

  const daySlots = (byDay.get(selected) ?? []).sort((a, b) => a.hour - b.hour);
  const isPastDay = selected < today;
  // De los días pasados solo importa lo que ocurrió: las horas vacías no aportan nada.
  const visible = daySlots.filter((s) => s.state !== "past" && !(isPastDay && s.state !== "booked"));
  const booked = daySlots.filter((s) => s.state === "booked").length;
  const free = daySlots.filter((s) => s.state === "free").length;
  const href = (d: string) => `/pt/agenda?mes=${month}&dia=${d}`;
  const monthHref = (m: string) => `/pt/agenda?mes=${m}`;
  const thisMonth = monthStartOf(today);

  return (
    <div className="grid gap-5">
      <header>
        <h1>Agenda</h1>
        <p className="mt-2 text-muted">Elige un día para ver sus horas y las clases reservadas.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <section aria-label="Calendario" className="panel grid gap-3 p-3 sm:p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2">
            <Link href={monthHref(prevMonthOf(month))} className="btn btn-quiet btn-sm" aria-label="Mes anterior">
              <ChevronLeft size={16} aria-hidden />
            </Link>
            <h2 className="first-cap text-lg" aria-live="polite">
              {monthLabel(month)}
            </h2>
            <Link href={monthHref(nextMonthOf(month))} className="btn btn-quiet btn-sm" aria-label="Mes siguiente">
              <ChevronRight size={16} aria-hidden />
            </Link>
          </div>

          <div role="grid" aria-label={`Días de ${monthLabel(month)}`} className="grid gap-1">
            <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
              {HEADS.map((h) => (
                <span key={h} role="columnheader" className="py-1">
                  {h}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} role="row" className="grid grid-cols-7 gap-1">
                {week.map((d) => {
                  if (!inMonth(d)) return <span key={d} role="gridcell" aria-hidden className="min-h-12" />;
                  const slots = byDay.get(d) ?? [];
                  const nBooked = slots.filter((s) => s.state === "booked").length;
                  const nFree = slots.filter((s) => s.state === "free").length;
                  const on = d === selected;
                  const label = `${dayLong(d)}: ${nBooked === 0 ? "sin clases" : plural(nBooked, "clase", "clases")}${nFree > 0 ? `, ${plural(nFree, "horario libre", "horarios libres")}` : ""}`;
                  const base =
                    "flex min-h-12 flex-col items-center justify-center rounded-[var(--radius-field)] border text-sm";
                  return (
                    <span key={d} role="gridcell" className="contents">
                      {slots.length === 0 ? (
                        <span className={`${base} border-transparent text-[#9aa19a]`}>
                          <span className="tabular-nums leading-none">{Number(d.slice(8))}</span>
                        </span>
                      ) : (
                        <Link
                          href={href(d)}
                          replace
                          scroll={false}
                          aria-current={on ? "date" : undefined}
                          aria-label={label}
                          className={`${base} ${
                            on
                              ? "border-ink bg-ink text-paper"
                              : d === today
                                ? "border-ink bg-paper font-bold"
                                : "border-line bg-paper hover:border-ink"
                          } ${d < today && !on ? "opacity-60" : ""}`}
                        >
                          <span className="tabular-nums leading-none">{Number(d.slice(8))}</span>
                          <span
                            aria-hidden
                            className={`mt-1 flex items-center gap-1 text-[11px] leading-none tabular-nums ${on ? "text-volt" : "text-muted"}`}
                          >
                            <span
                              className={`inline-block size-1.5 rounded-full ${nBooked > 0 ? "bg-volt-deep" : "bg-transparent"}`}
                            />
                            {nBooked > 0 ? nBooked : ""}
                          </span>
                        </Link>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-volt-deep" /> N.º de clases reservadas
            </span>
            {month !== thisMonth && (
              <Link href={href(today)} className="font-semibold text-ink underline underline-offset-4">
                Ir a hoy
              </Link>
            )}
          </div>
        </section>

        <section aria-labelledby="dia-elegido" className="grid gap-3">
          <div>
            <h2 id="dia-elegido" className="text-xl first-cap">
              {dayLong(selected)}
              {selected === today && <span className="tag tag-volt ml-2 align-middle normal-case">Hoy</span>}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {daySlots.length === 0
                ? "No atiendes este día."
                : isPastDay
                  ? plural(booked, "clase reservada", "clases reservadas") + "."
                  : `${plural(booked, "clase reservada", "clases reservadas")}, ${plural(free, "horario libre", "horarios libres")}.`}
            </p>
          </div>

          {daySlots.length === 0 && (
            <p className="panel panel-pad text-muted">
              Para cambiar los días y horas en que atiendes, ve a{" "}
              <Link href="/pt/disponibilidad" className="font-semibold text-ink underline underline-offset-4">
                Disponibilidad
              </Link>
              .
            </p>
          )}
          {daySlots.length > 0 && visible.length === 0 && (
            <p className="panel panel-pad text-muted">
              {isPastDay ? "No hubo clases este día." : "Ya pasaron todos los horarios de hoy."}
            </p>
          )}

          <ul className="grid grid-cols-1 gap-1.5">
            {visible.map((s) => {
              if (s.state === "booked") {
                return (
                  <li key={s.hour} className={`cell cell-booked relative !min-h-14 md:!h-auto ${s.start < new Date() ? "opacity-70" : ""}`}>
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="tabular-nums">{hourLabel(s.hour)}</span>{" "}
                        <span className="font-semibold">{s.studentName}</span>
                      </p>
                      {s.locationName && <p className="truncate text-xs">{s.locationName}</p>}
                    </div>
                    {s.start > new Date() ? <PtCancelForm id={s.bookingId!} who={s.studentName ?? "este alumno"} /> : null}
                  </li>
                );
              }
              if (s.state === "blocked") {
                return (
                  <li key={s.hour} className="cell cell-blocked !min-h-12 md:!h-auto">
                    <span className="tabular-nums">{hourLabel(s.hour)}</span>
                    <span className="text-xs">Bloqueado</span>
                  </li>
                );
              }
              return (
                <li key={s.hour} className="cell !min-h-12 md:!h-auto">
                  <span className="flex items-baseline gap-3">
                    <span className="font-medium tabular-nums">{hourLabel(s.hour)}</span>
                    <span className="text-xs text-muted">Libre</span>
                  </span>
                  <BlockSlotButton date={selected} hour={s.hour} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

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
