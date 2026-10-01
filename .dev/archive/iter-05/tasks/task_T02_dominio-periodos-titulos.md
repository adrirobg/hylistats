# Task T02 — Dominio de periodos, ranking, equipos del periodo y títulos

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un módulo puro en `src/domain/` que, a partir de las partidas de los miembros, calcula el periodo (día o semana) que se muestra, el ranking del periodo, los dúos y tríos de miembros y los 7 títulos con su texto de "por qué". Con tests de todos los casos de AC2, AC3 y AC4.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Bloque Hoy / Semana", "Títulos" (tabla de métricas, definición de dúo y trío, mínimos, competencia, empates) y "Explicación de los títulos"; Entregable 2; **AC2, AC3, AC4** y la parte de texto de **AC5**.
- think.md: F17 (día de juego), F20 (periodos), F21 (títulos, mínimos y reglas).
- Código:
  - `src/domain/records.ts:185`: `gameDay(gameStartTimestamp)`, la **única** definición del día de juego (F17). Reutilízala; no calcules el día de otra forma.
  - `src/domain/records.ts` y `src/domain/stats.ts` (`PLACEMENTS`): estilo de función pura; solo cuentan los puestos 1..6.
  - `src/lib/config.ts:32`: `RECORD_DAY_MIN_GAMES = 3`.
  - `src/db/schema.ts:98`: `participants` (`matchId`, `puuid`, `playerSubteamId`: mismo valor en la misma partida = mismo equipo; `placement`; `totalDamageDealtToChampions`).

## Prompt / instrucciones para worker <!-- MUST -->

1. Entrada: filas de partidas **solo de miembros**, cada una con `puuid` del miembro, `matchId`, `gameStartTimestamp`, `gameCreation`, `playerSubteamId`, `placement` y `totalDamageDealtToChampions`. Define el tipo. La consulta que las da es de T04: aquí solo el dominio.
2. **Semana de juego**: va del lunes a las 06:00 al lunes siguiente a las 06:00, hora de Madrid (F20). Constrúyela sobre `gameDay`. Tests en el límite (lunes 05:59 → semana anterior; lunes 06:00 → semana nueva) y en las semanas del 2026-03-29 y del 2026-10-25 (cambio de hora).
3. **Periodo mostrado**: dado `now`, el periodo actual (día o semana); si ningún miembro tiene partidas en él, el último día (o semana) con partidas de algún miembro. Devuelve el periodo, su etiqueta de fecha y si es el actual.
4. **Ranking del periodo**: miembros con al menos el mínimo (día: `RECORD_DAY_MIN_GAMES`; semana: constante nueva de 5 en `config.ts`), ordenados por puesto medio ascendente, con partidas, nº de 1º y puesto medio; los empates de puesto medio comparten posición (1, 1, 3). Los que no llegan, aparte como "sin mínimo".
5. **Equipos**: un **trío** son tres miembros en el mismo equipo (misma `matchId` y `playerSubteamId`). Un **dúo** son dos miembros en el mismo equipo, sea el tercero miembro o no; un trío de miembros aporta sus tres dúos. Por equipo: partidas, 1º, puesto medio. Una función reutilizable para cualquier conjunto de filas (T03 la usa para la temporada).
6. **Títulos** (tabla de la spec): El trol (peor puesto medio), El pacifista (menos daño medio a campeones por partida), El D-d-d-diablo (más daño medio a campeones por partida), Equipo roto (trío con más 1º juntos; desempata el mejor puesto medio), Equipo mental boom (trío con peor puesto medio), Pareja rota y Pareja mental boom (lo mismo con dúos). Mínimo de 3 partidas juntos en el periodo para dúos y tríos (constante en `config.ts`). Un título solo se otorga si hay **al menos 2 clasificados** de su tipo. Empates: el título se comparte (varios poseedores). Aplica la regla literal de la spec: no añadas condiciones extra (por ejemplo, exigir algún 1º para "Equipo roto"); documenta en tests lo que ocurre si todos los tríos tienen 0 primeros y si el mismo equipo resulta ser "roto" y "mental boom" a la vez.
7. Cada título otorgado lleva los datos para explicarlo: título con su periodo en el nombre visible ("El trol del día", "El trol de la semana"), poseedores (puuids), métrica, valor y partidas, y un texto corto de "por qué" (por ejemplo, "Peor puesto medio del día: 4,6 en 5 partidas"). Usa `formatDecimal` de `@/lib/format`.
8. Tests (`*.test.ts` junto al módulo) con partidas sintéticas: todos los casos de AC4 (empate que comparte, un solo clasificado → no se otorga, justo en el mínimo y uno por debajo, desempate de roto por puesto medio, trío con un externo → no es trío pero sí genera su dúo, dúo dentro de un trío), los de AC2 y AC3, y el periodo vacío.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Semana de juego sobre `gameDay`, con tests de lunes 05:59/06:00 y de las semanas con cambio de hora (AC2).
- [x] Periodo mostrado con el fallback al último día o semana con partidas, con test (AC2).
- [x] Ranking con mínimos, empates que comparten posición y "sin mínimo" aparte, con tests (AC3).
- [x] Los 7 títulos con sus métricas, mínimos, "al menos 2 clasificados" y empates compartidos; tests de cada caso de AC4.
- [x] Cada título trae métrica, valor, partidas y texto de "por qué" (AC5, parte de datos).
- [x] Constantes nuevas en `config.ts`.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `src/domain/group-titles.ts` (+ 42 tests en `group-titles.test.ts`): `gameWeek` sobre `gameDay` (lunes del día de juego), `gameDayStart`, `periodOf`, `displayedPeriod` (fallback al último día/semana con partidas no posterior al actual, con `label` e `isCurrent`), `computePlayerStats`, `rankPlayers` (posición compartida 1,1,3; "sin mínimo" aparte), `computeTeams` (dúos de cada par de miembros del mismo `matchId`+`playerSubteamId`; trío si son 3), `TITLE_DEFINITIONS`, `TITLE_RULES`, `awardTitles` (mínimos, ≥2 clasificados, empates compartidos, desempate de rotos por puesto medio), `titlesOf` (títulos por puuid, dúo/trío a cada miembro), `computeGroupPeriod`.
- Tests de AC2 (lunes 05:59/06:00, semanas del 2026-03-29 y 2026-10-25 con barrido cada 15 min), AC3 y todos los casos de AC4; regla literal documentada (tríos con 0 primeros, mismo trío roto y mental boom).
- `config.ts`: `GROUP_WEEK_MIN_GAMES = 5`, `GROUP_TEAM_MIN_GAMES = 3`.
- Decisión del orquestador: el "por qué" usa `formatAvgPlacement` (2 decimales, como el resto de la app) para que coincida con las tablas (AC5); el "4,6" de la spec es ejemplo.
- Orquestador: `npm run lint && npm run typecheck && npm test && npm run build` en verde (52 ficheros, 1159 tests).
