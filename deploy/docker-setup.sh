#!/usr/bin/env bash
# Primera instalación con Docker (sin sudo, solo grupo docker). Desde la carpeta del proyecto:
#   bash deploy/docker-setup.sh https://pt.sanahora.app
# Usa el Postgres que ya corre (stack-postgres-1) con una base propia: pt_agenda.
set -euo pipefail
APP_URL="${1:?Uso: bash deploy/docker-setup.sh https://pt.sanahora.app}"
PG=stack-postgres-1
DB=pt_agenda

docker inspect "$PG" >/dev/null || { echo "No encuentro el contenedor $PG"; exit 1; }
SU="$(docker exec "$PG" printenv POSTGRES_USER 2>/dev/null || true)"; SU="${SU:-postgres}"
psql_su() { docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U "$SU" "$@"; }

echo "== 1/5 Base de datos =="
if [ -f .env.docker ]; then
  echo ".env.docker ya existe: se reutiliza (no se crean claves nuevas)."
else
  ADMIN_PW="$(openssl rand -hex 16)"; APP_PW="$(openssl rand -hex 16)"; AUTH_PW="$(openssl rand -hex 16)"
  if psql_su -d postgres -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
    echo "La base $DB ya existe pero no hay .env.docker: bórrala a mano o restaura el archivo."; exit 1
  fi
  if psql_su -d postgres -tAc "select 1 from pg_roles where rolname='ptagenda_admin'" | grep -q 1; then
    psql_su -d postgres -c "alter role ptagenda_admin login password '$ADMIN_PW'"
  else
    psql_su -d postgres -c "create role ptagenda_admin login password '$ADMIN_PW'"
  fi
  psql_su -d postgres -c "create database $DB owner ptagenda_admin"
  psql_su -d "$DB" -c "create extension if not exists btree_gist"
  # El dueño de la base no tiene CREATEROLE (Postgres compartido): los roles los crea el superusuario.
  for R in "ptagenda_app:$APP_PW" "ptagenda_auth:$AUTH_PW"; do
    N="${R%%:*}"; P="${R#*:}"
    if psql_su -d postgres -tAc "select 1 from pg_roles where rolname='$N'" | grep -q 1; then
      psql_su -d postgres -c "alter role $N login nosuperuser nobypassrls password '$P'"
    else
      psql_su -d postgres -c "create role $N login nosuperuser nobypassrls password '$P'"
    fi
  done
  umask 077
  cat > .env.docker <<ENVEOF
ADMIN_DATABASE_URL=postgres://ptagenda_admin:$ADMIN_PW@$PG:5432/$DB
DATABASE_URL=postgres://ptagenda_app:$APP_PW@$PG:5432/$DB
AUTH_DATABASE_URL=postgres://ptagenda_auth:$AUTH_PW@$PG:5432/$DB
APP_DB_PASSWORD=$APP_PW
AUTH_DB_PASSWORD=$AUTH_PW
SKIP_ROLE_SETUP=1
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
APP_URL=$APP_URL
RESEND_API_KEY=
MAIL_FROM=PT Agenda <no-responder@sanahora.app>
ENVEOF
  echo ".env.docker creado. Guarda una copia en Bitwarden."
fi

echo "== 2/5 Construir imagen =="
docker compose -f docker-compose.pt.yml build

echo "== 3/5 Migraciones =="
docker compose -f docker-compose.pt.yml run --rm --no-deps pt-agenda pnpm db:migrate

echo "== 4/5 Levantar =="
docker compose -f docker-compose.pt.yml up -d
sleep 5
docker exec pt-agenda wget -qO- --server-response http://127.0.0.1:3000/ 2>&1 | head -1 || echo "Revisa: docker logs pt-agenda"

echo "== 5/5 Backup diario (cron de tu usuario) =="
mkdir -p "$HOME/backups/pt-agenda"
LINE="15 3 * * * docker exec $PG pg_dump -U $SU -Fc $DB > \$HOME/backups/pt-agenda/$DB-\$(date +\\%F).dump && find \$HOME/backups/pt-agenda -name '*.dump' -mtime +14 -delete"
( crontab -l 2>/dev/null | grep -v "backups/pt-agenda" ; echo "$LINE" ) | crontab -
echo "Listo. Falta agregar pt.sanahora.app al Caddyfile (ver docs/DEPLOY.md)."
