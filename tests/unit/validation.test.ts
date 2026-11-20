import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  fieldErrors,
  inviteSchema,
  locationSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from "@/lib/validation";

describe("registro de PT", () => {
  it("normaliza correo y acepta teléfono opcional vacío", () => {
    const r = registerSchema.parse({
      name: "  Camila Rojas ",
      email: " CAMILA@Correo.CL ",
      phone: "",
      password: "una-clave-larga-1",
    });
    expect(r).toMatchObject({ name: "Camila Rojas", email: "camila@correo.cl", phone: null });
  });

  it("rechaza contraseñas cortas, correos inválidos y teléfonos raros", () => {
    const r = registerSchema.safeParse({ name: "C", email: "no-es-correo", phone: "abc", password: "corta" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrors(r.error);
      expect(Object.keys(e).sort()).toEqual(["email", "name", "password", "phone"]);
    }
  });

  it("acepta teléfonos chilenos con formato", () => {
    const r = registerSchema.safeParse({
      name: "Camila",
      email: "c@c.cl",
      phone: "+56 9 1234 5678",
      password: "una-clave-larga-1",
    });
    expect(r.success).toBe(true);
  });
});

describe("login e invitación", () => {
  it("login exige correo y contraseña", () => {
    expect(loginSchema.safeParse({ email: "a@b.cl", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.cl", password: "x" }).success).toBe(true);
  });
  it("aceptar invitación exige 10 caracteres", () => {
    expect(acceptInvitationSchema.safeParse({ password: "123456789" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ password: "1234567890" }).success).toBe(true);
  });
  it("invitar: lugar vacío pasa a null y uno inválido se rechaza", () => {
    const ok = inviteSchema.parse({ name: "Matías", email: "m@m.cl", phone: "", locationId: "" });
    expect(ok.locationId).toBeNull();
    expect(inviteSchema.safeParse({ name: "Matías", email: "m@m.cl", phone: "", locationId: "xx" }).success).toBe(false);
    expect(
      inviteSchema.safeParse({
        name: "Matías",
        email: "m@m.cl",
        phone: "",
        locationId: "3f2b8c1e-9d4a-4b6c-8e1f-2a7d5c9b0e14",
      }).success,
    ).toBe(true);
  });
});

describe("lugares", () => {
  it("exige nombre y tipo válido", () => {
    expect(locationSchema.safeParse({ name: "Energy Gym", kind: "gym", address: "" }).success).toBe(true);
    expect(locationSchema.safeParse({ name: "E", kind: "gym", address: "" }).success).toBe(false);
    expect(locationSchema.safeParse({ name: "Energy Gym", kind: "spa", address: "" }).success).toBe(false);
  });
});

describe("perfil y datos de transferencia", () => {
  const base = {
    displayName: "Camila Rojas",
    phone: "",
    transferHolder: "",
    transferRut: "",
    transferBank: "",
    transferType: "",
    transferNumber: "",
    transferEmail: "",
  };

  it("permite dejar todos los datos de transferencia vacíos", () => {
    const r = profileSchema.parse(base);
    expect(r.transferRut).toBeNull();
    expect(r.transferType).toBeNull();
    expect(r.transferEmail).toBeNull();
  });

  it("valida y formatea el RUT del titular", () => {
    expect(profileSchema.parse({ ...base, transferRut: "123456785" }).transferRut).toBe("12.345.678-5");
    const bad = profileSchema.safeParse({ ...base, transferRut: "12.345.678-9" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error).transferRut).toBe("El RUT no es válido");
  });

  it("valida tipo de cuenta, número y correo", () => {
    expect(profileSchema.safeParse({ ...base, transferType: "rut", transferNumber: "12345678" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, transferType: "otra" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, transferNumber: "12ab" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, transferEmail: "nope" }).success).toBe(false);
  });
});
