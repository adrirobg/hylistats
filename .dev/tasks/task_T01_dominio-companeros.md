# Task T01 — Dominio de compañeros: top 3, última partida y tests de tríos

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`computeTeammates` devuelve todo lo que pinta la tabla del brief §3.4: `games`, `firsts`, `top3`, `avgPlacement` y `lastPlayedAt`. `firstRate` y `top3Rate` se derivan. Los tests prueban la regla de tríos: en cada partida, exactamente los 2 compañeros del mismo `playerSubteamId`.

## Contexto <!-- SHOULD -->

- spec.md: Entregable 1 y AC1 ("Tests de las agregaciones de compañeros (tríos: 2 por partida)").
- Brief §3.4: columnas Compañero, Partidas, 1º, % 1º, Top 3, Puesto medio y Última.
- Código:
  - `src/domain/stats.ts`: `TeammateRow` (l. 131), `TeammateStats` y `computeTeammates(rows, selfPuuid)` (l. 162). Hoy da `games`, `firsts` y `avgPlacement`. Faltan `top3` y `lastPlayedAt`.
  - `src/domain/queries.ts`: `getTeammateRows` (3 filas por partida, filtrado en SQL por el subteam propio), `TeammateSummary = Omit<TeammateStats, "puuid">` y la lista blanca `toTeammateSummary`. `getProfileStats` expone `teammates`.
  - `TeammateRow` no tiene la fecha de la partida: `getTeammateRows` tiene que traer `matches.gameCreation`.
- Tests: `src/domain/stats.test.ts` (unitarios) y `src/domain/queries.test.ts` (contra `hylistats_test`, con `tests/helpers/matches.ts`: `loadMatchFixtures`, `variantOf`, `promoteTrioToFirst`, `SELF_PUUID`).

## Prompt / instrucciones para worker <!-- MUST -->

1. Añade `gameCreation: number` (epoch ms) a `TeammateRow` y selecciónalo en `getTeammateRows`.
2. `TeammateStats` gana:
   - `top3`: partidas juntos con `placement <= 3`;
   - `lastPlayedAt`: epoch ms de la última partida juntos.

   Mismo criterio que `computeSummary`: solo cuentan los puestos 1..6. Mantén el orden actual (más partidas primero, con los mismos desempates) y el nombre más reciente.
3. `toTeammateSummary` añade `top3` y `lastPlayedAt` a la lista blanca, sin `puuid`.
4. Tests unitarios en `stats.test.ts`:
   - una partida de tríos da exactamente 2 compañeros, aunque se pasen las 18 filas;
   - las filas de otros subteams no cuentan;
   - si en una partida falta la fila propia, se ignora;
   - `top3` y `lastPlayedAt`: el máximo por `gameCreation`, no la última fila recibida;
   - el nombre más reciente gana;
   - un puesto fuera de rango no cuenta.
5. Test de integración en `queries.test.ts`: con los fixtures, la suma de `games` de todos los compañeros es `2 × partidas` del jugador, y ningún `TeammateSummary` tiene la clave `puuid`.
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `TeammateStats`/`TeammateSummary` con `games`, `firsts`, `top3`, `avgPlacement` y `lastPlayedAt`; sin `puuid` en `TeammateSummary`.
- [ ] Tests de tríos (2 por partida, subteam ajeno excluido, fila propia ausente) y de `top3`/`lastPlayedAt` en verde.
- [ ] Integración: suma de `games` = 2 × partidas del jugador.
- [ ] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
