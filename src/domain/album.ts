// Dominio del álbum: estado de cada campeón para el jugador, forma reciente y última partida.
// Funciones puras (sin BD ni red) sobre las filas de `getPlayerRows`. El estado "manual" y el
// objetivo son capa de navegador (brief §4.4) y no entran aquí: solo hay estados de dominio.
// El `import type` se borra al compilar: este módulo no arrastra `server-only` al cliente.

import type { ChampionCatalog } from "@/lib/ddragon";
import { computeHeat, type HeatResult, type HeatState } from "./heat";
import { PLACEMENTS, type PlayerMatchRow } from "./stats";

/** `won`: algún 1º (campeón verificado); `played`: partidas pero ningún 1º; `none`: sin partidas. */
export type AlbumState = "won" | "played" | "none";

export interface AlbumEntry {
  championId: number;
  /** `id` de Data Dragon; `null` si el campeón no está en el catálogo. */
  ddId: string | null;
  /** Nombre de Data Dragon (`es_ES`) o, sin catálogo, el `championName` de la partida. */
  name: string;
  portraitUrl: string | null;
  state: AlbumState;
  games: number;
  /** Partidas en 1º puesto (`placement === 1`). */
  firsts: number;
  /** Partidas con `placement <= 3`. */
  top3: number;
  /** Mejor puesto conseguido; `null` sin partidas. */
  bestPlacement: number | null;
  /** Puesto medio; `null` sin partidas. */
  avgPlacement: number | null;
  /** Epoch en ms de la última partida con el campeón; `null` sin partidas. */
  lastPlayedAt: number | null;
  /** Epoch en ms del **primer** 1º (el que lo verifica); `null` si no ha ganado. */
  firstWinAt: number | null;
  firstWinMatchId: string | null;
  /**
   * Frío/calor (F16, `computeHeat`): `hot` 🔥 "Modo diablo", `cold` ❄️ "Nevera", `neutral` sin
   * marca (también sin partidas o con algún 1º).
   */
  heat: HeatState;
  /** Media ajustada que decide el frío/calor; `null` sin partidas. Da el orden «Frío/calor». */
  heatAdjustedAvg: number | null;
}

// Mismo criterio que `computeSummary`: solo cuentan los puestos 1..6 de Arena tríos.
const isPlacement = (value: number) =>
  (PLACEMENTS as readonly number[]).includes(value);

// Orden cronológico total y determinista (`gameCreation`, después `matchId`), como en `stats.ts`.
export const compareTime = (
  a: Pick<PlayerMatchRow, "gameCreation" | "matchId">,
  b: Pick<PlayerMatchRow, "gameCreation" | "matchId">,
) => a.gameCreation - b.gameCreation || a.matchId.localeCompare(b.matchId);

/**
 * Slug del campeón en la URL (`?campeon=`): el `id` de Data Dragon en minúsculas (`ahri`,
 * `monkeyking`…) o, si el campeón no está en el catálogo, su nombre en minúsculas. Vive aquí, no
 * en la vista del panel, porque los destacados del Resumen (`summary.ts`) también lo necesitan.
 */
export function championSlug(entry: Pick<AlbumEntry, "ddId" | "name">): string {
  return (entry.ddId ?? entry.name).toLowerCase();
}

interface Acc {
  games: number;
  firsts: number;
  top3: number;
  best: number;
  placementSum: number;
  /** Fila más reciente: da `lastPlayedAt` y el nombre vigente del campeón. */
  last: PlayerMatchRow;
  firstWin: PlayerMatchRow | null;
}

/**
 * Una entrada por campeón del catálogo más una por cada `championId` jugado que no esté en él
 * (con `championName` como nombre, sin `ddId` ni retrato). Con el catálogo vacío (Data Dragon
 * caído) solo salen los campeones jugados. Orden: por `name` (`localeCompare("es")`).
 *
 * Invariante: las entradas `won` son exactamente `verifiedChampions(rows)`.
 *
 * `heat` es el frío/calor ya calculado sobre las mismas `rows` (quien también lo necesite, como
 * el panel de campeón, lo calcula una vez y lo pasa); sin él se calcula aquí.
 */
export function buildAlbum(
  catalog: ChampionCatalog,
  rows: readonly PlayerMatchRow[],
  heat: HeatResult = computeHeat(rows),
): AlbumEntry[] {
  const byChampion = new Map<number, Acc>();
  for (const row of rows) {
    if (!isPlacement(row.placement)) continue;
    const acc = byChampion.get(row.championId);
    if (!acc) {
      byChampion.set(row.championId, {
        games: 1,
        firsts: row.placement === 1 ? 1 : 0,
        top3: row.placement <= 3 ? 1 : 0,
        best: row.placement,
        placementSum: row.placement,
        last: row,
        firstWin: row.placement === 1 ? row : null,
      });
      continue;
    }
    acc.games += 1;
    acc.placementSum += row.placement;
    acc.best = Math.min(acc.best, row.placement);
    if (row.placement <= 3) acc.top3 += 1;
    if (compareTime(row, acc.last) > 0) acc.last = row;
    if (row.placement === 1) {
      acc.firsts += 1;
      if (!acc.firstWin || compareTime(row, acc.firstWin) < 0) {
        acc.firstWin = row;
      }
    }
  }

  const entry = (
    championId: number,
    identity: Pick<AlbumEntry, "ddId" | "name" | "portraitUrl">,
    acc: Acc | undefined,
  ): AlbumEntry => ({
    championId,
    ...identity,
    state: !acc ? "none" : acc.firsts > 0 ? "won" : "played",
    games: acc?.games ?? 0,
    firsts: acc?.firsts ?? 0,
    top3: acc?.top3 ?? 0,
    bestPlacement: acc?.best ?? null,
    avgPlacement: acc ? acc.placementSum / acc.games : null,
    lastPlayedAt: acc?.last.gameCreation ?? null,
    firstWinAt: acc?.firstWin?.gameCreation ?? null,
    firstWinMatchId: acc?.firstWin?.matchId ?? null,
    heat: heat.byChampion.get(championId)?.state ?? "neutral",
    heatAdjustedAvg: heat.byChampion.get(championId)?.adjustedAvg ?? null,
  });

  const album: AlbumEntry[] = [];
  for (const champion of catalog.champions) {
    const { championId, ddId, name, portraitUrl } = champion;
    album.push(
      entry(
        championId,
        { ddId, name, portraitUrl },
        byChampion.get(championId),
      ),
    );
    // Lo que queda en `byChampion` al final son los jugados que no están en el catálogo.
    byChampion.delete(championId);
  }
  for (const [championId, acc] of byChampion) {
    album.push(
      entry(
        championId,
        { ddId: null, name: acc.last.championName, portraitUrl: null },
        acc,
      ),
    );
  }
  return album.sort(
    (a, b) => a.name.localeCompare(b.name, "es") || a.championId - b.championId,
  );
}

export interface RecentGame {
  matchId: string;
  placement: number;
  championId: number;
  championName: string;
  /** Epoch en ms. */
  gameCreation: number;
}

/** Forma reciente: las últimas `n` partidas (20 por defecto), la más reciente primero. */
export function recentForm(
  rows: readonly PlayerMatchRow[],
  n = 20,
): RecentGame[] {
  return [...rows]
    .sort((a, b) => compareTime(b, a))
    .slice(0, Math.max(0, n))
    .map(({ matchId, placement, championId, championName, gameCreation }) => ({
      matchId,
      placement,
      championId,
      championName,
      gameCreation,
    }));
}

/** `gameCreation` (epoch en ms) de la última partida; `null` sin partidas. */
export function lastGameAt(rows: readonly PlayerMatchRow[]): number | null {
  let last: number | null = null;
  for (const { gameCreation } of rows) {
    if (last === null || gameCreation > last) last = gameCreation;
  }
  return last;
}
