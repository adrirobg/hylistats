# Task T01 — Colas de Arena 1750 + 1740 en backfill, incremental y stats

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

El worker lista, descarga y cuenta las partidas de las dos colas de Arena tríos (`queueId` 1750 y 1740). Las stats y los campeones verificados cubren las dos colas. Un perfil sincronizado antes del cambio se completa con `npm run sync:season -- "Nombre#TAG"` sin volver a pedir las partidas ya guardadas.

## Contexto <!-- SHOULD -->

- spec.md: Alcance ("Cola 1740"), Entregable 1, AC7 y "Decisiones técnicas → Colas". think.md F14.
- Evidencia: la 1740 tiene el mismo formato que la 1750 (`CHERRY`, mapa 30, 18 jugadores en 6 tríos, puestos 1–6), es de la misma temporada y cuenta para `602002`. Ver `.dev/archive/iter-01/verify-report.md` § AC4.
- `src/lib/config.ts:4`: `ARENA_QUEUE_ID = 1750` (se sustituye).
- `src/worker/steps.ts`:
  - `listPage` (~l. 495–577) lista una sola cola con `listCursor`.
  - `incrementalStartTime` (~l. 474).
  - Constante `MATCH_IDS_PAGE_SIZE`.
  - Función `mergeIds`.
- `src/db/schema.ts`: tabla `syncJobs` (~l. 135) con `matchIds`, `totalIds`, `fetched` y `listCursor`. Migraciones en `drizzle/` con `npm run db:generate` (drizzle-kit). `npm run db:migrate` y `npm run db:migrate:test`.
- `src/worker/queue.ts`: `registerProfile`, `requestRefresh`, `wakeWorker` y `normalizeRiotId`. El worker sondea la BD cada 2 s sin trabajo (`IDLE_WAIT_MS` en `src/worker/main.ts`), así que un job insertado desde otro proceso se recoge solo.
- `src/domain/queries.ts`: `getPlayerRows` y `getTeammateRows` filtran `eq(matches.queueId, ARENA_QUEUE_ID)`.
- Tests: `src/worker/worker.test.ts` y `src/worker/queue.test.ts`, el `RiotApi` falso de `tests/helpers/fake-riot.ts`, helpers de BD en `tests/helpers/db.ts` y `src/domain/queries.test.ts`.
- Scripts existentes como patrón: `scripts/db-reset.ts` y `scripts/migrate.ts` (`tsx --env-file-if-exists=.env.local`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Config**: en `src/lib/config.ts`, sustituye `ARENA_QUEUE_ID` por `ARENA_QUEUE_IDS = [1750, 1740] as const`. Comentario: las dos colas de Arena tríos de la temporada, ninguna en `queues.json`; la 1740 se añadió por decisión del supervisor (F14). Actualiza todos los usos.
2. **Esquema**: añade a `syncJobs` la columna `listQueueIndex` (`list_queue_index integer not null default 0`): índice en `ARENA_QUEUE_IDS` de la cola que se está listando. Genera la migración con `npm run db:generate`; no la escribas a mano. Aplícala a dev y test con `npm run db:migrate && npm run db:migrate:test`.
3. **Listado** (`listPage`): lista la cola `ARENA_QUEUE_IDS[job.listQueueIndex]` desde `listCursor`, con el mismo `startTime`.
   - **Página llena**: igual que ahora (guarda ids y cursor, y sigue).
   - **Página incompleta con más colas por delante**: guarda los ids fusionados, pasa a `listQueueIndex + 1` con `listCursor = 0` y sigue en `listing`. Es un paso más, sin transición a `fetching`.
   - **Página incompleta en la última cola**: termina como ahora (transacción con `match_fetch` y paso a `fetching`), pero antes ordena los ids fusionados de más reciente a más antigua por la parte numérica del `matchId` (en EUW1 crece con el tiempo; desempate por el texto). Documéntalo en un comentario.
   - El incremental sigue usando un único `incrementalStartTime` para las dos colas. Sin partidas nuevas hace 1 petición de ids por cola (2 en total) y ninguna de detalle. Actualiza los comentarios que hablen de "1 sola petición de ids".
4. **Dominio**: `getPlayerRows` y `getTeammateRows` filtran con `inArray(matches.queueId, [...ARENA_QUEUE_IDS])`. Actualiza el comentario de cabecera de `queries.ts`.
5. **Re-backfill**: crea `scripts/sync-season.ts` y el script npm `"sync:season": "tsx --env-file-if-exists=.env.local scripts/sync-season.ts"`.
   - Recibe un Riot ID `Nombre#TAG` como argumento.
   - Busca el perfil por `riotIdNorm` (con `normalizeRiotId`).
   - Si no existe o no está `active`: mensaje claro y código de salida 1.
   - Si tiene un job activo (`ACTIVE_SYNC_JOB_STATUSES`): no hace nada y lo dice.
   - Si no, inserta un job `backfill` en `pending` para ese perfil, con la misma forma que `registerProfile` (mira qué campos pone y si el job debe ser interactivo; usa la prioridad de un refresco no interactivo si existe esa distinción).
   - Imprime el id del job. **Nunca imprime el `puuid`.**
   - Extrae la lógica a una función exportada y probada (por ejemplo, `enqueueSeasonBackfill(db, riotIdNorm)` en `src/worker/queue.ts`); el script solo la envuelve.
   - Comprueba que un job `backfill` de un perfil que ya tiene la fase `pending` resuelta funciona. Si el worker exige resolver el Riot ID en `pending`, el backfill de un perfil `active` con `puuid` debe pasar directamente a `listing` o resolver sin petición: revisa `steps.ts` y elige lo mínimo, justificándolo en el informe.
   - Las partidas ya guardadas se resuelven sin petición (ya lo hace `listPage`/`fetchMatch` con `matches`).
6. **Tests** (sin llamadas a Riot; el `RiotApi` falso devuelve ids distintos según `query.queue`):
   - Backfill con partidas en las dos colas: se listan las dos, `totalIds` = suma sin duplicados y `matchIds` ordenado de más reciente a más antigua.
   - Paginación: una cola con página llena (100) y la otra incompleta.
   - Incremental sin partidas nuevas: exactamente 2 llamadas a `getMatchIds` (una por cola) y 0 a `getMatch`.
   - `enqueueSeasonBackfill`: perfil inexistente, perfil con job activo y perfil ok. Con partidas ya en `matches`, no se piden de nuevo.
   - `getPlayerRows` y `getProfileStats` cuentan partidas y 1º de las dos colas e ignoran otras colas (por ejemplo, 400).
   - Adapta los tests existentes que asumían una sola cola sin perder su intención (AC5 de iter-01 pasa a "1 petición por cola").
7. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] `ARENA_QUEUE_IDS = [1750, 1740]`; ningún uso de `ARENA_QUEUE_ID` en `src/`.
- [x] Migración generada con drizzle-kit que añade `sync_jobs.list_queue_index`, aplicada a dev y test.
- [x] El backfill lista las dos colas (tests) y deja `matchIds` ordenado de más reciente a más antigua.
- [x] Incremental sin partidas nuevas: 2 peticiones de ids y 0 de detalle (test).
- [x] Stats y verificados cuentan 1750 ∪ 1740 e ignoran otras colas (test).
- [x] `npm run sync:season -- "Nombre#TAG"` encola un backfill sin imprimir `puuid`; lógica probada.
- [x] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- `resolveAccount` ya pasa a `listing` sin petición si el perfil tiene `puuid`: `enqueueSeasonBackfill` inserta el job en `pending` (no interactivo) sin tocar `steps.ts`. Un test comprueba 0 llamadas a `account` en el re-backfill.
- Orden final de ids: `sortNewestFirst` por la parte numérica del `matchId` (desempate por texto), solo al cerrar la última cola.
- El fake de Riot guarda los overrides de ids por cola (`setMatchIds(puuid, ids, queue = 1750)`).
- Orquestador (mismo commit): skill `riot-api` y `.dev/research/riot-api.md` §5.2 corregidas (premisa "solo 1750" → 1750 + 1740, con nota fechada).

## Evidencias <!-- MUST -->

- Migración `drizzle/0002_light_ravenous.sql` (drizzle-kit): `list_queue_index integer DEFAULT 0 NOT NULL`, presente en `hylistats` y `hylistats_test` (`information_schema`).
- `grep -rn "ARENA_QUEUE_ID\b" src scripts tests` → sin resultados.
- Checks (orquestador, 2026-09-29): `npm run lint` OK (75 ficheros) · `npm run typecheck` OK · `npm test` 24 ficheros, 313 tests en verde · `npm run build` OK.
- Tests clave: `worker.test.ts` (dos colas, paginación llena/incompleta, incremental 2 ids + 0 detalle, re-backfill 0 `account` y solo las 3 partidas nuevas), `queue.test.ts` (`enqueueSeasonBackfill`: unknown, inactive, active, queued, concurrencia), `queries.test.ts` (1750 ∪ 1740, ignora 400).
- Commit: ver `git log` (`feat(worker): colas de Arena 1750 + 1740 …`).
