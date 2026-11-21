import Link from "next/link";
import { CopyRoutineForm, RoutineActiveForm } from "@/components/routines";
import { listRoutinesForPt, listStudents } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Rutinas" };

export default async function RutinasPage({ searchParams }: { searchParams: Promise<{ guardada?: string }> }) {
  const user = await requirePt();
  const { guardada } = await searchParams;
  const [routines, students] = await Promise.all([listRoutinesForPt(user.id), listStudents(user.id)]);
  const active = routines.filter((r) => r.active);
  const archived = routines.filter((r) => !r.active);
  const withRoutine = new Set(active.map((r) => r.studentId));
  const without = students.filter((s) => !withRoutine.has(s.userId));
  const everyone = students.map((s) => ({ id: s.userId, name: s.name }));

  return (
    <div className="grid gap-10">
      <header>
        <h1>Rutinas</h1>
        <p className="mt-2 max-w-prose text-muted">
          Cada alumno tiene una rutina activa, armada por días y ejercicios. Si creas una nueva, la anterior queda
          archivada.
        </p>
      </header>

      {guardada === "1" && (
        <p className="alert alert-ok" role="status">
          Rutina guardada. Tu alumno ya la ve en su cuenta.
        </p>
      )}

      {students.length === 0 && (
        <p className="panel panel-pad text-muted">
          Para armar una rutina primero invita a un alumno desde{" "}
          <Link href="/pt" className="underline underline-offset-4">
            Alumnos
          </Link>
          .
        </p>
      )}

      {without.length > 0 && (
        <section aria-labelledby="sin" className="grid gap-3">
          <h2 id="sin">Sin rutina</h2>
          <ul className="panel divide-y divide-line">
            {without.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="font-semibold">{s.name}</span>
                <Link href={`/pt/rutinas/nueva?alumno=${s.userId}`} className="btn btn-primary btn-sm">
                  Crear rutina
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <section aria-labelledby="activas" className="grid gap-3">
          <h2 id="activas">Rutinas activas</h2>
          <ul className="grid gap-3">
            {active.map((r) => (
              <li key={r.id} className="panel grid gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="text-sm text-muted">
                      {r.studentName} · {r.days} {r.days === 1 ? "día" : "días"}, {r.exercises} ejercicios · editada el{" "}
                      {formatDate(r.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <Link href={`/pt/rutinas/${r.id}`} className="btn btn-quiet btn-sm">
                      Editar
                    </Link>
                    <RoutineActiveForm id={r.id} active />
                  </div>
                </div>
                <CopyRoutineForm id={r.id} students={everyone.filter((s) => s.id !== r.studentId)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archivadas" className="grid gap-3">
          <h2 id="archivadas">Archivadas</h2>
          <ul className="panel divide-y divide-line">
            {archived.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  {r.name} <span className="text-sm text-muted">· {r.studentName}</span>
                </span>
                <div className="flex flex-wrap items-start gap-2">
                  <Link href={`/pt/rutinas/${r.id}`} className="btn btn-quiet btn-sm">
                    Ver y editar
                  </Link>
                  <RoutineActiveForm id={r.id} active={false} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
