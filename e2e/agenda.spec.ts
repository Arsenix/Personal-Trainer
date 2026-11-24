import { expect, test } from "@playwright/test";
import { addDays, dayLong, mondayOf, todayLocal } from "../src/lib/dates";
import { activateMonth, createPlan, inviteAndJoin, monthOfDate, newPage, registerPt } from "./helpers";

const run = `${Date.now().toString(36)}a`;
const ptEmail = `entrenadora.${run}@prueba.cl`;
const nextMonday = addDays(mondayOf(todayLocal()), 7);
const tuesday = addDays(nextMonday, 1);
const wednesday = addDays(nextMonday, 2);
const thursday = addDays(nextMonday, 3);

test.describe.configure({ mode: "serial" });

let student1: Awaited<ReturnType<typeof newPage>>;
let student2: Awaited<ReturnType<typeof newPage>>;
let pt: Awaited<ReturnType<typeof newPage>>;

test("el PT parte con un horario de lunes a viernes de 06:00 a 22:00", async ({ browser }) => {
  pt = await newPage(browser);
  await registerPt(pt.page, "Valentina Mora", ptEmail);

  await pt.page.goto(`/pt/agenda?semana=${nextMonday}`);
  await expect(pt.page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
  await expect(pt.page.getByText("0 clases reservadas, 80 horarios libres.")).toBeVisible();

  await pt.page.goto("/pt/disponibilidad");
  await expect(pt.page.getByRole("heading", { name: "Bloque 1" })).toBeVisible();
  await expect(pt.page.getByLabel("Desde (bloque 1)")).toHaveValue("6");
  await expect(pt.page.getByLabel("Hasta (bloque 1)")).toHaveValue("22");
  await expect(pt.page.getByRole("button", { name: "lunes, bloque 1" })).toHaveAttribute("aria-pressed", "true");
  await expect(pt.page.getByRole("button", { name: "sábado, bloque 1" })).toHaveAttribute("aria-pressed", "false");

  student1 = await inviteAndJoin(pt.page, browser, "Matías Fuentes", `matias.${run}@prueba.cl`);
  student2 = await inviteAndJoin(pt.page, browser, "Javiera Soto", `javiera.${run}@prueba.cl`);

  // Sin mes activado no se puede reservar: el PT crea un plan y activa los meses que toca la semana de prueba.
  await createPlan(pt.page, "Plan 20", 20, "200000");
  for (const month of new Set([monthOfDate(nextMonday), monthOfDate(addDays(nextMonday, 4))])) {
    await activateMonth(pt.page, "Matías Fuentes", month);
    await activateMonth(pt.page, "Javiera Soto", month);
  }
});

test("el alumno elige un horario, confirma y la clase queda reservada", async () => {
  const s = student1.page;
  await s.goto(`/alumno/reservar?dia=${wednesday}`);
  await expect(s.getByRole("heading", { level: 1, name: "Reservar clase" })).toBeVisible();
  // Sin elegir nada no hay barra de confirmación.
  await expect(s.getByRole("button", { name: "Confirmar reserva" })).toHaveCount(0);

  await s.getByRole("button", { name: /Elegir miércoles .*, 10:00/ }).click();
  await expect(s.getByText("Vas a reservar")).toBeVisible();
  await s.getByRole("button", { name: "Elegir otro" }).click();
  await expect(s.getByText("Vas a reservar")).toHaveCount(0);

  await s.getByRole("button", { name: /Elegir miércoles .*, 10:00/ }).click();
  await s.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(s.getByText("Clase reservada. Le avisamos a tu PT.")).toBeVisible();
  await expect(s.getByText("Tu clase 10:00")).toBeVisible();

  await s.goto("/alumno");
  await expect(s.getByRole("heading", { name: "Tus próximas clases" })).toBeVisible();
  await expect(s.getByText(/miércoles \d+ de \w+, 10:00/)).toBeVisible();
});

test("otro alumno ya no ve ese horario como libre y el PT ve quién lo tomó", async () => {
  const s2 = student2.page;
  await s2.goto(`/alumno/reservar?dia=${wednesday}`);
  await expect(s2.getByRole("button", { name: /Elegir miércoles .*, 10:00/ })).toHaveCount(0);
  await expect(s2.getByRole("button", { name: /Elegir miércoles .*, 11:00/ })).toHaveCount(1);
  await expect(s2.getByText("Tu clase")).toHaveCount(0);

  await pt.page.goto(`/pt/agenda?semana=${nextMonday}`);
  await expect(pt.page.getByText("1 clase reservada, 79 horarios libres.")).toBeVisible();
  await expect(pt.page.getByText("Matías Fuentes").first()).toBeVisible();
});

test("el alumno cancela con más de 24 horas y el horario vuelve a quedar libre", async () => {
  const s = student1.page;
  await s.goto("/alumno");
  await s.getByText("Cancelar clase", { exact: true }).click();
  await s.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(s.getByText("No tienes clases reservadas")).toBeVisible();
  await expect(s.getByText("Cancelada por ti")).toBeVisible();

  await student2.page.goto(`/alumno/reservar?dia=${wednesday}`);
  await expect(student2.page.getByRole("button", { name: /Elegir miércoles .*, 10:00/ })).toHaveCount(1);
});

test("el PT cancela una clase con motivo y el alumno lo ve", async () => {
  const s = student1.page;
  await s.goto(`/alumno/reservar?dia=${tuesday}`);
  await s.getByRole("button", { name: /Elegir martes .*, 9:00|Elegir martes .*, 09:00/ }).click();
  await s.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(s.getByText("Clase reservada.")).toBeVisible();

  const p = pt.page;
  await p.goto(`/pt/agenda?semana=${nextMonday}`);
  await p.locator("summary", { hasText: "Cancelar" }).first().click();
  await p.getByLabel("Motivo (opcional)").fill("Me enfermé");
  await p.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(p.getByText("0 clases reservadas, 80 horarios libres.")).toBeVisible();

  await s.goto("/alumno");
  await expect(s.getByText("Cancelada por tu PT")).toBeVisible();
});

test("bloquear un día con una clase pide confirmación, cancela la clase y oculta el día", async () => {
  const s = student1.page;
  await s.goto(`/alumno/reservar?dia=${thursday}`);
  await s.getByRole("button", { name: /Elegir jueves .*, 10:00/ }).click();
  await s.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(s.getByText("Clase reservada.")).toBeVisible();

  const p = pt.page;
  await p.goto("/pt/disponibilidad");
  await p.getByLabel("Fecha").fill(thursday);
  await p.getByLabel("Motivo (opcional)").fill("Vacaciones");
  await p.getByRole("button", { name: "Bloquear horario" }).click();
  await expect(p.getByText(/En ese horario hay 1 clase reservada/)).toBeVisible();
  await p.getByRole("button", { name: "Bloquear y cancelar la clase" }).click();
  await expect(p.getByText("Horario bloqueado. Cancelamos 1 clase y avisamos por correo.")).toBeVisible();
  await expect(p.getByText("todo el día · Vacaciones")).toBeVisible();

  await s.goto(`/alumno/reservar?dia=${thursday}`);
  await expect(s.getByRole("button", { name: /Elegir jueves/ })).toHaveCount(0);
  await expect(s.getByRole("button", { name: `${dayLong(thursday)}: sin horarios` })).toBeDisabled();

  // Quitar el bloqueo devuelve el día.
  await p.goto("/pt/disponibilidad");
  await p.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(p.getByText("todo el día · Vacaciones")).toHaveCount(0);
  await s.goto(`/alumno/reservar?dia=${thursday}`);
  await expect(s.getByRole("button", { name: /Elegir jueves .*, 10:00/ })).toHaveCount(1);
});

test("el PT arma su horario por bloques (varios días a la vez y pausa de almuerzo) y los alumnos solo ven eso", async () => {
  const p = pt.page;
  await p.goto("/pt/disponibilidad");
  await expect(p.getByText(/80 clases por semana/)).toBeVisible();

  // Bloque 1: lunes a viernes, mañana.
  await p.getByLabel("Hasta (bloque 1)").selectOption("12");
  // Bloque 2: solo lunes, miércoles y viernes, tarde.
  await p.getByRole("button", { name: "Agregar bloque" }).click();
  for (const d of ["lunes", "miércoles", "viernes"]) {
    await p.getByRole("button", { name: `${d}, bloque 2` }).click();
  }
  await expect(p.getByText(/45 clases por semana/)).toBeVisible();
  await p.getByRole("button", { name: "Guardar horario" }).click();
  await expect(p.getByText("Horario guardado: 45 clases por semana.")).toBeVisible();

  const s = student2.page;
  await s.goto(`/alumno/reservar?dia=${nextMonday}`);
  await expect(s.getByRole("button", { name: /Elegir lunes .*, 07:00/ })).toHaveCount(1);
  await expect(s.getByRole("button", { name: /Elegir lunes .*, 13:00/ })).toHaveCount(0);
  await expect(s.getByRole("button", { name: /Elegir lunes .*, 16:00/ })).toHaveCount(1);
  await s.goto(`/alumno/reservar?dia=${tuesday}`);
  await expect(s.getByRole("button", { name: /Elegir martes .*, 07:00/ })).toHaveCount(1);
  await expect(s.getByRole("button", { name: /Elegir martes .*, 16:00/ })).toHaveCount(0);

  // Un bloque que se pisa con otro se avisa antes de guardar y no se guarda.
  await p.goto("/pt/disponibilidad");
  await p.getByLabel("Hasta (bloque 2)").selectOption("21");
  await p.getByLabel("Desde (bloque 2)").selectOption("10");
  await expect(p.getByText(/Dos bloques se pisan el lunes/)).toBeVisible();

  // Volver a lunes a viernes, 06:00 a 22:00.
  await p.goto("/pt/disponibilidad");
  await p.getByRole("button", { name: "Lunes a viernes, 06:00 a 22:00" }).click();
  await p.getByRole("button", { name: "Guardar horario" }).click();
  await expect(p.getByText("Horario guardado: 80 clases por semana.")).toBeVisible();
  await s.goto(`/alumno/reservar?dia=${nextMonday}`);
  await expect(s.getByRole("button", { name: /Elegir lunes .*, 13:00/ })).toHaveCount(1);
});

test("el PT bloquea una hora libre desde la agenda y queda en la actividad", async () => {
  const p = pt.page;
  await p.goto(`/pt/agenda?semana=${nextMonday}`);
  await p.getByRole("button", { name: `Bloquear 15:00 del ${addDays(nextMonday, 4)}` }).click();
  await expect(p.getByText("Bloqueado").first()).toBeVisible();
  await expect(p.getByText("0 clases reservadas, 79 horarios libres.")).toBeVisible();

  await p.goto("/pt/actividad");
  await expect(p.getByText("reservó una clase").first()).toBeVisible();
  await expect(p.getByText("bloqueó horas de su agenda").first()).toBeVisible();
  await expect(p.getByText("canceló una clase").first()).toBeVisible();
});

test("las zonas están separadas: el alumno no entra a la agenda del PT", async () => {
  await student1.page.goto("/pt/agenda");
  await expect(student1.page).toHaveURL(/\/alumno$/);
  await student1.page.goto("/pt/disponibilidad");
  await expect(student1.page).toHaveURL(/\/alumno$/);
  await pt.page.goto("/alumno/reservar");
  await expect(pt.page).toHaveURL(/\/pt$/);
  await Promise.all([student1.ctx.close(), student2.ctx.close(), pt.ctx.close()]);
});
