import { describe, expect, it } from "vitest";
import { expandBlocks, groupRulesIntoBlocks, weeklyHours } from "@/lib/schedule";
import { scheduleInputSchema } from "@/lib/validation";

describe("horario semanal por bloques", () => {
  it("expande un bloque de varios días a reglas por día", () => {
    const r = expandBlocks([{ days: [1, 3, 5], start: 6, end: 22 }]);
    expect(r).toEqual({
      rules: [
        { weekday: 1, start: 6, end: 22 },
        { weekday: 3, start: 6, end: 22 },
        { weekday: 5, start: 6, end: 22 },
      ],
    });
  });

  it("permite dos bloques el mismo día si no se pisan (pausa de almuerzo)", () => {
    const r = expandBlocks([
      { days: [1, 2], start: 6, end: 12 },
      { days: [1, 2], start: 16, end: 21 },
    ]);
    expect(r).toEqual({
      rules: [
        { weekday: 1, start: 6, end: 12 },
        { weekday: 1, start: 16, end: 21 },
        { weekday: 2, start: 6, end: 12 },
        { weekday: 2, start: 16, end: 21 },
      ],
    });
  });

  it("une tramos que se tocan y quita días repetidos", () => {
    expect(
      expandBlocks([
        { days: [2, 2], start: 6, end: 12 },
        { days: [2], start: 12, end: 16 },
      ]),
    ).toEqual({ rules: [{ weekday: 2, start: 6, end: 16 }] });
  });

  it("rechaza bloques que se pisan, nombrando el día", () => {
    const r = expandBlocks([
      { days: [1, 2], start: 6, end: 12 },
      { days: [2], start: 10, end: 14 },
    ]);
    expect(r).toEqual({ error: expect.stringContaining("martes") });
  });

  it("rechaza bloques sin días, invertidos o fuera de rango", () => {
    expect(expandBlocks([{ days: [], start: 6, end: 8 }])).toHaveProperty("error");
    expect(expandBlocks([{ days: [1], start: 10, end: 10 }])).toHaveProperty("error");
    expect(expandBlocks([{ days: [1], start: 12, end: 8 }])).toHaveProperty("error");
    expect(expandBlocks([{ days: [1], start: -1, end: 8 }])).toHaveProperty("error");
    expect(expandBlocks([{ days: [1], start: 6, end: 25 }])).toHaveProperty("error");
    expect(expandBlocks([{ days: [8], start: 6, end: 8 }])).toHaveProperty("error");
    expect(expandBlocks([{ days: [1], start: 6.5, end: 8 }])).toHaveProperty("error");
  });

  it("sin bloques no hay horas abiertas", () => {
    expect(expandBlocks([])).toEqual({ rules: [] });
    expect(weeklyHours([])).toBe(0);
  });

  it("cuenta las clases por semana", () => {
    const r = expandBlocks([{ days: [1, 2, 3, 4, 5], start: 6, end: 22 }]);
    expect("rules" in r && weeklyHours(r.rules)).toBe(80);
  });

  it("agrupa reglas guardadas en bloques con los mismos horarios", () => {
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 6, end: 22 }));
    expect(groupRulesIntoBlocks(rules)).toEqual([{ days: [1, 2, 3, 4, 5], start: 6, end: 22 }]);
    const mixed = [
      { weekday: 1, start: 6, end: 12 },
      { weekday: 1, start: 16, end: 21 },
      { weekday: 2, start: 6, end: 12 },
      { weekday: 6, start: 9, end: 13 },
    ];
    expect(groupRulesIntoBlocks(mixed)).toEqual([
      { days: [1, 2], start: 6, end: 12 },
      { days: [6], start: 9, end: 13 },
      { days: [1], start: 16, end: 21 },
    ]);
  });

  it("agrupar y expandir es reversible", () => {
    const rules = [
      { weekday: 1, start: 6, end: 12 },
      { weekday: 1, start: 16, end: 21 },
      { weekday: 3, start: 6, end: 12 },
    ];
    expect(expandBlocks(groupRulesIntoBlocks(rules))).toEqual({ rules });
  });

  it("el esquema del formulario rechaza datos mal formados", () => {
    expect(scheduleInputSchema.safeParse([{ days: [1], start: 6, end: 22 }]).success).toBe(true);
    expect(scheduleInputSchema.safeParse([{ days: [1], start: "6", end: 22 }]).success).toBe(false);
    expect(scheduleInputSchema.safeParse([{ days: [0], start: 6, end: 22 }]).success).toBe(false);
    expect(scheduleInputSchema.safeParse("hola").success).toBe(false);
    expect(scheduleInputSchema.safeParse(Array(21).fill({ days: [1], start: 6, end: 7 })).success).toBe(false);
  });
});
