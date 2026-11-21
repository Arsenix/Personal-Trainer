import { getSessionUser } from "@/lib/session";
import { getProofFile } from "@/lib/queries";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Descarga de un comprobante: solo el alumno que lo subió o su PT (lo decide la base con RLS). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("No encontrado", { status: 404 });
  const file = await getProofFile(user.id, id);
  if (!file) return new Response("No encontrado", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
  // El visor de PDF de Chrome no funciona dentro de un sandbox; las imágenes sí lo llevan.
  if (file.mime !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  return new Response(new Uint8Array(file.data), { headers });
}
