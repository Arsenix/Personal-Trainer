/**
 * Datos de demostración (solo desarrollo): un PT con lugares y alumnos.
 *   PT:      camila@demo.ptagenda.cl / DemoPass-2026
 *   Alumnos: matias@demo.ptagenda.cl, javiera@demo.ptagenda.cl / DemoPass-2026 (la invitación de Tomás queda pendiente)
 * Es repetible: si el PT ya existe, no hace nada.
 */
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";

config({ path: ".env.local" });
config();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("El seed de demostración no corre en producción.");
  const { appPool, withSystem, withUser, audit } = await import("../src/lib/db");
  const { generateToken, hashToken, newId } = await import("../src/lib/tokens");
  const { addDays, mondayOf, todayLocal } = await import("../src/lib/dates");

  const PASSWORD = "DemoPass-2026";
  const ptEmail = "camila@demo.ptagenda.cl";

  const exists = await appPool().query("select email_in_use($1) as used", [ptEmail]);
  if (exists.rows[0].used) {
    console.log("El PT de demostración ya existe. Usa `pnpm db:reset` para empezar de cero.");
    await appPool().end();
    return;
  }

  const ptId = newId();
  const hash = await hashPassword(PASSWORD);
  await withSystem((c) =>
    c.query("select register_pt($1, $2, $3, $4, $5)", [ptId, ptEmail, "Camila Rojas", hash, "+56 9 5555 0101"]),
  );

  const loc: Record<string, string> = {};
  await withUser(ptId, async (c) => {
    await c.query(
      `update pt_profiles set transfer_holder = 'Camila Rojas Pérez', transfer_rut = '12.345.678-5',
              transfer_bank = 'Banco Estado', transfer_type = 'rut', transfer_number = '12345678',
              transfer_email = 'camila@demo.ptagenda.cl' where user_id = $1`,
      [ptId],
    );
    for (const [name, kind, address] of [
      ["Energy Gym Providencia", "gym", "Av. Providencia 1234, Providencia"],
      ["Domicilio de Javiera", "home", "Los Leones 456, Ñuñoa"],
      ["Parque Bicentenario", "other", null],
    ] as const) {
      const { rows } = await c.query(
        "insert into locations (pt_id, name, kind, address) values ($1, $2, $3, $4) returning id",
        [ptId, name, kind, address],
      );
      loc[name] = rows[0].id;
      await audit(c, ptId, "location.created", "location", rows[0].id, { name });
    }
  });

  const students = [
    ["Matías Fuentes", "matias@demo.ptagenda.cl", "+56 9 5555 0102", "Energy Gym Providencia", true],
    ["Javiera Soto", "javiera@demo.ptagenda.cl", "+56 9 5555 0103", "Domicilio de Javiera", true],
    ["Tomás Araya", "tomas@demo.ptagenda.cl", null, "Energy Gym Providencia", false],
  ] as const;
  const studentIds: Record<string, string> = {};
  for (const [name, email, phone, place, accept] of students) {
    const token = generateToken();
    await withUser(ptId, async (c) => {
      const { rows } = await c.query(
        `insert into invitations (pt_id, email, name, phone, location_id, token_hash, expires_at)
         values ($1, $2, $3, $4, $5, $6, now() + interval '7 days') returning id`,
        [ptId, email, name, phone, loc[place], hashToken(token)],
      );
      await audit(c, ptId, "invitation.created", "invitation", rows[0].id, { email });
    });
    if (accept) {
      const id = newId();
      studentIds[email] = id;
      await withSystem((c) => c.query("select accept_invitation($1, $2, $3)", [hashToken(token), id, hash]));
    } else {
      console.log(`Invitación pendiente de ${name}: ${process.env.APP_URL ?? "http://localhost:3000"}/invitacion/${token}`);
    }
  }
  // Algunas clases reservadas para la próxima semana (hora de Santiago).
  const nextMonday = addDays(mondayOf(todayLocal()), 7);
  const bookings: [string, number, number][] = [
    ["matias@demo.ptagenda.cl", 1, 7],
    ["matias@demo.ptagenda.cl", 3, 7],
    ["javiera@demo.ptagenda.cl", 2, 18],
    ["javiera@demo.ptagenda.cl", 4, 19],
  ];
  for (const [email, dayOffset, hour] of bookings) {
    const day = addDays(nextMonday, dayOffset);
    await withUser(studentIds[email], async (c) => {
      const { rows } = await c.query(
        "select make_timestamptz(extract(year from $1::date)::int, extract(month from $1::date)::int, extract(day from $1::date)::int, $2, 0, 0, 'America/Santiago') as t",
        [day, hour],
      );
      await c.query("select book_class($1)", [rows[0].t]);
    });
  }

  console.log(`Listo. Ingresa con ${ptEmail} / ${PASSWORD}`);
  await appPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
