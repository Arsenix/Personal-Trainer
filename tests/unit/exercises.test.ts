import { describe, expect, it } from "vitest";
import { EXERCISES, normalize, searchExercises } from "@/lib/exercises";
import { exerciseSchema } from "@/lib/validation";

const names = (q: string, own: string[] = []) => searchExercises(q, own).map((s) => s.name);

describe("catálogo de ejercicios", () => {
  it("no repite nombres y todos tienen grupo", () => {
    const seen = new Set<string>();
    for (const e of EXERCISES) {
      const n = normalize(e.name);
      expect(seen.has(n), `repetido: ${e.name}`).toBe(false);
      seen.add(n);
      expect(e.group.length).toBeGreaterThan(0);
      expect(e.name.length).toBeLessThanOrEqual(80);
    }
    expect(EXERCISES.length).toBeGreaterThan(120);
  });

  it("encuentra por el comienzo del nombre, sin importar tildes ni mayúsculas", () => {
    expect(names("hip")[0]).toBe("Hip thrust");
    expect(names("ELIPTICA")).toContain("Elíptica");
    expect(names("sentadilla").slice(0, 3).every((n) => n.startsWith("Sentadilla"))).toBe(true);
  });

  it("encuentra por una palabra del medio y por el nombre en inglés", () => {
    expect(names("banca")).toContain("Press banca");
    expect(names("squat")).toContain("Sentadilla libre");
    expect(names("deadlift")).toContain("Peso muerto");
    expect(names("lat pull")).toContain("Jalón al pecho");
  });

  it("pone primero lo que empieza igual y limita la lista", () => {
    const r = searchExercises("pre");
    expect(r[0].name.toLowerCase().startsWith("pre")).toBe(true);
    expect(searchExercises("a", [], 5).length).toBeLessThanOrEqual(5);
  });

  it("sin coincidencias no sugiere nada y sin texto solo ofrece los ejercicios propios", () => {
    expect(names("xyzxyz")).toEqual([]);
    expect(names("")).toEqual([]);
    expect(names("", ["Mi circuito", "Press banca"])).toEqual(["Mi circuito"]);
  });

  it("mezcla los ejercicios propios, sin duplicar los del catálogo, y los marca", () => {
    const r = searchExercises("circ", ["Circuito de Pablo", "Press banca"]);
    expect(r[0]).toMatchObject({ name: "Circuito de Pablo", custom: true });
    expect(searchExercises("press banca", ["Press banca"]).filter((s) => s.name === "Press banca")).toHaveLength(1);
  });
});

describe("peso del ejercicio", () => {
  const base = { name: "Hip thrust", sets: "4", reps: "8", note: "" };
  const weight = (w: unknown) => exerciseSchema.safeParse({ ...base, weight: w });

  it("acepta vacío, número, coma o punto", () => {
    expect(weight(undefined)).toMatchObject({ success: true, data: { weight: null } });
    expect(weight("")).toMatchObject({ success: true, data: { weight: null } });
    expect(weight(null)).toMatchObject({ success: true, data: { weight: null } });
    expect(weight("62,5")).toMatchObject({ success: true, data: { weight: 62.5 } });
    expect(weight("62.5")).toMatchObject({ success: true, data: { weight: 62.5 } });
    expect(weight(100)).toMatchObject({ success: true, data: { weight: 100 } });
    expect(weight("0")).toMatchObject({ success: true, data: { weight: 0 } });
    expect(weight("999.99").success).toBe(true);
  });

  it("rechaza texto, negativos, más de dos decimales y más de 999,99", () => {
    for (const w of ["abc", "12 kg", "-1", "62,555", "1000", "1e3", "1,2,3"]) {
      expect(weight(w).success, String(w)).toBe(false);
    }
  });
});
