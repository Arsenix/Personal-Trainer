import { notFound } from "next/navigation";
import { RoutineEditor } from "@/components/routines";
import { listExerciseNames, listStudents } from "@/lib/queries";
import { requirePt } from "@/lib/session";

export const metadata = { title: "Nueva rutina" };

export default async function NuevaRutinaPage({ searchParams }: { searchParams: Promise<{ alumno?: string }> }) {
  const user = await requirePt();
  const { alumno } = await searchParams;
  const [students, suggestions] = await Promise.all([listStudents(user.id), listExerciseNames(user.id)]);
  const student = students.find((s) => s.userId === alumno);
  if (!student) notFound();
  return (
    <div className="grid gap-6">
      <header>
        <h1>Nueva rutina</h1>
        <p className="mt-2 text-muted">Para {student.name}.</p>
      </header>
      <RoutineEditor studentId={student.userId} studentName={student.name} suggestions={suggestions} />
    </div>
  );
}
