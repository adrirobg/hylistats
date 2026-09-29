#!/bin/sh
# Crea la BD de tests (solo se ejecuta al inicializar un volumen vacío).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE hylistats_test OWNER $POSTGRES_USER;"
