"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/lib/auth";
import { withSystem, isUniqueViolation } from "@/lib/db";
import { newId, hashToken } from "@/lib/tokens";
import { acceptInvitationSchema, fieldErrors, loginSchema, registerSchema } from "@/lib/validation";
import { formValues, str, type ActionState } from "@/lib/action-state";
import { allow } from "@/lib/rate-limit";
import { previewInvitation } from "@/lib/queries";

const TOO_MANY: ActionState = { error: "Demasiados intentos. Espera un minuto y vuelve a probar." };

export async function registerPt(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  if (!(await allow("register", 5, 10 * 60_000))) return { ...TOO_MANY, values };

  const parsed = registerSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    password: str(fd, "password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { name, email, phone, password } = parsed.data;

  try {
    const hash = await hashPassword(password);
    await withSystem((c) =>
      c.query("select register_pt($1, $2, $3, $4, $5)", [newId(), email, name, hash, phone]),
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { errors: { email: "Ya existe una cuenta con este correo. ¿Quieres ingresar?" }, values };
    }
    console.error("registerPt", e);
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo en un momento.", values };
  }

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (e) {
    console.error("registerPt: inicio de sesión automático falló", e);
    redirect("/ingresar");
  }
  redirect("/pt");
}

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = loginSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { email, password } = parsed.data;

  // 8 intentos por minuto por IP y correo: frena la adivinación de contraseñas.
  if (!(await allow("login", 8, 60_000, email))) return { ...TOO_MANY, values };

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch {
    return { error: "Correo o contraseña incorrectos.", values };
  }
  // El layout de cada zona redirige al alumno a /alumno.
  redirect("/pt");
}

export async function logout(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export async function acceptInvitation(
  token: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!(await allow("accept", 10, 10 * 60_000))) return TOO_MANY;

  const parsed = acceptInvitationSchema.safeParse({ password: str(fd, "password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const preview = await previewInvitation(token);
  if (!preview || preview.state !== "valid") {
    return { error: "Esta invitación ya no es válida. Pídele a tu PT que te envíe una nueva." };
  }
  if (str(fd, "confirm") !== parsed.data.password) {
    return { errors: { confirm: "Las contraseñas no coinciden" } };
  }

  try {
    const hash = await hashPassword(parsed.data.password);
    await withSystem((c) =>
      c.query("select accept_invitation($1, $2, $3)", [hashToken(token), newId(), hash]),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("invitation_invalid")) {
      return { error: "Esta invitación ya no es válida. Pídele a tu PT que te envíe una nueva." };
    }
    if (msg.includes("email_taken")) {
      return { error: "Ya existe una cuenta con este correo. Ingresa con tu contraseña." };
    }
    console.error("acceptInvitation", e);
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo en un momento." };
  }

  try {
    await auth.api.signInEmail({
      body: { email: preview.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (e) {
    console.error("acceptInvitation: inicio de sesión automático falló", e);
    redirect("/ingresar");
  }
  redirect("/alumno");
}
