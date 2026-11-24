"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { bookClass } from "@/app/actions/student";
import { initialState } from "@/lib/action-state";
import { hourLabel } from "@/lib/dates";
import { FormMessage, SubmitButton } from "./ui";

export type ReserveSlot = { start: string; hour: number; state: "free" | "mine"; long: string };

const WEEKDAY_HEADS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Calendario del mes: se elige un día y debajo salen sus horarios libres. */
export function ReserveCalendar({
  month,
  monthTitle,
  weeks,
  slotsByDay,
  labels,
  today,
  initialDay,
  prevHref,
  nextHref,
}: {
  month: string;
  monthTitle: string;
  weeks: string[][];
  slotsByDay: Record<string, ReserveSlot[]>;
  labels: Record<string, string>;
  today: string;
  initialDay: string | null;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const [state, action] = useActionState(bookClass, initialState);
  const [day, setDay] = useState<string | null>(initialDay);
  const [selected, setSelected] = useState<string | null>(null);

  const daySlots = day ? (slotsByDay[day] ?? []) : [];
  // La selección solo vale mientras ese horario siga libre (tras reservar pasa a "Tu clase").
  const current = daySlots.find((s) => s.start === selected && s.state === "free") ?? null;
  const monthHasFree = Object.values(slotsByDay).some((l) => l.some((s) => s.state === "free"));

  return (
    <div className="grid gap-6">
      <FormMessage state={state} />

      <section aria-label="Calendario" className="panel grid gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          {prevHref ? (
            <Link href={prevHref} className="btn btn-quiet btn-sm" aria-label="Mes anterior">
              <ChevronLeft size={16} aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-quiet btn-sm opacity-40" aria-disabled="true">
              <ChevronLeft size={16} aria-hidden />
            </span>
          )}
          <h2 className="first-cap text-lg" aria-live="polite">
            {monthTitle}
          </h2>
          {nextHref ? (
            <Link href={nextHref} className="btn btn-quiet btn-sm" aria-label="Mes siguiente">
              <ChevronRight size={16} aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-quiet btn-sm opacity-40" aria-disabled="true">
              <ChevronRight size={16} aria-hidden />
            </span>
          )}
        </div>

        <div role="grid" aria-label={`Días de ${monthTitle}`} className="grid gap-1">
          <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
            {WEEKDAY_HEADS.map((h) => (
              <span key={h} role="columnheader" className="py-1">
                {h}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="grid grid-cols-7 gap-1">
              {week.map((d) => {
                if (d.slice(0, 7) !== month.slice(0, 7)) return <span key={d} role="gridcell" aria-hidden className="min-h-12" />;
                const slots = slotsByDay[d] ?? [];
                const free = slots.filter((s) => s.state === "free").length;
                const mine = slots.some((s) => s.state === "mine");
                const available = free > 0 || mine;
                const isSelected = day === d;
                const status = free > 0 ? `${free} ${free === 1 ? "horario libre" : "horarios libres"}` : mine ? "tienes una clase" : "sin horarios";
                return (
                  <span key={d} role="gridcell" className="contents">
                    <button
                      type="button"
                      disabled={!available}
                      aria-pressed={isSelected}
                      aria-current={d === today ? "date" : undefined}
                      aria-label={`${labels[d] ?? d}: ${status}`}
                      onClick={() => {
                        setDay(d);
                        setSelected(null);
                      }}
                      className={[
                        "flex min-h-12 flex-col items-center justify-center rounded-[var(--radius-field)] border text-sm transition-colors",
                        isSelected
                          ? "border-ink bg-ink text-paper"
                          : available
                            ? "border-line bg-paper hover:border-ink"
                            : "border-transparent text-[#9aa19a]",
                        d === today ? "font-bold" : "",
                      ].join(" ")}
                    >
                      <span className="tabular-nums leading-none">{Number(d.slice(8))}</span>
                      {available && (
                        <span
                          aria-hidden
                          className={`mt-1 flex items-center gap-1 text-[11px] leading-none tabular-nums ${isSelected ? "text-volt" : "text-muted"}`}
                        >
                          <span className={`inline-block size-1.5 rounded-full ${mine && free === 0 ? "bg-ok" : "bg-volt-deep"}`} />
                          {free > 0 ? free : "✓"}
                        </span>
                      )}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Los días con número tienen horarios libres. Elige uno para ver las horas.
        </p>
      </section>

      {!monthHasFree && (
        <p className="panel panel-pad text-muted">
          No hay horarios libres en {monthTitle}. {nextHref ? "Prueba con el mes siguiente." : "Vuelve más adelante."}
        </p>
      )}

      {day && (
        <section aria-labelledby="dia-elegido" className="grid gap-3">
          <h2 id="dia-elegido" className="text-lg first-cap">
            {labels[day] ?? day}
          </h2>
          {daySlots.length === 0 ? (
            <p className="text-sm text-muted">Sin horarios libres este día.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {daySlots.map((s) => (
                <li key={s.start}>
                  {s.state === "mine" ? (
                    <span className="tag tag-volt flex min-h-11 w-full items-center justify-center rounded-[var(--radius-field)]">
                      <CalendarCheck size={14} aria-hidden /> Tu clase {hourLabel(s.hour)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={current?.start === s.start}
                      onClick={() => setSelected(s.start)}
                      className={`btn w-full ${current?.start === s.start ? "btn-primary" : "btn-quiet"}`}
                      aria-label={`Elegir ${s.long}`}
                    >
                      {hourLabel(s.hour)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {current && (
        <form
          action={action}
          className="on-dark sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] bg-ink p-4 text-paper shadow-xl"
        >
          <input type="hidden" name="start" value={current.start} />
          <p className="min-w-0 text-sm">
            <span className="block text-[#9aa7b0]">Vas a reservar</span>
            <span className="font-semibold first-cap">{current.long}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-quiet !border-[#3a4650] !text-paper" onClick={() => setSelected(null)}>
              Elegir otro
            </button>
            <SubmitButton className="btn btn-volt" pendingText="Reservando…">
              Confirmar reserva
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
