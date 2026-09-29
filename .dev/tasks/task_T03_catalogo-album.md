# Task T03 — Catálogo de campeones (Data Dragon) y dominio del álbum

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Dos módulos probados, sin UI:

1. `src/lib/ddragon.ts` (server-only): catálogo de todos los campeones desde Data Dragon, con caché de Next.
2. `src/domain/album.ts` (puro): estado de cada campeón del catálogo para el jugador, forma de las últimas 20 partidas y fecha de la última partida.

La página de perfil (T06, T08, T10) los consume.

## Contexto <!-- SHOULD -->

- spec.md: Entregable 3 y "Decisiones técnicas → Data Dragon".
- Brief §4.4, tabla de estados del cromo: *ganado · verificado*, *jugado sin ganar* ("×4 · mejor 2º") y *sin jugar*. El estado *manual* y el objetivo son capa de navegador (T04/T09): **no** entran en este dominio. Brief §4.7: forma de 20 con el puesto.
- `.claude/skills/riot-api/SKILL.md` y `.dev/research/riot-api.md` §9.1:
  - `https://ddragon.leagueoflegends.com/api/versions.json`: el primero es el último.
  - `…/cdn/{ver}/data/es_ES/champion.json`: `data[id]` con `key` (string numérico), `id`, `name` e `image.full`.
  - Retrato: `…/cdn/{ver}/img/champion/{image.full}`.
  - **Mapear por `Number(key)` = `championId`**, nunca por nombre (`FiddleSticks` ≠ `Fiddlesticks`). Hoy hay 173 campeones.
- Tipos existentes en `src/domain/stats.ts`:
  - `PlayerMatchRow { matchId, gameCreation, championId, championName, placement, playerSubteamId }`.
  - `PLACEMENTS` y `Placement`.
  - `verifiedChampions(rows)` → `VerifiedChampion { championId, championName, firsts, firstWinMatchId, firstWinAt, lastWinMatchId, lastWinAt }`.
  - `computeSummary(rows)` → `StatsSummary`.
  - Filas en orden cronológico ascendente (`getPlayerRows` en `src/domain/queries.ts`).
- `next.config.ts` ya tiene `images: { unoptimized: true }`.
- Next 16: lee `node_modules/next/dist/docs/` sobre caché de `fetch` y datos en servidor (`next: { revalidate }`, `"use cache"`, lo que aplique a 16.3.7 sin activar flags nuevos) antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

Tests sin red: inyecta el `fetch` y usa datos inline mínimos en el test. No toques `tests/fixtures/`.

1. **`src/lib/ddragon.ts`** (`import "server-only"`):
   - Tipos: `Champion { championId: number; ddId: string; name: string; portraitUrl: string | null }` y `ChampionCatalog { version: string | null; champions: Champion[] }`, este último ordenado por `name` con `localeCompare("es")`.
   - `parseChampionJson(json, version)`: puro, valida con Zod lo mínimo (`data` con `key`, `id`, `name`, `image.full`) y construye el catálogo con `portraitUrl`. Ignora entradas inválidas en lugar de fallar entero.
   - `loadChampionCatalog(fetchImpl = fetch)`: pide `versions.json` y `champion.json` (`es_ES`) con caché de 24 h según el mecanismo de Next 16 que encuentres en los docs, y un timeout razonable (`AbortSignal.timeout`). Ante cualquier error (red, JSON inválido) devuelve `{ version: null, champions: [] }` y registra un `console.warn` sin datos sensibles. **Nunca lanza.**
   - `getChampionCatalog()`: la versión cacheada para las páginas.
2. **`src/domain/album.ts`** (puro, sin BD ni red):
   - `AlbumEntry { championId; ddId: string | null; name; portraitUrl: string | null; state: "won" | "played" | "none"; games; firsts; top3; bestPlacement: number | null; avgPlacement: number | null; lastPlayedAt: number | null; firstWinAt: number | null; firstWinMatchId: string | null }`.
   - `buildAlbum(catalog: ChampionCatalog, rows: readonly PlayerMatchRow[]): AlbumEntry[]`:
     - Una entrada por campeón del catálogo, más una por cada `championId` jugado que no esté en el catálogo (con `championName` como `name`, `ddId: null` y `portraitUrl: null`).
     - Estados: `won` si tiene algún `placement === 1`; `played` si tiene partidas sin 1º; `none` si no tiene partidas.
     - Ignora filas con puesto fuera de 1..6, igual que `computeSummary`.
     - `firstWinAt` y `firstWinMatchId` son los del **primer** 1º, el que lo verifica.
     - Orden por `name` (`localeCompare("es")`).
     - Con el catálogo vacío (Data Dragon caído), el álbum contiene solo los campeones jugados.
   - `recentForm(rows, n = 20)`: últimas `n` partidas, la más reciente primero, como `{ matchId, placement, championId, championName, gameCreation }`.
   - `lastGameAt(rows)`: `gameCreation` de la última partida, o `null`.
   - Invariante: el nº de entradas `won` coincide con `verifiedChampions(rows).length`. Pruébalo.
3. **Tests** (`src/lib/ddragon.test.ts` y `src/domain/album.test.ts`):
   - Parseo con `key` numérico en string.
   - Fiddlesticks (`id` `Fiddlesticks`, `key` "9") casado con `championName` `FiddleSticks` por id.
   - Entrada inválida ignorada.
   - Error de red o JSON inválido → catálogo vacío sin lanzar.
   - Estados `won`, `played` y `none`; `bestPlacement`, `top3`, `avgPlacement` y `firsts`.
   - Campeón jugado ausente del catálogo.
   - Catálogo vacío.
   - `recentForm` con más y menos de 20 partidas.
   - Invariante con `verifiedChampions`.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `loadChampionCatalog` nunca lanza, cachea 24 h y mapea por `key` numérico.
- [ ] `buildAlbum` cubre catálogo + jugados sin catálogo con los 3 estados de dominio; invariante `won` = `verifiedChampions.length` probado.
- [ ] `recentForm` y `lastGameAt` probados.
- [ ] Tests sin red; los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
