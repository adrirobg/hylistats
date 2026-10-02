#!/bin/bash
# Prepara el contenedor de las sesiones cloud de Claude Code (claude.ai/code).
# En local no hace nada. Documentación: docs/cloud.md
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Node 24 (.node-version). La imagen trae Node 22 en /opt/node22/bin, que va
# primero en el PATH: se instala encima con `n` para que gane el 24.
if ! node -v | grep -q "^v$(cat .node-version)"; then
  npm install -g n >/dev/null 2>&1
  N_PREFIX=/opt/node22 n "$(cat .node-version)" >/dev/null
  hash -r
fi

# Postgres local en el puerto 5433, como docker compose y CI (Docker no está
# disponible en el contenedor). La imagen trae Postgres 16; los tests no
# dependen de nada propio de la 17.
PG_CONF=/etc/postgresql/16/main/postgresql.conf
if [ -f "$PG_CONF" ]; then
  sed -i 's/^#\?port = .*/port = 5433/' "$PG_CONF"
  pg_ctlcluster 16 main start >/dev/null 2>&1 || true
  su postgres -c "psql -p 5433 -tc \"SELECT 1 FROM pg_roles WHERE rolname='hylistats'\" | grep -q 1 \
    || psql -p 5433 -qc \"CREATE ROLE hylistats LOGIN SUPERUSER PASSWORD 'hylistats'\""
  for db in hylistats hylistats_test; do
    su postgres -c "psql -p 5433 -tc \"SELECT 1 FROM pg_database WHERE datname='$db'\" | grep -q 1 \
      || createdb -p 5433 -O hylistats $db"
  done
fi

# Dependencias: solo si faltan o el lockfile ha cambiado desde la última instalación.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi
