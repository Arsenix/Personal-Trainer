"use client";

import { useActionState, useState } from "react";
import { Ban, CalendarCheck, X } from "lucide-react";
import {
  blockSlot,
  cancelBookingAsPt,
  createBlock,
  removeBlock,
  resetDefaultRules,
  saveDayRules,
} from "@/app/actions/pt";
import { bookClass, cancelBookingAsStudent } from "@/app/actions/student";
import { initialState } from "@/lib/action-state";
import { hourLabel } from "@/lib/dates";
import { Field, FormMessage, SelectField, SubmitButton } from "./ui";

const FROM_HOURS = Array.from({ length: 24 }, (_, i) => i);
const TO_HOURS = Array.from({ length: 24 }, (_, i) => i + 1);

// ---------------------------------------------------------------------------
// PT: agenda semanal
// ---------------------------------------------------------------------------
export function BlockSlotButton({ date, hour }: { date: string; hour: number }) {
  const [state, action] = useActionState(blockSlot, initialState);
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="hour" value={hour} />
      <SubmitButton className="btn btn-quiet btn-sm !min-h-8 !px-2" pendingText="…">
        <Ban size={14} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Bloquear {hourLabel(hour)} del {date}</span>
        <span aria-hidden className="text-xs">Bloquear</span>
      </SubmitButton>
      {state.error && (
        <p className="field-error mt-1 text-xs" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PtCancelForm({ id, who }: { id: string; who: string }) {
  const [state, action] = useActionState(cancelBookingAsPt, initialState);
  return (
    <details className="group relative shrink-0">
      <summary className="btn btn-quiet btn-sm !min-h-8 cursor-pointer list-none !px-2 text-xs marker:content-none">
        Cancelar
      </summary>
      <form
        action={action}
        className="panel absolute right-0 top-full z-30 mt-1 grid w-64 gap-3 p-3 shadow-lg"
      >
        <p className="text-sm font-semibold">Cancelar la clase de {who}</p>
        <input type="hidden" name="id" value={id} />
        <div className="field">
          <label htmlFor={`reason-${id}`}>Motivo (opcional)</label>
          <input id={`reason-${id}`} name="reason" maxLength={200} className="input min-h-10 text-sm" />
          <p className="hint">Se lo enviamos al alumno por correo.</p>
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn btn-danger btn-sm" pendingText="Cancelando…">
          Confirmar cancelación
        </SubmitButton>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// PT: disponibilidad
// ---------------------------------------------------------------------------
export function DayRulesForm({
  weekday,
  label,
  ranges,
}: {
  weekday: number;
  label: string;
  ranges: { start: number; end: number }[];
}) {
  const [state, action] = useActionState(saveDayRules, initialState);
  const rows = [...ranges, { start: -1, end: -1 }]; // una fila vacía para agregar un tramo
  return (
    <form action={action} className="panel grid gap-3 p-4">
      <input type="hidden" name="weekday" value={weekday} />
      <div className="flex items-baseline justify-between gap-3">
        <h3>{label}</h3>
        <span className="text-sm text-muted">
          {ranges.length === 0 ? "Sin atención" : `${ranges.length} ${ranges.length === 1 ? "tramo" : "tramos"}`}
        </span>
      </div>
      <ul className="grid gap-2">
        {rows.map((r, i) => (
          <li key={`${weekday}-${i}-${r.start}-${r.end}`} className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-sm text-muted">{r.start < 0 ? "Agregar" : `Tramo ${i + 1}`}</span>
            <label className="sr-only" htmlFor={`from-${weekday}-${i}`}>
              Desde ({label}, fila {i + 1})
            </label>
            <select
              id={`from-${weekday}-${i}`}
              name="from"
              defaultValue={r.start < 0 ? "" : String(r.start)}
              className="input min-h-10 w-auto py-1 text-sm"
            >
              <option value="">—</option>
              {FROM_HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
            <span aria-hidden className="text-muted">
              a
            </span>
            <label className="sr-only" htmlFor={`to-${weekday}-${i}`}>
              Hasta ({label}, fila {i + 1})
            </label>
            <select
              id={`to-${weekday}-${i}`}
              name="to"
              defaultValue={r.end < 0 ? "" : String(r.end)}
              className="input min-h-10 w-auto py-1 text-sm"
            >
              <option value="">—</option>
              {TO_HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Para quitar un tramo, deja su hora en «—». Cada hora entre el inicio y el término es una clase.</p>
      <FormMessage state={state} />
      <div>
        <SubmitButton className="btn btn-primary btn-sm">Guardar {label.toLowerCase()}</SubmitButton>
      </div>
    </form>
  );
}

export function ResetRulesForm() {
  const [state, action] = useActionState(resetDefaultRules, initialState);
  return (
    <form action={action} className="grid gap-2">
      <FormMessage state={state} />
      <div>
        <SubmitButton className="btn btn-quiet btn-sm" pendingText="Restableciendo…">
          Restablecer lunes a viernes, 06:00 a 22:00
        </SubmitButton>
      </div>
    </form>
  );
}

export function BlockForm() {
  const [state, action] = useActionState(createBlock, initialState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="date" label="Fecha" type="date" state={state} required />
        <SelectField name="from" label="Desde" state={state} defaultValue="0">
          {FROM_HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </SelectField>
        <SelectField name="to" label="Hasta" state={state} defaultValue="24">
          {TO_HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </SelectField>
      </div>
      <Field name="reason" label="Motivo (opcional)" state={state} hint="Solo lo ves tú." />
      {state.conflicts ? (
        <div className="alert alert-error grid gap-3" role="alert">
          <p>
            En ese horario hay {state.conflicts} {state.conflicts === 1 ? "clase reservada" : "clases reservadas"}. Si
            sigues, se {state.conflicts === 1 ? "cancela" : "cancelan"} y avisamos por correo a{" "}
            {state.conflicts === 1 ? "el alumno" : "los alumnos"}.
          </p>
          <div>
            <button type="submit" name="confirm" value="1" className="btn btn-danger btn-sm">
              Bloquear y cancelar {state.conflicts === 1 ? "la clase" : "las clases"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <SubmitButton pendingText="Bloqueando…">Bloquear horario</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function RemoveBlockForm({ id }: { id: string }) {
  const [state, action] = useActionState(removeBlock, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn btn-quiet btn-sm" pendingText="…">
        <X size={14} aria-hidden /> Quitar
      </SubmitButton>
      {state.error && (
        <p className="field-error text-xs" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Alumno: reservar y cancelar
// ---------------------------------------------------------------------------
export type ReserveSlot = { start: string; hour: number; state: "free" | "mine"; long: string };
export type ReserveDay = { date: string; label: string; slots: ReserveSlot[] };

export function ReserveWeek({ days }: { days: ReserveDay[] }) {
  const [state, action] = useActionState(bookClass, initialState);
  const [selected, setSelected] = useState<string | null>(null);
  // La selección solo vale mientras ese horario siga libre (tras reservar pasa a "Tu clase").
  const current = days.flatMap((d) => d.slots).find((s) => s.start === selected && s.state === "free") ?? null;

  return (
    <div className="grid gap-6">
      <FormMessage state={state} />
      {days.map((d) => (
        <section key={d.date} aria-labelledby={`dia-${d.date}`} className="grid gap-3">
          <h2 id={`dia-${d.date}`} className="text-lg capitalize">
            {d.label}
          </h2>
          {d.slots.length === 0 ? (
            <p className="text-sm text-muted">Sin horarios libres este día.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {d.slots.map((s) => (
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
      ))}

      {current && (
        <form
          action={action}
          className="on-dark sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] bg-ink p-4 text-paper shadow-xl"
        >
          <input type="hidden" name="start" value={current.start} />
          <p className="min-w-0 text-sm">
            <span className="block text-[#9aa7b0]">Vas a reservar</span>
            <span className="font-semibold capitalize">{current.long}</span>
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

export function StudentCancelForm({ id, canCancel }: { id: string; canCancel: boolean }) {
  const [state, action] = useActionState(cancelBookingAsStudent, initialState);
  if (!canCancel) {
    return (
      <p className="max-w-xs text-sm text-muted">
        Faltan menos de 24 horas: ya no se puede cancelar desde aquí. Si no puedes ir, avísale a tu PT.
      </p>
    );
  }
  return (
    <details className="group">
      <summary className="btn btn-quiet btn-sm cursor-pointer list-none marker:content-none">Cancelar clase</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm text-muted">Se libera el horario y le avisamos a tu PT.</p>
        <FormMessage state={state} />
        <div>
          <SubmitButton className="btn btn-danger btn-sm" pendingText="Cancelando…">
            Sí, cancelar
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
