import { describe, expect, it } from "vitest";
import {
  addDays,
  canStudentCancel,
  dayLong,
  hourLabel,
  isDateString,
  isoWeekday,
  mondayOf,
  slotLong,
  slotShort,
  todayLocal,
  weekDays,
  weekFromParam,
  weekRangeLabel,
} from "@/lib/dates";
import { blockSchema, parseHourRanges } from "@/lib/validation";

describe("fechas locales", () => {
  it("todayLocal usa la fecha de Santiago, no la de UTC", () => {
    // 02:30 UTC del 21 de noviembre es todavía el 20 en Santiago (UTC-3 en verano).
    expect(todayLocal(new Date("2026-11-21T02:30:00Z"))).toBe("2026-11-20");
    expect(todayLocal(new Date("2026-11-21T03:30:00Z"))).toBe("2026-11-21");
    // En invierno es UTC-4.
    expect(todayLocal(new Date("2026-07-01T03:30:00Z"))).toBe("2026-06-30");
  });

  it("calcula lunes, días de la semana y suma de días", () => {
    expect(isoWeekday("2026-11-23")).toBe(1); // lunes
    expect(isoWeekday("2026-11-29")).toBe(7); // domingo
    expect(mondayOf("2026-11-26")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekDays("2026-11-23")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
  });

  it("valida el parámetro de semana y cae en la semana actual si no sirve", () => {
    const now = new Date("2026-11-20T15:00:00Z"); // viernes 20
    expect(weekFromParam("2026-12-02", now)).toBe("2026-11-30");
    expect(weekFromParam("basura", now)).toBe("2026-11-16");
    expect(weekFromParam(undefined, now)).toBe("2026-11-16");
    expect(weekFromParam("2026-02-30", now)).toBe("2026-11-16");
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2028-02-29")).toBe(true);
  });

  it("da etiquetas legibles en español", () => {
    expect(hourLabel(7)).toBe("07:00");
    expect(dayLong("2026-11-26")).toBe("jueves 26 de noviembre");
    expect(weekRangeLabel("2026-11-23")).toBe("23 al 27 de noviembre");
    expect(weekRangeLabel("2026-11-30")).toBe("30 de noviembre al 4 de diciembre");
  });

  it("muestra la hora local de Santiago para un instante real", () => {
    // 10:00 UTC en diciembre es 07:00 en Santiago (UTC-3).
    expect(slotLong(new Date("2026-12-07T10:00:00Z"))).toBe("lunes 7 de diciembre, 07:00");
    // 11:00 UTC en julio es 07:00 (UTC-4).
    expect(slotLong(new Date("2026-07-06T11:00:00Z"))).toBe("lunes 6 de julio, 07:00");
    expect(slotShort(new Date("2026-12-07T10:00:00Z"))).toMatch(/lun 7 dic · 07:00/);
  });

  it("el alumno cancela con 24 horas o más", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(canStudentCancel(new Date("2026-11-21T12:00:00Z"), now)).toBe(true);
    expect(canStudentCancel(new Date("2026-11-21T11:59:59Z"), now)).toBe(false);
    expect(canStudentCancel(new Date("2026-11-20T11:00:00Z"), now)).toBe(false);
  });
});

describe("tramos y bloqueos", () => {
  it("lee, ordena y valida tramos", () => {
    expect(parseHourRanges(["13", "6", ""], ["22", "12", ""])).toEqual({
      ranges: [
        { start: 6, end: 12 },
        { start: 13, end: 22 },
      ],
    });
    expect(parseHourRanges(["", ""], ["", ""])).toEqual({ ranges: [] });
    expect(parseHourRanges(["6", "12"], ["12", "22"])).toEqual({
      ranges: [
        { start: 6, end: 12 },
        { start: 12, end: 22 },
      ],
    });
  });

  it("rechaza tramos incompletos, invertidos, fuera de rango o que se pisan", () => {
    expect(parseHourRanges(["6"], [""])).toHaveProperty("error");
    expect(parseHourRanges(["10"], ["10"])).toHaveProperty("error");
    expect(parseHourRanges(["12"], ["8"])).toHaveProperty("error");
    expect(parseHourRanges(["-1"], ["8"])).toHaveProperty("error");
    expect(parseHourRanges(["6"], ["25"])).toHaveProperty("error");
    expect(parseHourRanges(["6", "10"], ["12", "14"])).toEqual({ error: "Los tramos de un mismo día no pueden pisarse." });
    expect(parseHourRanges(["6.5"], ["8"])).toHaveProperty("error");
  });

  it("el bloqueo exige fecha y horas coherentes", () => {
    expect(blockSchema.safeParse({ date: "2026-11-26", from: "8", to: "10", reason: "" }).success).toBe(true);
    expect(blockSchema.safeParse({ date: "2026-11-26", from: "0", to: "24", reason: "Vacaciones" }).success).toBe(true);
    expect(blockSchema.safeParse({ date: "", from: "8", to: "10", reason: "" }).success).toBe(false);
    expect(blockSchema.safeParse({ date: "2026-11-26", from: "10", to: "10", reason: "" }).success).toBe(false);
    expect(blockSchema.safeParse({ date: "2026-11-26", from: "10", to: "9", reason: "" }).success).toBe(false);
  });
});
