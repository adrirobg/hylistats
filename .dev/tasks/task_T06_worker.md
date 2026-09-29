# Task T06 — Worker en proceso con cola persistente

**Owner**: worker:opus
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Worker único en el proceso de Next (`instrumentation.ts`) con `pg_try_advisory_lock`, cola persistente en BD (`sync_jobs` + `match_fetch`), prioridades y round-robin, backfill de más reciente a más antigua, refresco incremental, dedupe por `matchId`, pausa ante 401/403 con reanudación sin reinicio y reanudación tras caída.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (worker, temporada), Entregable 6, AC2, AC3, AC5, AC6, AC7; "Decisiones técnicas" (cola con `sync_jobs.matchIds`, todas las llamadas a Riot pasan por el worker, singletons en `globalThis`).
- `.dev/research/sync-strategy.md` §1 (presupuesto), §2 (cola de dos niveles, prioridades, round-robin, errores), §3 (disparadores: cooldown 60 s, umbral 2 min).
- `.dev/research/stack.md` §3(a) (arranque sin `await` desde `register()`, guard `NEXT_RUNTIME === 'nodejs'`, SIGTERM), §7 (advisory lock) y §7.1 punto 3 (máquina de estados de la key: `ok` → 401/403 → `invalid` (pausado) → key nueva → `ok`; el job en curso vuelve sin consumir reintento; mientras pausado, sin llamadas a Riot; se despierta por señal en proceso o consultando `settings` cada 10–15 s).
- Código previo: `src/db/schema.ts` (T02), `src/lib/riot/client.ts` (`RiotApi`, errores, prioridades, T04), `src/domain/ingest.ts` (`storeMatch`), `src/domain/stats.ts` (`extractChallenge`), `src/lib/config.ts` (T05), fixtures en `tests/fixtures/` (T03), `tests/helpers/db.ts`.
- Next.js 16: leer `node_modules/next/dist/docs/` sobre `instrumentation.ts` antes de escribirlo.

## Prompt / instrucciones para worker <!-- MUST -->

Sin llamadas a la Riot API real ni lectura de `.env.local`: en tests, un `RiotApi` falso construido con los fixtures.

1. `src/worker/queue.ts` (funciones con `Db` inyectado):
   - `registerProfile(db, gameName, tagLine)` → upsert por `riotIdNorm`; si el perfil es nuevo, crea un job `backfill` (`interactive: true`) en `pending`. Devuelve el perfil.
   - `requestRefresh(db, profileId, { interactive })` → si hay job activo, no hace nada; si el último job terminó hace < 60 s (cooldown configurable), devuelve `cooldown`; si no, crea un job `incremental`. Devuelve `'queued' | 'active' | 'cooldown'`.
   - `ensureFreshOnView(db, profileId)` → encola un refresco no interactivo si `lastSyncedAt` supera 2 min y no hay job activo (para la página).
   - `wakeWorker()` → señal en proceso (EventEmitter en `globalThis`).
2. `src/worker/steps.ts` — un paso de trabajo por llamada, persistiendo todo en BD antes y después de cada petición (reanudable en cualquier punto):
   - **pending** → si el perfil no tiene `puuid`: Account-V1 (prioridad interactiva); 404 → perfil `not_found`, job `error`; OK → guarda `puuid`, `gameName`/`tagLine` canónicos, perfil `active`. Pasa a `listing`.
   - **listing (backfill)** → páginas `getMatchIds(puuid, { start: listCursor, count: 100, queue: 1750, startTime: SEASON_START en segundos })`; añade ids a `matchIds` (sin duplicar, orden de la API: más reciente primero) y avanza `listCursor` en la misma transacción; al recibir una página < 100, inserta todos los ids en `match_fetch` (`onConflictDoNothing`), marca `done` los que ya están en `matches`, fija `totalIds` y `fetched` y pasa a `fetching`.
   - **listing (incremental)** → `startTime` = `max(gameEndTimestamp)` de las partidas del perfil (en segundos, menos 60 s de margen) o `SEASON_START` si no tiene; 1 petición `count: 100` (pagina solo si vuelve llena). Ids nuevos = los que no están en `matches`. Si no hay ninguno → termina el job directamente (**1 sola petición de ids**, sin detalle; ver punto 3 sobre el challenge). Si hay → `match_fetch` + `fetching`.
   - **fetching** → round-robin entre jobs `fetching` (el de `lastServedAt` más antiguo, con los `interactive` primero); en ese job, el primer id de `matchIds` cuyo `match_fetch` esté `pending` y con `nextAttemptAt` vencido. Si la partida ya está en `matches` (la trajo otro job) → `done` sin petición. Si no → `getMatch` (prioridad detalle, o interactiva si el job lo es) → `storeMatch` → `match_fetch.done`. 404 → `missing`. `RiotRetryableError` → `attempts++`, `nextAttemptAt` con backoff; a los 5 → `error`. Tras cada resolución, recalcula `fetched` = ids del job en `done`/`missing`/`error`.
   - **cierre** → cuando todos los ids del job están resueltos: `getPlayerData(puuid)` (host `euw1`) → `extractChallenge(…, 602002)` → guarda `challengeValue/Level/CheckedAt`; `lastSyncedAt = now`; job `done` con `finishedAt`. Si `getPlayerData` falla con un error no-auth, registra `lastError` y cierra igualmente.
   - Selección del siguiente trabajo (prioridades I2 §2): (1) jobs `interactive` en `pending`/`listing`, (2) resto de `pending`/`listing`, (3) `fetching` en round-robin (los `interactive` antes).
3. Challenge en incremental: el criterio AC5 cuenta **peticiones de ids**; el incremental sin partidas nuevas hace 1 de ids y además refresca `602002` (host `euw1`, otra ventana). Deja ambas cosas y documenta en el código la razón.
4. `RiotAuthError` en cualquier paso → `settings.keyStatus = 'invalid'`, `keyStatusSince`, `keyStatusReason` (sin la key); el paso no avanza ni consume intento (el job y el `match_fetch` quedan como estaban); el worker pasa a `paused` y no hace más llamadas hasta que `wakeWorker()` se dispare o `settings` cambie (`keyStatus = 'ok'` o `updatedAt` posterior a la pausa; consulta cada 10 s). Al arrancar, si `keyStatus = 'invalid'`, empieza en pausa (sale igual que arriba). Tras la primera petición OK, `keyStatus = 'ok'`.
5. `src/worker/main.ts`:
   - `createWorker(deps)` con `deps = { db, riot: RiotApi, now, sleep, lock }` y métodos `tick()` (ejecuta un paso; devuelve `'worked' | 'idle' | 'paused'`), `run()` (bucle: `tick`; si `idle`, espera a `wakeWorker` o 2 s; si `paused`, espera a señal o 10 s) y `stop()` (termina el paso en curso y sale).
   - Estado en `globalThis` para `/api/health`: `{ state: 'starting' | 'waiting_lock' | 'running' | 'idle' | 'paused' | 'stopped', lastActivityAt, currentJobId, lastError }` (`getWorkerStatus()`).
   - `startWorker()` idempotente (guard en `globalThis`): cliente `pg` dedicado (no del pool) con `SELECT pg_try_advisory_lock(<constante bigint>)`; si `false`, `waiting_lock` y reintenta cada 15 s. Con el lock, `run()` con `getRiotClient()` y `getDb()`. SIGTERM/SIGINT → `stop()` y liberar el lock.
   - Logs breves con id de job y Riot ID; **nunca** la key ni puuids.
6. `src/instrumentation.ts`: `register()` → si `process.env.NEXT_RUNTIME === 'nodejs'` y `WORKER_ENABLED !== 'false'`, `const { startWorker } = await import('./worker/main'); void startWorker();` (sin `await` del bucle).
7. Tests (`src/worker/*.test.ts`, BD de test, `RiotApi` falso que cuenta llamadas por método e id y sirve fixtures; ids de páginas sintetizados a partir de los fixtures):
   - Backfill completo de un perfil: job `done`, `fetched === totalIds`, 18 participantes por partida, `challengeValue` guardado, orden de descarga = más reciente primero.
   - **AC3 dedupe**: registra el jugador y un compañero de una partida compartida del fixture (su `riotId` anónimo); ambos listan esa partida; al terminar, `getMatch` de ese id se llamó **1 vez** y `matches` no tiene duplicados.
   - **AC5 incremental**: tras el backfill, `requestRefresh` sin partidas nuevas → exactamente 1 `getMatchIds` y 0 `getMatch`; con 1 nueva → 1 `getMatchIds` y 1 `getMatch`; cooldown devuelve `cooldown`.
   - **AC6 pausa**: el falso lanza `RiotAuthError` → `tick()` devuelve `paused`, `keyStatus = 'invalid'`, job sin avanzar ni consumir intento, ninguna llamada más mientras está pausado; se actualiza `settings` a `ok` + `wakeWorker()` → reanuda y termina.
   - **AC7 caída**: ejecuta N ticks de un backfill, descarta la instancia (simula kill) y crea otra con la misma BD → termina; sin filas duplicadas y sin volver a pedir partidas ya guardadas.
   - Round-robin: dos backfills en `fetching` alternan peticiones de detalle.
   - 404 en detalle → `missing` y el job termina.
   - `pg_try_advisory_lock`: una segunda instancia no obtiene el lock mientras la primera lo tiene.
8. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Comprueba además que `npm run build && WORKER_ENABLED=false npm start` arranca, y que con el worker habilitado y la BD dev vacía llega a estado `idle` (sin perfiles no hace ninguna petición a Riot). Para esto usa la BD dev: Next carga `.env.local` por sí solo; tú no lo leas.

## Criterios de aceptacion <!-- MUST -->

- [ ] Worker con advisory lock, cola persistente, prioridades y round-robin, arrancado desde `instrumentation.ts`.
- [ ] Tests en verde de backfill, dedupe (AC3), incremental (AC5), pausa/reanudación (AC6), caída/reanudación (AC7), round-robin, 404 y lock.
- [ ] Sin la key ni puuids en logs.
- [ ] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
