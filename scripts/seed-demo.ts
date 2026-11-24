/**
 * Datos de demostración (solo desarrollo): un PT con lugares y alumnos.
 *   PT:      camila@demo.ptagenda.cl / DemoPass-2026
 *   Alumnos: matias@, javiera@ y valentina@demo.ptagenda.cl / DemoPass-2026 (la invitación de Tomás queda pendiente)
 *   Valentina sube un comprobante y espera que el PT le active el mes (para mostrar el flujo de pago).
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
    ["Valentina Paz", "valentina@demo.ptagenda.cl", "+56 9 5555 0104", "Energy Gym Providencia", true],
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

  // Planes del PT y mes activado para los alumnos que tienen clases reservadas.
  const planIds: Record<string, string> = {};
  for (const [name, credits, price] of [
    ["Plan 4 clases", 4, 44000],
    ["Plan 8 clases", 8, 80000],
    ["Plan 12 clases", 12, 108000],
  ] as const) {
    const { rows } = await withUser(ptId, (c) => c.query("select save_plan(null, $1, $2, $3, true) as id", [name, credits, price]));
    planIds[name] = rows[0].id;
  }
  const plansFor: Record<string, string> = {
    "matias@demo.ptagenda.cl": "Plan 8 clases",
    "javiera@demo.ptagenda.cl": "Plan 12 clases",
  };
  const { currentMonth } = await import("../src/lib/dates");
  const months = new Set<string>([currentMonth(), ...bookings.map(([, d]) => `${addDays(nextMonday, d).slice(0, 7)}-01`)]);
  for (const [email, plan] of Object.entries(plansFor)) {
    for (const month of months) {
      await withUser(ptId, (c) => c.query("select activate_month($1, $2, $3)", [studentIds[email], month, planIds[plan]]));
    }
  }

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

  // Valentina ya transfirió: sube su comprobante y queda esperando que el PT le active el mes.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await withUser(studentIds["valentina@demo.ptagenda.cl"], (c) =>
    c.query("select upload_proof($1, 'transferencia.png', 'image/png', $2)", [currentMonth(), png]),
  );

  // Una rutina de ejemplo para Matías.
  const routineDays = [
    {
      title: "Día A · Piernas y empuje",
      exercises: [
        { name: "Sentadilla libre", sets: 4, reps: "8-10", weight: 60, note: "Baja controlado, pausa de un segundo" },
        { name: "Press banca", sets: 4, reps: "8", weight: 47.5, note: "" },
        { name: "Peso muerto rumano", sets: 3, reps: "10", weight: 50, note: "Espalda neutra" },
        { name: "Plancha", sets: 3, reps: "40 s", note: "" },
      ],
    },
    {
      title: "Día B · Espalda y brazos",
      exercises: [
        { name: "Dominadas asistidas", sets: 4, reps: "6-8", note: "" },
        { name: "Remo con mancuerna", sets: 3, reps: "10", weight: 14, note: "Cada lado" },
        { name: "Curl de bíceps con mancuernas", sets: 3, reps: "12", weight: 8, note: "" },
      ],
    },
  ];
  await withUser(ptId, (c) =>
    c.query("select save_routine(null, $1, $2, $3, $4::jsonb)", [
      studentIds["matias@demo.ptagenda.cl"],
      "Fuerza, 4 semanas",
      "Calienta 10 minutos antes de empezar y anota los pesos que usas.",
      JSON.stringify(routineDays),
    ]),
  );

  console.log(`Listo. Ingresa con ${ptEmail} / ${PASSWORD}`);
  await appPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
