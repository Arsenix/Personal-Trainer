import { listAudit } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { auditLabel, formatDateTime } from "@/lib/format";

export const metadata = { title: "Actividad" };

export default async function ActividadPage() {
  const user = await requirePt();
  const rows = await listAudit(user.id, 100);
  return (
    <div className="grid gap-8">
      <header>
        <h1>Actividad</h1>
        <p className="mt-2 max-w-xl text-muted">
          Registro de accesos y cambios en tu cuenta y la de tus alumnos. No se puede editar ni borrar.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted">Aún no hay actividad.</p>
      ) : (
        <ol className="panel divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <p className="min-w-0">
                <span className="font-semibold">{r.actorName ?? "Sistema"}</span>{" "}
                <span className="text-muted">{auditLabel(r.action).toLowerCase()}</span>
              </p>
              <time className="shrink-0 text-sm text-muted" dateTime={r.at.toISOString()}>
                {formatDateTime(r.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
