/** RUT chileno: normalización, validación (módulo 11) y formato. */

export function cleanRut(input: string): string {
  return input.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function rutCheckDigit(body: string): string {
  let sum = 0;
  let mult = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  if (rest === 10) return "K";
  return String(rest);
}

export function isValidRut(input: string): boolean {
  const c = cleanRut(input);
  if (c.length < 2 || c.length > 9) return false;
  const body = c.slice(0, -1);
  if (!/^\d+$/.test(body) || Number(body) < 1_000_000) return false;
  return rutCheckDigit(body) === c.slice(-1);
}

/** 12345678-5 → "12.345.678-5". Devuelve la entrada si no es válido. */
export function formatRut(input: string): string {
  if (!isValidRut(input)) return input;
  const c = cleanRut(input);
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${c.slice(-1)}`;
}
