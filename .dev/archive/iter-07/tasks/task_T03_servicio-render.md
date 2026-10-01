# Task T03 — Servicio en Render

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] Servicio creado con la configuración indicada (AC3).
- [x] Deploy correcto con migraciones al arrancar (AC3).
- [x] `/api/health` OK (AC5).

## Evidencias <!-- MUST -->

- Workspace: único, "My Workspace" (`tea-davctigu01pc73e9e6n0`).
- Servicio `hylistats` (`srv-dave04qd0e5s73fkle3g`) creado con el MCP: repo `adrirobg/hylistats`, rama `feat/13-despliegue` (pasar a `main` tras el merge: el MCP no edita la rama), runtime node, build `npm ci && npm run build`, arranque `npm run start:prod`, Frankfurt, plan free, autodeploy; variables no secretas `SEASON_START`, `WORKER_ENABLED`. URL: https://hylistats.onrender.com. Render compila con plan de build `starter` (sin problemas de memoria; build ~55 s).
- Primer deploy (sin secretos): build OK, arranque falla con `nonZeroExit: 1` (falta `DATABASE_URL`), como se esperaba.
- El supervisor añadió `DATABASE_URL` (pooler session) y `ADMIN_TOKEN` en el panel y el health check `/api/health` (el MCP no lo permite). Deploys `dep-dave2svavr4c73bl49c0` y `dep-dave36unfi0s73fsggu0`: `succeeded`.
- `/api/health`: `ok: true`, `db: ok`, worker `idle` con el lock, key `ok` (la dev key restaurada desde local, `source: db`).
- Métricas: memoria ~170 MB de 512 MB; límite de CPU 0,15.
