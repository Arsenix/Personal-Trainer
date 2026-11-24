#!/usr/bin/env bash
# Después de copiar código nuevo: bash deploy/docker-update.sh
set -euo pipefail
docker compose -f docker-compose.pt.yml build
docker compose -f docker-compose.pt.yml run --rm --no-deps pt-agenda pnpm db:migrate
docker compose -f docker-compose.pt.yml up -d
