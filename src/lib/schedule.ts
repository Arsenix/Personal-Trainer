/** Horario semanal del PT: bloques (varios días + un tramo de horas) y su expansión a reglas por día. */
export type ScheduleBlock = { days: number[]; start: number; end: number };
export type Rule = { weekday: number; start: number; end: number };

/** ISO: 1 = lunes … 7 = domingo. */
export const WEEKDAYS = [
  { n: 1, short: "Lun", long: "lunes" },
  { n: 2, short: "Mar", long: "martes" },
  { n: 3, short: "Mié", long: "miércoles" },
  { n: 4, short: "Jue", long: "jueves" },
  { n: 5, short: "Vie", long: "viernes" },
  { n: 6, short: "Sáb", long: "sábado" },
  { n: 7, short: "Dom", long: "domingo" },
] as const;

export const MAX_BLOCKS = 20;

const longName = (n: number) => WEEKDAYS.find((d) => d.n === n)?.long ?? String(n);

/**
 * Convierte los bloques en reglas por día. Une tramos que se tocan (6–12 y 12–16 → 6–16)
 * y rechaza los que se pisan o están incompletos.
 */
export function expandBlocks(blocks: ScheduleBlock[]): { rules: Rule[] } | { error: string } {
  if (blocks.length > MAX_BLOCKS) return { error: `Máximo ${MAX_BLOCKS} bloques.` };
  const perDay = new Map<number, { start: number; end: number }[]>();
  for (const [i, b] of blocks.entries()) {
    const days = [...new Set(b.days)];
    if (days.length === 0) return { error: `El bloque ${i + 1} no tiene días elegidos.` };
    if (
      !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ||
      !Number.isInteger(b.start) ||
      !Number.isInteger(b.end) ||
      b.start < 0 ||
      b.start > 23 ||
      b.end < 1 ||
      b.end > 24
    ) {
      return { error: `El bloque ${i + 1} tiene una hora o un día no válido.` };
    }
    if (b.end <= b.start) return { error: `En el bloque ${i + 1}, el término debe ser después del inicio.` };
    for (const d of days) perDay.set(d, [...(perDay.get(d) ?? []), { start: b.start, end: b.end }]);
  }
  const rules: Rule[] = [];
  for (const d of [...perDay.keys()].sort((a, b) => a - b)) {
    const list = perDay.get(d)!.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: { start: number; end: number }[] = [];
    for (const r of list) {
      const last = merged[merged.length - 1];
      if (last && r.start < last.end) {
        return { error: `Dos bloques se pisan el ${longName(d)}. Cambia las horas o quita ese día de uno de ellos.` };
      }
      if (last && r.start === last.end) last.end = r.end;
      else merged.push({ ...r });
    }
    for (const m of merged) rules.push({ weekday: d, ...m });
  }
  return { rules };
}

/** Agrupa reglas guardadas en bloques: los días que comparten el mismo tramo quedan juntos. */
export function groupRulesIntoBlocks(rules: Rule[]): ScheduleBlock[] {
  const groups = new Map<string, ScheduleBlock>();
  for (const r of rules) {
    const key = `${r.start}-${r.end}`;
    const g = groups.get(key) ?? { days: [], start: r.start, end: r.end };
    if (!g.days.includes(r.weekday)) g.days.push(r.weekday);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, days: g.days.sort((a, b) => a - b) }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.days[0] - b.days[0]);
}

/** Clases (horas) por semana que quedan abiertas. */
export function weeklyHours(rules: Rule[]): number {
  return rules.reduce((sum, r) => sum + (r.end - r.start), 0);
}
