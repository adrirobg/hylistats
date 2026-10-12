# Task T05 — El grupo hoy y títulos por compañero (datos y vista-modelo)

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: instancia derivada de `spec.md` (sección "Revisión v4"). Su núcleo es `Contexto` + `Prompt` + criterios.

## Objetivo <!-- MUST -->

Los datos puros que necesita la cabecera v4: la actividad **de hoy (estricto)** de cada miembro en la `GroupView`, las filas de **El grupo hoy** (Clasificación + hoy) y las filas de **títulos agrupadas por compañero** con texto corto por periodo. Sin React.

## Contexto <!-- SHOULD -->

- spec.md → "Revisión v4": D2, D3, D5; AC15, AC16, AC17, AC19. Maqueta `.dev/research/cabecera/propuestas-v4.html` (objetos `GROUP` y `TITLES` del `<script>`: forma y textos objetivo).
- `src/domain/group-view.ts` → `loadGroupView` (~205): ya tiene `rows` (filas de temporada de los miembros con `puuid` = clave de miembro, `gameStartTimestamp`, `championId`, `championName`, `placement`, `matchId`) y `now`. `GroupView` (~112) está memoizada (`group-view-memo.ts`).
- Periodos en `src/domain/group-titles.ts`: `periodKey(kind, ts)`, `periodOf`, `rowsInPeriod`, `displayedPeriod` (este **cae al último día con partidas**: aquí NO vale, D3 pide hoy estricto: usa `periodKey("day", now)`). `isPlacement`, `formatAvgPlacement`.
- `src/app/euw/[slug]/vitrina-view.ts`: `titleRows`/`TitleRow`/`TitlePeriodLine`, `titleLineText`, `titleCounts`, `ladderRows`/`LadderRow`, `eloFacts`, `profileVitrina`/`VitrinaGroup`. `TitleHolder` (group-titles ~543) tiene `value`, `games`, `firsts`, `avgPlacement`, `avgDamage`, `why`; `AwardedTitle.metric`.
- `GroupViewMember` tiene `key`, `gameName`, `slug`, `profileIconUrl`.
- Retratos de campeón: busca el helper que ya usa el álbum (URLs `https://ddragon.leagueoflegends.com/cdn/<versión>/img/champion/<ddId>.png`, `src/lib/ddragon.ts` / `album*.ts`) y reutilízalo; el `ddId` sale del `ChampionCatalog`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Dominio — hoy estricto** (módulo nuevo, p. ej. `src/domain/group-today.ts` + test; no hagas crecer `group-titles.ts`):
   `computeGroupToday(rows, memberKeys, now): GroupToday` con `GroupToday = { dayKey: string; games: number /* partidas distintas del día (por matchId) */; members: Map<string, MemberToday> | Record<...> }` y `MemberToday = { games, firsts, avgPlacement: number | null, last: { matchId, championId, championName, placement }[] /* hasta 5, más reciente primero por gameStartTimestamp */ }`. Solo filas con `isPlacement` y `periodKey("day", row.gameStartTimestamp) === periodKey("day", now)`. Miembros sin partidas hoy: `games 0`, `firsts 0`, `avgPlacement null`, `last []`.
   Añade `today: GroupToday` a `GroupView` y calcúlalo en `loadGroupView` con los mismos `rows` y `now` (sin consultas nuevas). Ajusta los fixtures/tests que construyan `GroupView` a mano.
2. **Vista-modelo — El grupo hoy** (en `vitrina-view.ts`): `groupTodayRows(view, ownerKey, catalog): GroupTodayRow[]`, en el orden de `elo.standings` (como `ladderRows`, que puede desaparecer si nadie más la usa): `position`, `name`, `slug`, `leagueId`, `rating`, `provisional`, `dayChange`, `me`, y de hoy `games`, `firsts`, `avgPlacement: string | null` (`formatAvgPlacement`), `last: { championName, portraitUrl, placement }[]`. Y `todayGames` (total del día) para la cabecera. `VitrinaGroup` pasa a `{ titles, today: GroupTodayRow[], todayGames: number, facts }`.
3. **Vista-modelo — títulos por compañero**: cambia `TitleRow` a `{ id, name, tone, metric: string /* "más 1º juntos", "peor puesto medio juntos", "peor puesto medio", "menos daño medio", "más daño medio" — corto, en minúscula */, lines: TitleMateLine[] }` con `TitleMateLine = { mates: { name, slug, iconUrl }[] /* vacío en individuales */, periods: { kind: "day" | "week"; text: string }[] /* día antes que semana */ }`. Agrupa los poseedores del dueño por el conjunto de compañeros: el mismo dúo hoy y en la semana es **una** línea con dos periodos. Orden de líneas: el de aparición (día primero). Texto corto según `metric` del título, con los números del `TitleHolder`: más 1º → `"2 primeros en 6 · 2,33"` (`"1 primero"` en singular); peor/mejor puesto medio → `"media 4,70 en 10"`; daño → `"12.346 de daño en 5"` (usa `formatAvgDamage`). Las partidas con `formatCount`. Mantén `why` completo en el periodo (`why: string`) para el `title` del elemento. Borra `titleCounts` y `titleLineText` si quedan sin uso (la UI de T06 dejará de usarlos; si `title-list.tsx` aún los importa, déjalos y dilo).
4. Tests (vitest): hoy estricto con partidas solo ayer (todo a 0 / `null`), con partidas hoy y ayer (solo cuentan las de hoy), `last` limitado a 5 y en orden, total de partidas distintas con dos miembros en la misma partida; `groupTodayRows` en orden de Clasificación con empates y el dueño marcado; títulos: un dúo con día y semana → una línea con dos periodos; empate con dos dúos → dos líneas; trío → dos chips; individual → sin chips; textos cortos de cada métrica y singular. Caso real: Hylimichi (maqueta v4, `TITLES`).

Reglas comunes:
- Next.js 16: antes de escribir código de Next lee la guía en `node_modules/next/dist/docs/` (aquí casi todo es TS puro).
- Sin dependencias nuevas. Textos en español; comentarios con la densidad y el tono del código vecino.
- No hagas crecer `src/app/euw/[slug]/data.ts` ni `src/domain/group-titles.ts` más que el cableado mínimo.
- Si algo de la spec no encaja con el código, **para y descríbelo** en el informe.
- No toques los `.tsx` de la cabecera (`vitrina.tsx`, `title-list.tsx`, `group-ladder.tsx`, `league-trophy.tsx`, `page.tsx`, `sync-band.tsx`): son de T06. Si el typecheck falla en ellos por tus cambios de tipos, haz el mínimo para que compile (o dilo) y descríbelo.
- Al terminar: `npm run lint && npm run typecheck && npm test` en verde. Sin commit.

## Criterios de aceptacion <!-- MUST -->

- [ ] `GroupView.today` con hoy estricto y tests.
- [ ] `groupTodayRows` + `todayGames` en `VitrinaGroup`.
- [ ] `TitleRow` por compañero con `metric` y textos cortos; tests de los casos listados.
- [ ] `npm run lint && npm run typecheck && npm test` en verde.
