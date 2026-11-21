import Link from "next/link";
import {
  listMonthsForPt,
  listPendingProofs,
  listRoutinesForPt,
  listSlots,
  listStudents,
} from "@/lib/queries";
import { requirePt } from "@/lib/session";
import { addDays, currentMonth, dayLong, hourLabel, monthLabel, todayLocal } from "@/lib/dates";

export const metadata = { title: "Resumen" };

function Panel({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="panel panel-pad grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id}>{title}</h2>
        {count !== undefined && <span className="text-2xl font-semibold tabular-nums">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function NameList({ items }: { items: { id: string; name: string; hint?: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <Link href={`/pt/alumnos#alumno-${s.id}`} className="font-semibold underline-offset-4 hover:underline">
            {s.name}
          </Link>
          {s.hint && <span className="text-sm text-muted">{s.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function ResumenPage() {
  const user = await requirePt();
  const today = todayLocal();
  const month = currentMonth();
  const [students, slots, proofs, months, routines] = await Promise.all([
    listStudents(user.id),
    listSlots(user.id, today, addDays(today, 6)),
    listPendingProofs(user.id),
    listMonthsForPt(user.id, [month]),
    listRoutinesForPt(user.id),
  ]);

  const nameOf = new Map(students.map((s) => [s.userId, s.name]));
  const now = new Date().getTime();
  const booked = slots.filter((s) => s.state === "booked" && s.start.getTime() > now - 60 * 60_000);
  const todays = booked.filter((s) => s.date === today);
  const nextDays = booked.filter((s) => s.date !== today);
  const byDay = new Map<string, typeof booked>();
  for (const b of nextDays) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);

  const activeIds = new Set(months.map((m) => m.studentId));
  const noMonth = students.filter((s) => !activeIds.has(s.userId));
  const low = months.filter((m) => m.balance <= 1).map((m) => ({ id: m.studentId, name: nameOf.get(m.studentId) ?? "", hint: m.balance === 0 ? "Sin clases disponibles" : "Le queda 1 clase" }));
  const withRoutine = new Set(routines.filter((r) => r.active).map((r) => r.studentId));
  const noRoutine = students.filter((s) => !withRoutine.has(s.userId));

  return (
    <div className="grid gap-8">
      <header>
        <h1>Resumen</h1>
        <p className="mt-2 text-muted first-cap">{dayLong(today)}</p>
      </header>

      {students.length === 0 && (
        <p className="panel panel-pad text-muted">
          Aún no tienes alumnos. Invita al primero desde{" "}
          <Link href="/pt/alumnos" className="underline underline-offset-4">
            Alumnos
          </Link>{" "}
          y tu agenda se irá llenando.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="hoy" title="Hoy" count={todays.length}>
          {todays.length === 0 ? (
            <p className="text-muted">No tienes clases reservadas hoy.</p>
          ) : (
            <ul className="divide-y divide-line">
              {todays.map((b) => (
                <li key={b.bookingId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="mr-3 font-semibold tabular-nums">{hourLabel(b.hour)}</span>
                    {b.studentName}
                  </span>
                  <span className="text-sm text-muted">{b.locationName ?? "Lugar por definir"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="semana" title="Próximos 6 días" count={nextDays.length}>
          {nextDays.length === 0 ? (
            <p className="text-muted">Todavía no hay clases reservadas para los próximos días.</p>
          ) : (
            <ul className="grid gap-3">
              {[...byDay.entries()].map(([date, items]) => (
                <li key={date}>
                  <p className="first-cap text-sm font-semibold">{dayLong(date)}</p>
                  <ul className="text-sm">
                    {items.map((b) => (
                      <li key={b.bookingId} className="flex justify-between gap-2 py-0.5">
                        <span>
                          <span className="mr-2 tabular-nums">{hourLabel(b.hour)}</span>
                          {b.studentName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <Link href="/pt/agenda" className="text-sm underline underline-offset-4">
            Ver la agenda completa
          </Link>
        </Panel>

        <Panel id="revisar" title="Comprobantes por revisar" count={proofs.length}>
          {proofs.length === 0 ? (
            <p className="text-muted">No hay comprobantes pendientes.</p>
          ) : (
            <NameList
              items={proofs.map((p) => ({ id: p.studentId, name: nameOf.get(p.studentId) ?? "Alumno", hint: `Mes de ${monthLabel(p.month)}` }))}
            />
          )}
        </Panel>

        <Panel id="sin-mes" title={`Sin ${monthLabel(month)} activado`} count={noMonth.length}>
          {noMonth.length === 0 ? (
            <p className="text-muted">Todos tus alumnos tienen el mes activado.</p>
          ) : (
            <NameList items={noMonth.map((s) => ({ id: s.userId, name: s.name }))} />
          )}
        </Panel>

        <Panel id="saldo" title="Les quedan pocas clases" count={low.length}>
          {low.length === 0 ? (
            <p className="text-muted">Nadie está al límite de sus clases este mes.</p>
          ) : (
            <NameList items={low} />
          )}
        </Panel>

        <Panel id="rutina" title="Sin rutina" count={noRoutine.length}>
          {noRoutine.length === 0 ? (
            <p className="text-muted">Todos tus alumnos tienen una rutina activa.</p>
          ) : (
            <>
              <NameList items={noRoutine.map((s) => ({ id: s.userId, name: s.name }))} />
              <Link href="/pt/rutinas" className="text-sm underline underline-offset-4">
                Ir a Rutinas
              </Link>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
