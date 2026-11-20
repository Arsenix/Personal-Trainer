import { createHash, randomBytes, randomUUID } from "node:crypto";

/** Token aleatorio de 256 bits para los links de invitación. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** En la base solo se guarda el hash: el token en claro existe únicamente en el link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newId(): string {
  return randomUUID();
}

export const INVITATION_TTL_DAYS = 7;
