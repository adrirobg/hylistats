import { describe, expect, it } from "vitest";
import { HEAT_MIN_GAMES, HEAT_PRIOR_GAMES, HEAT_THRESHOLD } from "@/lib/config";
import { type ChampionHeat, computeHeat, type HeatResult } from "./heat";
import type { PlayerMatchRow } from "./stats";

// Filas sintéticas (sin BD ni red). `games(id, [puestos])` crea una partida por puesto.
// Con K = 5 y n = 5 la media ajustada es (media_campeón + media_global) / 2, así que
// "justo ±0,4" equivale a media_campeón = media_global ∓ 0,8.

let counter = 0;
function games(championId: number, placements: number[]): PlayerMatchRow[] {
  return placements.map((placement) => {
    counter += 1;
    return {
      matchId: `EUW1_${counter}`,
      gameCreation: 1_790_000_000_000 + counter * 60_000,
      championId,
      championName: `Champ${championId}`,
      placement,
      playerSubteamId: 1,
    };
  });
}

/** El calor de un campeón; falla si no está (evita `!` en los tests). */
function heatOf(result: HeatResult, championId: number): ChampionHeat {
  const heat = result.byChampion.get(championId);
  if (!heat) throw new Error(`campeón ${championId} ausente`);
  return heat;
}

function globalOf(result: HeatResult): number {
  if (result.globalAvg === null) throw new Error("sin media global");
  return result.globalAvg;
}

describe("constantes de F16", () => {
  it("los tests asumen mínimo 5, peso 5 y umbral 0,4", () => {
    expect(HEAT_MIN_GAMES).toBe(5);
    expect(HEAT_PRIOR_GAMES).toBe(5);
    expect(HEAT_THRESHOLD).toBe(0.4);
  });
});

describe("computeHeat", () => {
  it("sin partidas: media global null y ningún campeón", () => {
    const result = computeHeat([]);
    expect(result.globalAvg).toBeNull();
    expect(result.byChampion.size).toBe(0);
  });

  it("ignora puestos fuera de 1..6 (también en la media global)", () => {
    const result = computeHeat([...games(1, [0, 7, 3, 3])]);
    expect(result.globalAvg).toBe(3);
    expect(result.byChampion.get(1)?.games).toBe(2);
  });

  it("solo puestos fuera de rango: como sin partidas", () => {
    const result = computeHeat(games(1, [0, 7]));
    expect(result.globalAvg).toBeNull();
    expect(result.byChampion.size).toBe(0);
  });

  it("AC3 (4 partidas): campeón con 4 partidas es neutral con motivo few-games aunque sea extremo", () => {
    // X: 4 × 2º (avg 2). Y: 5 × 6º → global = (8 + 30) / 9 ≈ 4,22; sin el mínimo sería 🔥.
    const result = computeHeat([
      ...games(1, [2, 2, 2, 2]),
      ...games(2, [6, 6, 6, 6, 6]),
    ]);
    const x = heatOf(result, 1);
    expect(x.games).toBe(4);
    expect(x.state).toBe("neutral");
    expect(x.reason).toBe("few-games");
  });

  it("AC3 (justo en -0,4): campeón con la ajustada exactamente 0,4 mejor que la global es hot", () => {
    // X (sin 1º): 2,2,2,2,3 → suma 11, avg 2,2.
    // Y (con 1º): 1,4,4,5,5 → suma 19.
    // Global = (11 + 19) / 10 = 3,0. Ajustada de X = (11 + 5·3) / (5 + 5) = 2,6.
    // Global − ajustada = 0,4 exacto (con ruido de coma flotante) → hot.
    const result = computeHeat([
      ...games(1, [2, 2, 2, 2, 3]),
      ...games(2, [1, 4, 4, 5, 5]),
    ]);
    expect(result.globalAvg).toBeCloseTo(3.0, 12);
    const x = heatOf(result, 1);
    expect(x.avg).toBeCloseTo(2.2, 12);
    expect(x.adjustedAvg).toBeCloseTo(2.6, 12);
    expect(x.state).toBe("hot");
    expect(x.reason).toBeNull();
  });

  it("AC3 (justo en +0,4): campeón con la ajustada exactamente 0,4 peor que la global es cold", () => {
    // X (sin 1º): 3,4,4,4,4 → suma 19, avg 3,8.
    // Y (con 1º): 1,1,3,3,3 → suma 11.
    // Global = (19 + 11) / 10 = 3,0. Ajustada de X = (19 + 5·3) / (5 + 5) = 3,4.
    // Ajustada − global = 0,4 exacto (con ruido de coma flotante) → cold.
    const result = computeHeat([
      ...games(1, [3, 4, 4, 4, 4]),
      ...games(2, [1, 1, 3, 3, 3]),
    ]);
    expect(result.globalAvg).toBeCloseTo(3.0, 12);
    const x = heatOf(result, 1);
    expect(x.adjustedAvg).toBeCloseTo(3.4, 12);
    expect(x.state).toBe("cold");
    expect(x.reason).toBeNull();
  });

  it("justo por debajo del umbral (0,3) es neutral con motivo within", () => {
    // X (sin 1º): 2,2,2,3,3 → suma 12. Y (con 1º): 1,3,4,5,5 → suma 18.
    // Global = 30 / 10 = 3,0. Ajustada de X = (12 + 15) / 10 = 2,7. Global − ajustada = 0,3 < 0,4.
    const result = computeHeat([
      ...games(1, [2, 2, 2, 3, 3]),
      ...games(2, [1, 3, 4, 5, 5]),
    ]);
    const x = heatOf(result, 1);
    expect(x.adjustedAvg).toBeCloseTo(2.7, 12);
    expect(x.state).toBe("neutral");
    expect(x.reason).toBe("within");
  });

  it("AC3 (algún 1º): campeón con un 1º es neutral con motivo won aunque cumpliría el umbral", () => {
    // W (con 1º): 1,1,1,2,2 → suma 7. O (sin 1º): 6 × 5 → suma 30.
    // Global = 37 / 10 = 3,7. Ajustada de W = (7 + 18,5) / 10 = 2,55 → 1,15 mejor: sería hot.
    const result = computeHeat([
      ...games(1, [1, 1, 1, 2, 2]),
      ...games(2, [6, 6, 6, 6, 6]),
    ]);
    const w = heatOf(result, 1);
    expect(w.adjustedAvg).toBeLessThan(globalOf(result) - HEAT_THRESHOLD);
    expect(w.state).toBe("neutral");
    expect(w.reason).toBe("won");
    // El campeón sin 1º y malo sí marca: ajustada = (30 + 18,5) / 10 = 4,85 → 1,15 peor.
    expect(heatOf(result, 2).state).toBe("cold");
  });

  it("AC3 (media global): usa todas las partidas, también las de campeones ya ganados", () => {
    // X (sin 1º): 6 × 4º → suma 24. Y (con 1º): 6 × 1º → suma 6.
    // Global con todas = 30 / 12 = 2,5 → ajustada de X = (24 + 12,5) / 11 ≈ 3,32 → 0,82 peor: cold.
    // Si se excluyera Y, la global sería 4,0 → ajustada 4,0 → neutral.
    const result = computeHeat([
      ...games(1, [4, 4, 4, 4, 4, 4]),
      ...games(2, [1, 1, 1, 1, 1, 1]),
    ]);
    expect(result.globalAvg).toBe(2.5);
    const x = heatOf(result, 1);
    expect(x.adjustedAvg).toBeCloseTo(36.5 / 11, 12);
    expect(x.state).toBe("cold");
    expect(heatOf(result, 2).reason).toBe("won");
  });

  it("incluye en el mapa a todos los campeones jugados con sus partidas y media", () => {
    const result = computeHeat([...games(1, [2, 4]), ...games(2, [3])]);
    expect([...result.byChampion.keys()].sort()).toEqual([1, 2]);
    expect(result.byChampion.get(1)).toMatchObject({ games: 2, avg: 3 });
  });
});
