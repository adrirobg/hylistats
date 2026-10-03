# Task T01 — Vista-modelo de la vitrina (títulos, escalera, liga, splash)

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un módulo puro `src/app/euw/[slug]/vitrina-view.ts` (con `vitrina-view.test.ts`) que convierte los datos que ya existen en lo que pinta la vitrina: filas de títulos agrupadas, escalera del grupo, datos del trofeo de Liga y URL del splash. Sin React, sin BD, sin navegador.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Títulos", "Escalera del grupo", "Liga del grupo", "Fondo"; inferencias I4, I5, I7, I8; AC2, AC3, AC5, AC6, AC11.
- Tipos de entrada (no se cambian):
  - `PlayerTitle` / `AwardedTitle` / `TitleHolder` / `TITLE_DEFINITIONS` / `TitleId` en `src/domain/group-titles.ts` (`AwardedTitle` ~558, `TitleHolder` ~543, `PlayerTitle` ~688, `TITLE_DEFINITIONS` ~429). `title.kind` es `"day" | "week"`; `holder.puuids` son claves de miembro (`memberKey`), `holder.why` el texto.
  - `GroupView.members: GroupViewMember[]` (`src/domain/group-view.ts:85`: `key`, `gameName`, `slug`) y `GroupView.elo: GroupElo` (`src/domain/elo.ts:160`: `standings: EloStanding[]` con `key`, `position`, `roundedRating`, `league`, `provisional`, `dayChange`).
  - `ProfileElo` (`src/domain/group-view.ts:281`) y `ELO_LEAGUES` (`src/lib/config.ts:138`: hierro, bronce 1450, plata 1480, oro 1510, platino 1540, diamante 1570).
  - `VerifiedChampion` (`src/domain/stats.ts:74`: `championId`, `lastWinAt`) y `ChampionCatalog`/`Champion` (`src/lib/ddragon.ts:29`: `champions[].championId`, `ddId`). La URL base de Data Dragon es `https://ddragon.leagueoflegends.com` (`DDRAGON_URL`, no exportada: expórtala o crea un helper `championSplashUrl(ddId)` en `ddragon.ts` junto a los otros de URLs, con test).
  - El vigente `title-badges.ts` (36 líneas) y su test: los sustituye este módulo para la cabecera. Bórralos si nadie más los usa (`grep -rn title-badges src`), y deja `TITLES_LINK` (`?tab=grupo#titulos`) en el módulo nuevo.
- Patrón de módulo puro + test: `src/app/euw/[slug]/rating-view.ts` y `rating-view.test.ts`.

## Prompt / instrucciones para worker <!-- MUST -->

Implementa y testea estas funciones (nombres orientativos; tipos exportados):

1. `titleRows(titles: readonly PlayerTitle[], ownerKey: string, members: readonly GroupViewMember[]): TitleRow[]`
   - Una fila por `title.id`, en el orden de `TITLE_DEFINITIONS`. Campos: `id`, `name` (el de la definición, **sin periodo**: "Equipo mental boom"), `tone: "honor" | "shame"` (honor: `devil`, `brokenTrio`, `brokenDuo`; vergüenza: `troll`, `pacifist`, `boomTrio`, `boomDuo`), `day: TitlePeriodLine | null`, `week: TitlePeriodLine | null`.
   - `TitlePeriodLine`: `why` (el `holder.why`) y `partners: string[]` = `gameName` de los otros miembros del `holder` (sin `ownerKey`), en el orden de `members`. Vacío en los individuales.
   - Empate (el mismo título y periodo con dos holders del dueño, p. ej. dos dúos): una sola fila; en ese periodo guarda todos (`lines: TitlePeriodLine[]` en vez de una; elige la forma más simple y documéntala).
   - `titleCounts(rows)` → `{ honor, shame }`.
2. `ladderRows(elo: GroupElo, members: readonly GroupViewMember[], ownerKey: string): LadderRow[]` — todos los `standings` en su orden: `position`, `name` (`gameName`), `slug`, `leagueId`, `rating` (`roundedRating`), `dayChange` (o `null`), `provisional`, `me`.
3. `eloFacts(standings, ownerKey)` → `{ position, total, above: { name, diff } | null, leadBy: number | null, nextLeague: { name, diff } | null }`.
   - `above`: el miembro con el menor `roundedRating` estrictamente mayor que el propio (con varios iguales, el primero en `standings`); `diff` en puntos redondeados. Si nadie está por encima: `above = null` y `leadBy` = propio − siguiente mayor ≤ propio de otro miembro (0 si empata; `null` si es el único).
   - `nextLeague`: la primera de `ELO_LEAGUES` con `min` > rating propio redondeado; `null` en Diamante.
4. `splashChampion(verified: readonly VerifiedChampion[], catalog: ChampionCatalog): { name: string; splashUrl: string } | null` — el de mayor `lastWinAt` (empate: mayor `championId`, determinista); `null` sin verificados o si el campeón no está en el catálogo. URL `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{ddId}_0.jpg` (sin versión).
5. `deltaText(n)` para los chips: `+12`, `−7` (signo menos tipográfico U+2212, como `formatEloChange` en `src/domain/elo.ts:294`: reutilízalo si encaja) y `0`.

Tests (vitest) que cubran, como mínimo: título solo de día, solo de semana y de ambos; dúo y trío con compañeros (y el dueño excluido); empate con dos dúos; orden de `TITLE_DEFINITIONS`; tonos; escalera con empates de posición y fila propia; `above` con empate en el de arriba; líder (`leadBy`) y miembro único; siguiente liga en cada tramo y `null` en Diamante; `splashChampion` sin verificados, con varios y con campeón fuera del catálogo. Usa como caso los datos reales de Hylimichi del 2026-10-03 (4 títulos × día y semana → 4 filas; textos en `.dev/research/cabecera/propuestas.html`, objeto `PROFILES.hyli`).

Reglas comunes (todas las tasks de código):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de Next lee la guía correspondiente en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas. Textos de UI en español; comentarios con la densidad y el tono del código que tocas (mira los módulos `*-view.ts` vecinos).
- No hagas crecer `src/app/euw/[slug]/data.ts` ni `src/domain/group-titles.ts`: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Otra task (T02) trabaja en paralelo en el mismo árbol sobre `arena-god*` y `god-trophy*`: no toques esos archivos; si un fallo de lint/tests viene de ellos, dilo en el informe en vez de arreglarlo.
- Al terminar: `npm run lint && npm run typecheck && npm test` en verde (el `build` lo corre T03). No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] `vitrina-view.ts` con `titleRows`, `titleCounts`, `ladderRows`, `eloFacts`, `splashChampion` (+ helper de URL) y tipos exportados.
- [ ] Tests de todos los casos listados; Hylimichi → 4 filas (2 honor, 2 vergüenza).
- [ ] `title-badges.ts` retirado o justificado en el informe.
- [ ] `npm run lint && npm run typecheck && npm test` en verde.

## Evidencias <!-- MUST -->

