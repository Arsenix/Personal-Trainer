import type { ReactNode } from "react";
import { Wordmark, WeekIllustration } from "./brand";

/** Pantalla dividida: panel oscuro con la semana a la izquierda, formulario a la derecha. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-dark flex flex-col justify-between gap-10 bg-ink p-6 text-paper sm:p-10">
        <Wordmark className="text-paper" />
        <div className="hidden max-w-sm lg:block">
          <WeekIllustration />
        </div>
        <p className="max-w-xs text-sm text-[#9aa7b0]">
          Las horas se publican una vez. Tus alumnos eligen entre las que quedan libres.
        </p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <h1>{title}</h1>
          {intro && <div className="mt-3 text-muted">{intro}</div>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
