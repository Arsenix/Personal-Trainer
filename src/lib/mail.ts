import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type Mail = { to: string; subject: string; text: string };

/**
 * Envía un correo con Resend. Sin RESEND_API_KEY (desarrollo y pruebas) lo deja en
 * la consola y en .mail-outbox/outbox.jsonl. Devuelve true si salió por Resend.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // MAIL_OUTBOX=1 deja la bandeja simulada también con la app compilada (lo usan las pruebas e2e).
    if (process.env.NODE_ENV !== "production" || process.env.MAIL_OUTBOX === "1") {
      console.log(`[correo simulado] a ${mail.to}: ${mail.subject}\n${mail.text}`);
      try {
        const dir = join(process.cwd(), ".mail-outbox");
        await mkdir(dir, { recursive: true });
        await appendFile(join(dir, "outbox.jsonl"), JSON.stringify({ ...mail, at: new Date() }) + "\n");
      } catch {
        // la bandeja simulada es solo una comodidad de desarrollo
      }
    }
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "PT Agenda <no-responder@localhost>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
