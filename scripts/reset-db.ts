/** Borra todo el esquema public y vuelve a migrar. Solo para desarrollo y pruebas. */
import { Client } from "pg";
import { migrate } from "./migrate";

/** Solo se puede borrar una base cuyo nombre termine en _dev o _test. */
export function assertResettable(adminUrl: string) {
  const db = decodeURIComponent(new URL(adminUrl).pathname.replace(/^\//, ""));
  if (!/_(dev|test)$/.test(db)) {
    throw new Error(`Por seguridad solo se reinician bases terminadas en _dev o _test (esta es "${db}").`);
  }
}

export async function resetDb(adminUrl: string, appPassword: string, authPassword: string) {
  assertResettable(adminUrl);
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query("drop schema public cascade; create schema public;");
  } finally {
    await c.end();
  }
  await migrate({ adminUrl, appPassword, authPassword, quiet: true });
}

if (process.argv[1] && /reset-db\.ts$/.test(process.argv[1])) {
  import("dotenv").then(async ({ config }) => {
    config({ path: ".env.local" });
    config();
    await resetDb(
      process.env.ADMIN_DATABASE_URL!,
      process.env.APP_DB_PASSWORD!,
      process.env.AUTH_DB_PASSWORD!,
    );
    console.log("Base reiniciada.");
  });
}
