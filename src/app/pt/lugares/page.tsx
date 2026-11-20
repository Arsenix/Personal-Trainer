import { LocationArchiveForm, LocationCreateForm, LocationEditForm } from "@/components/forms";
import { listLocations } from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { KIND_LABEL } from "@/lib/validation";

export const metadata = { title: "Lugares" };

export default async function LugaresPage() {
  const user = await requirePt();
  const locations = await listLocations(user.id);
  return (
    <div className="grid gap-10">
      <header>
        <h1>Lugares</h1>
        <p className="mt-2 max-w-xl text-muted">
          Donde entrenas con tus alumnos: tu gimnasio, un domicilio u otro lugar. Cada alumno queda asociado a uno.
        </p>
      </header>

      <section aria-labelledby="nuevo" className="panel panel-pad">
        <h2 id="nuevo" className="mb-4">
          Agregar un lugar
        </h2>
        <LocationCreateForm />
      </section>

      {locations.length > 0 && (
        <section aria-labelledby="mis-lugares" className="grid gap-3">
          <h2 id="mis-lugares">Tus lugares</h2>
          <ul className="grid gap-3">
            {locations.map((l) => (
              <li key={l.id} className={`panel p-4 ${l.archived ? "opacity-70" : ""}`}>
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{l.name}</span>
                      <span className="block truncate text-sm text-muted">
                        {KIND_LABEL[l.kind]}
                        {l.address ? ` · ${l.address}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {l.archived && <span className="tag">Archivado</span>}
                      <span className="tag">
                        {l.students} {l.students === 1 ? "alumno" : "alumnos"}
                      </span>
                      <span className="text-sm font-semibold underline underline-offset-4">Editar</span>
                    </span>
                  </summary>
                  <div className="mt-4 grid gap-4 border-t border-line pt-4">
                    <LocationEditForm id={l.id} name={l.name} kind={l.kind} address={l.address} />
                    <LocationArchiveForm id={l.id} archived={l.archived} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
