import { z } from "zod";
import { isValidRut, formatRut } from "./rut";

const text = (min: number, max: number, msg: string) =>
  z.string().trim().min(min, msg).max(max, `Máximo ${max} caracteres`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const phoneSchema = optionalText(20).refine(
  (v) => v === null || /^\+?[0-9 ]{8,16}$/.test(v),
  "Ingresa un teléfono válido, por ejemplo +56 9 1234 5678",
);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Ingresa un correo válido"));

export const passwordSchema = z
  .string()
  .min(10, "Usa al menos 10 caracteres")
  .max(128, "Máximo 128 caracteres");

export const registerSchema = z.object({
  name: text(2, 80, "Ingresa tu nombre"),
  email,
  phone: phoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña").max(128),
});

export const acceptInvitationSchema = z.object({ password: passwordSchema });

export const inviteSchema = z.object({
  name: text(2, 80, "Ingresa el nombre del alumno"),
  email,
  phone: phoneSchema,
  locationId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid("Lugar no válido").nullable()),
});

export const LOCATION_KINDS = ["gym", "home", "other"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];
export const KIND_LABEL: Record<LocationKind, string> = {
  gym: "Gimnasio",
  home: "Domicilio",
  other: "Otro",
};

export const locationSchema = z.object({
  name: text(2, 80, "Ingresa un nombre para el lugar"),
  kind: z.enum(LOCATION_KINDS, "Elige un tipo de lugar"),
  address: optionalText(200),
});

export const ACCOUNT_TYPES = ["corriente", "vista", "ahorro", "rut"] as const;
export const ACCOUNT_TYPE_LABEL: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  corriente: "Cuenta corriente",
  vista: "Cuenta vista",
  ahorro: "Cuenta de ahorro",
  rut: "Cuenta RUT",
};

export const profileSchema = z
  .object({
    displayName: text(2, 80, "Ingresa tu nombre"),
    phone: phoneSchema,
    transferHolder: optionalText(80),
    transferRut: optionalText(14),
    transferBank: optionalText(60),
    transferType: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.enum(ACCOUNT_TYPES, "Tipo de cuenta no válido").nullable()),
    transferNumber: optionalText(30).refine(
      (v) => v === null || /^[0-9 -]{4,30}$/.test(v),
      "El número de cuenta solo lleva dígitos",
    ),
    transferEmail: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.email("Ingresa un correo válido").nullable()),
  })
  .superRefine((v, ctx) => {
    if (v.transferRut !== null && !isValidRut(v.transferRut)) {
      ctx.addIssue({ code: "custom", path: ["transferRut"], message: "El RUT no es válido" });
    }
  })
  .transform((v) => ({
    ...v,
    transferRut: v.transferRut ? formatRut(v.transferRut) : null,
  }));

export type FieldErrors = Record<string, string>;

/** Convierte los errores de Zod en { campo: mensaje } (el primero de cada campo). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
