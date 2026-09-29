# Task T04 — Cliente Riot con limitador de dos ventanas

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`src/lib/riot/`: limitador por host (dos ventanas, 10 % de margen, prioridades, `Retry-After`), cliente `fetch` con política de errores de I2 §2, esquemas Zod de los campos usados, fuente de la key (`settings` → entorno) y métricas en memoria. Todo inyectable y testeado sin red.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (cliente Riot), Entregable 4, "Riesgos" (singletons en `globalThis`), AC2 (sin 429 sin gestionar), AC8 (key).
- `.dev/research/stack.md` §6 (diseño `riotFetch(host, path, priority)`, key leída en cada llamada, `server-only`).
- `.dev/research/sync-strategy.md` §2 (prioridades y gestión de errores: 429, 5xx, 404, 401/403).
- skill `riot-api`: hosts, endpoints, rate limits (`100:120,20:1` por host), gotchas (`count` ≤ 100, `startTime` en segundos).
- Fixtures de T03 en `tests/fixtures/` (contrato de los esquemas). Tablas de T02 en `src/db/schema.ts` (`settings`).

## Prompt / instrucciones para worker <!-- MUST -->

Prohibido llamar a la Riot API real en esta task y leer `.env.local`. Todo con `fetch` falso.

1. `src/lib/riot/limiter.ts` — `class HostLimiter` con ventanas deslizantes (log de timestamps) configurables; por defecto `[{ limit: 18, windowMs: 1_000 }, { limit: 90, windowMs: 120_000 }]` (20/1 s y 100/120 s con 10 % de margen). `acquire(priority)` devuelve una promesa que se resuelve cuando hay hueco; cola por prioridad (`0` interactivo > `1` listado > `2` detalle), FIFO dentro de cada prioridad. `blockUntil(epochMs)` para `Retry-After`. Reloj y `sleep` inyectables (`now`, `sleep`) para tests deterministas.
2. `src/lib/riot/schemas.ts` — Zod 4 con objetos laxos (campos extra permitidos): `AccountDto` (`puuid`, `gameName`, `tagLine`); `MatchIdsDto` (array de string); `MatchDto` (`metadata.matchId`, `metadata.participants`; `info.gameCreation`, `gameStartTimestamp`, `gameEndTimestamp`, `gameDuration`, `gameVersion`, `queueId`, `endOfGameResult` opcional, `participants[]`) y `ParticipantDto` con solo los campos que usa `participants` de `src/db/schema.ts` (`playerAugment1..6` e `item0..6` opcionales con default 0); `PlayerDataDto` (`challenges[]` con `challengeId`, `value`, `level`, `percentile?`, `achievedTime?`). Exporta tipos inferidos.
3. `src/lib/riot/errors.ts` — `RiotAuthError` (401/403), `RiotNotFoundError` (404), `RiotBadRequestError` (400), `RiotRetryableError` (5xx/timeout/red agotados), `RiotRateLimitError` (429 agotado). Los mensajes incluyen host, ruta sin query sensible y status; **nunca** cabeceras ni la key.
4. `src/lib/riot/key.ts` — `getRiotApiKey(db)`: `settings.riotApiKey` (fila `id = 1`) y si es null `process.env.RIOT_API_KEY`; devuelve `{ key, source: 'db' | 'env' } | null`. Se lee **en cada llamada** (sin caché) para que un cambio desde `/admin` surta efecto sin reinicio.
5. `src/lib/riot/client.ts` — `createRiotClient(deps)` con `deps = { fetch, getKey, limiters, now, sleep, random, metrics }` y una interfaz exportada `RiotApi`:
   - `getAccountByRiotId(gameName, tagLine, priority)` → `europe` `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` (`encodeURIComponent`).
   - `getMatchIds(puuid, { start, count, startTime?, queue }, priority)` → `europe` `/lol/match/v5/matches/by-puuid/{puuid}/ids` (valida `count` ≤ 100).
   - `getMatch(matchId, priority)` → `europe` `/lol/match/v5/matches/{matchId}`; devuelve `{ match, raw }` (raw = texto JSON original, para `rawGz`).
   - `getPlayerData(puuid, priority)` → `euw1` `/lol/challenges/v1/player-data/{puuid}`.
   - `validateKey(candidateKey)` → Account-V1 de `BEJITO MAMBO#1991` (configurable) usando **esa** key en lugar de `getKey`; devuelve `'ok' | 'invalid' | 'error'`.
   - Política (I2 §2): antes de cada intento `await limiter.acquire(priority)`; `fetch` con `AbortSignal.timeout(10_000)` y cabecera `X-Riot-Token`. 200 → parse Zod. 429 → `Retry-After` (s) → `limiter.blockUntil` y reintento; sin cabecera → backoff exponencial con jitter; tras 5 → `RiotRateLimitError`. 5xx/timeout/red → backoff exponencial con jitter (base 1 s, tope 30 s), máx. 5 intentos → `RiotRetryableError`. 404 → `RiotNotFoundError` sin reintento. 401/403 → `RiotAuthError` sin reintento. 400 → `RiotBadRequestError`. Sin key disponible → `RiotAuthError('no key')`.
   - Métricas en memoria (`metrics`): contadores por tipo de endpoint (`account`, `matchIds`, `match`, `playerData`, `validate`), `status429`, `retries`, `lastRequestAt`. Sin loguear la key ni cabeceras.
   - `getRiotClient()` / `getLimiters()` / `getRiotMetrics()`: singletons en `globalThis` (un `HostLimiter` por host `europe` y `euw1`) con dependencias reales (`fetch` global, `getRiotApiKey(getDb())`).
   - `import 'server-only'` en `client.ts` y `key.ts` (Vitest ya lo resuelve a un stub).
6. Tests (`src/lib/riot/*.test.ts`), sin red y con reloj falso: limitador (18 en 1 s y la 19ª espera; 90 en 120 s; prioridades; FIFO; `blockUntil`); cliente (cabecera con la key del `getKey`; 200 con cada fixture de T03 parsea; 429 con `Retry-After` espera ese tiempo y reintenta, cuenta en `status429`; 5xx → reintentos → error; 404 → `RiotNotFoundError` con el cuerpo de `match-404.json`; 401/403 → `RiotAuthError` sin reintento; `validateKey` usa la key candidata; ningún mensaje de error ni métrica contiene la key); `getRiotApiKey` prioriza BD sobre entorno (BD de test).
7. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] Limitador de dos ventanas por host con margen del 10 %, prioridades y `Retry-After`, testeado con reloj falso.
- [ ] Cliente con política 429/5xx/404/401-403 y esquemas Zod validados contra los fixtures reales.
- [ ] Key leída en cada llamada (BD → entorno), nunca en mensajes, métricas ni logs.
- [ ] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

- Añadido `RiotSchemaError` (200 con cuerpo no JSON o que no cumple Zod; sin reintento).
- Puuid enmascarado en mensajes de error (`by-puuid/:puuid/ids`, `player-data/:puuid`); errores de red descritos por `name`/`cause.code` (el `message` de Node puede citar la cabecera con la key).
- 429 → `limiter.blockUntil` del host entero (Retry-After acotado a 5 min); backoff `min(30 s, 1 s·2^(n-1))` con jitter.
- Key releída con `getKey()` en cada intento, tras `acquire`. `validateKey`: prioridad 0, 2 intentos; 401/403 → `invalid`, resto → `error`.
- `getMatchIds` valida `count` 0..100 y que `startTime` esté en segundos antes de gastar petición.
- Métricas cuentan peticiones HTTP reales (incluidos reintentos). Singletons en `globalThis.__hylistatsRiot`.
- `tests/helpers/riot.ts`: reloj falso y lectura de fixtures para T05/T06.

## Evidencias <!-- MUST -->

- Orquestador: `npm run lint && npm run typecheck && npm test` → 9 ficheros, 110 tests OK (80 nuevos: limitador con reloj falso, cliente con fetch falso y fixtures, key BD→entorno, singletons, fuga de key en errores/métricas).
- La key real de `.env.local` cumple `KEY_SHAPE` (comprobado sin imprimirla).
- Commit: `feat(riot): cliente Riot con limitador de dos ventanas por host`.
