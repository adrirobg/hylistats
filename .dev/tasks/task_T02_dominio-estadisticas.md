# Task T02 — Dominio de estadísticas personales: récords, rachas, días, a la primera

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un módulo puro `src/domain/records.ts` que, a partir de las partidas del jugador en la temporada, calcula todo lo que pinta la pestaña Estadísticas, más una consulta que le da las filas. Con tests de todos los casos límite de AC2.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Pestaña Estadísticas" (definiciones y desempates); Entregable 2; AC2.
- think.md F17 (día de juego: 06:00–06:00 Europe/Madrid, cuenta el día en que empezó la partida (`gameStartTimestamp`), mínimo 3 partidas para mejor/peor día).
- Código:
  - `src/domain/stats.ts:10`: `PlayerMatchRow` (matchId, gameCreation, championId, championName, placement, playerSubteamId) y `computeSummary` como estilo de función pura; `PLACEMENTS` 1..6.
  - `src/domain/queries.ts:29`: `getPlayerRows(db, puuid, seasonStart)`: filtra colas `ARENA_QUEUE_IDS` y temporada, orden cronológico ascendente.
  - `src/domain/summary.ts:163`: `highlights()` y su `firstTry` (l. ~155): definición de "ganado a la primera" (compara la primera partida del campeón con su primer 1º). **Reutiliza esa lógica** (extrae un helper compartido si hace falta) para que el Resumen y Estadísticas no diverjan.
  - Columnas nuevas de T01: `participants.totalDamageTaken`, `participants.largestKillingSpree`; y ya existentes `kills`, `deaths`, `totalDamageDealtToChampions`; `matches.gameStartTimestamp`.

## Prompt / instrucciones para worker <!-- MUST -->

1. Consulta nueva `getRecordRows(db, puuid, seasonStart)` en `queries.ts` (mismo filtro y orden que `getPlayerRows`) que devuelve `RecordRow`: matchId, gameCreation, gameStartTimestamp, championId, championName, placement, kills, deaths, totalDamageDealtToChampions, totalDamageTaken, largestKillingSpree (estos dos pueden ser null; trátalos como "sin dato" y exclúyelos solo de su récord).
2. `src/domain/records.ts`, función pura `computeRecords(rows)` que devuelve:
   - `records`: `damage`, `damageTaken`, `kills`, `killingSpree`, `deaths`: cada uno `{ value, matchId, championId, championName, gameCreation } | null`. **Empate: gana la partida más antigua.**
   - `deathlessWins`: `{ count, matches: [...] }` (1º con 0 muertes, más reciente primero).
   - `mostDeathsWin`: el 1º con más `deaths` (empate: la más antigua) o null.
   - `longestWinStreak` y `longestDrought`: `{ length, fromMatchId, toMatchId, from, to, ongoing }`. Orden cronológico por `gameCreation` (desempate `matchId`); 1º consecutivos / partidas consecutivas sin 1º; `ongoing` si incluye la última partida. **Empate: la más reciente.** null si length 0.
   - `bestDay` y `worstDay`: `{ day: "YYYY-MM-DD", avgPlacement, games }`. Día de juego = fecha en Europe/Madrid de `gameStartTimestamp − 6 h` (usa `Intl.DateTimeFormat` con `timeZone: "Europe/Madrid"`, sin librerías nuevas). Solo días con `games >= RECORD_DAY_MIN_GAMES` (3, en `src/lib/config.ts`). **Empate: el más reciente.** null si ningún día llega.
   - `firstTry`: `{ count, wonChampions, rate }` (rate = count / campeones con algún 1º; 0 si no hay).
   - `topChampion`: campeón con más 1º `{ championId, championName, firsts, games }` (empate: más partidas, luego nombre) o null.
3. Tests en `src/domain/records.test.ts` con filas sintéticas, como mínimo los de AC2: empate en un récord (gana la más antigua); racha en curso hasta la última partida; partida a las 01:30 de Madrid que cuenta en el día anterior; día con 2 partidas excluido; jugador sin ningún 1º (streak/firstTry/topChampion/mostDeathsWin vacíos); cambio de horario (partidas a las 05:30 y 06:30 hora local en los días 2026-03-29 y 2026-10-25). Añade también: campos null excluidos de su récord; lista vacía.
4. Test de integración de `getRecordRows` en `queries.test.ts` con los fixtures existentes.
5. No toques UI (eso es T04). `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] `computeRecords` y `getRecordRows` existen con la forma descrita.
- [x] Tests de AC2 en verde (empates, racha en curso, 01:30, día con 2 partidas, sin 1º, cambio de hora).
- [x] `firstTry` comparte lógica con `highlights().firstTry` (mismo resultado sobre los mismos datos, con test).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `src/domain/records.ts`: `computeRecords(rows): Records` y `gameDay(ts)`. `getRecordRows(db, puuid, seasonStart)` en `src/domain/queries.ts` (mismo filtro y orden que `getPlayerRows`). `RECORD_DAY_MIN_GAMES = 3` en `src/lib/config.ts`.
- `firstTry` compartido: `firstTryMatches(rows)` en `src/domain/summary.ts`, usado por `highlights()` y `computeRecords`. Hay un test de equivalencia con `highlights().firstTry`, y los tests previos de `highlights` siguen en verde sin cambios.
- **Desviación del prompt, alineada con la spec**: el día de juego no se calcula como `gameStartTimestamp − 6 h`. Esa resta pone en el día equivocado 1 h de partidas en los días de cambio de hora (03-29 06:30 CEST daría 03-28; 10-25 05:30 CET daría 10-25). `gameDay` toma la fecha y la hora locales de Madrid con `Intl` y resta un día natural si la hora es < 06:00, que es la regla de spec §Días y F17.
- Tests: 32 en `records.test.ts`. Cubren AC2: empate de récord (gana la más antigua), racha en curso, 01:30 en el día anterior, día con 2 partidas excluido, sin ningún 1º, y cambio de hora en marzo y octubre a las 05:30 y 06:30. Cubren también nulos excluidos, lista vacía y los desempates de rachas, días y `topChampion`. Hay 4 tests de integración de `getRecordRows` en `queries.test.ts`.
- `npm run lint && npm run typecheck && npm test && npm run build`: en verde (48 ficheros, 1006 tests).
