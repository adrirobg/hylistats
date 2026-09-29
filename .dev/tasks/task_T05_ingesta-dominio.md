# Task T05 — Ingesta de partidas y dominio de stats

**Owner**: worker:sonnet
**Estado**: in_progress *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Mapeo idempotente de una partida Match-V5 a filas (`matches` + los 18 `participants`, JSON crudo gzip) y funciones de dominio: resumen de stats, campeones ganados verificados, compañeros y valor del challenge `602002`, más las consultas de BD que las alimentan para un perfil dentro de la temporada.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (Dominio), Entregable 5, AC4.
- skill `riot-api`: "Leer los campos Arena" (`placement === 1` es 1º; `win` ≠ 1º; compañeros = mismo `playerSubteamId`; no usar `teams[]`), "Challenge 602002".
- `.dev/research/riot-api.md` §5.4 (algoritmo de 1º y compañeros) y §8 (comparación lista vs contador).
- `.dev/research/sync-strategy.md` §6 (temporada: `queue=1750` + `SEASON_START`).
- Código previo: `src/db/schema.ts` (T02), `src/lib/riot/schemas.ts` (`MatchDto`, `PlayerDataDto`, T04), `tests/fixtures/` + su `README.md` (T03), `tests/helpers/db.ts`.

## Prompt / instrucciones para worker <!-- MUST -->

Sin llamadas a la Riot API ni lectura de `.env.local`.

1. `src/lib/config.ts`: `ARENA_QUEUE_ID = 1750`, `CHALLENGE_ARENA_GOD = 602002`, `getSeasonStart()` → `Date` desde `SEASON_START` (ISO) con default `2026-05-12T00:00:00Z`; error claro si el valor no es una fecha válida.
2. `src/domain/ingest.ts`:
   - `matchToRows(match: MatchDto)` → `{ match: NewMatch, participants: NewParticipant[] }` (los 18; `augments` = `[playerAugment1..6]`, `items` = `[item0..item6]`).
   - `storeMatch(db, match, raw: string)` → en una transacción inserta `matches` (con `rawGz = gzipSync(raw)`) y `participants`, ambos con `onConflictDoNothing` (idempotente). Devuelve si insertó o ya existía.
3. `src/domain/stats.ts` — funciones **puras** sobre filas del jugador `{ matchId, gameCreation, championId, championName, placement, playerSubteamId }`:
   - `computeSummary(rows)` → `{ games, firsts, firstRate, top3, top3Rate, avgPlacement, distribution: Record<1..6, number> }` (tasas en 0–1; `avgPlacement` null si no hay partidas).
   - `verifiedChampions(rows)` → campeones con `placement === 1`: `{ championId, championName, firsts, firstWinMatchId, firstWinAt, lastWinMatchId, lastWinAt }`, orden por `lastWinAt` descendente. El recuento es `distinct championId`.
   - `computeTeammates(rows)` sobre filas `{ matchId, puuid, riotIdGameName, riotIdTagline, placement, playerSubteamId }` de **todas** las partidas del jugador más su `puuid` → por compañero (mismo `playerSubteamId`, distinto `puuid`): `{ puuid, gameName, tagLine, games, firsts, avgPlacement }`, orden por `games` desc. (El `puuid` es interno: no se expone en UI/URLs; aquí solo agrupa.)
   - `extractChallenge(playerData, challengeId)` → `{ value, level, achievedTime } | null`.
   - `compareWithChallenge(verifiedCount, challengeValue)` → `{ status: 'match' | 'diff' | 'unknown', diff }`.
4. `src/domain/queries.ts` (usa `Db` inyectado): `getPlayerRows(db, puuid, seasonStart)` (join `participants`–`matches`, `queueId = 1750`, `gameCreation >= seasonStart`), `getTeammateRows(db, puuid, seasonStart)` y `getProfileStats(db, profileId)` que compone `summary`, `verifiedChampions`, `teammates` y la comparación con `profiles.challengeValue`.
5. Tests:
   - `stats.test.ts` con filas construidas a partir de los fixtures (calcula los valores esperados a mano en el propio test a partir de los JSON y explica en un comentario de dónde sale cada cifra): resumen, distribución, `verifiedChampions` (distinct, varios 1º del mismo campeón cuentan 1), compañeros (siempre 2 por partida en tríos), `extractChallenge` con `player-data.json`, `compareWithChallenge`.
   - `ingest.test.ts` contra la BD de test: `storeMatch` dos veces con el mismo fixture deja 1 `matches` y 18 `participants`; `rawGz` descomprime al JSON original; `getPlayerRows` filtra por temporada y cola (inserta una partida con `queueId` distinto o anterior a `SEASON_START` modificando un fixture en memoria y comprueba que no cuenta).
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `storeMatch` idempotente (PK + `onConflictDoNothing`) con JSON crudo gzip.
- [ ] Resumen, campeones verificados (`distinct championId | placement==1` desde `SEASON_START`, cola 1750), compañeros por `playerSubteamId` y `602002` testeados con fixtures reales.
- [ ] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

- `ProfileStats.teammates` usa `TeammateSummary` (sin `puuid`, lista blanca); `computeTeammates` conserva `puuid` como interno.
- `getTeammateRows` filtra en SQL por el `playerSubteamId` del jugador (3 filas por partida en vez de 18).
- `getSeasonStart` valida estrictamente (fechas desbordadas, horas sin zona). `getProfileStats(db, id, seasonStart?)` para tests con fecha fija.
- Sin `server-only` en `src/domain` ni `config.ts` (los importa el worker).
- Helper `tests/helpers/matches.ts` (`variantOf`, `promoteTrioToFirst`) para sintetizar 1º puestos sobre partidas reales.

## Evidencias <!-- MUST -->

- Cifras de los fixtures (tests): 10 partidas, puestos `[5,3,3,3,5,6,4,4,2,2]` → 0 primeros, top3 5, media 3,7; trío ganador real → 10 primeros / 9 campeones distintos (Lulu ×2); compañeros 20 = 10×2; `602002` = 75 MASTER.
- `storeMatch` idempotente (2 veces y 3 en paralelo → 1 `matches` + 18 `participants`); `rawGz` descomprime al JSON original; filtro de temporada y cola probado.
- Orquestador: `npm run lint && npm run typecheck && npm test` → 13 ficheros, 168 tests OK.
- Commit: `feat(domain): ingesta de partidas y stats de temporada`.
