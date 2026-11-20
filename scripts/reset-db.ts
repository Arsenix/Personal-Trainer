/** Borra todo el esquema public y vuelve a migrar. Solo para desarrollo y pruebas. */
import { Client } from "pg";
import { migrate } from "./migrate";

export async function resetDb(adminUrl: string, appPassword: string, authPassword: string) {
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
    if (process.env.NODE_ENV === "production") throw new Error("No en producción");
    await resetDb(
      process.env.ADMIN_DATABASE_URL!,
      process.env.APP_DB_PASSWORD!,
      process.env.AUTH_DB_PASSWORD!,
    );
    console.log("Base reiniciada.");
  });
}
