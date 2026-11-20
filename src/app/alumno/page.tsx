import { notFound } from "next/navigation";
import { getStudentHome } from "@/lib/queries";
import { requireStudent } from "@/lib/session";
import { ACCOUNT_TYPE_LABEL, KIND_LABEL } from "@/lib/validation";

export const metadata = { title: "Mi cuenta" };

export default async function AlumnoPage() {
  const user = await requireStudent();
  const home = await getStudentHome(user.id);
  if (!home) notFound();
  const t = home.transfer;
  const hasTransfer = Boolean(t.transferHolder || t.transferBank || t.transferNumber);

  return (
    <div className="grid gap-8">
      <header>
        <h1>Hola, {user.name.split(" ")[0]}</h1>
        <p className="mt-2 text-muted">
          Entrenas con <strong className="text-ink">{home.ptName}</strong>.
          {home.ptPhone && (
            <>
              {" "}
              Si algo cambia, escríbele al{" "}
              <a className="underline underline-offset-4" href={`tel:${home.ptPhone.replace(/\s/g, "")}`}>
                {home.ptPhone}
              </a>
              .
            </>
          )}
        </p>
      </header>

      <section className="panel panel-pad grid gap-1" aria-labelledby="lugar">
        <h2 id="lugar">Dónde entrenas</h2>
        {home.locationName ? (
          <p className="mt-2">
            <span className="font-semibold">{home.locationName}</span>
            {home.locationKind && <span className="text-muted"> · {KIND_LABEL[home.locationKind]}</span>}
            {home.locationAddress && <span className="block text-muted">{home.locationAddress}</span>}
          </p>
        ) : (
          <p className="mt-2 text-muted">Tu PT aún no define el lugar.</p>
        )}
      </section>

      <section className="panel panel-pad grid gap-3" aria-labelledby="pago">
        <h2 id="pago">Cómo pagar tu plan</h2>
        {hasTransfer ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {[
              ["Titular", t.transferHolder],
              ["RUT", t.transferRut],
              ["Banco", t.transferBank],
              ["Tipo de cuenta", t.transferType ? ACCOUNT_TYPE_LABEL[t.transferType as keyof typeof ACCOUNT_TYPE_LABEL] : null],
              ["Número de cuenta", t.transferNumber],
              ["Correo", t.transferEmail],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="break-all font-semibold">{v}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-muted">Tu PT todavía no cargó sus datos de transferencia.</p>
        )}
      </section>

      <p className="text-sm text-muted">
        Muy pronto verás aquí las horas disponibles de {home.ptName} y tus créditos del mes.
      </p>
    </div>
  );
}
