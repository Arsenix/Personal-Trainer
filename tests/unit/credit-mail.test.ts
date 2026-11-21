import { describe, expect, it } from "vitest";
import { monthActivatedMail, proofRejectedMail, proofUploadedMail } from "@/lib/credit-mail";

const c = { studentName: "Matías Fuentes", studentEmail: "matias@x.cl", ptName: "Camila Rojas", ptEmail: "camila@x.cl" };

describe("correos de créditos", () => {
  it("el comprobante subido le llega al PT, con alumno, mes y enlace a Alumnos", () => {
    const m = proofUploadedMail(c, "2026-12-01");
    expect(m.to).toBe("camila@x.cl");
    expect(m.subject).toContain("Matías Fuentes");
    expect(m.subject).toContain("diciembre de 2026");
    expect(m.text).toContain("/pt/alumnos");
  });
  it("el mes activado le llega al alumno con el plan y las clases (singular y plural)", () => {
    const m = monthActivatedMail(c, "2026-11-01", "Plan 8 clases", 8);
    expect(m.to).toBe("matias@x.cl");
    expect(m.text).toContain("Hola Matías,");
    expect(m.text).toContain("8 clases disponibles");
    expect(monthActivatedMail(c, "2026-11-01", "Plan 1", 1).text).toContain("1 clase disponible.");
    expect(m.text).toContain("/alumno/reservar");
  });
  it("el rechazo incluye el motivo solo si existe", () => {
    expect(proofRejectedMail(c, "2026-11-01", "No se ve el monto").text).toContain("Motivo: No se ve el monto");
    expect(proofRejectedMail(c, "2026-11-01", null).text).not.toContain("Motivo");
    expect(proofRejectedMail(c, "2026-11-01", null).to).toBe("matias@x.cl");
  });
});
