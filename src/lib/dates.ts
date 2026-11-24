/**
 * Fechas "de calendario" (YYYY-MM-DD) en la zona horaria del negocio, America/Santiago.
 * Se calcula con aritmética UTC sobre la fecha sola, para que el huso del servidor no influya.
 */
export const TZ = "America/Santiago";

const pad = (n: number) => String(n).padStart(2, "0");

function parts(date: Date, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TZ, ...opts });
}

/** Fecha de hoy en Santiago. */
export function todayLocal(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}`;
}

export function isDateString(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

/** Lunes de la semana pedida en la URL (?semana=YYYY-MM-DD), o el de esta semana si no sirve. */
export function weekFromParam(param: string | undefined, now: Date = new Date()): string {
  return mondayOf(isDateString(param) ? param : todayLocal(now));
}

export function weekDays(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

export function hourLabel(h: number): string {
  return `${pad(h)}:00`;
}

const asNoon = (date: string) => new Date(`${date}T12:00:00Z`);

/** Intl en es-CL escribe "jueves, 26 de noviembre": quitamos la coma tras el día de la semana. */
const tidy = (s: string) => s.replace(/^(\p{L}+)\.?,\s*/u, "$1 ").replace(/\./g, "");

/** "lunes 24 de noviembre" */
export function dayLong(date: string): string {
  return tidy(
    new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
      asNoon(date),
    ),
  );
}

/** "lun 24 nov" */
export function dayShort(date: string): string {
  return tidy(
    new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
      asNoon(date),
    ),
  );
}

/** "24 al 28 de noviembre" o "27 de oct. al 31 de oct." cuando cruza de mes. */
export function weekRangeLabel(monday: string): string {
  const friday = addDays(monday, 4);
  const fmt = (d: string, month: boolean) =>
    new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", ...(month ? { month: "long" } : {}) }).format(
      asNoon(d),
    );
  const sameMonth = monday.slice(0, 7) === friday.slice(0, 7);
  return sameMonth ? `${fmt(monday, false)} al ${fmt(friday, true)}` : `${fmt(monday, true)} al ${fmt(friday, true)}`;
}

/** "miércoles 26 de noviembre, 10:00" para un instante real. */
export function slotLong(start: Date): string {
  const day = tidy(parts(start, { weekday: "long", day: "numeric", month: "long" }).format(start));
  const time = parts(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
  return `${day}, ${time}`;
}

/** "mié 26 nov · 10:00" */
export function slotShort(start: Date): string {
  const day = tidy(parts(start, { weekday: "short", day: "numeric", month: "short" }).format(start));
  const time = parts(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
  return `${day} · ${time}`;
}

export const SLOT_HORIZON_DAYS = 56;
export const CANCEL_LIMIT_HOURS = 24;

/** ¿Puede el alumno cancelar todavía? (la base lo vuelve a verificar) */
export function canStudentCancel(start: Date, now: Date = new Date()): boolean {
  return start.getTime() - now.getTime() >= CANCEL_LIMIT_HOURS * 3_600_000;
}

// ---------------------------------------------------------------------------
// Meses de créditos (iteración 3): un mes se identifica por su primer día, YYYY-MM-01
// ---------------------------------------------------------------------------
export function currentMonth(now: Date = new Date()): string {
  return `${todayLocal(now).slice(0, 7)}-01`;
}

/** Primer día del mes de una fecha: "2026-11-26" → "2026-11-01". */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
}

/** Último día del mes ("2026-11-01" → "2026-11-30"). */
export function monthEndOf(month: string): string {
  return addDays(nextMonthOf(month), -1);
}

/** Semanas (lunes a domingo) que cubren el mes. Incluye los días vecinos que completan la primera y la última semana. */
export function monthWeeks(month: string): string[][] {
  const weeks: string[][] = [];
  const end = monthEndOf(month);
  for (let monday = mondayOf(month); monday <= end; monday = addDays(monday, 7)) {
    weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i)));
  }
  return weeks;
}

export function nextMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
}

export function isMonthString(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(s);
}

/** "noviembre 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}
