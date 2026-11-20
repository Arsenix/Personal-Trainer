import Link from "next/link";
import { Wordmark, WeekIllustration } from "@/components/brand";
import { getSessionUser, homeFor } from "@/lib/session";

export default async function Home() {
  const user = await getSessionUser();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <main className="flex flex-col justify-between gap-16 px-6 py-8 sm:px-12 sm:py-10">
        <header className="flex items-center justify-between">
          <Wordmark />
          <nav className="flex items-center gap-2" aria-label="Cuenta">
            {user ? (
              <Link href={homeFor(user.role)} className="btn btn-primary btn-sm">
                Ir a mi panel
              </Link>
            ) : (
              <Link href="/ingresar" className="btn btn-quiet btn-sm">
                Ingresar
              </Link>
            )}
          </nav>
        </header>

        <section className="max-w-xl">
          <p className="tag tag-volt mb-5">Primera versión</p>
          <h1 className="text-[clamp(2.4rem,7vw,4.2rem)]">
            Tu agenda llena, sin escribirle a cada alumno.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted">
            Publicas tus horas de lunes a viernes. Cada alumno toma las clases que le alcanzan con los créditos
            de su mes, y tú ves la semana armada.
          </p>
          {!user && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/registro" className="btn btn-primary">
                Crear cuenta de PT
              </Link>
              <Link href="/ingresar" className="btn btn-quiet">
                Ya tengo cuenta
              </Link>
            </div>
          )}
        </section>

        <p className="max-w-md text-sm text-muted">
          Hoy puedes registrarte, invitar a tus alumnos y ordenar los lugares donde entrenas. La reserva de horas
          y los créditos mensuales llegan en las próximas entregas.
        </p>
      </main>

      <aside className="on-dark hidden items-center justify-center bg-ink p-12 text-paper lg:flex" aria-hidden="true">
        <div className="w-full max-w-sm">
          <WeekIllustration />
        </div>
      </aside>
    </div>
  );
}
