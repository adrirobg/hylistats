# Task T01 — Dominio de compañeros: top 3, última partida y tests de tríos

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] `TeammateStats`/`TeammateSummary` con `games`, `firsts`, `top3`, `avgPlacement` y `lastPlayedAt`; sin `puuid` en `TeammateSummary`.
- [x] Tests de tríos (2 por partida, subteam ajeno excluido, fila propia ausente) y de `top3`/`lastPlayedAt` en verde.
- [x] Integración: suma de `games` = 2 × partidas del jugador.
- [x] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- `TeammateRow.gameCreation` sale de `matches.gameCreation` en `getTeammateRows`. `TeammateStats` y `TeammateSummary` ganan `top3` y `lastPlayedAt`, y la lista blanca `toTeammateSummary` los añade sin `puuid`.
- Una fila de compañero con puesto fuera de 1..6 se ignora entera, igual que en `computeSummary`.
- Desviación menor: el nombre vigente es el de la fila con mayor `gameCreation`, no el de la última recibida. Con entrada cronológica da lo mismo que antes, pero ya no depende del orden de entrada.

## Evidencias <!-- MUST -->

- Tests nuevos en `stats.test.ts`:
  - una partida de tríos con 18 filas da 2 compañeros;
  - un subteam ajeno no cuenta;
  - si falta la fila propia, se ignora la partida;
  - `top3` y `lastPlayedAt` con filas desordenadas;
  - gana el nombre más reciente;
  - un puesto fuera de rango no cuenta.
- Test nuevo en `queries.test.ts` (integración contra `hylistats_test`): la suma de `games` es 2 × partidas del jugador y ningún `TeammateSummary` lleva `puuid`.
- Checks (orquestador):
  - `npm run lint`: OK, 121 ficheros;
  - `npm run typecheck`: OK;
  - `npm test`: 36 ficheros y 629 tests en verde (+6);
  - `npm run build`: OK.
- Commit: ver `git log` (`feat(domain): compañeros con top 3 y última partida`).
