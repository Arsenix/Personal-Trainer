import { defineConfig } from "@playwright/test";

// Las pruebas e2e usan la base pt_agenda_test y un servidor de producción en el puerto 3100.
// Navegador: por defecto el de Playwright (`npx playwright install chromium`).
// Si ya tienes Chrome instalado: E2E_CHANNEL=chrome pnpm test:e2e
const PORT = 3100;
const e2eEnv = {
  ADMIN_DATABASE_URL:
    process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://ptagenda_admin:admin_dev_pass@localhost:5432/pt_agenda_test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://ptagenda_app:dev_app_pass@localhost:5432/pt_agenda_test",
  AUTH_DATABASE_URL:
    process.env.TEST_AUTH_DATABASE_URL ?? "postgres://ptagenda_auth:dev_auth_pass@localhost:5432/pt_agenda_test",
  APP_DB_PASSWORD: "dev_app_pass",
  AUTH_DB_PASSWORD: "dev_auth_pass",
  BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
  APP_URL: `http://localhost:${PORT}`,
  // Las pruebas crean muchos PT en pocos minutos; en producción el límite real es 5 cada 10 minutos.
  REGISTER_LIMIT_MAX: "100",
  MAIL_OUTBOX: "1",
  RESEND_API_KEY: "",
};
Object.assign(process.env, e2eEnv);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_CHANNEL || undefined,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Primero deja la base de pruebas limpia y migrada; después levanta la app ya compilada (pnpm build).
    command: `pnpm exec tsx scripts/reset-db.ts && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...e2eEnv, NODE_ENV: "production" },
  },
});
