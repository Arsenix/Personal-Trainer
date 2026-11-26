import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getStudentName, listWorkoutsForPt, type LoggedExercise } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { formatDate, formatKg } from "@/lib/format";

export const metadata = { title: "Progreso del alumno" };

function done(e: LoggedExercise) {
  return e.sets.filter((s) => s.done);
}

/** "60 kg × 10, 60 kg × 10, 60 kg × 8" */
function setsText(e: LoggedExercise): string {
  const d = done(e);
  if (d.length === 0) return "Sin series marcadas";
  return d.map((s) => `${s.weight === null ? "sin carga" : formatKg(s.weight)} × ${s.reps ?? "—"}`).join(" · ");
}

export default async function ProgresoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePt();
  const { id } = await params;
  const name = await getStudentName(user.id, id);
  if (!name) notFound();
  const sessions = await listWorkoutsForPt(user.id, id);
  const withWork = sessions.filter((s) => s.exercises.some((e) => done(e).length > 0));

  // Mejor peso por ejercicio, de más reciente a más antiguo, para ver si sube.
  const byExercise = new Map<string, { date: string; top: number | null }[]>();
  for (const s of withWork) {
    for (const e of s.exercises) {
      const d = done(e);
      if (d.length === 0) continue;
      const weights = d.map((x) => x.weight).filter((w): w is number => w !== null);
      const key = e.name;
      byExercise.set(key, [...(byExercise.get(key) ?? []), { date: s.date, top: weights.length ? Math.max(...weights) : null }]);
    }
  }

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <Link href="/pt/alumnos" className="inline-flex items-center gap-1 text-sm text-muted underline underline-offset-4">
          <ChevronLeft size={14} aria-hidden /> Alumnos
        </Link>
        <h1>Progreso de {name}</h1>
        <p className="text-muted">
          {withWork.length === 0
            ? "Todavía no registra entrenamientos."
            : `${withWork.length} ${withWork.length === 1 ? "entrenamiento registrado" : "entrenamientos registrados"}. Último: ${formatDate(new Date(`${withWork[0].date}T12:00:00Z`))}.`}
        </p>
      </header>

      {byExercise.size > 0 && (
        <section aria-labelledby="ejercicios" className="grid gap-3">
          <h2 id="ejercicios">Peso máximo por ejercicio</h2>
          <ul className="panel divide-y divide-line">
            {[...byExercise.entries()].map(([ex, list]) => {
              const latest = list[0];
              const prev = list[1];
              const diff = latest.top !== null && prev?.top != null ? latest.top - prev.top : null;
              return (
                <li key={ex} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                  <p className="min-w-0 font-semibold">{ex}</p>
                  <p className="text-sm tabular-nums">
                    {latest.top === null ? "Sin carga" : formatKg(latest.top)}
                    {diff !== null && diff !== 0 && (
                      <span className={diff > 0 ? " text-ok" : " text-muted"}>
                        {" "}
                        ({diff > 0 ? "+" : "−"}
                        {formatKg(Math.abs(diff))} vs. la vez anterior)
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {withWork.length > 0 && (
        <section aria-labelledby="historial" className="grid gap-3">
          <h2 id="historial">Historial</h2>
          <ul className="grid gap-3">
            {withWork.map((s) => (
              <li key={s.id} className="panel grid gap-3 p-4">
                <p className="font-semibold">
                  {formatDate(new Date(`${s.date}T12:00:00Z`))} <span className="text-muted">· {s.dayTitle}</span>
                </p>
                <ul className="grid gap-2">
                  {s.exercises
                    .filter((e) => done(e).length > 0 || e.note)
                    .map((e) => (
                      <li key={e.position} className="grid gap-0.5">
                        <p className="text-sm">
                          <span className="font-semibold">{e.name}</span>{" "}
                          <span className="text-muted tabular-nums">
                            (indicado {e.plannedSets} × {e.plannedReps}
                            {e.plannedWeight !== null && ` · ${formatKg(e.plannedWeight)}`})
                          </span>
                        </p>
                        <p className="text-sm tabular-nums">{setsText(e)}</p>
                        {e.note && <p className="text-sm text-muted">“{e.note}”</p>}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
