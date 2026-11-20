import { describe, expect, it } from "vitest";
import { generateToken, hashToken, newId } from "@/lib/tokens";

describe("tokens de invitación", () => {
  it("genera tokens largos, únicos y seguros para URL", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it("el hash es determinista, de 64 hex y no revela el token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).not.toBe(hashToken(generateToken()));
  });

  it("newId entrega UUID", () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
