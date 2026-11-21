import { describe, expect, it } from "vitest";
import { safeFileName, sniffProof } from "@/lib/files";

const bytes = (...n: number[]) => Uint8Array.from([...n, ...new Array(16).fill(0)]);

describe("sniffProof", () => {
  it("reconoce JPG, PNG, WebP y PDF por su contenido", () => {
    expect(sniffProof(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffProof(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffProof(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
    expect(sniffProof(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
  });
  it("rechaza ejecutables, HTML, SVG, ZIP y archivos vacíos o muy cortos", () => {
    expect(sniffProof(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffProof(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffProof(bytes(0x4d, 0x5a))).toBeNull();
    expect(sniffProof(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(sniffProof(new Uint8Array())).toBeNull();
  });
  it("un RIFF que no es WebP no pasa", () => {
    expect(sniffProof(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe("safeFileName", () => {
  it("quita rutas y caracteres problemáticos", () => {
    expect(safeFileName("C:\\fotos\\comp ro bante.png", "image/png")).toBe("comp ro bante.png");
    expect(safeFileName("../../etc/passwd", "image/png")).toBe("passwd");
    expect(safeFileName('a"b<c>.pdf', "application/pdf")).toBe("abc.pdf");
  });
  it("usa un nombre por defecto si queda vacío y limita el largo", () => {
    expect(safeFileName("", "application/pdf")).toBe("comprobante.pdf");
    expect(safeFileName("..", "image/jpeg")).toBe("comprobante.jpg");
    expect(safeFileName("x".repeat(300) + ".png", "image/png")).toHaveLength(100);
  });
});
