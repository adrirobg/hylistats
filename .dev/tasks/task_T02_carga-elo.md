# Task T02 — Carga del ELO en la vista del grupo y en el perfil

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La vista del grupo (`loadGroupView`) devuelve la Clasificación del ELO, y la carga del perfil obtiene el ELO del miembro (rating, liga, provisional, historial por `matchId` y serie para la gráfica) reutilizando la misma lectura que ya hace para los títulos, sin duplicarla.

## Contexto <!-- SHOULD -->

- spec.md: Entregable 2; Riesgos → "Sin datos nuevos", "Coste de lectura"; última cláusula de **AC1** (temporada y colas) y la parte de datos de **AC3–AC6**.
- Código:
  - `src/domain/group-view.ts:104` `GroupView`; `:125` `groupPeriods`; `:139` `loadMemberRows` (privada: filas de los miembros con `puuid` → clave de miembro); `:189` `loadGroupView`; `:255` `loadProfileTitles`.
  - `src/domain/queries.ts:~105` `getGroupRows`: filtra colas `ARENA_QUEUE_IDS` y `gameCreation >= seasonStart`.
  - `src/app/euw/[slug]/data.ts:536-546`: carga en paralelo de la página del perfil, donde se llama a `loadProfileTitles`; `:247-249` campos `titles` e `isMember` de los datos del perfil.
  - `src/domain/group-view.test.ts`: tests con BD de test (`getTestDb`, `truncateAll`).
  - `src/domain/elo.ts` (T01).

## Prompt / instrucciones para worker <!-- MUST -->

1. Añade `elo` a `GroupView`, calculado con el módulo de T01 sobre las mismas `rows` y el mismo `now` que `groupPeriods`, con `memberKeys` de todos los miembros.
2. Sustituye en la página del perfil la llamada a `loadProfileTitles` por una función de `group-view.ts` (p. ej. `loadProfileGroupData`) que haga **una sola** lectura (`listGroupMembers` + `loadMemberRows`) y devuelva los títulos (mismo resultado que hoy) y el ELO del perfil: `null` si no es miembro. Mantén `loadProfileTitles` solo si algo más la usa.
3. El ELO del perfil lleva: rating (con decimales y redondeado), liga, provisional, partidas, historial indexable por `matchId` (con el desglose de T01) y la serie para la gráfica (`gameStartTimestamp`, `ratingAfter`). Añádelo a los datos del perfil en `data.ts` con el cableado mínimo (un campo); la UI la hacen T03–T06.
4. Tests con BD de test: la Clasificación de `loadGroupView` (miembros sin partidas incluidos), el ELO del perfil de un miembro coincide con su fila de la Clasificación, `null` para un no miembro, y las partidas anteriores a `SEASON_START` o de otras colas no cuentan (AC1, última cláusula). Los títulos del perfil no cambian (los tests existentes siguen en verde).

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; números con `formatDecimal`/`formatCount` de `@/lib/format`; componentes `hy/*` y `ui/*`; textos de UI en español.
- No hagas crecer `src/app/euw/[slug]/data.ts` (716 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] `GroupView.elo` con la Clasificación.
- [x] Una sola lectura en el perfil para títulos y ELO; `null` en no miembros.
- [x] Historial por `matchId` y serie para la gráfica en los datos del perfil.
- [x] Tests de BD, incluida la exclusión de partidas fuera de temporada o de otras colas.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `src/domain/group-view.ts`: `GroupView.elo: GroupElo`; `loadProfileGroupData(db, profileId, now, seasonStart?)` → `{titles, elo: ProfileElo | null}` con una sola lectura (sustituye a `loadProfileTitles`); `profileEloOf` pura; `ProfileElo` serializable (posición, rating, liga, provisional, partidas, `matches` por `matchId`, `series`, periodos y cambios).
- `src/app/euw/[slug]/data.ts`: +4 líneas de cableado (`elo` en los datos del perfil).
- 5 tests nuevos en `group-view.test.ts`, incluida la exclusión de partidas anteriores a `seasonStart` y de otra cola (AC1, última cláusula).
- Aviso para la UI: `league.min` de Hierro es `-Infinity`.
- `npm run lint && npm run typecheck && npm test && npm run build` en verde (1319 tests).

