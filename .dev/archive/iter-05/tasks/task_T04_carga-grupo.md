# Task T04 — Carga de datos de la vista del grupo

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un módulo de carga propio que, con una sola función, devuelve todo lo que pinta la vista del grupo (periodo, ranking, títulos, equipos y temporada) y otra función ligera que devuelve los títulos vigentes de un perfil para su cabecera.

## Contexto <!-- SHOULD -->

- spec.md: Entregables 4 y 7; Riesgos ("`data.ts` ya tiene 679 líneas"); **AC1** (elruffles no cuenta), **AC6** y **AC9** (mismos datos en los dos sitios).
- Código:
  - Consultas de miembros de T01; dominio de T02 y T03.
  - `src/domain/queries.ts:30` (`getPlayerRows`) y `:62` (`getRecordRows`): filtro de temporada (`seasonStart`) y colas `ARENA_QUEUE_IDS`. Usa el mismo filtro.
  - `src/app/euw/[slug]/data.ts:487` (`loadProfilePage`): de dónde saca hoy el perfil `seasonStart`, `challengeValue` y el total de campeones (datos estáticos) para `arenaGodGoal`. **No añadas código a `data.ts`** salvo la llamada mínima para los badges (T08).

## Prompt / instrucciones para worker <!-- MUST -->

1. Consulta nueva de filas del grupo: partidas de la temporada y colas Arena **solo de los miembros** (con los campos del tipo de entrada de T02), en una sola consulta.
2. Módulo de carga nuevo (fuera de `src/app/euw/[slug]/data.ts`), por ejemplo en `src/app/grupo/` o `src/domain/`, con:
   - `loadGroupView(db, now)`: miembros (Riot ID, slug del perfil, icono y `lastSyncedAt`), periodo mostrado de día y de semana, con su ranking y sus títulos, equipos de temporada, tabla de Temporada (con `challengeValue` y total de campeones, como el perfil) y la sincronización más antigua.
   - `loadProfileTitles(db, profileId, now)`: los títulos vigentes de ese perfil (los del periodo mostrado de día y de semana), o lista vacía si no es miembro. Reutiliza el mismo cálculo que `loadGroupView`; no dupliques reglas.
3. Tests de integración con la BD de test: un no miembro (como elruffles) no aparece en ninguna cifra; `loadProfileTitles` coincide con los títulos de `loadGroupView` para ese perfil.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Consulta de filas del grupo solo de miembros, con el filtro de temporada y colas de siempre (AC1).
- [x] `loadGroupView` y `loadProfileTitles` en un módulo propio; `data.ts` no crece (Riesgos).
- [x] Test: un no miembro no aparece en ninguna cifra (AC1).
- [x] Test: los títulos de `loadProfileTitles` son exactamente los de `loadGroupView` para ese perfil (AC6, AC9).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `getGroupRows` en `src/domain/queries.ts`: una consulta, `participants.puuid IN (miembros)`, mismas colas (`ARENA_QUEUE_IDS`) y filtro de temporada que `getPlayerRows`/`getRecordRows`.
- `src/domain/group-view.ts`: `loadGroupView(db, now, seasonStart?, catalog?)` y `loadProfileTitles(db, profileId, now, seasonStart?)`, ambas sobre la misma `groupPeriods` + `loadMemberRows`. El `puuid` se sustituye por `memberKey(profileId)` antes de calcular: no sale del módulo. `data.ts` sin tocar.
- `src/domain/group-view.test.ts` (11 tests, BD de test): no miembro (elruffles) en las mismas partidas no aparece en ninguna cifra (AC1); `loadProfileTitles` = `titlesOf(day)+titlesOf(week)` de `loadGroupView` para cada miembro, con dúo/trío en cada miembro (AC6/AC9); no miembro → []; sin puuids en el JSON.
- Orquestador: `npm run lint && npm run typecheck && npm test && npm run build` en verde (54 ficheros, 1197 tests).
