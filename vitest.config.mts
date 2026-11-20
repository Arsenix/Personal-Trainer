import { defineConfig } from "vitest/config";
import path from "node:path";

// Las pruebas de integración usan su propia base (pt_agenda_test): nunca tocan la de desarrollo.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      ADMIN_DATABASE_URL:
        process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://ptagenda_admin:admin_dev_pass@localhost:5432/pt_agenda_test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://ptagenda_app:test_app_pass@localhost:5432/pt_agenda_test",
      AUTH_DATABASE_URL:
        process.env.TEST_AUTH_DATABASE_URL ?? "postgres://ptagenda_auth:test_auth_pass@localhost:5432/pt_agenda_test",
      APP_DB_PASSWORD: "test_app_pass",
      AUTH_DB_PASSWORD: "test_auth_pass",
    },
  },
});
