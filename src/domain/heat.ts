// Dominio del frío/calor por campeón (F16): función pura (sin BD, sin red y sin React) sobre las
// filas del jugador en la temporada y cola activas. Solo cuentan los puestos 1..6 (mismo criterio
// que `computeSummary`): una fila con un puesto fuera de rango se ignora en todas las cifras.
// Un puesto menor es mejor: 🔥 "modo diablo" = puesto ajustado mejor que la media global;
// ❄️ "Nevera" = peor.

import { HEAT_MIN_GAMES, HEAT_PRIOR_GAMES, HEAT_THRESHOLD } from "@/lib/config";
import { PLACEMENTS, type PlayerMatchRow } from "./stats";

export type HeatState = "hot" | "cold" | "neutral";

/** Por qué un campeón es `neutral` (`null` si tiene marca). */
export type HeatReason = "won" | "few-games" | "within" | null;

export interface ChampionHeat {
  state: HeatState;
  /** Partidas del campeón con puesto 1..6. */
  games: number;
  /** Puesto medio del campeón. */
  avg: number;
  /** Media ajustada hacia la global: `(n·avg + K·globalAvg) / (n + K)`. */
  adjustedAvg: number;
  /**
   * Motivo del estado neutro: `won` (algún 1º en la temporada), `few-games` (menos de
   * `HEAT_MIN_GAMES`) o `within` (dentro del umbral). `null` si es `hot` o `cold`. Si se dan
   * `won` y `few-games` a la vez, sale `won`.
   */
  reason: HeatReason;
}

export interface HeatResult {
  /** Puesto medio de todas las partidas del jugador (también las de campeones ya ganados); `null` sin partidas. */
  globalAvg: number | null;
  /** Todos los campeones jugados, por `championId`. */
  byChampion: Map<number, ChampionHeat>;
}

/** Tolerancia de coma flotante: que una diferencia de "justo 0,4" marque. */
const EPSILON = 1e-9;

const isPlacement = (value: number) =>
  (PLACEMENTS as readonly number[]).includes(value);

interface ChampionAcc {
  games: number;
  placementSum: number;
  firsts: number;
}

/**
 * Clasifica cada campeón jugado como `hot`, `cold` o `neutral` (F16). Solo pueden marcar los
 * campeones sin ningún 1º y con ≥ `HEAT_MIN_GAMES` partidas; la media global usa todas las
 * partidas del jugador, también las de campeones ya ganados.
 */
export function computeHeat(rows: readonly PlayerMatchRow[]): HeatResult {
  const acc = new Map<number, ChampionAcc>();
  let totalGames = 0;
  let totalSum = 0;
  for (const { championId, placement } of rows) {
    if (!isPlacement(placement)) continue;
    totalGames += 1;
    totalSum += placement;
    const champion = acc.get(championId);
    if (champion) {
      champion.games += 1;
      champion.placementSum += placement;
      if (placement === 1) champion.firsts += 1;
    } else {
      acc.set(championId, {
        games: 1,
        placementSum: placement,
        firsts: placement === 1 ? 1 : 0,
      });
    }
  }

  const byChampion = new Map<number, ChampionHeat>();
  if (totalGames === 0) return { globalAvg: null, byChampion };

  const globalAvg = totalSum / totalGames;
  for (const [championId, { games, placementSum, firsts }] of acc) {
    const avg = placementSum / games;
    // `n·avg` es la suma de puestos: se usa directamente para no arrastrar el error de `sum/n·n`.
    const adjustedAvg =
      (placementSum + HEAT_PRIOR_GAMES * globalAvg) /
      (games + HEAT_PRIOR_GAMES);

    let state: HeatState = "neutral";
    let reason: HeatReason;
    if (firsts > 0) {
      reason = "won";
    } else if (games < HEAT_MIN_GAMES) {
      reason = "few-games";
    } else if (globalAvg - adjustedAvg >= HEAT_THRESHOLD - EPSILON) {
      state = "hot";
      reason = null;
    } else if (adjustedAvg - globalAvg >= HEAT_THRESHOLD - EPSILON) {
      state = "cold";
      reason = null;
    } else {
      reason = "within";
    }
    byChampion.set(championId, { state, games, avg, adjustedAvg, reason });
  }
  return { globalAvg, byChampion };
}
