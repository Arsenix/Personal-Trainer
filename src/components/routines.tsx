"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { copyRoutine, saveRoutine, setRoutineActive } from "@/app/actions/pt";
import { initialState } from "@/lib/action-state";
import { FormMessage, SelectField, SubmitButton } from "./ui";
import { ExerciseCombobox } from "./exercise-combobox";
import type { RoutineDay } from "@/lib/queries";

// Todo como texto mientras se edita; el servidor valida y convierte.
type Ex = { key: string; name: string; sets: string; reps: string; weight: string; note: string };
type Day = { key: string; title: string; exercises: Ex[] };

let seq = 0;
const key = () => `k${++seq}`;
const blankEx = (): Ex => ({ key: key(), name: "", sets: "3", reps: "10", weight: "", note: "" });
const toState = (days: RoutineDay[]): Day[] =>
  days.map((d) => ({ key: key(), title: d.title, exercises: d.exercises.map((e) => ({
      key: key(),
      name: e.name,
      sets: String(e.sets),
      reps: e.reps,
      weight: e.weight === null ? "" : String(e.weight).replace(".", ","),
      note: e.note,
    })),
  }));

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function RoutineEditor({
  id,
  studentId,
  studentName,
  initial,
  suggestions,
}: {
  id?: string;
  studentId: string;
  studentName: string;
  initial?: { name: string; notes: string; days: RoutineDay[] };
  suggestions: string[];
}) {
  const [state, action] = useActionState(saveRoutine, initialState);
  const [days, setDays] = useState<Day[]>(() =>
    initial && initial.days.length > 0
      ? toState(initial.days)
      : [{ key: key(), title: "Día 1", exercises: [blankEx()] }],
  );
  // Controlados: React 19 vacía los campos no controlados después de cada envío, incluso con errores.
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const setDay = (i: number, patch: Partial<Day>) => setDays((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const setEx = (i: number, j: number, patch: Partial<Ex>) =>
    setDays((ds) =>
      ds.map((d, k) => (k === i ? { ...d, exercises: d.exercises.map((e, m) => (m === j ? { ...e, ...patch } : e)) } : d)),
    );

  const payload = JSON.stringify(
    days.map((d) => ({
      title: d.title,
      exercises: d.exercises.map(({ name, sets, reps, weight, note }) => ({ name, sets, reps, weight, note })),
    })),
  );

  return (
    <form action={action} className="grid gap-8">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="student" value={studentId} />
      <input type="hidden" name="days" value={payload} />

      <section className="panel panel-pad grid gap-4">
        <div className="field">
          <label htmlFor="r-name">Nombre de la rutina</label>
          <input id="r-name" name="name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} required />
          <p className="hint">Para {studentName}. Al guardarla pasa a ser su rutina activa. En cada ejercicio, el peso es opcional: vacío es peso corporal o sin carga.</p>
        </div>
        <div className="field">
          <label htmlFor="r-notes">Indicaciones generales (opcional)</label>
          <textarea id="r-notes" name="notes" className="input min-h-20" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      {days.map((d, i) => (
        <section key={d.key} className="panel panel-pad grid gap-4" aria-label={`Día ${i + 1}`}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="field min-w-0 flex-1">
              <label htmlFor={`day-${d.key}`}>Título del día {i + 1}</label>
              <input
                id={`day-${d.key}`}
                className="input"
                maxLength={60}
                value={d.title}
                onChange={(e) => setDay(i, { title: e.target.value })}
              />
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDays((x) => move(x, i, -1))} disabled={i === 0} aria-label={`Subir el día ${i + 1}`}>
                <ArrowUp size={16} aria-hidden />
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDays((x) => move(x, i, 1))} disabled={i === days.length - 1} aria-label={`Bajar el día ${i + 1}`}>
                <ArrowDown size={16} aria-hidden />
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDays((x) => x.filter((_, k) => k !== i))} disabled={days.length === 1} aria-label={`Quitar el día ${i + 1}`}>
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          </div>

          <ul className="grid gap-4">
            {d.exercises.map((e, j) => (
              <li key={e.key} className="grid gap-2 border-t border-line pt-4 first:border-0 first:pt-0">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem]">
                  <ExerciseCombobox
                    label={`Ejercicio ${j + 1}`}
                    value={e.name}
                    onChange={(name) => setEx(i, j, { name })}
                    own={suggestions}
                  />
                  <div className="field">
                    <label htmlFor={`s-${e.key}`}>Series</label>
                    <input id={`s-${e.key}`} className="input" inputMode="numeric" value={e.sets} onChange={(ev) => setEx(i, j, { sets: ev.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`r-${e.key}`}>Repeticiones</label>
                    <input id={`r-${e.key}`} className="input" maxLength={20} value={e.reps} onChange={(ev) => setEx(i, j, { reps: ev.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`w-${e.key}`}>Peso (kg)</label>
                    <input
                      id={`w-${e.key}`}
                      className="input"
                      inputMode="decimal"
                      maxLength={7}
                      placeholder="—"
                      value={e.weight}
                      onChange={(ev) => setEx(i, j, { weight: ev.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="field min-w-0 flex-1">
                    <label htmlFor={`o-${e.key}`}>Nota (opcional)</label>
                    <input id={`o-${e.key}`} className="input" maxLength={200} value={e.note} onChange={(ev) => setEx(i, j, { note: ev.target.value })} />
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDay(i, { exercises: move(d.exercises, j, -1) })} disabled={j === 0} aria-label={`Subir el ejercicio ${j + 1} del día ${i + 1}`}>
                      <ArrowUp size={16} aria-hidden />
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDay(i, { exercises: move(d.exercises, j, 1) })} disabled={j === d.exercises.length - 1} aria-label={`Bajar el ejercicio ${j + 1} del día ${i + 1}`}>
                      <ArrowDown size={16} aria-hidden />
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDay(i, { exercises: d.exercises.filter((_, m) => m !== j) })} disabled={d.exercises.length === 1} aria-label={`Quitar el ejercicio ${j + 1} del día ${i + 1}`}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setDay(i, { exercises: [...d.exercises, blankEx()] })}
              disabled={d.exercises.length >= 20}
            >
              <Plus size={16} aria-hidden /> Agregar ejercicio
            </button>
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => setDays((x) => [...x, { key: key(), title: `Día ${x.length + 1}`, exercises: [blankEx()] }])}
          disabled={days.length >= 7}
        >
          <Plus size={16} aria-hidden /> Agregar día
        </button>
      </div>

      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Guardando…">{id ? "Guardar cambios" : "Crear rutina"}</SubmitButton>
      </div>
    </form>
  );
}

export function RoutineActiveForm({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionState(setRoutineActive, initialState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <FormMessage state={state} />
      <div>
        <SubmitButton className="btn btn-quiet btn-sm" pendingText="…">
          {active ? "Archivar" : "Reactivar"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function CopyRoutineForm({ id, students }: { id: string; students: { id: string; name: string }[] }) {
  const [state, action] = useActionState(copyRoutine, initialState);
  if (students.length === 0) return null;
  return (
    <details>
      <summary className="btn btn-quiet btn-sm cursor-pointer list-none marker:content-none">Copiar a otro alumno</summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="id" value={id} />
        <SelectField name="student" label="Alumno" defaultValue="">
          <option value="" disabled>
            Elige un alumno
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SubmitButton className="btn btn-primary" pendingText="Copiando…">
          Copiar
        </SubmitButton>
        <div className="sm:col-span-2 empty:hidden">
          <FormMessage state={state} />
        </div>
      </form>
    </details>
  );
}
