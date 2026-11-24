"use client";

import { useActionState } from "react";
import { activateMonth, adjustCredits, rejectProof, savePlan, setPlanActive } from "@/app/actions/pt";
import { uploadProof } from "@/app/actions/student";
import { initialState } from "@/lib/action-state";
import { Field, FormMessage, SelectField, SubmitButton } from "./ui";
import type { PlanRow } from "@/lib/queries";
import { formatClp } from "@/lib/format";

// ---------------------------------------------------------------------------
// PT: planes
// ---------------------------------------------------------------------------
export function PlanForm({ plan }: { plan?: PlanRow }) {
  const [state, action] = useActionState(savePlan, initialState);
  const k = plan?.id ?? "new";
  return (
    <form action={action} className="grid gap-4" key={state.ok ? `${k}-ok` : k}>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field name="name" label="Nombre del plan" state={state} defaultValue={plan?.name} maxLength={60} required />
        <Field
          name="credits"
          label="Clases al mes"
          state={state}
          inputMode="numeric"
          defaultValue={plan ? String(plan.credits) : ""}
          required
        />
        <Field
          name="price"
          label="Precio (CLP)"
          state={state}
          inputMode="numeric"
          defaultValue={plan ? String(plan.priceClp) : ""}
          required
        />
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton className={plan ? "btn btn-quiet btn-sm" : "btn btn-primary"}>
          {plan ? "Guardar cambios" : "Crear plan"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function PlanActiveForm({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionState(setPlanActive, initialState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <FormMessage state={state} />
      <div>
        <SubmitButton className="btn btn-quiet btn-sm" pendingText="…">
          {active ? "Archivar plan" : "Restaurar plan"}
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// PT: activar el mes, ajustar créditos, rechazar comprobante
// ---------------------------------------------------------------------------
export function ActivateMonthForm({
  studentId,
  month,
  plans,
}: {
  studentId: string;
  month: string;
  plans: PlanRow[];
}) {
  const [state, action] = useActionState(activateMonth, initialState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="student" value={studentId} />
      <input type="hidden" name="month" value={month} />
      <SelectField name="plan" label="Plan del mes" state={state} defaultValue="">
        <option value="" disabled>
          Elige un plan
        </option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.credits} clases · {formatClp(p.priceClp)}
          </option>
        ))}
      </SelectField>
      <SubmitButton className="btn btn-primary" pendingText="Activando…">
        Activar mes
      </SubmitButton>
      <div className="sm:col-span-2 empty:hidden">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function AdjustCreditsForm({ studentId, month }: { studentId: string; month: string }) {
  const [state, action] = useActionState(adjustCredits, initialState);
  return (
    <details>
      <summary className="btn btn-quiet btn-sm cursor-pointer list-none marker:content-none">Ajustar créditos</summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="student" value={studentId} />
        <input type="hidden" name="month" value={month} />
        <Field
          name="delta"
          label="Créditos"
          state={state}
          inputMode="numeric"
          required
        />
        <Field name="note" label="Motivo" state={state} maxLength={200} required />
        <SubmitButton className="btn btn-primary" pendingText="…">
          Aplicar
        </SubmitButton>
        <p className="hint -mt-1 sm:col-span-3">Créditos: un número positivo suma (1) y uno negativo resta (-1).</p>
        <div className="sm:col-span-3 empty:hidden">
          <FormMessage state={state} />
        </div>
      </form>
    </details>
  );
}

export function RejectProofForm({ id }: { id: string }) {
  const [state, action] = useActionState(rejectProof, initialState);
  return (
    <details>
      <summary className="btn btn-quiet btn-sm cursor-pointer list-none marker:content-none">Rechazar</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <Field name="note" label="Motivo para el alumno" state={state} maxLength={200} />
        <FormMessage state={state} />
        <div>
          <SubmitButton className="btn btn-danger btn-sm" pendingText="…">
            Rechazar comprobante
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Alumno: subir comprobante
// ---------------------------------------------------------------------------
export function UploadProofForm({ month }: { month: string }) {
  const [state, action] = useActionState(uploadProof, initialState);
  return (
    <form action={action} className="grid gap-3" key={state.ok ? "sent" : "form"}>
      <input type="hidden" name="month" value={month} />
      <div className="field">
        <label htmlFor={`file-${month}`}>Comprobante de transferencia</label>
        <input
          id={`file-${month}`}
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="input file:mr-3 file:border-0 file:bg-transparent file:font-semibold"
        />
        <p className="hint">Foto o PDF, hasta 5 MB.</p>
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton className="btn btn-primary" pendingText="Subiendo…">
          Enviar comprobante
        </SubmitButton>
      </div>
    </form>
  );
}
