import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentCancelForm } from "@/components/agenda";
import { canStudentCancel, slotLong } from "@/lib/dates";
import { getStudentHome, listStudentBookings, type BookingStatus } from "@/lib/queries";
import { requireStudent } from "@/lib/session";
import { ACCOUNT_TYPE_LABEL, KIND_LABEL } from "@/lib/validation";

export const metadata = { title: "Mi cuenta" };

const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: "Realizada",
  cancelled_student: "Cancelada por ti",
  cancelled_pt: "Cancelada por tu PT",
};

export default async function AlumnoPage() {
  const user = await requireStudent();
  const [home, { upcoming, history }] = await Promise.all([
    getStudentHome(user.id),
    listStudentBookings(user.id),
  ]);
  if (!home) notFound();
  const now = new Date();
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

      <section aria-labelledby="proximas" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="proximas">Tus próximas clases</h2>
          <Link href="/alumno/reservar" className="btn btn-primary btn-sm">
            Reservar una clase
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="panel panel-pad text-muted">
            No tienes clases reservadas. Elige un horario libre de {home.ptName}.
          </p>
        ) : (
          <ul className="grid gap-3">
            {upcoming.map((b) => (
              <li key={b.id} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="font-semibold capitalize">{slotLong(b.start)}</p>
                  <p className="text-sm text-muted">{b.locationName ?? home.locationName ?? "Lugar por definir"}</p>
                </div>
                <StudentCancelForm id={b.id} canCancel={canStudentCancel(b.start, now)} />
              </li>
            ))}
          </ul>
        )}
      </section>

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

      {history.length > 0 && (
        <section aria-labelledby="anteriores" className="grid gap-3">
          <h2 id="anteriores">Clases anteriores</h2>
          <ul className="panel divide-y divide-line">
            {history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="capitalize">{slotLong(b.start)}</span>
                <span className="tag">{STATUS_LABEL[b.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">Muy pronto verás aquí también tus créditos del mes.</p>
    </div>
  );
}
