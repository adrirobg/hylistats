# Task T02 — BD en Supabase

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Esquema de Drizzle aplicado en Supabase y datos del Postgres local restaurados, con recuentos idénticos.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Supabase" y "Datos"; **AC2**.
- Proyecto Supabase `frtniilscrrbyhbzdkhl` (`eu-central-1`), Data API desactivada, RLS automático activado. MCP de Supabase en `.mcp.json`.
- Conexión: pooler Supavisor en modo **session** (5432). La contraseña la maneja solo el supervisor.
- Local: contenedor `hylistats-postgres-1` (Postgres 17), BD `hylistats` (~44 MB).

## Prompt / instrucciones para worker <!-- MUST -->

1. Aplicar las migraciones (`scripts/migrate.ts --url` con la cadena del pooler, aportada por el supervisor sin pasar por el chat) y comprobar `drizzle.__drizzle_migrations`.
2. Volcado de solo datos desde el contenedor (`pg_dump --data-only`, sin la tabla de migraciones) y restauración en Supabase con triggers desactivados o en orden de dependencias; reajustar secuencias.
3. Comparar recuentos por tabla local vs Supabase.
4. Comprobar que el usuario de la conexión es dueño de las tablas (RLS automático no le afecta).

## Criterios de aceptacion <!-- MUST -->

- [x] Migraciones de Supabase = `drizzle/` (AC2).
- [x] Recuentos por tabla idénticos (AC2).
- [x] Secuencias ajustadas y RLS sin efecto en el usuario de la app (AC2).

## Evidencias <!-- MUST -->

- Conexión: `SUPABASE_DATABASE_URL` en `.env.local` (puesta por el supervisor; nunca impresa), pooler session `aws-1-eu-central-1.pooler.supabase.com:5432`, PostgreSQL 17.11, usuario `postgres`. Comandos lanzados con `psql`/`pg_dump` del contenedor `hylistats-postgres-1` (Postgres 17): en el Mac no hay cliente instalado y no hizo falta el MCP.
- Migraciones: `tsx scripts/migrate.ts --url …` → 5 filas en `drizzle.__drizzle_migrations` = 5 ficheros en `drizzle/`.
- Tablas: las 7 de `public` con dueño `postgres`, `rowsecurity = t` (RLS automático) y `relforcerowsecurity = f` → el dueño no queda sujeto al RLS.
- Datos: `pg_dump --data-only --schema=public --no-owner --no-privileges` y `psql -1 -v ON_ERROR_STOP=1`. El primer intento se revirtió entero por la fila `settings.id=1` que siembra una migración; el segundo antepone `TRUNCATE settings;` → `RESTORE_OK`.
- Recuentos idénticos (local = Supabase): group_members 6, match_fetch 1222, matches 1222, participants 21996, profiles 7, settings 1, sync_jobs 634 (cola local sin pendientes: 634 `done`, 1222 `done`).
- Secuencias idénticas: `profiles_id_seq` 7, `sync_jobs_id_seq` 641.
