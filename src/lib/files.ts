/** Comprobantes de transferencia: tipo real del archivo por su contenido (no por lo que diga el navegador). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export type ProofMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export const PROOF_EXT: Record<ProofMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Devuelve el tipo si los primeros bytes corresponden a JPG, PNG, WebP o PDF; si no, null. */
export function sniffProof(bytes: Uint8Array): ProofMime | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

/** Nombre seguro para guardar y mostrar: sin rutas, sin caracteres de control, máximo 100 caracteres. */
export function safeFileName(name: string, mime: ProofMime): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f"<>:*?|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return clean === "" || clean === "." || clean === ".." ? `comprobante.${PROOF_EXT[mime]}` : clean;
}
