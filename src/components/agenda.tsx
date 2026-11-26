"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Ban, Plus, X } from "lucide-react";
import {
  blockSlot,
  cancelBookingAsPt,
  createBlock,
  removeBlock,
  saveWeekSchedule,
} from "@/app/actions/pt";
import { cancelBookingAsStudent } from "@/app/actions/student";
import { initialState } from "@/lib/action-state";
import { hourLabel } from "@/lib/dates";
import { expandBlocks, weeklyHours, WEEKDAYS, type ScheduleBlock } from "@/lib/schedule";
import { Field, FormMessage, SubmitButton } from "./ui";

const FROM_HOURS = Array.from({ length: 24 }, (_, i) => i);

// ---------------------------------------------------------------------------
// PT: agenda semanal
// ---------------------------------------------------------------------------
export function BlockSlotButton({ date, hour }: { date: string; hour: number }) {
  const [state, action] = useActionState(blockSlot, initialState);
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="hour" value={hour} />
      <SubmitButton className="btn btn-quiet btn-sm !min-h-9 !px-3" pendingText="…">
        <Ban size={14} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Bloquear {hourLabel(hour)} del {date}</span>
        <span aria-hidden className="text-sm">Bloquear</span>
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
      <summary className="btn btn-quiet btn-sm !min-h-9 cursor-pointer list-none !bg-paper !px-3 text-sm marker:content-none">
        <X size={14} strokeWidth={1.75} aria-hidden />
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
type EditorBlock = ScheduleBlock & { key: number };

const WEEKDAY_PRESET: ScheduleBlock[] = [{ days: [1, 2, 3, 4, 5], start: 6, end: 22 }];

function HourSelects({
  idBase,
  label,
  start,
  end,
  onChange,
}: {
  idBase: string;
  label: string;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  // «Hasta» solo ofrece horas posteriores a «Desde», así no se puede armar un tramo al revés.
  const toHours = Array.from({ length: 24 - start }, (_, i) => start + 1 + i);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="field">
        <label htmlFor={`${idBase}-from`}>Desde</label>
        <select
          id={`${idBase}-from`}
          aria-label={`Desde (${label})`}
          value={start}
          onChange={(e) => {
            const nextStart = Number(e.target.value);
            onChange(nextStart, end <= nextStart ? nextStart + 1 : end);
          }}
          className="input min-h-10 w-auto py-1 text-sm"
        >
          {FROM_HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-to`}>Hasta</label>
        <select
          id={`${idBase}-to`}
          aria-label={`Hasta (${label})`}
          value={end}
          onChange={(e) => onChange(start, Number(e.target.value))}
          className="input min-h-10 w-auto py-1 text-sm"
        >
          {toHours.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Horario semanal: bloques de «estos días, de tal hora a tal hora». Se guarda todo de una vez. */
export function ScheduleEditor({ initial }: { initial: ScheduleBlock[] }) {
  const [state, action] = useActionState(saveWeekSchedule, initialState);
  const uid = useId().replace(/:/g, "");
  const nextKey = useRef(initial.length);
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => initial.map((b, i) => ({ ...b, key: i })));

  const patch = (key: number, change: Partial<ScheduleBlock>) =>
    setBlocks((all) => all.map((b) => (b.key === key ? { ...b, ...change } : b)));
  const toggleDay = (key: number, day: number) =>
    setBlocks((all) =>
      all.map((b) =>
        b.key === key
          ? { ...b, days: b.days.includes(day) ? b.days.filter((d) => d !== day) : [...b.days, day].sort((x, y) => x - y) }
          : b,
      ),
    );
  const addBlock = () =>
    setBlocks((all) => [...all, { key: nextKey.current++, days: [], start: all.length === 0 ? 6 : 16, end: all.length === 0 ? 22 : 21 }]);
  const usePreset = () => {
    setBlocks(WEEKDAY_PRESET.map((b) => ({ ...b, key: nextKey.current++ })));
  };

  const plain: ScheduleBlock[] = blocks.map(({ days, start, end }) => ({ days, start, end }));
  const expanded = expandBlocks(plain);
  const rules = "rules" in expanded ? expanded.rules : [];
  const hours = weeklyHours(rules);

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="blocks" value={JSON.stringify(plain)} />

      {blocks.length === 0 && (
        <p className="panel panel-pad text-muted">
          Todavía no tienes horas abiertas. Agrega un bloque o usa «Lunes a viernes, 06:00 a 22:00».
        </p>
      )}

      <ul className="grid gap-3">
        {blocks.map((b, i) => (
          <li key={b.key} className="panel grid gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3>Bloque {i + 1}</h3>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setBlocks((all) => all.filter((x) => x.key !== b.key))}
              >
                <X size={14} aria-hidden /> Quitar bloque {i + 1}
              </button>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm text-muted">Días</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = b.days.includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${d.long}, bloque ${i + 1}`}
                      onClick={() => toggleDay(b.key, d.n)}
                      className={`btn btn-sm ${on ? "btn-primary" : "btn-quiet"}`}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <HourSelects
              idBase={`${uid}-${b.key}`}
              label={`bloque ${i + 1}`}
              start={b.start}
              end={b.end}
              onChange={(start, end) => patch(b.key, { start, end })}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-quiet btn-sm" onClick={addBlock}>
          <Plus size={14} aria-hidden /> Agregar bloque
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={usePreset}>
          Lunes a viernes, 06:00 a 22:00
        </button>
      </div>

      <section aria-label="Cómo queda tu semana" className="panel grid gap-2 p-4">
        <h3>Así queda tu semana</h3>
        {"error" in expanded ? (
          <p className="field-error" role="alert">
            {expanded.error}
          </p>
        ) : (
          <>
            <ul className="grid gap-1 text-sm">
              {WEEKDAYS.map((d) => {
                const day = rules.filter((r) => r.weekday === d.n);
                return (
                  <li key={d.n} className="flex gap-3">
                    <span className="w-10 font-semibold">{d.short}</span>
                    <span className={day.length === 0 ? "text-muted" : ""}>
                      {day.length === 0
                        ? "Sin atención"
                        : day.map((r) => `${hourLabel(r.start)} a ${hourLabel(r.end)}`).join(" y ")}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm text-muted">
              {hours} {hours === 1 ? "clase" : "clases"} por semana. Cada hora es una clase de 1 hora que tus alumnos
              pueden reservar.
            </p>
          </>
        )}
      </section>

      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Guardando…">Guardar horario</SubmitButton>
      </div>
    </form>
  );
}

export function BlockForm() {
  const [state, action] = useActionState(createBlock, initialState);
  const uid = useId().replace(/:/g, "");
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(24);
  const toHours = Array.from({ length: 24 - from }, (_, i) => from + 1 + i);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="date" label="Fecha" type="date" state={state} required />
        <div className="field">
          <label htmlFor={`${uid}-from`}>Desde</label>
          <select
            id={`${uid}-from`}
            name="from"
            className="input"
            value={from}
            onChange={(e) => {
              const next = Number(e.target.value);
              setFrom(next);
              if (to <= next) setTo(next + 1);
            }}
          >
            {FROM_HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-to`}>Hasta</label>
          <select id={`${uid}-to`} name="to" className="input" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {toHours.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="hint -mt-2">De 00:00 a 24:00 se bloquea el día completo.</p>
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
// Alumno: cancelar (la reserva vive en reserve-calendar.tsx)
// ---------------------------------------------------------------------------
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
