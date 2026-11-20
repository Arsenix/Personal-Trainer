import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { appPool, authPool } from "./db";

const isProd = process.env.NODE_ENV === "production";

/**
 * Better Auth solo se usa para sesiones y para iniciar sesión.
 * Las cuentas NO se crean por la vía pública: PT y alumnos se dan de alta con las
 * funciones register_pt / accept_invitation de la base (ver db/migrations/001_init.sql).
 */
export const auth = betterAuth({
  database: authPool(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
    },
  },
  advanced: {
    useSecureCookies: isProd,
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          // Auditoría de accesos: cada inicio de sesión exitoso queda registrado.
          try {
            await appPool().query("select log_audit($1, 'auth.login', 'session', null, '{}'::jsonb)", [
              session.userId,
            ]);
          } catch (e) {
            console.error("No se pudo registrar el acceso en la auditoría", e);
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
