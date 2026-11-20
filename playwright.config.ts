import { defineConfig } from "@playwright/test";

// Las pruebas e2e usan la base pt_agenda_test y un servidor de producción en el puerto 3100.
// Navegador: por defecto el de Playwright (`npx playwright install chromium`).
// Si ya tienes Chrome instalado: E2E_CHANNEL=chrome pnpm test:e2e
const PORT = 3100;
const e2eEnv = {
  ADMIN_DATABASE_URL:
    process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://ptagenda_admin:admin_dev_pass@localhost:5432/pt_agenda_test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://ptagenda_app:test_app_pass@localhost:5432/pt_agenda_test",
  AUTH_DATABASE_URL:
    process.env.TEST_AUTH_DATABASE_URL ?? "postgres://ptagenda_auth:test_auth_pass@localhost:5432/pt_agenda_test",
  APP_DB_PASSWORD: "test_app_pass",
  AUTH_DB_PASSWORD: "test_auth_pass",
  BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
  APP_URL: `http://localhost:${PORT}`,
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
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_CHANNEL || undefined,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...e2eEnv, NODE_ENV: "production" },
  },
});
