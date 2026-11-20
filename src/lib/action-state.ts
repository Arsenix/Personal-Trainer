import type { FieldErrors } from "./validation";

/** Resultado que devuelven las acciones de servidor a los formularios (useActionState). */
export type ActionState = {
  ok?: boolean;
  error?: string;
  errors?: FieldErrors;
  message?: string;
  /** Para repoblar los campos de texto si hay errores (nunca contraseñas). */
  values?: Record<string, string>;
  /** Link de invitación recién creado (el token solo existe en este momento). */
  link?: string;
  mailed?: boolean;
};

export const initialState: ActionState = {};

export function formValues(fd: FormData, skip: string[] = ["password"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && !skip.includes(k) && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
