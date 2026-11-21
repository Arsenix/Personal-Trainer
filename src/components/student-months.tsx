import { ActivateMonthForm, AdjustCreditsForm, RejectProofForm, UploadProofForm } from "./credits";
import type { LedgerRow, MonthRow, PlanRow, ProofRow } from "@/lib/queries";
import { formatClp, formatDateTime } from "@/lib/format";
import { monthLabel } from "@/lib/dates";
import Link from "next/link";

export const REASON_LABEL: Record<LedgerRow["reason"], string> = {
  activation: "Carga del plan",
  adjustment: "Ajuste del PT",
  booking: "Clase reservada",
  refund: "Clase cancelada, crédito devuelto",
};

export function LedgerList({ rows }: { rows: LedgerRow[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline underline-offset-4">Ver movimientos</summary>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {rows.slice(0, 20).map((r, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
            <span>
              {REASON_LABEL[r.reason]}
              {r.note && <span className="text-muted"> · {r.note}</span>}
            </span>
            <span className="tabular-nums">
              <span className="font-semibold">{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
              <span className="text-muted"> · {formatDateTime(r.createdAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Estado de los créditos de un alumno en cada mes, visto por el PT. */
export function StudentMonths({
  studentId,
  months,
  rows,
  proofs,
  plans,
  ledger,
}: {
  studentId: string;
  months: string[];
  rows: MonthRow[];
  proofs: ProofRow[];
  plans: PlanRow[];
  ledger: LedgerRow[];
}) {
  const active = plans.filter((p) => p.active);
  return (
    <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
      {months.map((m) => {
        const row = rows.find((r) => r.month === m);
        const pend = proofs.filter((p) => p.month === m);
        return (
          <section key={m} aria-label={`${monthLabel(m)}`} className="grid content-start gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold first-cap">{monthLabel(m)}</h3>
              {row ? <span className="tag tag-volt">Activo</span> : <span className="tag tag-warn">Sin activar</span>}
            </div>

            {row ? (
              <>
                <p>
                  <span className="text-2xl font-semibold tabular-nums">{row.balance}</span>
                  <span className="text-muted"> de {row.loaded} clases disponibles</span>
                </p>
                <p className="text-sm text-muted">
                  {row.planName} · {formatClp(row.priceClp)}
                </p>
                <AdjustCreditsForm studentId={studentId} month={m} />
                <LedgerList rows={ledger.filter((l) => l.month === m)} />
              </>
            ) : (
              <>
                {pend.length > 0 && (
                  <ul className="grid gap-2">
                    {pend.map((p) => (
                      <li key={p.id} className="panel grid gap-2 p-3 text-sm">
                        <p>
                          <span className="font-semibold">Comprobante por revisar</span>
                          <span className="text-muted"> · {formatDateTime(p.createdAt)}</span>
                        </p>
                        <div className="flex flex-wrap items-start gap-2">
                          <Link
                            href={`/api/comprobantes/${p.id}`}
                            target="_blank"
                            rel="noopener"
                            className="btn btn-quiet btn-sm"
                          >
                            Ver {p.fileName}
                          </Link>
                          <RejectProofForm id={p.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {active.length === 0 ? (
                  <p className="text-sm text-muted">
                    Para activar el mes primero crea un plan en{" "}
                    <Link href="/pt/planes" className="underline underline-offset-4">
                      Planes
                    </Link>
                    .
                  </p>
                ) : (
                  <ActivateMonthForm studentId={studentId} month={m} plans={active} />
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

const PROOF_STATUS: Record<ProofRow["status"], string> = {
  pending: "En revisión",
  accepted: "Aceptado",
  rejected: "Rechazado",
};

/** Créditos del alumno por mes, con la subida de comprobante cuando el mes no está activado. */
export function StudentCredits({
  months,
  rows,
  proofs,
  ledger,
}: {
  months: string[];
  rows: MonthRow[];
  proofs: ProofRow[];
  ledger: LedgerRow[];
}) {
  return (
    <section aria-labelledby="creditos" className="grid gap-3">
      <h2 id="creditos">Tus clases del mes</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {months.map((m) => {
          const row = rows.find((r) => r.month === m);
          const mine = proofs.filter((p) => p.month === m);
          const pending = mine.some((p) => p.status === "pending");
          return (
            <article key={m} className="panel panel-pad grid content-start gap-3" aria-label={monthLabel(m)}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold first-cap">{monthLabel(m)}</h3>
                {row ? <span className="tag tag-volt">Activo</span> : <span className="tag tag-warn">Sin activar</span>}
              </div>
              {row ? (
                <>
                  <p>
                    <span className="text-3xl font-semibold tabular-nums">{row.balance}</span>
                    <span className="text-muted"> de {row.loaded} clases disponibles</span>
                  </p>
                  <p className="text-sm text-muted">{row.planName}</p>
                  <LedgerList rows={ledger.filter((l) => l.month === m)} />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Para reservar clases de este mes, paga tu plan por transferencia y sube el comprobante. Tu PT activa
                    el mes y se cargan tus clases.
                  </p>
                  {mine.length > 0 && (
                    <ul className="grid gap-1 text-sm">
                      {mine.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{p.fileName}</span>
                          <span className="flex items-center gap-2">
                            <span className={p.status === "rejected" ? "tag tag-warn" : "tag"}>{PROOF_STATUS[p.status]}</span>
                          </span>
                          {p.status === "rejected" && p.note && (
                            <span className="basis-full text-muted">Tu PT dice: {p.note}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {pending ? (
                    <p className="text-sm text-muted">Tu PT ya tiene tu comprobante. Te activará el mes en cuanto lo revise.</p>
                  ) : (
                    <UploadProofForm month={m} />
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-sm text-muted">Las clases que no uses en el mes se pierden cuando cambia el mes.</p>
    </section>
  );
}
