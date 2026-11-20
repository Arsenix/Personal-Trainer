import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { hit, resetRateLimits } from "@/lib/rate-limit";

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("límite por ventana", () => {
  it("permite hasta el máximo y bloquea el siguiente intento", () => {
    for (let i = 0; i < 3; i++) expect(hit("k", 3, 1000)).toBe(true);
    expect(hit("k", 3, 1000)).toBe(false);
  });
  it("cuenta cada clave por separado", () => {
    for (let i = 0; i < 3; i++) hit("a", 3, 1000);
    expect(hit("b", 3, 1000)).toBe(true);
  });
  it("se reinicia al terminar la ventana", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 4; i++) hit("k", 3, 1000);
    expect(hit("k", 3, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(hit("k", 3, 1000)).toBe(true);
  });
});
