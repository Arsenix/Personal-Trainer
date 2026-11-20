import { headers } from "next/headers";

/**
 * Límite por ventana fija, en memoria. Suficiente para un solo servidor (el VPS);
 * si algún día hay varias instancias, hay que moverlo a la base o a Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "local";
}

/** true si la acción está permitida para este IP (y opcionalmente este correo). */
export async function allow(action: string, max: number, windowMs: number, extra = ""): Promise<boolean> {
  const ip = await clientIp();
  return hit(`${action}:${ip}:${extra}`, max, windowMs);
}

export function resetRateLimits() {
  buckets.clear();
}
