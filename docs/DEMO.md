# Guía de demostración

Una demo de unos 10 minutos, pensada para mostrársela a un PT. Todo corre con datos de ejemplo.

## Preparación

```powershell
pnpm db:reset          # deja la base de desarrollo limpia (solo bases terminadas en _dev o _test)
pnpm db:seed-demo      # PT, alumnos, planes, clases, rutina y un comprobante pendiente
pnpm dev
```

Cuentas (clave `DemoPass-2026` para todas):

| Quién | Correo |
| --- | --- |
| PT | `camila@demo.ptagenda.cl` |
| Alumno con mes activo, clases y rutina | `matias@demo.ptagenda.cl` |
| Alumna con mes activo, sin rutina | `javiera@demo.ptagenda.cl` |
| Alumna que ya pagó y espera activación | `valentina@demo.ptagenda.cl` |

La invitación de Tomás queda pendiente: el link sale en la consola al correr el seed. Sin `RESEND_API_KEY` los correos no se envían: quedan en la consola y en `.mail-outbox/outbox.jsonl`.

## Recorrido sugerido

1. **El problema** (30 s): hoy el PT le escribe a cada alumno para cuadrar horas, controlar pagos y mandar la rutina.
2. **Resumen del PT** (`camila@`): qué hay hoy, las clases de los próximos días, quién subió un comprobante y quién no tiene el mes activado. Es lo primero que ve al entrar.
3. **Cobro por transferencia**: en Alumnos, abrir a Valentina, ver su comprobante, activar el mes con un plan. Se cargan sus clases y ella recibe un correo.
4. **Reserva del alumno** (`valentina@`, en otra ventana o de incógnito): entra a Reservar clase, ve su saldo y toma una hora. El PT recibe el aviso y la clase aparece en su Agenda sin que nadie escriba.
5. **Reglas**: ella cancela con más de 24 horas y el crédito vuelve. Con menos de 24 horas ya no puede. Un segundo alumno no puede tomar la misma hora.
6. **Disponibilidad**: el PT bloquea un día (por ejemplo, vacaciones). Si había clases, pide confirmación, las cancela, devuelve los créditos y avisa a los alumnos.
7. **Rutina**: el PT arma una rutina para Javiera en dos minutos (o copia la de Matías) y ella la ve en su teléfono en Mi rutina.
8. **Registro de actividad**: todo queda anotado y no se puede editar ni borrar.

## Lo que todavía no está

- Pagos con tarjeta o conciliación automática: el cobro es por transferencia con comprobante.
- Seguimiento de lo que el alumno hizo en cada sesión (pesos, repeticiones reales).
- Recuperación de contraseña y avisos por WhatsApp o push.
- Cobro de la plataforma a los PT.

## Antes de una demo en línea (VPS)

- Variables: `DATABASE_URL`, `AUTH_DATABASE_URL`, `ADMIN_DATABASE_URL` (solo para migrar), `APP_DB_PASSWORD`, `AUTH_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY` y `MAIL_FROM` (dominio verificado en Resend).
- Respaldo diario con `pg_dump` de la base: ahí viven clases, créditos y comprobantes.
- Si usas nginx delante: `client_max_body_size 6m;` y reenviar `X-Forwarded-For`, porque los límites de intentos cuentan por IP.
- No ejecutes `db:reset` ni `db:seed-demo` contra la base real: el reinicio rechaza bases que no terminen en `_dev` o `_test`.
