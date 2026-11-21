import { expect, test } from "@playwright/test";
import { currentMonth, monthLabel } from "../src/lib/dates";
import { activateMonth, createPlan, inviteAndJoin, newPage, registerPt } from "./helpers";

const run = `${Date.now().toString(36)}s`;
const month = currentMonth();

test("el resumen del PT parte vacío, luego ordena lo pendiente de cada alumno", async ({ browser }) => {
  const pt = await newPage(browser);
  const p = pt.page;
  await registerPt(p, "Fernanda Soto", `resumen.${run}@prueba.cl`);

  // Sin alumnos: invitación a empezar y paneles en cero.
  await expect(p.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
  await expect(p.getByText("Aún no tienes alumnos.")).toBeVisible();
  await expect(p.getByText("No tienes clases reservadas hoy.")).toBeVisible();

  const st = await inviteAndJoin(p, browser, "Luis Cano", `luis.${run}@prueba.cl`);
  await p.goto("/pt");
  const sinMes = p.getByRole("region", { name: new RegExp(`Sin ${monthLabel(month)} activado`, "i") });
  await expect(sinMes).toContainText("Luis Cano");
  await expect(p.getByRole("region", { name: "Sin rutina" })).toContainText("Luis Cano");

  // Con un plan de una sola clase, el alumno queda activo pero "al límite".
  await createPlan(p, "Prueba 1 clase", 1, "15000");
  await activateMonth(p, "Luis Cano", month);
  await p.goto("/pt");
  await expect(p.getByText("Todos tus alumnos tienen el mes activado.")).toBeVisible();
  const saldo = p.getByRole("region", { name: "Les quedan pocas clases" });
  await expect(saldo).toContainText("Luis Cano");
  await expect(saldo).toContainText("Le queda 1 clase");

  // Cada fila del panel lleva a la tarjeta del alumno.
  await saldo.getByRole("link", { name: "Luis Cano" }).click();
  await expect(p).toHaveURL(/\/pt\/alumnos#alumno-/);
  await Promise.all([pt.ctx.close(), st.ctx.close()]);
});
