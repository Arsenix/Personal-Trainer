"use client";

import { useFormStatus } from "react-dom";
import { useId, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { ActionState } from "@/lib/action-state";

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  className = "btn btn-primary",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function Field({
  name,
  label,
  type = "text",
  state,
  hint,
  required,
  autoComplete,
  inputMode,
  defaultValue,
  maxLength,
}: {
  name: string;
  label: string;
  type?: string;
  state?: ActionState;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  defaultValue?: string;
  maxLength?: number;
}) {
  const error = state?.errors?.[name];
  // Único por instancia: una página puede tener varios formularios con el mismo campo.
  const uid = useId().replace(/:/g, "");
  const id = `f-${name}-${uid}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        defaultValue={state?.values?.[name] ?? defaultValue ?? ""}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  name,
  label,
  state,
  children,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  state?: ActionState;
  children: ReactNode;
  defaultValue?: string;
  hint?: string;
}) {
  const error = state?.errors?.[name];
  // Único por instancia: una página puede tener varios formularios con el mismo campo.
  const uid = useId().replace(/:/g, "");
  const id = `f-${name}-${uid}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        className="input"
        defaultValue={state?.values?.[name] ?? defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
      >
        {children}
      </select>
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="alert alert-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p className="alert alert-ok" role="status">
        {state.message}
      </p>
    );
  }
  return null;
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={link}
        aria-label="Link de invitación"
        className="input font-mono text-sm"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="btn btn-primary shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* el campo queda seleccionable para copiar a mano */
          }
        }}
      >
        {copied ? <Check size={18} strokeWidth={2} aria-hidden /> : <Copy size={18} strokeWidth={1.75} aria-hidden />}
        {copied ? "Copiado" : "Copiar link"}
      </button>
    </div>
  );
}
