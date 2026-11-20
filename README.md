# PT Agenda

Agenda para personal trainers independientes. El PT publica sus horas (lunes a viernes, 06:00 a 22:00, bloques de 1 hora) y sus alumnos reservan con los créditos de su mes, sin tener que escribirle a cada uno.

Nombre provisorio. Stack: Next.js 16 · TypeScript · PostgreSQL 16 · Better Auth · Zod · Tailwind v4 · Vitest · Playwright.

## Estado: iteración 1 (identidad y alumnos)

Incluye:

- Registro e ingreso del PT (correo y contraseña).
- Invitación de alumnos por link de un solo uso (vale 7 días; en la base solo se guarda su hash). El PT puede copiar el link, pedir uno nuevo (el anterior deja de servir) o revocarlo. Si hay `RESEND_API_KEY`, también se envía por correo.
- Alta del alumno con el link: crea su contraseña y queda vinculado a **un solo PT**.
- Lugares de entrenamiento del PT (gimnasio, domicilio u otro, con archivar/restaurar) y asignación de un lugar a cada alumno.
- Perfil del PT con sus datos de transferencia (RUT validado con módulo 11). Los alumnos los ven en su pantalla.
- Registro de actividad (append-only): altas, invitaciones, cambios de lugares y perfil, e inicios de sesión.
- Datos de demostración.

Todavía no incluye: disponibilidad y reservas (iteración 2), créditos, planes y cancelación con 24 horas (iteración 3), rutinas (iteración 4), notificaciones por correo de clases y panel de agenda (iteración 5). Tampoco hay recuperación de contraseña ni cobro de la plataforma a los PT.

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
pnpm test:unit      # RUT, tokens, validación, límite de intentos
pnpm test:int       # PostgreSQL real: RLS, invitaciones, auditoría, permisos de roles (base pt_agenda_test)
pnpm build
pnpm test:e2e       # navegador real: flujo PT y alumno completo (base pt_agenda_test, puerto 3100)
```

Para e2e necesitas un navegador: `pnpm exec playwright install chromium`, o si ya tienes Chrome: `$env:E2E_CHANNEL="chrome"; pnpm test:e2e`.

Si tus bases de prueba tienen otro usuario, puerto o clave, define `TEST_ADMIN_DATABASE_URL`, `TEST_DATABASE_URL` y `TEST_AUTH_DATABASE_URL`.

## Producción (VPS)

Variables obligatorias: `DATABASE_URL`, `AUTH_DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_URL` (con https), `RESEND_API_KEY`, `MAIL_FROM`. Las migraciones se corren con `ADMIN_DATABASE_URL`, `APP_DB_PASSWORD` y `AUTH_DB_PASSWORD`.

El límite de intentos de ingreso vive en memoria: sirve para un solo proceso. Si algún día hay más de una instancia, hay que moverlo a la base.
