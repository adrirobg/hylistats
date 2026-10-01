# Task T03 — Servicio en Render

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Servicio `hylistats` en Render (Frankfurt, Free) desplegando la app con los secretos del supervisor.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Servicio en Render"; **AC3**, **AC5**.
- MCP de Render conectado (crea servicios, variables, deploys, logs; no borra).
- Secretos: `DATABASE_URL` (pooler session) y `ADMIN_TOKEN` (≥32) los pone el supervisor en el panel. Variables no secretas (`SEASON_START`, `WORKER_ENABLED`) se pueden fijar por MCP.

## Prompt / instrucciones para worker <!-- MUST -->

1. Comprobar el workspace seleccionado en el MCP.
2. Crear el web service: repo `adrirobg/hylistats`, rama de la iteración para el primer deploy (después `main`), runtime Node, build `npm ci && npm run build`, arranque de producción de T01, región Frankfurt, plan Free, health check `/api/health`, autodeploy.
3. Pedir al supervisor que añada los secretos; fijar las variables no secretas.
4. Seguir el deploy por logs hasta que el health check pase.

## Criterios de aceptacion <!-- MUST -->

- [ ] Servicio creado con la configuración indicada (AC3).
- [ ] Deploy correcto con migraciones al arrancar (AC3).
- [ ] `/api/health` OK (AC5).

## Evidencias <!-- MUST -->

- {pendiente}
