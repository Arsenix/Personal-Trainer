import { describe, expect, it } from "vitest";
import { cleanRut, formatRut, isValidRut, rutCheckDigit } from "@/lib/rut";

describe("RUT", () => {
  it("valida RUTs correctos con y sin formato", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("11.111.111-1")).toBe(true);
  });

  it("rechaza dígito verificador incorrecto y entradas absurdas", () => {
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("abc")).toBe(false);
    expect(isValidRut("1-9")).toBe(false);
    expect(isValidRut("0000000-0")).toBe(false);
    expect(isValidRut("1234567890123-5")).toBe(false);
  });

  it("calcula y acepta la K (dígito 10)", () => {
    let body = 10_000_000;
    while (rutCheckDigit(String(body)) !== "K") body++;
    expect(isValidRut(`${body}-K`)).toBe(true);
    expect(isValidRut(`${body}-k`)).toBe(true);
    expect(isValidRut(`${body}-0`)).toBe(false);
  });

  it("calcula el 0 (resto 11)", () => {
    let body = 10_000_000;
    while (rutCheckDigit(String(body)) !== "0") body++;
    expect(isValidRut(`${body}-0`)).toBe(true);
  });

  it("limpia y formatea", () => {
    expect(cleanRut("12.345.678-5")).toBe("123456785");
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("12.345.678-9")).toBe("12.345.678-9"); // inválido: se devuelve tal cual
  });
});
