"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import {
  acceptInvitation,
  login,
  registerPt,
} from "@/app/actions/auth";
import {
  createLocation,
  inviteStudent,
  resendInvitation,
  revokeInvitation,
  setLocationArchived,
  setStudentLocation,
  updateLocation,
  updateProfile,
} from "@/app/actions/pt";
import { initialState } from "@/lib/action-state";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  KIND_LABEL,
  LOCATION_KINDS,
  type LocationKind,
} from "@/lib/validation";
import { CopyLink, Field, FormMessage, SelectField, SubmitButton } from "./ui";
import type { PtProfile } from "@/lib/queries";

export type LocationOption = { id: string; name: string };

export function RegisterForm() {
  const [state, action] = useActionState(registerPt, initialState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field name="name" label="Tu nombre" state={state} autoComplete="name" required />
      <Field name="email" label="Correo" type="email" state={state} autoComplete="email" required />
      <Field
        name="phone"
        label="Teléfono (opcional)"
        type="tel"
        inputMode="tel"
        state={state}
        autoComplete="tel"
        hint="Tus alumnos lo verán para escribirte si algo cambia."
      />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        state={state}
        autoComplete="new-password"
        hint="Al menos 10 caracteres."
        required
      />
      <SubmitButton pendingText="Creando tu cuenta…">Crear cuenta de PT</SubmitButton>
      <p className="text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-ink underline underline-offset-4">
          Ingresar
        </Link>
      </p>
    </form>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(login, initialState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field name="email" label="Correo" type="email" state={state} autoComplete="email" required />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        state={state}
        autoComplete="current-password"
        required
      />
      <SubmitButton pendingText="Ingresando…">Ingresar</SubmitButton>
      <p className="text-sm text-muted">
        ¿Eres PT y aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-ink underline underline-offset-4">
          Regístrate
        </Link>
        . Si eres alumno, entra con el link que te envió tu PT.
      </p>
    </form>
  );
}

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitation.bind(null, token), initialState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field
        name="password"
        label="Crea tu contraseña"
        type="password"
        state={state}
        autoComplete="new-password"
        hint="Al menos 10 caracteres."
        required
      />
      <Field
        name="confirm"
        label="Repítela"
        type="password"
        state={state}
        autoComplete="new-password"
        required
      />
      <SubmitButton pendingText="Creando tu cuenta…">Entrar a mi cuenta</SubmitButton>
    </form>
  );
}

export function InviteForm({ locations }: { locations: LocationOption[] }) {
  const [state, action] = useActionState(inviteStudent, initialState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {state.link && (
        <div className="grid gap-2 rounded-[var(--radius-field)] border border-line bg-ground p-3">
          <p className="text-sm font-semibold">
            {state.mailed
              ? "Le enviamos el link por correo. También puedes mandárselo tú:"
              : "Copia este link y mándaselo a tu alumno (por WhatsApp, por ejemplo):"}
          </p>
          <CopyLink link={state.link} />
          <p className="text-xs text-muted">
            Este link se muestra solo ahora. Si lo pierdes, usa «Nuevo link» en la lista de invitaciones.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nombre del alumno" state={state} required />
        <Field name="email" label="Correo" type="email" state={state} autoComplete="off" required />
        <Field name="phone" label="Teléfono (opcional)" type="tel" inputMode="tel" state={state} />
        <SelectField name="locationId" label="Dónde entrena (opcional)" state={state}>
          <option value="">Sin definir</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div>
        <SubmitButton pendingText="Creando invitación…">Invitar alumno</SubmitButton>
      </div>
    </form>
  );
}

export function InvitationActions({ id }: { id: string }) {
  const [resent, resend] = useActionState(resendInvitation, initialState);
  const [revoked, revoke] = useActionState(revokeInvitation, initialState);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={resend}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn btn-quiet btn-sm" pendingText="Generando…">
            Nuevo link
          </SubmitButton>
        </form>
        <form action={revoke}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn btn-danger btn-sm" pendingText="Revocando…">
            Revocar
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={revoked} />
      <FormMessage state={resent} />
      {resent.link && <CopyLink link={resent.link} />}
    </div>
  );
}

export function StudentLocationForm({
  studentId,
  current,
  locations,
}: {
  studentId: string;
  current: string | null;
  locations: LocationOption[];
}) {
  const [state, action] = useActionState(setStudentLocation, initialState);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="grid gap-1">
      <input type="hidden" name="studentId" value={studentId} />
      <label className="sr-only" htmlFor={`loc-${studentId}`}>
        Lugar de entrenamiento
      </label>
      <select
        id={`loc-${studentId}`}
        name="locationId"
        defaultValue={current ?? ""}
        className="input min-h-10 py-1.5 text-sm"
        onChange={() => form.current?.requestSubmit()}
      >
        <option value="">Sin definir</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function LocationCreateForm() {
  const [state, action] = useActionState(createLocation, initialState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nombre" state={state} hint="Por ejemplo: Smart Fit Providencia" required />
        <SelectField name="kind" label="Tipo" state={state} defaultValue="gym">
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
      </div>
      <Field name="address" label="Dirección (opcional)" state={state} autoComplete="off" />
      <div>
        <SubmitButton pendingText="Guardando…">Agregar lugar</SubmitButton>
      </div>
    </form>
  );
}

export function LocationEditForm({
  id,
  name,
  kind,
  address,
}: {
  id: string;
  name: string;
  kind: LocationKind;
  address: string | null;
}) {
  const [state, action] = useActionState(updateLocation, initialState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nombre" state={state} defaultValue={name} required />
        <SelectField name="kind" label="Tipo" state={state} defaultValue={kind}>
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
      </div>
      <Field name="address" label="Dirección" state={state} defaultValue={address ?? ""} />
      <div>
        <SubmitButton className="btn btn-primary btn-sm">Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}

export function LocationArchiveForm({ id, archived }: { id: string; archived: boolean }) {
  const [state, action] = useActionState(setLocationArchived, initialState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archive" value={archived ? "0" : "1"} />
      <SubmitButton className="btn btn-quiet btn-sm" pendingText="…">
        {archived ? "Restaurar" : "Archivar"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ProfileForm({ profile }: { profile: PtProfile }) {
  const [state, action] = useActionState(updateProfile, initialState);
  return (
    <form action={action} className="grid gap-8" noValidate>
      <FormMessage state={state} />
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-lg font-bold">Tus datos</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="displayName" label="Nombre" state={state} defaultValue={profile.displayName} required />
          <Field
            name="phone"
            label="Teléfono"
            type="tel"
            inputMode="tel"
            state={state}
            defaultValue={profile.phone ?? ""}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-lg font-bold">Datos para que te transfieran</legend>
        <p className="-mt-2 text-sm text-muted">
          Los ven solo tus alumnos, en su pantalla, cuando tengan que pagar su plan del mes.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="transferHolder"
            label="Titular de la cuenta"
            state={state}
            defaultValue={profile.transferHolder ?? ""}
          />
          <Field
            name="transferRut"
            label="RUT del titular"
            state={state}
            defaultValue={profile.transferRut ?? ""}
            hint="Con o sin puntos, con guion."
          />
          <Field
            name="transferBank"
            label="Banco"
            state={state}
            defaultValue={profile.transferBank ?? ""}
          />
          <SelectField
            name="transferType"
            label="Tipo de cuenta"
            state={state}
            defaultValue={profile.transferType ?? ""}
          >
            <option value="">Sin definir</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
          <Field
            name="transferNumber"
            label="Número de cuenta"
            state={state}
            inputMode="numeric"
            defaultValue={profile.transferNumber ?? ""}
          />
          <Field
            name="transferEmail"
            label="Correo para el comprobante"
            type="email"
            state={state}
            defaultValue={profile.transferEmail ?? ""}
          />
        </div>
      </fieldset>
      <div>
        <SubmitButton>Guardar perfil</SubmitButton>
      </div>
    </form>
  );
}
