# Task T03 — Fixtures reales anonimizadas

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Script `scripts/record-fixtures.ts` que graba una vez respuestas reales de la Riot API (≤ 15 peticiones), las anonimiza y las deja en `tests/fixtures/`, para que todos los tests funcionen sin key ni red.

## Contexto <!-- SHOULD -->

- spec.md: Alcance ("Tests Vitest con fixtures reales grabadas"), Entregable 3, "Riesgos" (repo **público**: anonimizar).
- skill `riot-api` (`.claude/skills/riot-api/SKILL.md`): endpoints, routing `europe`/`euw1`, autenticación sin filtrar la key.
- `.dev/research/riot-api.md` §5.1–5.4 (ids, detalle, 1º puesto y compañeros), §6 (404 real: `EUW1_7300000001`), §7.1 (`player-data`).

## Prompt / instrucciones para worker <!-- MUST -->

**Key**: el script la lee de `process.env.RIOT_API_KEY` (se ejecuta con `npx tsx --env-file-if-exists=.env.local scripts/record-fixtures.ts`). Prohibido: leer/imprimir `.env.local` (`cat`, `grep`, `sed`…), loguear la key, escribirla en ficheros, pasarla por query string o usar `curl -v`/`set -x`. Si la API responde 401/403, **para** y repórtalo: no reintentes.

1. Escribe `scripts/record-fixtures.ts` (fetch nativo, cabecera `X-Riot-Token`, peticiones **secuenciales** con ≥ 1 s de pausa, máximo 15 en total, aborta si se supera). Graba en `tests/fixtures/`:
   - `account.json` — `GET https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/BEJITO%20MAMBO/1991`.
   - `match-ids.json` — `GET …/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=1750&startTime=1778544000&start=0&count=10` (1778544000 = 2026-05-12T00:00:00Z en segundos).
   - `matches/<matchId>.json` — detalle (`GET …/lol/match/v5/matches/{id}`) de las partidas de esa lista en orden, parando cuando haya **al menos 5** grabadas **y** al menos una con el jugador en `placement === 1` (máx. 10 detalles).
   - `match-404.json` — cuerpo real del 404 de `GET …/lol/match/v5/matches/EUW1_7300000001` (guarda `{ status, body }`).
   - `player-data.json` — `GET https://euw1.api.riotgames.com/lol/challenges/v1/player-data/{puuid}`, recortado: conserva `totalPoints`, `categoryPoints` y solo las entradas de `challenges` con `challengeId` en 602000–602002 y 601000–601006; elimina `preferences`.
2. **Anonimización** (antes de escribir nada a disco):
   - Todo `puuid` (en `account.json`, `metadata.participants`, `info.participants[].puuid`, `player-data`) → sustituto determinista por orden de aparición: el del jugador de prueba `anon-puuid-self`, el resto `anon-puuid-001`, `anon-puuid-002`… (mismo real → mismo sustituto en todos los ficheros; el mapa real→anon **solo en memoria**, nunca a disco).
   - `riotIdGameName`/`riotIdTagline` de todo participante que **no** sea el jugador de prueba → `Player001`/`ANON` (mismo número que su puuid). `summonerName` → `""`. `summonerId`, `accountId` y `profileIcon` si aparecen → valor neutro (`"anon"` / `0`).
   - El jugador de prueba conserva `BEJITO MAMBO#1991` (es el supervisor).
   - Al final, el script comprueba que ninguna cadena de puuid real aparece en ningún fichero escrito (búsqueda en memoria sobre el contenido serializado) y falla si aparece.
3. `tests/fixtures/README.md`: fecha de grabación, qué petición produjo cada fichero, reglas de anonimización, recorte de `player-data` y el aviso "no regrabar sin necesidad (gasta presupuesto de Riot)". Incluye cuántas partidas hay, en cuáles hay 1º puesto del jugador y qué `playerSubteamId` comparten sus compañeros (útil para los tests).
4. Script npm `fixtures:record` = `tsx --env-file-if-exists=.env.local scripts/record-fixtures.ts`.
5. Ejecútalo **una sola vez** (si falla por un bug tuyo antes de hacer peticiones, corrígelo; si falla a mitad, no repitas más de una vez y respeta el tope global de 15 peticiones entre ambos intentos).
6. Test `tests/fixtures.test.ts`: cada fichero existe y es JSON válido; hay ≥ 5 partidas, todas `queueId === 1750` con 18 participantes; el jugador `anon-puuid-self` aparece en todas; al menos una con `placement === 1`; ningún puuid tiene forma de puuid real (78 caracteres base64url) y no quedan Riot IDs de terceros (todos los ajenos son `PlayerNNN#ANON`).
7. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `tests/fixtures/` con `account.json`, `match-ids.json`, ≥ 5 `matches/*.json`, `match-404.json`, `player-data.json` y `README.md`. *(Ajuste del orquestador 2026-09-29: el criterio original pedía ≥ 1 partida con 1º del jugador; la muestra de 10 no tiene ninguno y se decidió no gastar más peticiones: los tests sintetizan el 1º en memoria sobre partidas reales y el recuento real lo cubre AC4 en el E2E.)*
- [ ] Ningún puuid real ni Riot ID de terceros en los fixtures; la key no aparece en ningún fichero.
- [ ] ≤ 15 peticiones a Riot en total, sin 429.
- [ ] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

- 14/15 peticiones (account, ids, 10 detalles, 404 real, player-data), todas 200 salvo el 404 esperado; sin 429.
- Las 10 partidas más recientes (28–29 sep) no tienen ningún 1º del jugador (puestos 2–6). El worker propuso un script ad hoc para pedir una partida concreta con 1º; el clasificador de auto mode se lo denegó y el orquestador **no** lo ejecutó en su lugar: sin más peticiones, los tests sintetizan el 1º en memoria y el recuento real va al E2E (AC4).
- Partidas guardadas compactas (1,34 MB en total). `player-data.json` recortado a los retos Arena; `602002` = 75 (MASTER).
- Compañero recurrente `anon-puuid-013` en las 10 partidas (útil para el test de dedupe de T06).

## Evidencias <!-- MUST -->

- Orquestador: comprobación independiente → 0 apariciones de la key en `tests/`, `scripts/`, `src/`; 0 tokens ≥ 60 caracteres en `tests/fixtures/`; todos los puuids `anon-puuid-*`; único Riot ID real `BEJITO MAMBO#1991`.
- `npm run lint && npm run typecheck && npm test` → 28 tests OK (13 de fixtures).
- Commit: `test(fixtures): fixtures reales anonimizadas de Riot`.
