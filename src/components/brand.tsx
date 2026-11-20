import Link from "next/link";

/** Marca provisoria: cuatro bloques de hora apilados, uno ocupado. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect x="2" y="3" width="24" height="4.5" rx="1" fill="currentColor" opacity=".35" />
      <rect x="2" y="9.5" width="24" height="4.5" rx="1" fill="var(--color-volt)" />
      <rect x="2" y="16" width="24" height="4.5" rx="1" fill="currentColor" opacity=".35" />
      <rect x="2" y="22.5" width="14" height="3" rx="1" fill="currentColor" opacity=".35" />
    </svg>
  );
}

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 ${className}`} aria-label="PT Agenda, inicio">
      <BrandMark />
      <span className="display text-[1.35rem] lowercase" style={{ fontStretch: "75%", fontWeight: 850 }}>
        pt agenda
      </span>
    </Link>
  );
}

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
// Un patrón fijo y deliberadamente irregular: horas tomadas (verde), libres (gris) y bloqueadas (borde).
const PATTERN = [
  "ffbfffbffffbfbff",
  "bbffbfffbfffffbf",
  "fbfbffffbbffbfff",
  "ffffbfbffbfffbbf",
  "bffbfffbfffbfffo",
];

export function WeekIllustration() {
  return (
    <div aria-hidden="true" className="select-none">
      <div className="grid grid-cols-5 gap-x-2 gap-y-[5px]">
        {DAYS.map((d) => (
          <div key={d} className="mb-1 text-xs font-semibold tracking-wide text-[#8d9aa3]">
            {d}
          </div>
        ))}
        {Array.from({ length: 16 }).flatMap((_, row) =>
          PATTERN.map((col, ci) => {
            const ch = col[row];
            const cls = ch === "b" ? "slot slot-taken" : ch === "o" ? "slot slot-off" : "slot";
            return <div key={`${row}-${ci}`} className={cls} />;
          }),
        )}
      </div>
      <p className="mt-3 text-xs text-[#8d9aa3]">06:00 a 22:00, bloques de una hora</p>
    </div>
  );
}
