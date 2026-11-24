import { getActiveRoutine } from "@/lib/queries";
import { requireStudent } from "@/lib/session";
import { formatDate, formatKg } from "@/lib/format";

export const metadata = { title: "Mi rutina" };

export default async function RutinaPage() {
  const user = await requireStudent();
  const routine = await getActiveRoutine(user.id);

  if (!routine) {
    return (
      <div className="grid gap-4">
        <h1>Mi rutina</h1>
        <p className="panel panel-pad text-muted">Tu PT todavía no te asignó una rutina. Cuando lo haga, la verás aquí.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <header>
        <h1>{routine.name}</h1>
        <p className="mt-2 text-sm text-muted">Actualizada el {formatDate(routine.updatedAt)}</p>
        {routine.notes && <p className="panel panel-pad mt-4 whitespace-pre-line">{routine.notes}</p>}
      </header>

      {routine.days.map((d, i) => (
        <section key={i} aria-labelledby={`dia-${i}`} className="grid gap-3">
          <h2 id={`dia-${i}`}>{d.title}</h2>
          <ol className="panel divide-y divide-line">
            {d.exercises.map((e, j) => (
              <li key={j} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{e.name}</p>
                  {e.note && <p className="text-sm text-muted">{e.note}</p>}
                </div>
                <p className="tabular-nums">
                  <span className="font-semibold">{e.sets}</span> × <span className="font-semibold">{e.reps}</span>
                  {e.weight !== null && (
                    <>
                      <span className="text-muted"> · </span>
                      <span className="font-semibold">{formatKg(e.weight)}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
