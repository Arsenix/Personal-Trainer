# PT Agenda

Agenda para personal trainers independientes. El PT publica sus horas (lunes a viernes, 06:00 a 22:00, bloques de 1 hora) y sus alumnos reservan con los créditos de su mes, sin tener que escribirle a cada uno.

Nombre provisorio. Stack: Next.js 16 · TypeScript · PostgreSQL 16 · Better Auth · Zod · Tailwind v4 · Vitest · Playwright.

## Estado: iteración 4 (rutinas)

Iteración 1, identidad y alumnos:

- Registro e ingreso del PT (correo y contraseña).
- Invitación de alumnos por link de un solo uso (vale 7 días; en la base solo se guarda su hash). El PT puede copiar el link, pedir uno nuevo (el anterior deja de servir) o revocarlo. Si hay `RESEND_API_KEY`, también se envía por correo.
- Alta del alumno con el link: crea su contraseña y queda vinculado a **un solo PT**.
- Lugares de entrenamiento del PT (gimnasio, domicilio u otro, con archivar/restaurar) y asignación de un lugar a cada alumno.
- Perfil del PT con sus datos de transferencia (RUT validado con módulo 11). Los alumnos los ven en su pantalla.
- Registro de actividad (append-only): altas, invitaciones, cambios de lugares y perfil, e inicios de sesión.
- Datos de demostración.

Iteración 2, disponibilidad y reservas:

- **Disponibilidad** (`/pt/disponibilidad`): cada PT parte con lunes a viernes de 06:00 a 22:00 y puede editar tramos por día, restablecer el horario base y bloquear fechas u horas (vacaciones, imprevistos). Si un bloqueo cae sobre clases reservadas, pide confirmación, las cancela y avisa por correo.
- **Agenda del PT** (`/pt/agenda`): semana en grilla con clases (alumno y lugar), horas libres, bloqueadas y pasadas. Puede bloquear una hora o cancelar una clase con motivo; el crédito siempre se devuelve cuando cancela el PT (cuando existan créditos, iteración 3).
- **Reserva del alumno** (`/alumno/reservar`): ve solo los horarios libres de su PT hasta 8 semanas adelante, elige uno y confirma. No necesita aprobación; el PT recibe un correo. Puede cancelar con 24 horas o más de anticipación; después ya no.
- Las reglas viven en la base: no hay dos clases en la misma hora de un PT (restricción de exclusión, probada con reservas simultáneas), horario `America/Santiago` con cambio de hora, y RLS para que cada uno vea solo lo suyo.
- Requiere la extensión `btree_gist` (viene en `postgresql-contrib`); el usuario que corre las migraciones debe poder crearla.

Iteración 3, planes, créditos y comprobantes:

- **Planes** (`/pt/planes`): cada PT define los suyos (nombre, clases al mes, precio en CLP). Se pueden editar y archivar. El alumno no elige plan.
- **Activar el mes**: en la tarjeta de cada alumno (`/pt`) el PT activa el mes en curso o el siguiente eligiendo un plan. El precio y los créditos se **copian** al mes: cambiar el plan después no altera lo ya activado.
- **Créditos**: 1 crédito = 1 clase y son del mes calendario de la clase. Sin mes activado o sin saldo no se puede reservar; lo que sobra al cambiar de mes se pierde (no hay arrastre ni proceso de vencimiento, porque el saldo es por mes). Si el alumno cancela con 24 horas o más, el crédito vuelve; con menos no puede cancelar y el crédito queda consumido; si cancela el PT, o bloquea la agenda, siempre vuelve. El PT puede ajustar créditos con un motivo y todo queda en un libro de movimientos que el alumno también ve.
- **Comprobante de transferencia**: el alumno sube una foto o PDF (hasta 5 MB) en su inicio. El tipo se verifica por el contenido del archivo y se vuelve a validar en la base. El PT lo abre (solo él y el alumno pueden), lo rechaza con un motivo o activa el mes, y al activar los pendientes quedan aceptados.
- Los comprobantes se guardan en la base (bytea). Para un volumen alto conviene pasarlos a almacenamiento de objetos.

Iteración 4, rutinas:

- **Rutinas** (`/pt/rutinas`): el PT arma una rutina estructurada para cada alumno: nombre, indicaciones generales, hasta 7 días y hasta 20 ejercicios por día (nombre, series, repeticiones y nota). Puede reordenar días y ejercicios, y el editor sugiere los ejercicios que ya usó.
- Cada alumno tiene **una sola rutina activa**. Crear una nueva archiva la anterior; el PT puede archivar, reactivar, editar o **copiar** una rutina a otro de sus alumnos.
- **Mi rutina** (`/alumno/rutina`): el alumno ve solo su rutina activa, en solo lectura. La base garantiza que no vea archivadas ni las de otros.
- La rutina se guarda completa en una sola operación en la base (`save_routine`), que valida todo antes de escribir, y queda en la actividad.

Todavía no incluye: seguimiento de lo que el alumno hizo en cada sesión, biblioteca de ejercicios con videos, avisos por correo al subir un comprobante y panel de pendientes (iteración 5), recordatorio de fin de mes. Tampoco hay recuperación de contraseña ni cobro de la plataforma a los PT.

## Cómo correrlo en tu máquina

Requisitos: Node 22, pnpm, PostgreSQL 16.

```powershell
pnpm install
copy .env.example .env.local        # y ajusta los valores
```

Crea la base y un usuario dueño con permisos de superusuario (una sola vez), por ejemplo en `psql`:

```sql
create role ptagenda_admin login superuser password 'admin_dev_pass';
create database pt_agenda_dev owner ptagenda_admin;
create database pt_agenda_test owner ptagenda_admin;
```

Si tu Postgres local usa el puerto 5433 (por otro Postgres ya instalado), cambia el puerto en las URL de `.env.local` y en `TEST_*` (ver abajo).

```powershell
pnpm db:migrate        # crea tablas, roles y reglas de acceso (RLS)
pnpm db:seed-demo      # PT de demostración: camila@demo.ptagenda.cl / DemoPass-2026
pnpm dev
```

Después de cambiar el esquema en desarrollo: `pnpm db:reset` (borra todo y vuelve a migrar; no corre en producción).

## Base de datos: dos roles

- `ptagenda_app`: lo usa la aplicación. No es dueño de las tablas, así que Row Level Security siempre aplica. Cada transacción declara el usuario con `set_config('app.user_id', ...)` (ver `src/lib/db.ts`).
- `ptagenda_auth`: solo Better Auth, sobre sus tablas. No puede cambiar el rol de un usuario ni leer datos de la aplicación.

Las cuentas no se crean por la vía pública de Better Auth (`disableSignUp`). El alta de PT y de alumno ocurre en las funciones `register_pt` y `accept_invitation` de la base, de forma atómica.

## Pruebas

```powershell
pnpm typecheck && pnpm lint
pnpm test:unit      # RUT, tokens, validación, límite de intentos, fechas, tipo de archivo
pnpm test:int       # PostgreSQL real: RLS, invitaciones, agenda, reservas simultáneas, créditos, comprobantes, rutinas, auditoría, permisos de roles (base pt_agenda_test)
pnpm build
pnpm test:e2e       # navegador real: flujo PT y alumno completo (base pt_agenda_test, puerto 3100)
```

Para e2e necesitas un navegador: `pnpm exec playwright install chromium`, o si ya tienes Chrome: `$env:E2E_CHANNEL="chrome"; pnpm test:e2e`.

Si tus bases de prueba tienen otro usuario, puerto o clave, define `TEST_ADMIN_DATABASE_URL`, `TEST_DATABASE_URL` y `TEST_AUTH_DATABASE_URL`.

## Producción (VPS)

Variables obligatorias: `DATABASE_URL`, `AUTH_DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_URL` (con https), `RESEND_API_KEY`, `MAIL_FROM`. Las migraciones se corren con `ADMIN_DATABASE_URL`, `APP_DB_PASSWORD` y `AUTH_DB_PASSWORD`.

El límite de intentos de ingreso vive en memoria: sirve para un solo proceso. Si algún día hay más de una instancia, hay que moverlo a la base.
