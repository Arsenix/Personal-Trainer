import { InviteForm, InvitationActions, StudentLocationForm } from "@/components/forms";
import { StudentMonths } from "@/components/student-months";
import {
  listLedger,
  listLocations,
  listMonthsForPt,
  listPendingInvitations,
  listPendingProofs,
  listPlans,
  listStudents,
} from "@/lib/queries";
import { currentMonth, nextMonthOf } from "@/lib/dates";
import { requirePt } from "@/lib/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Alumnos" };

export default async function AlumnosPage() {
  const user = await requirePt();
  const months = [currentMonth(), nextMonthOf(currentMonth())];
  const [students, invitations, locations, plans, monthRows, proofs, ledger] = await Promise.all([
    listStudents(user.id),
    listPendingInvitations(user.id),
    listLocations(user.id),
    listPlans(user.id),
    listMonthsForPt(user.id, months),
    listPendingProofs(user.id),
    listLedger(user.id, months),
  ]);
  const active = locations.filter((l) => !l.archived).map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="grid gap-10">
      <header>
        <h1>Alumnos</h1>
        <p className="mt-2 text-muted">
          {students.length === 0
            ? "Todavía no tienes alumnos. Invita al primero y mándale el link."
            : `${students.length} ${students.length === 1 ? "alumno" : "alumnos"} con cuenta.`}
        </p>
      </header>

      {proofs.length > 0 && (
        <p className="alert alert-ok" role="status">
          {proofs.length === 1
            ? "Tienes 1 comprobante de pago por revisar."
            : `Tienes ${proofs.length} comprobantes de pago por revisar.`}{" "}
          Están en la tarjeta de cada alumno, bajo el mes que pagó.
        </p>
      )}

      <section aria-labelledby="invitar" className="panel panel-pad">
        <h2 id="invitar" className="mb-4">
          Invitar a un alumno
        </h2>
        <InviteForm locations={active} />
      </section>

      {invitations.length > 0 && (
        <section aria-labelledby="pendientes" className="grid gap-3">
          <h2 id="pendientes">Invitaciones pendientes</h2>
          <ul className="grid gap-3">
            {invitations.map((i) => (
              <li key={i.email.toLowerCase()} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{i.name}</p>
                  <p className="truncate text-sm text-muted">{i.email}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    {i.expired ? (
                      <span className="tag tag-warn">Venció el {formatDate(i.expiresAt)}</span>
                    ) : (
                      <span className="tag">Vence el {formatDate(i.expiresAt)}</span>
                    )}
                    {i.locationName && <span>{i.locationName}</span>}
                  </p>
                </div>
                <InvitationActions id={i.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {students.length > 0 && (
        <section aria-labelledby="lista" className="grid gap-3">
          <h2 id="lista">Tus alumnos</h2>
          <ul className="grid gap-3">
            {students.map((s) => (
              <li key={s.userId} className="panel grid gap-4 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-sm text-muted">{s.email}</p>
                  <p className="text-sm text-muted">
                    {s.phone ? (
                      <a className="underline underline-offset-4" href={`tel:${s.phone.replace(/\s/g, "")}`}>
                        {s.phone}
                      </a>
                    ) : (
                      "Sin teléfono"
                    )}
                    {" · "}desde {formatDate(s.joinedAt)}
                  </p>
                </div>
                <StudentLocationForm studentId={s.userId} current={s.locationId} locations={active} />
                </div>
                <StudentMonths
                  studentId={s.userId}
                  months={months}
                  rows={monthRows.filter((r) => r.studentId === s.userId)}
                  proofs={proofs.filter((p) => p.studentId === s.userId)}
                  plans={plans}
                  ledger={ledger.filter((l) => l.studentId === s.userId)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
