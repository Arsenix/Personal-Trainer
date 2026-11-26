"use client";

import { useActionState, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { saveWorkout } from "@/app/actions/student";
import { initialState } from "@/lib/action-state";
import { FormMessage, SubmitButton } from "./ui";

export type LoggerExercise = {
  position: number;
  name: string;
  sets: number;
  reps: string;
  weight: number | null;
  note: string;
  /** Lo guardado hoy, si el alumno ya registró este día. */
  saved: { note: string; sets: { reps: number | null; weight: number | null; done: boolean }[] } | null;
  /** Resumen de la última vez, ya formateado ("4 × 10 · 60 kg"). */
  last: { date: string; summary: string } | null;
};

type SetState = { reps: string; weight: string; done: boolean };
type ExState = { note: string; sets: SetState[] };

const num = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/** "8-10" → "8"; "10" → "10"; "al fallo" → "". */
function firstInt(reps: string): string {
  const m = reps.match(/\d{1,3}/);
  return m ? m[0] : "";
}

function initial(e: LoggerExercise): ExState {
  if (e.saved) {
    return { note: e.saved.note, sets: e.saved.sets.map((s) => ({ reps: num(s.reps), weight: num(s.weight), done: s.done })) };
  }
  return {
    note: "",
    sets: Array.from({ length: e.sets }, () => ({ reps: firstInt(e.reps), weight: num(e.weight), done: false })),
  };
}

const toNumber = (v: string) => Number(v.replace(",", "."));

/** Anota las series de un día de la rutina: repeticiones y peso, ya rellenados con lo que indicó el PT. */
export function WorkoutLogger({ dayId, exercises }: { dayId: string; exercises: LoggerExercise[] }) {
  const [state, action] = useActionState(saveWorkout, initialState);
  const [data, setData] = useState<ExState[]>(() => exercises.map(initial));

  function setSet(ei: number, si: number, patch: Partial<SetState>) {
    setData((d) => d.map((ex, i) => (i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) })));
  }
  function bump(ei: number, si: number, field: "reps" | "weight", delta: number) {
    const cur = toNumber(data[ei].sets[si][field] || "0");
    const next = Math.max(0, Math.round(((Number.isFinite(cur) ? cur : 0) + delta) * 100) / 100);
    setSet(ei, si, { [field]: String(next).replace(".", ",") });
  }

  const payload = JSON.stringify(
    exercises.map((e, i) => ({
      position: e.position,
      note: data[i].note,
      sets: data[i].sets.map((s) => ({
        reps: s.reps.trim() === "" ? "" : s.reps.trim(),
        weight: s.weight.trim() === "" ? "" : s.weight.trim().replace(",", "."),
        done: s.done,
      })),
    })),
  );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="day" value={dayId} />
      <input type="hidden" name="data" value={payload} />

      {exercises.map((e, ei) => (
        <fieldset key={e.position} className="panel grid gap-3 p-3 sm:p-4">
          <legend className="sr-only">{e.name}</legend>
          <div className="min-w-0">
            <p className="font-semibold">{e.name}</p>
            <p className="text-sm tabular-nums text-muted">
              Indicado: {e.sets} × {e.reps}
              {e.weight !== null && ` · ${num(e.weight)} kg`}
            </p>
            {e.note && <p className="text-sm text-muted">{e.note}</p>}
            {e.last && (
              <p className="mt-1 text-sm tabular-nums">
                <span className="text-muted">Última vez ({e.last.date}):</span> {e.last.summary}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <div className="grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_2.75rem] gap-2 text-xs font-semibold text-muted" aria-hidden>
              <span>N.º</span>
              <span>Reps</span>
              <span>Peso (kg)</span>
              <span />
            </div>
            {data[ei].sets.map((s, si) => (
              <div key={si} className="grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">{si + 1}</span>
                <Stepper
                  label={`${e.name}, serie ${si + 1}: repeticiones`}
                  value={s.reps}
                  inputMode="numeric"
                  onChange={(v) => setSet(ei, si, { reps: v })}
                  onBump={(d) => bump(ei, si, "reps", d)}
                  step={1}
                  buttons={false}
                />
                <Stepper
                  label={`${e.name}, serie ${si + 1}: peso en kilos`}
                  value={s.weight}
                  inputMode="decimal"
                  onChange={(v) => setSet(ei, si, { weight: v })}
                  onBump={(d) => bump(ei, si, "weight", d)}
                  step={2.5}
                />
                <button
                  type="button"
                  aria-pressed={s.done}
                  aria-label={`${e.name}, serie ${si + 1} hecha`}
                  onClick={() => setSet(ei, si, { done: !s.done })}
                  className={`grid size-11 place-items-center rounded-[var(--radius-field)] border ${
                    s.done ? "border-volt-deep bg-volt text-ink" : "border-line bg-paper text-muted"
                  }`}
                >
                  <Check size={18} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <div className="field">
            <label htmlFor={`nota-${dayId}-${e.position}`}>Nota (opcional)</label>
            <input
              id={`nota-${dayId}-${e.position}`}
              value={data[ei].note}
              maxLength={200}
              onChange={(ev) => setData((d) => d.map((x, i) => (i === ei ? { ...x, note: ev.target.value } : x)))}
              className="input min-h-10 text-sm"
              placeholder="Ej.: costó la última serie"
            />
          </div>
        </fieldset>
      ))}

      <FormMessage state={state} />
      <div>
        <SubmitButton className="btn btn-primary" pendingText="Guardando…">
          Guardar entrenamiento
        </SubmitButton>
      </div>
    </form>
  );
}

function Stepper({
  label,
  value,
  inputMode,
  onChange,
  onBump,
  step,
  buttons = true,
}: {
  label: string;
  value: string;
  inputMode: "numeric" | "decimal";
  onChange: (v: string) => void;
  onBump: (delta: number) => void;
  step: number;
  buttons?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center">
      {buttons && (
        <button
          type="button"
          aria-label={`Menos: ${label}`}
          onClick={() => onBump(-step)}
          className="grid size-11 shrink-0 place-items-center rounded-l-[var(--radius-field)] border border-r-0 border-line bg-paper text-muted"
        >
          <Minus size={14} aria-hidden />
        </button>
      )}
      <input
        aria-label={label}
        value={value}
        inputMode={inputMode}
        autoComplete="off"
        maxLength={6}
        onChange={(ev) => onChange(ev.target.value.replace(/[^0-9,.]/g, ""))}
        className={`input !min-h-11 !w-full min-w-0 px-1 text-center tabular-nums ${buttons ? "!rounded-none" : ""}`}
      />
      {buttons && (
        <button
          type="button"
          aria-label={`Más: ${label}`}
          onClick={() => onBump(step)}
          className="grid size-11 shrink-0 place-items-center rounded-r-[var(--radius-field)] border border-l-0 border-line bg-paper text-muted"
        >
          <Plus size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
