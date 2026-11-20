import { resetDb } from "../scripts/reset-db";

export default async function globalSetup() {
  await resetDb(process.env.ADMIN_DATABASE_URL!, process.env.APP_DB_PASSWORD!, process.env.AUTH_DB_PASSWORD!);
}
