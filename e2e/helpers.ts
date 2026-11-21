import { expect, type Browser, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { monthLabel } from "../src/lib/dates";

export const PASSWORD = "clave-segura-2026";

export async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ locale: "es-CL", timezoneId: "America/Santiago" });
  return { ctx, page: await ctx.newPage() };
}

export async function registerPt(page: Page, name: string, email: string) {
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill(name);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta de PT" }).click();
  await expect(page).toHaveURL(/\/pt$/);
}

/** El PT invita y el alumno crea su cuenta desde el link. Devuelve el contexto del alumno, ya con sesión. */
export async function inviteAndJoin(pt: Page, browser: Browser, name: string, email: string) {
  await pt.goto("/pt/alumnos");
  await pt.getByLabel("Nombre del alumno").fill(name);
  await pt.getByLabel("Correo", { exact: true }).fill(email);
  await pt.getByRole("button", { name: "Invitar alumno" }).click();
  const link = await pt.getByLabel("Link de invitación").first().inputValue();
  const s = await newPage(browser);
  await s.page.goto(link);
  await s.page.getByLabel("Crea tu contraseña").fill(PASSWORD);
  await s.page.getByLabel("Repítela").fill(PASSWORD);
  await s.page.getByRole("button", { name: "Entrar a mi cuenta" }).click();
  await expect(s.page).toHaveURL(/\/alumno$/);
  return s;
}

export async function createPlan(pt: Page, name: string, credits: number, price: string) {
  await pt.goto("/pt/planes");
  await pt.getByLabel("Nombre del plan").first().fill(name);
  await pt.getByLabel("Clases al mes").first().fill(String(credits));
  await pt.getByLabel("Precio (CLP)").first().fill(price);
  await pt.getByRole("button", { name: "Crear plan" }).click();
  await expect(pt.getByText("Plan creado.")).toBeVisible();
}

export const monthOfDate = (date: string) => `${date.slice(0, 7)}-01`;

/** Región del mes dentro de la tarjeta de un alumno en /pt. */
export function studentMonth(pt: Page, studentName: string, month: string) {
  return pt
    .getByRole("listitem")
    .filter({ hasText: studentName })
    .getByRole("region", { name: new RegExp(monthLabel(month), "i") });
}

/** El PT activa un mes con el primer plan de la lista. */
export async function activateMonth(pt: Page, studentName: string, month: string) {
  await pt.goto("/pt/alumnos");
  const region = studentMonth(pt, studentName, month);
  await region.getByLabel("Plan del mes").selectOption({ index: 1 });
  await region.getByRole("button", { name: "Activar mes" }).click();
  await expect(region.getByText("Activo", { exact: true })).toBeVisible();
}

/** Correos simulados que la app dejó para una dirección (la bandeja es un archivo, ver src/lib/mail.ts). */
export async function mailsTo(email: string): Promise<{ subject: string; text: string }[]> {
  try {
    const raw = await readFile(join(process.cwd(), ".mail-outbox", "outbox.jsonl"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { to: string; subject: string; text: string })
      .filter((m) => m.to.toLowerCase() === email.toLowerCase());
  } catch {
    return [];
  }
}
