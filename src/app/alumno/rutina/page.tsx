import { WorkoutLogger, type LoggerExercise } from "@/components/workout-logger";
import { getActiveRoutine, getLastTimes, getTodaysWorkouts, type LastTime } from "@/lib/queries";
import { requireStudent } from "@/lib/session";
import { formatDate, formatKg } from "@/lib/format";
import { todayLocal } from "@/lib/dates";
import { routineDayIds } from "@/lib/workouts";

export const metadata = { title: "Mi rutina" };

function summarize(l: LastTime): string {
  const sets = l.sets;
  if (sets.length === 0) return "";
  const same = sets.every((s) => s.reps === sets[0].reps && s.weight === sets[0].weight);
  const w = (n: number | null) => (n === null ? "" : ` · ${formatKg(n)}`);
  if (same) return `${sets.length} × ${sets[0].reps ?? "—"}${w(sets[0].weight)}`;
  return sets.map((s) => `${s.reps ?? "—"}${s.weight === null ? "" : ` × ${formatKg(s.weight)}`}`).join(", ");
}

export default async function RutinaPage() {
  const user = await requireStudent();
  const today = todayLocal();
  const [routine, todays, last] = await Promise.all([
    getActiveRoutine(user.id),
    getTodaysWorkouts(user.id, today),
    getLastTimes(user.id, today),
  ]);

  if (!routine) {
    return (
      <div className="grid gap-4">
        <h1>Mi rutina</h1>
        <p className="panel panel-pad text-muted">Tu PT todavía no te asignó una rutina. Cuando lo haga, la verás aquí.</p>
      </div>
    );
  }
  const dayIds = await routineDayIds(user.id, routine.id);

  return (
    <div className="grid gap-6">
      <header>
        <h1>{routine.name}</h1>
        <p className="mt-2 text-sm text-muted">Actualizada el {formatDate(routine.updatedAt)}</p>
        {routine.notes && <p className="panel panel-pad mt-4 whitespace-pre-line">{routine.notes}</p>}
        <p className="mt-4 text-muted">
          Anota lo que hiciste en cada serie: ya viene con lo que indicó tu PT, cambia solo lo que sea distinto y marca
          las series hechas.
        </p>
      </header>

      {routine.days.map((d, i) => {
        const saved = todays.find((s) => s.dayTitle === d.title);
        const exercises: LoggerExercise[] = d.exercises.map((e, j) => {
          const se = saved?.exercises.find((x) => x.position === j + 1);
          const l = last[e.name.toLowerCase()];
          return {
            position: j + 1,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            weight: e.weight,
            note: e.note,
            saved: se ? { note: se.note, sets: se.sets } : null,
            last: l ? { date: formatDate(new Date(`${l.date}T12:00:00Z`)), summary: summarize(l) } : null,
          };
        });
        return (
          <details key={i} open={i === 0 || !!saved} className="group grid gap-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none">
              <h2 id={`dia-${i}`}>{d.title}</h2>
              <span className="flex items-center gap-2 text-sm text-muted">
                {saved && <span className="tag tag-volt">Registrado hoy</span>}
                <span className="group-open:hidden">Ver</span>
              </span>
            </summary>
            <WorkoutLogger dayId={dayIds[i]} exercises={exercises} />
          </details>
        );
      })}
    </div>
  );
}
