# Task T10 — Verificación E2E contra la API real

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Ejecutar con la app real (`next build && next start`, Postgres de Docker, dev key vigente) los criterios que necesitan la API: backfill de `BEJITO MAMBO#1991` con kill a mitad y reanudación, comparación con `602002`, incremental, pausa/reanudación por key y grep de la key. Evidencias a `.dev/verify-report.md`.

## Contexto <!-- SHOULD -->

- spec.md: AC2, AC4, AC5, AC6, AC7, AC8; "Riesgos" (presupuesto: un solo backfill completo; AC7 dentro de ese backfill).
- runbook `.dev/research/orquestacion-v1.md` §Bucle 6 y §Límites.

## Prompt / instrucciones para worker <!-- MUST -->

La ejecuta el orquestador (necesita la key y el presupuesto de Riot; no se delega).

1. `docker compose up -d`, `npm run db:migrate`, `npm run db:reset -- --yes`, `npm run build`, `npm start` con salida a un log en el scratchpad.
2. Registrar `BEJITO MAMBO#1991` desde la página (navegador integrado) y capturar el progreso `fetched/total`.
3. A mitad del backfill: `kill -9` del servidor; contar filas; arrancar de nuevo; comprobar que reanuda desde la cola y que al terminar no hay duplicados (`participants = 18 × matches`, `match_fetch` único, métricas de `getMatch` ≈ partidas).
4. AC4: comparar `distinct championId | placement==1` desde `SEASON_START` con `602002`; si difiere, investigar y explicar.
5. AC5: "Actualizar" tras el backfill → delta de métricas: 1 petición de ids y 0 de detalle si no hay partidas nuevas.
6. AC6: poner una key inválida en `settings` (SQL), forzar refresco → worker `paused` y aviso en la página (captura) → `POST /api/admin/key` con la key de `.env.local` leída en el shell → reanuda sin reiniciar.
7. AC8: grep de la key (desde variable de shell, imprimiendo solo recuentos) en `.next/static`, logs del servidor, `git grep` del repo y fixtures.
8. `/api/health`: `status429` y reintentos.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC2, AC4, AC5, AC6, AC7 y AC8 comprobados con evidencia en `.dev/verify-report.md`.
- [ ] Un solo backfill completo contra Riot.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
