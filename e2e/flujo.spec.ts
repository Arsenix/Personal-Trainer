import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "clave-segura-2026";
const run = Date.now().toString(36);
const ptEmail = `camila.${run}@prueba.cl`;
const studentEmail = `matias.${run}@prueba.cl`;
const studentName = "Matías Fuentes";

async function registerPt(page: Page, email: string, name: string) {
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill(name);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta de PT" }).click();
  await expect(page).toHaveURL(/\/pt$/);
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ locale: "es-CL", timezoneId: "America/Santiago" });
  return { ctx, page: await ctx.newPage() };
}

test.describe.configure({ mode: "serial" });

test("la portada carga y las zonas privadas piden ingresar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu agenda llena");
  await expect(page.getByRole("link", { name: "Crear cuenta de PT" })).toBeVisible();
  for (const path of ["/pt", "/pt/lugares", "/pt/perfil", "/pt/actividad", "/alumno"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/ingresar$/);
  }
});

test("el registro valida los campos y no deja crear dos cuentas con el mismo correo", async ({ page, browser }) => {
  await page.goto("/registro");
  await page.getByRole("button", { name: "Crear cuenta de PT" }).click();
  await expect(page.getByText("Ingresa tu nombre")).toBeVisible();
  await expect(page.getByText("Ingresa un correo válido")).toBeVisible();
  await expect(page.getByText("Usa al menos 10 caracteres")).toBeVisible();

  await registerPt(page, ptEmail, "Camila Rojas");
  await expect(page.getByRole("heading", { level: 1, name: "Alumnos" })).toBeVisible();

  const other = await newPage(browser);
  await other.page.goto("/registro");
  await other.page.getByLabel("Tu nombre").fill("Otra Persona");
  await other.page.getByLabel("Correo").fill(ptEmail.toUpperCase());
  await other.page.getByLabel("Contraseña").fill(PASSWORD);
  await other.page.getByRole("button", { name: "Crear cuenta de PT" }).click();
  await expect(other.page.getByText("Ya existe una cuenta con este correo")).toBeVisible();
  await other.ctx.close();
});

test("flujo completo: PT arma su cuenta, invita a un alumno y el alumno entra", async ({ page, browser }) => {
  // El PT ingresa (la cuenta ya existe por la prueba anterior).
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(ptEmail);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/pt$/);

  // Lugares
  await page.getByRole("link", { name: "Lugares" }).first().click();
  await expect(page).toHaveURL(/\/pt\/lugares$/);
  await page.getByLabel("Nombre").fill("Energy Gym Providencia");
  await page.getByLabel("Dirección (opcional)").fill("Av. Providencia 1234");
  await page.getByRole("button", { name: "Agregar lugar" }).click();
  await expect(page.getByText("Lugar agregado.")).toBeVisible();
  await expect(page.getByText("Energy Gym Providencia").first()).toBeVisible();

  // Un nombre repetido se rechaza
  await page.getByLabel("Nombre").first().fill("energy gym providencia");
  await page.getByRole("button", { name: "Agregar lugar" }).click();
  await expect(page.getByText("Ya tienes un lugar con ese nombre")).toBeVisible();

  // Perfil: RUT inválido se rechaza, válido se guarda
  await page.getByRole("link", { name: "Perfil y cobro" }).first().click();
  await page.getByLabel("Titular de la cuenta").fill("Camila Rojas Pérez");
  await page.getByLabel("RUT del titular").fill("12.345.678-9");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("El RUT no es válido")).toBeVisible();
  await page.getByLabel("RUT del titular").fill("123456785");
  await page.getByLabel("Banco").fill("Banco Estado");
  await page.getByLabel("Tipo de cuenta").selectOption("rut");
  await page.getByLabel("Número de cuenta").fill("12345678");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil guardado.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("RUT del titular")).toHaveValue("12.345.678-5");

  // Invitar al alumno
  await page.getByRole("link", { name: "Alumnos" }).first().click();
  await page.getByLabel("Nombre del alumno").fill(studentName);
  await page.getByLabel("Correo", { exact: true }).fill(studentEmail);
  await page.getByLabel("Dónde entrena (opcional)").selectOption({ label: "Energy Gym Providencia" });
  await page.getByRole("button", { name: "Invitar alumno" }).click();
  await expect(page.getByText(`Invitación lista para ${studentName}.`)).toBeVisible();
  const link = await page.getByLabel("Link de invitación").first().inputValue();
  expect(link).toMatch(/\/invitacion\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toBeVisible();

  // Un correo con cuenta no se puede invitar otra vez
  await page.getByLabel("Nombre del alumno").fill("Camila Duplicada");
  await page.getByLabel("Correo", { exact: true }).fill(ptEmail);
  await page.getByRole("button", { name: "Invitar alumno" }).click();
  await expect(page.getByText("Este correo ya tiene una cuenta")).toBeVisible();

  // El alumno abre el link en otro navegador
  const s = await newPage(browser);
  await s.page.goto(link);
  await expect(s.page.getByRole("heading", { level: 1 })).toContainText("Hola, Matías");
  await expect(s.page.getByText("Camila Rojas").first()).toBeVisible();

  await s.page.getByLabel("Crea tu contraseña").fill(PASSWORD);
  await s.page.getByLabel("Repítela").fill("otra-clave-distinta");
  await s.page.getByRole("button", { name: "Entrar a mi cuenta" }).click();
  await expect(s.page.getByText("Las contraseñas no coinciden")).toBeVisible();

  await s.page.getByLabel("Crea tu contraseña").fill(PASSWORD);
  await s.page.getByLabel("Repítela").fill(PASSWORD);
  await s.page.getByRole("button", { name: "Entrar a mi cuenta" }).click();
  await expect(s.page).toHaveURL(/\/alumno$/);
  await expect(s.page.getByRole("heading", { level: 1 })).toContainText("Hola, Matías");
  await expect(s.page.getByText("Energy Gym Providencia")).toBeVisible();
  await expect(s.page.getByText("Banco Estado")).toBeVisible();
  await expect(s.page.getByText("12.345.678-5")).toBeVisible();

  // El link ya no sirve y el alumno no puede entrar a la zona del PT
  await s.page.goto(link);
  await expect(s.page.getByRole("heading", { level: 1 })).toContainText("Este link no sirve");
  await s.page.goto("/alumno");
  await s.page.goto("/pt");
  await expect(s.page).toHaveURL(/\/alumno$/);

  // Salir y volver a entrar
  await s.page.getByRole("button", { name: "Salir" }).click();
  await expect(s.page).toHaveURL(/\/$/);
  await s.page.goto("/alumno");
  await expect(s.page).toHaveURL(/\/ingresar$/);
  await s.page.getByLabel("Correo").fill(studentEmail);
  await s.page.getByLabel("Contraseña").fill(PASSWORD);
  await s.page.getByRole("button", { name: "Ingresar" }).click();
  await expect(s.page).toHaveURL(/\/alumno$/);
  await s.ctx.close();

  // El PT ahora ve al alumno, cambia su lugar y ve la actividad
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus alumnos" })).toBeVisible();
  await expect(page.getByText(studentName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toHaveCount(0);

  await page.getByRole("link", { name: "Actividad" }).first().click();
  await expect(page.getByText("Aceptó la invitación y creó su cuenta".toLowerCase())).toBeVisible();
  await expect(page.getByText("creó una invitación")).toBeVisible();
  await expect(page.getByText("inició sesión").first()).toBeVisible();
});

test("el PT puede regenerar y revocar invitaciones", async ({ page, browser }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(ptEmail);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/pt$/);

  await page.getByLabel("Nombre del alumno").fill("Javiera Soto");
  await page.getByLabel("Correo", { exact: true }).fill(`javiera.${run}@prueba.cl`);
  await page.getByRole("button", { name: "Invitar alumno" }).click();
  const first = await page.getByLabel("Link de invitación").first().inputValue();

  await page.getByRole("button", { name: "Nuevo link" }).click();
  await expect(page.getByText(/El anterior dejó de funcionar/)).toBeVisible();

  const s = await newPage(browser);
  await s.page.goto(first);
  await expect(s.page.getByRole("heading", { level: 1 })).toContainText("Este link no sirve");

  await page.reload();
  await page.getByRole("button", { name: "Revocar" }).click();
  await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toHaveCount(0);
  await s.ctx.close();
});

test("un PT no ve a los alumnos de otro PT", async ({ browser }) => {
  const b = await newPage(browser);
  await registerPt(b.page, `otro.${run}@prueba.cl`, "Otro Entrenador");
  await expect(b.page.getByText("Todavía no tienes alumnos")).toBeVisible();
  await expect(b.page.getByText(studentName)).toHaveCount(0);
  await b.page.goto("/pt/lugares");
  await expect(b.page.getByText("Energy Gym Providencia")).toHaveCount(0);
  await b.page.goto("/pt/actividad");
  await expect(b.page.getByText("Matías")).toHaveCount(0);
  await b.ctx.close();
});

test("el inicio de sesión rechaza claves incorrectas y frena los intentos repetidos", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(`nadie.${run}@prueba.cl`);
  for (let i = 0; i < 8; i++) {
    await page.getByLabel("Contraseña").fill(`mala-clave-${i}`);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    // React vacía el formulario al terminar la acción: esperar a que ocurra antes del siguiente intento.
    await expect(page.getByLabel("Contraseña")).toHaveValue("");
  }
  await page.getByLabel("Contraseña").fill("mala-clave-9");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Demasiados intentos")).toBeVisible();
});
