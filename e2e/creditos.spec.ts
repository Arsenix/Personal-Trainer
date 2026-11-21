import { expect, test } from "@playwright/test";
import { addDays, currentMonth, mondayOf, monthLabel, todayLocal } from "../src/lib/dates";
import { activateMonth, createPlan, inviteAndJoin, monthOfDate, newPage, registerPt, studentMonth } from "./helpers";

const run = `${Date.now().toString(36)}c`;
const ptEmail = `credito.${run}@prueba.cl`;
const nextMonday = addDays(mondayOf(todayLocal()), 7);
const wednesday = addDays(nextMonday, 2);
const month = monthOfDate(wednesday); // mes de las clases de la prueba
const name = "Daniela Pino";

// PNG mínimo y válido de 1x1.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });

let pt: Awaited<ReturnType<typeof newPage>>;
let st: Awaited<ReturnType<typeof newPage>>;

const monthCard = () => st.page.getByRole("article", { name: new RegExp(monthLabel(month), "i") });

async function reserve(hour: number) {
  await st.page.goto(`/alumno/reservar?semana=${nextMonday}`);
  await st.page.getByRole("button", { name: new RegExp(`Elegir miércoles .*, ${String(hour).padStart(2, "0")}:00`) }).click();
  await st.page.getByRole("button", { name: "Confirmar reserva" }).click();
}

test("el PT crea un plan y el alumno sin mes activado no puede reservar", async ({ browser }) => {
  pt = await newPage(browser);
  await registerPt(pt.page, "Marcela Vidal", ptEmail);
  await createPlan(pt.page, "Plan 4 clases", 4, "44.000");
  await expect(pt.page.getByText("4 clases al mes · $44.000")).toBeVisible();

  st = await inviteAndJoin(pt.page, browser, name, `daniela.${run}@prueba.cl`);
  await expect(monthCard().getByText("Sin activar")).toBeVisible();

  await reserve(10);
  await expect(st.page.getByText(/todavía no activa el mes/)).toBeVisible();
});

test("el alumno sube un comprobante: solo se aceptan fotos y PDF reales", async () => {
  await st.page.goto("/alumno");
  const card = monthCard();
  // Un archivo de texto disfrazado de imagen no pasa.
  await card.getByLabel("Comprobante de transferencia").setInputFiles({
    name: "comprobante.png",
    mimeType: "image/png",
    buffer: Buffer.from("esto no es una imagen, es solo texto de relleno"),
  });
  await card.getByRole("button", { name: "Enviar comprobante" }).click();
  await expect(st.page.getByText("Solo se aceptan fotos (JPG, PNG, WebP) o PDF.")).toBeVisible();

  await card.getByLabel("Comprobante de transferencia").setInputFiles({ name: "transferencia.png", mimeType: "image/png", buffer: PNG });
  await card.getByRole("button", { name: "Enviar comprobante" }).click();
  await expect(card.getByText("En revisión")).toBeVisible();
  await expect(card.getByText(/Tu PT ya tiene tu comprobante/)).toBeVisible();
});

test("el PT ve el comprobante, solo él y el alumno pueden abrirlo, y puede rechazarlo", async ({ browser }) => {
  const p = pt.page;
  await p.goto("/pt");
  await expect(p.getByText("Tienes 1 comprobante de pago por revisar.")).toBeVisible();
  const region = studentMonth(p, name, month);
  const link = region.getByRole("link", { name: /Ver transferencia\.png/ });
  const href = (await link.getAttribute("href"))!;

  const own = await p.request.get(href);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/png");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await st.page.request.get(href)).status()).toBe(200);

  const anon = await newPage(browser);
  expect((await anon.page.request.get(href)).status()).toBe(401);
  // Otro PT con sesión tampoco: la base no le entrega la fila.
  const other = await newPage(browser);
  await registerPt(other.page, "Otro Entrenador", `otro.${run}@prueba.cl`);
  expect((await other.page.request.get(href)).status()).toBe(404);
  await Promise.all([anon.ctx.close(), other.ctx.close()]);

  await region.getByText("Rechazar", { exact: true }).click();
  await region.getByLabel("Motivo para el alumno").fill("No se ve el monto");
  await region.getByRole("button", { name: "Rechazar comprobante" }).click();
  await expect(p.getByText("Tienes 1 comprobante")).toHaveCount(0);

  await st.page.goto("/alumno");
  await expect(monthCard().getByText("Rechazado")).toBeVisible();
  await expect(monthCard().getByText("Tu PT dice: No se ve el monto")).toBeVisible();
  await expect(monthCard().getByLabel("Comprobante de transferencia")).toBeVisible();
});

test("el alumno vuelve a subirlo, el PT activa el mes y se cargan los créditos del plan", async () => {
  const card = monthCard();
  await card.getByLabel("Comprobante de transferencia").setInputFiles({ name: "transferencia2.png", mimeType: "image/png", buffer: PNG });
  await card.getByRole("button", { name: "Enviar comprobante" }).click();
  await expect(card.getByText("En revisión")).toBeVisible();

  await activateMonth(pt.page, name, month);
  await expect(studentMonth(pt.page, name, month)).toContainText("4 de 4 clases disponibles");

  await st.page.goto("/alumno");
  await expect(monthCard().getByText("Activo", { exact: true })).toBeVisible();
  await expect(monthCard()).toContainText("4 de 4 clases disponibles");
});

test("cada clase gasta un crédito y al quedar en cero no se puede reservar más", async () => {
  for (const [i, hour] of [10, 11, 12, 13].entries()) {
    await reserve(hour);
    await expect(st.page.getByText("Clase reservada.")).toBeVisible();
    await st.page.goto("/alumno");
    await expect(monthCard()).toContainText(`${3 - i} de 4 clases disponibles`);
  }
  await reserve(14);
  await expect(st.page.getByText(/No te quedan créditos en ese mes/)).toBeVisible();
});

test("al cancelar con más de 24 horas el crédito vuelve y se puede usar en otra hora", async () => {
  await st.page.goto("/alumno");
  await st.page.getByText("Cancelar clase", { exact: true }).first().click();
  await st.page.getByRole("button", { name: "Sí, cancelar" }).first().click();
  await expect(monthCard()).toContainText("1 de 4 clases disponibles");
  await expect(monthCard().getByText("Clase cancelada, crédito devuelto").first()).toBeHidden(); // dentro de "Ver movimientos"
  await monthCard().getByText("Ver movimientos").click();
  await expect(monthCard().getByText("Clase cancelada, crédito devuelto").first()).toBeVisible();

  await reserve(14);
  await expect(st.page.getByText("Clase reservada.")).toBeVisible();
});

test("si cancela el PT el crédito vuelve, y el PT puede ajustar créditos con un motivo", async () => {
  const p = pt.page;
  await p.goto(`/pt/agenda?semana=${nextMonday}`);
  await p.locator("summary", { hasText: "Cancelar" }).first().click();
  await p.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(p.getByText("3 clases reservadas")).toBeVisible();

  await p.goto("/pt");
  const region = studentMonth(p, name, month);
  await expect(region).toContainText("1 de 4 clases disponibles");
  await region.getByText("Ajustar créditos").click();
  await region.getByLabel("Créditos").fill("-100");
  await region.getByLabel("Motivo").fill("Prueba");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(region.getByText("Ingresa un número entre -60 y 60")).toBeVisible();

  await region.getByLabel("Créditos").fill("2");
  await region.getByLabel("Motivo").fill("Clase de cortesía");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(region.getByText("Créditos ajustados.")).toBeVisible();
  await expect(region).toContainText("3 de 6 clases disponibles");

  await st.page.goto("/alumno");
  await expect(monthCard()).toContainText("3 de 6 clases disponibles");
  await monthCard().getByText("Ver movimientos").click();
  await expect(monthCard().getByText(/Ajuste del PT · Clase de cortesía/)).toBeVisible();
});

test("los meses de la tarjeta son el actual y el siguiente", async () => {
  await pt.page.goto("/pt");
  await expect(
    pt.page.getByRole("listitem").filter({ hasText: name }).getByRole("heading", { name: new RegExp(monthLabel(currentMonth()), "i") }),
  ).toBeVisible();
  await Promise.all([pt.ctx.close(), st.ctx.close()]);
});
