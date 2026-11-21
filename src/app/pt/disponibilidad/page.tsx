import { BlockForm, DayRulesForm, RemoveBlockForm, ResetRulesForm } from "@/components/agenda";
import { listBlocks, listRules } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { dayLong, hourLabel } from "@/lib/dates";

export const metadata = { title: "Disponibilidad" };

const DAYS = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
] as const;

export default async function DisponibilidadPage() {
  const user = await requirePt();
  const [rules, blocks] = await Promise.all([listRules(user.id), listBlocks(user.id)]);

  return (
    <div className="grid gap-10">
      <header>
        <h1>Disponibilidad</h1>
        <p className="mt-2 max-w-xl text-muted">
          Cada hora dentro de tus tramos es una clase de 1 hora que tus alumnos pueden reservar. Las clases que ya
          están reservadas no se cancelan solas si cambias el horario: cancélalas desde la agenda si hace falta.
        </p>
      </header>

      <section aria-labelledby="semanal" className="grid gap-4">
        <h2 id="semanal">Horario semanal</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {DAYS.map(([weekday, label]) => (
            <DayRulesForm
              key={weekday}
              weekday={weekday}
              label={label}
              ranges={rules.filter((r) => r.weekday === weekday).map((r) => ({ start: r.start, end: r.end }))}
            />
          ))}
        </div>
        <ResetRulesForm />
      </section>

      <section id="bloqueos" aria-labelledby="bloquear" className="grid gap-4">
        <h2 id="bloquear">Bloquear horas</h2>
        <div className="panel panel-pad">
          <BlockForm />
        </div>

        {blocks.length > 0 && (
          <div className="grid gap-3">
            <h3>Bloqueos próximos</h3>
            <ul className="grid gap-2">
              {blocks.map((b) => (
                <li key={b.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
                  <p className="min-w-0">
                    <span className="font-semibold first-cap">{dayLong(b.date)}</span>{" "}
                    <span className="text-muted">
                      {b.start === 0 && b.end === 24 ? "todo el día" : `${hourLabel(b.start)} a ${hourLabel(b.end)}`}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </span>
                  </p>
                  <RemoveBlockForm id={b.id} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
