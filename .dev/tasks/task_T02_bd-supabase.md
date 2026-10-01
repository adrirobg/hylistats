# Task T02 — BD en Supabase

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] Migraciones de Supabase = `drizzle/` (AC2).
- [ ] Recuentos por tabla idénticos (AC2).
- [ ] Secuencias ajustadas y RLS sin efecto en el usuario de la app (AC2).

## Evidencias <!-- MUST -->

- {pendiente}
