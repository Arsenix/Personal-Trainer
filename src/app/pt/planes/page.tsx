import { PlanActiveForm, PlanForm } from "@/components/credits";
import { listPlans } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { formatClp } from "@/lib/format";

export const metadata = { title: "Planes" };

export default async function PlanesPage() {
  const user = await requirePt();
  const plans = await listPlans(user.id);
  const active = plans.filter((p) => p.active);
  const archived = plans.filter((p) => !p.active);

  return (
    <div className="grid gap-10">
      <header>
        <h1>Planes</h1>
        <p className="mt-2 max-w-prose text-muted">
          Cada plan es un número de clases al mes y un precio. Tú eliges el plan de cada alumno cuando activas su mes;
          lo que cargues queda copiado ahí, así que cambiar un plan después no altera los meses ya activados.
        </p>
      </header>

      <section aria-labelledby="nuevo" className="panel panel-pad">
        <h2 id="nuevo" className="mb-4">
          Nuevo plan
        </h2>
        <PlanForm />
      </section>

      <section aria-labelledby="vigentes" className="grid gap-3">
        <h2 id="vigentes">Planes vigentes</h2>
        {active.length === 0 ? (
          <p className="panel panel-pad text-muted">Todavía no tienes planes. Crea el primero arriba.</p>
        ) : (
          <ul className="grid gap-3">
            {active.map((p) => (
              <li key={p.id} className="panel grid gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-muted tabular-nums">
                    {p.credits} {p.credits === 1 ? "clase" : "clases"} al mes · {formatClp(p.priceClp)}
                  </p>
                </div>
                <details>
                  <summary className="btn btn-quiet btn-sm cursor-pointer list-none marker:content-none">Editar</summary>
                  <div className="mt-3 grid gap-4">
                    <PlanForm plan={p} />
                    <PlanActiveForm id={p.id} active />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="archivados" className="grid gap-3">
          <h2 id="archivados">Archivados</h2>
          <ul className="panel divide-y divide-line">
            {archived.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  {p.name} <span className="text-sm text-muted">· {p.credits} clases · {formatClp(p.priceClp)}</span>
                </span>
                <PlanActiveForm id={p.id} active={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
