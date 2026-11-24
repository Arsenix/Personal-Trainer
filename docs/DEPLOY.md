# Publicar en pt.sanahora.app (servidor con Docker, sin sudo)

Es el camino que corresponde a este servidor: Postgres y Caddy ya corren en contenedores (`stack-postgres-1`, `stack-caddy-1`, red `stack_default`). PT Agenda se agrega como un contenedor más, con su propia base `pt_agenda` en el mismo Postgres. No se toca ningún contenedor existente.

```bash
cd ~/pt-agenda
bash deploy/docker-setup.sh https://pt.sanahora.app
```

Después agrega el bloque de `deploy/Caddyfile.snippet` al Caddyfile del stack y recarga:

```bash
docker exec stack-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Actualizar: copiar el código nuevo y `bash deploy/docker-update.sh`.
Logs: `docker logs -f pt-agenda`. Backup diario en `~/backups/pt-agenda` (14 días).
Datos de demo (opcional): `docker compose -f docker-compose.pt.yml run --rm --no-deps pt-agenda pnpm db:seed-demo` (cuentas con clave pública `DemoPass-2026`).

