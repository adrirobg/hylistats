# Task T10 — Verificación E2E contra la API real

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] AC2, AC4, AC5, AC6, AC7 y AC8 comprobados con evidencia en `.dev/verify-report.md`.
- [x] Un solo backfill completo contra Riot.

## Notas de implementacion <!-- MAY -->

- Del informe de T06: backfill secuencial ~11–12 min (90 peticiones/120 s); el `kill -9` repite como mucho 1 petición; `SIGTERM` de Next no espera al paso en curso (inocuo). Para AC6, rotar la key vía `POST /api/admin/key` (bearer `ADMIN_TOKEN` de `.env.local`, leído en el shell sin imprimirlo).
- `.env.local` ya tiene `DATABASE_URL`, `DATABASE_URL_TEST`, `ADMIN_TOKEN` (generado), `SEASON_START` y `WORKER_ENABLED`.
- Backfill real: 10 min 19 s (18:07:44 → 18:18:03 UTC), con la ráfaga inicial de ~90 peticiones y después ~0,75 peticiones/s.
- Tras el `kill -9`, el proceso nuevo arranca con el limitador vacío y Riot aún cuenta la ventana anterior: un 429 gestionado con `Retry-After`. Hallazgo diferido en el verify-report.
- AC4 no cuadró a la primera (70 frente a 75). Sondeo acotado (89 peticiones, script en el scratchpad, cliente y limitador del proyecto): la diferencia es la **cola 1740**, una segunda cola de Arena con 80 partidas del jugador. La unión 1750 ∪ 1740 da 75 y reproduce el umbral 60 en el `achievedTime`. No se cambia `queue=1750` (alcance del supervisor).
- El comportamiento en cliente que T08 no pudo ver en el navegador (buscador con `router.push`, polling de `AutoRefresh`, estados de `RefreshButton`) se comprobó aquí en el navegador integrado.

## Evidencias <!-- MUST -->

- `.dev/verify-report.md`: AC1–AC8 con comandos, recuentos y métricas; conclusión **PASS**.
- Navegador integrado: home → `/euw/BEJITO%20MAMBO-1991` → "Registrar y sincronizar" → `descargando 7/508` → `49/508` sin recargar; "Actualizar" → `active`, `queued` y `cooldown`; aviso de pausa en AC6.
- AC7: `kill -9` a 258/508 → rearranque → 508/508; `participants = 9144 = 18 × 508`, `match_fetch` 508 `done`, 0 duplicados.
- AC5: incremental sin partidas nuevas = `matchIds +1`, `match +0`. AC6: 401 → `paused` → `POST /api/admin/key` `{"result":"ok"}` → reanuda en el mismo proceso. AC8: 0 apariciones de la key en `.next`, logs, árbol, historial git y respuestas HTTP.
- Logs en el scratchpad de la sesión (`server-1.log`, `server-2.log`, `ac4-probe.log`, `ac4-probe2.log`).
