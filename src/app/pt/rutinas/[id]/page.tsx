import { notFound } from "next/navigation";
import { RoutineEditor } from "@/components/routines";
import { getRoutine, listExerciseNames } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { z } from "zod";

export const metadata = { title: "Editar rutina" };

export default async function EditarRutinaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePt();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [routine, suggestions] = await Promise.all([getRoutine(user.id, id), listExerciseNames(user.id)]);
  if (!routine) notFound();
  return (
    <div className="grid gap-6">
      <header>
        <h1>Editar rutina</h1>
        <p className="mt-2 text-muted">
          Para {routine.studentName}
          {routine.active ? "" : ". Está archivada: al guardar, vuelve a ser su rutina activa"}.
        </p>
      </header>
      <RoutineEditor
        id={routine.id}
        studentId={routine.studentId}
        studentName={routine.studentName}
        initial={{ name: routine.name, notes: routine.notes, days: routine.days }}
        suggestions={suggestions}
      />
    </div>
  );
}
