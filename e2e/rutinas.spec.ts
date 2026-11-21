import { expect, test } from "@playwright/test";
import { inviteAndJoin, newPage, registerPt } from "./helpers";

const run = `${Date.now().toString(36)}r`;
test.describe.configure({ mode: "serial" });

let pt: Awaited<ReturnType<typeof newPage>>;
let s1: Awaited<ReturnType<typeof newPage>>;
let s2: Awaited<ReturnType<typeof newPage>>;
let editUrl = "";

test("sin rutina, el alumno lo ve y el PT tiene a quién crearle una", async ({ browser }) => {
  pt = await newPage(browser);
  await registerPt(pt.page, "Rodrigo Ibarra", `rutina.${run}@prueba.cl`);
  s1 = await inviteAndJoin(pt.page, browser, "Tomás Vera", `tomas.${run}@prueba.cl`);
  s2 = await inviteAndJoin(pt.page, browser, "Paula Rey", `paula.${run}@prueba.cl`);

  await s1.page.getByRole("link", { name: "Mi rutina" }).click();
  await expect(s1.page.getByText("Tu PT todavía no te asignó una rutina.")).toBeVisible();

  await pt.page.goto("/pt/rutinas");
  await expect(pt.page.getByRole("listitem").filter({ hasText: "Tomás Vera" }).getByRole("link", { name: "Crear rutina" })).toBeVisible();
});

test("el PT arma una rutina con dos días; los errores se explican y nada se pierde", async () => {
  const p = pt.page;
  await p.goto("/pt/rutinas");
  await p.getByRole("listitem").filter({ hasText: "Tomás Vera" }).getByRole("link", { name: "Crear rutina" }).click();
  await expect(p.getByRole("heading", { level: 1, name: "Nueva rutina" })).toBeVisible();

  await p.getByLabel("Nombre de la rutina").fill("Base de fuerza");
  await p.getByLabel("Indicaciones generales (opcional)").fill("Calienta 10 minutos.");
  await p.getByLabel("Título del día 1").fill("Piernas");

  // Un ejercicio sin nombre no se guarda y avisa; el formulario conserva lo escrito.
  await p.getByRole("button", { name: "Crear rutina" }).click();
  await expect(p.getByText("Cada ejercicio necesita un nombre")).toBeVisible();
  await expect(p.getByLabel("Nombre de la rutina")).toHaveValue("Base de fuerza");

  await p.getByLabel("Ejercicio 1", { exact: true }).fill("Sentadilla");
  await p.getByLabel("Series").first().fill("4");
  await p.getByLabel("Repeticiones").first().fill("8-10");
  await p.getByRole("button", { name: "Agregar ejercicio" }).click();
  await p.getByLabel("Ejercicio 2", { exact: true }).fill("Puente de glúteos");
  await p.getByLabel("Nota (opcional)").nth(1).fill("Pausa arriba");

  await p.getByRole("button", { name: "Agregar día" }).click();
  await p.getByLabel("Título del día 2").fill("Empuje");
  await p.getByRole("region", { name: "Día 2" }).getByLabel("Ejercicio 1", { exact: true }).fill("Press banca");

  // Reordenar: sube el ejercicio 2 del día 1 y vuelve a bajarlo (no debe romper nada).
  await p.getByRole("button", { name: "Subir el ejercicio 2 del día 1" }).click();
  await expect(p.getByLabel("Ejercicio 1", { exact: true }).first()).toHaveValue("Puente de glúteos");
  await p.getByRole("button", { name: "Bajar el ejercicio 1 del día 1" }).click();
  await expect(p.getByLabel("Ejercicio 1", { exact: true }).first()).toHaveValue("Sentadilla");

  await p.getByRole("button", { name: "Crear rutina" }).click();
  await expect(p.getByText("Rutina guardada. Tu alumno ya la ve en su cuenta.")).toBeVisible();
  await expect(p.getByText("Tomás Vera · 2 días, 3 ejercicios")).toBeVisible();
  editUrl = (await p.getByRole("link", { name: "Editar" }).first().getAttribute("href"))!;
});

test("el alumno ve su rutina completa y en orden", async () => {
  const s = s1.page;
  await s.goto("/alumno/rutina");
  await expect(s.getByRole("heading", { level: 1, name: "Base de fuerza" })).toBeVisible();
  await expect(s.getByText("Calienta 10 minutos.")).toBeVisible();
  await expect(s.getByRole("heading", { name: "Piernas" })).toBeVisible();
  await expect(s.getByText("Sentadilla")).toBeVisible();
  await expect(s.getByText("Pausa arriba")).toBeVisible();
  await expect(s.getByRole("listitem").filter({ hasText: "Sentadilla" })).toContainText("4 × 8-10");
  await expect(s.getByRole("heading", { name: "Empuje" })).toBeVisible();
  // El otro alumno no ve nada de esto.
  await s2.page.goto("/alumno/rutina");
  await expect(s2.page.getByText("Tu PT todavía no te asignó una rutina.")).toBeVisible();
});

test("el PT edita la rutina y el alumno ve el cambio", async () => {
  const p = pt.page;
  await p.goto(editUrl);
  await expect(p.getByLabel("Ejercicio 1", { exact: true }).first()).toHaveValue("Sentadilla");
  await p.getByLabel("Repeticiones").first().fill("6-8");
  await p.getByRole("button", { name: "Quitar el día 2" }).click();
  await p.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(p.getByText("Tomás Vera · 1 día, 2 ejercicios")).toBeVisible();

  await s1.page.goto("/alumno/rutina");
  await expect(s1.page.getByRole("listitem").filter({ hasText: "Sentadilla" })).toContainText("4 × 6-8");
  await expect(s1.page.getByRole("heading", { name: "Empuje" })).toHaveCount(0);
});

test("copiar a otro alumno, y una rutina nueva archiva la anterior", async () => {
  const p = pt.page;
  await p.goto("/pt/rutinas");
  const card = p.getByRole("listitem").filter({ hasText: "Tomás Vera · 1 día" });
  await card.getByText("Copiar a otro alumno").click();
  await card.getByLabel("Alumno").selectOption({ label: "Paula Rey" });
  await card.getByRole("button", { name: "Copiar" }).click();
  await expect(p.getByText("Rutina copiada.")).toBeVisible();
  await s2.page.goto("/alumno/rutina");
  await expect(s2.page.getByRole("heading", { level: 1, name: "Base de fuerza" })).toBeVisible();

  // Nueva rutina para Tomás: la anterior queda archivada y él ve la nueva.
  await p.goto("/pt/rutinas");
  await p.getByRole("listitem").filter({ hasText: "Tomás Vera · 1 día" }).getByRole("button", { name: "Archivar" }).click();
  await s1.page.goto("/alumno/rutina");
  await expect(s1.page.getByText("Tu PT todavía no te asignó una rutina.")).toBeVisible();
  await p.goto("/pt/rutinas");
  await p.getByRole("listitem").filter({ hasText: "Base de fuerza · Tomás Vera" }).getByRole("button", { name: "Reactivar" }).click();
  await s1.page.goto("/alumno/rutina");
  await expect(s1.page.getByRole("heading", { level: 1, name: "Base de fuerza" })).toBeVisible();
});

test("otro PT no puede abrir ni crear rutinas de estos alumnos, y el alumno no entra al editor", async ({ browser }) => {
  const other = await newPage(browser);
  await registerPt(other.page, "Otra Entrenadora", `otra.${run}@prueba.cl`);
  const res = await other.page.goto(editUrl);
  expect(res?.status()).toBe(404);
  await other.ctx.close();

  await s1.page.goto(editUrl);
  await expect(s1.page).toHaveURL(/\/alumno$/);
  await Promise.all([pt.ctx.close(), s1.ctx.close(), s2.ctx.close()]);
});
