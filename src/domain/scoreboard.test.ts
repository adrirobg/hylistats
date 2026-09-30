import { describe, expect, it } from "vitest";
import type { RecentGame } from "./album";
import {
  distributionSegments,
  formChipLabel,
  NO_FIGURE,
  placeTone,
  scoreboardFigures,
} from "./scoreboard";
import {
  computeSummary,
  PLACEMENTS,
  type Placement,
  type PlayerMatchRow,
} from "./stats";

// Espacio duro que pone `Intl` entre la cifra y el «%» en es-ES.
const NBSP = " ";

/** Resumen real (`computeSummary`) de una distribución dada: `n` partidas por cada puesto. */
function summaryOf(distribution: Record<Placement, number>) {
  const rows: PlayerMatchRow[] = [];
  for (const placement of PLACEMENTS) {
    for (let i = 0; i < distribution[placement]; i += 1) {
      rows.push({
        matchId: `EUW1_${placement}_${i}`,
        gameCreation: 1_790_000_000_000 + rows.length,
        championId: 103,
        championName: "Ahri",
        placement,
        playerSubteamId: 1,
      });
    }
  }
  return computeSummary(rows);
}

// 509 partidas, 84 primeros, top 3 = 265 y puesto medio 1730/509 = 3,399.
const SAMPLE = summaryOf({ 1: 84, 2: 88, 3: 93, 4: 100, 5: 73, 6: 71 });

describe("scoreboardFigures", () => {
  it("cinco cifras en es-ES y en su orden", () => {
    const figures = scoreboardFigures(SAMPLE);
    expect(figures.map((f) => f.value)).toEqual([
      "509",
      "84",
      `16,5${NBSP}%`,
      `52${NBSP}%`,
      "3,40",
    ]);
    expect(figures.map((f) => f.label)).toEqual([
      "partidas",
      "1º",
      "% 1º",
      "top 3",
      "puesto medio",
    ]);
    expect(figures.map((f) => f.key)).toEqual([
      "games",
      "firsts",
      "firstRate",
      "top3Rate",
      "avgPlacement",
    ]);
  });

  it("el oro es solo de las dos medidas de victoria (1º y % 1º)", () => {
    expect(scoreboardFigures(SAMPLE).map((f) => f.gold)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it("los millares van con el separador de es-ES", () => {
    const big = summaryOf({
      1: 2000,
      2: 2000,
      3: 2000,
      4: 2000,
      5: 2000,
      6: 2000,
    });
    expect(scoreboardFigures(big)[0].value).toBe("12.000");
  });

  it("sin partidas: «partidas» es 0 y el resto una raya (nunca NaN ni 0 %)", () => {
    const figures = scoreboardFigures(computeSummary([]));
    expect(figures.map((f) => f.value)).toEqual([
      "0",
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
    ]);
    expect(NO_FIGURE).toBe("—");
    for (const { value } of figures) expect(value).not.toMatch(/NaN/);
    for (const { value } of figures.slice(1)) expect(value).not.toMatch(/^0/);
  });

  it("con partidas pero ningún 1º, las cifras son 0 reales, no rayas", () => {
    const figures = scoreboardFigures(
      summaryOf({ 1: 0, 2: 0, 3: 0, 4: 2, 5: 0, 6: 0 }),
    );
    expect(figures.map((f) => f.value)).toEqual([
      "2",
      "0",
      `0,0${NBSP}%`,
      `0${NBSP}%`,
      "4,00",
    ]);
  });
});

describe("distributionSegments", () => {
  const segments = distributionSegments(SAMPLE);

  it("seis segmentos, del 1º al 6º, que suman 100 %", () => {
    expect(segments.map((s) => s.placement)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(segments.map((s) => s.count)).toEqual([84, 88, 93, 100, 73, 71]);
    expect(segments.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 9);
    expect(segments[0].percent).toBeCloseTo((84 / 509) * 100, 9);
  });

  it("etiqueta «puesto: porcentaje» en es-ES con un decimal", () => {
    expect(segments.map((s) => s.label)).toEqual([
      `1º: 16,5${NBSP}%`,
      `2º: 17,3${NBSP}%`,
      `3º: 18,3${NBSP}%`,
      `4º: 19,6${NBSP}%`,
      `5º: 14,3${NBSP}%`,
      `6º: 13,9${NBSP}%`,
    ]);
  });

  it("el color sale del puesto", () => {
    expect(segments.map((s) => s.tone)).toEqual([
      "p1",
      "p23",
      "p23",
      "p46",
      "p46",
      "p46",
    ]);
  });

  it("un puesto sin partidas sigue ahí, con 0 %", () => {
    const only = distributionSegments(
      summaryOf({ 1: 4, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }),
    );
    expect(only).toHaveLength(6);
    expect(only.map((s) => s.percent)).toEqual([100, 0, 0, 0, 0, 0]);
    expect(only[1].label).toBe(`2º: 0,0${NBSP}%`);
  });

  it("sin partidas no hay segmentos (ni NaN)", () => {
    expect(distributionSegments(computeSummary([]))).toEqual([]);
  });
});

describe("placeTone", () => {
  it("1º oro, 2º–3º verde agua y 4º–6º pizarra", () => {
    expect(PLACEMENTS.map(placeTone)).toEqual([
      "p1",
      "p23",
      "p23",
      "p46",
      "p46",
      "p46",
    ]);
  });
});

describe("formChipLabel", () => {
  const NOW = Date.UTC(2026, 8, 29, 15, 0, 0);
  const game = (overrides: Partial<RecentGame> = {}): RecentGame => ({
    matchId: "EUW1_1",
    placement: 1,
    championId: 103,
    championName: "Ahri",
    gameCreation: NOW - 2 * 60 * 60_000,
    ...overrides,
  });

  it("campeón · puesto · hace cuánto", () => {
    expect(formChipLabel(game(), NOW)).toBe("Ahri · 1º · hace 2 h");
    expect(
      formChipLabel(
        game({
          placement: 5,
          championName: "Kai'Sa",
          gameCreation: NOW - 26 * 60 * 60_000,
        }),
        NOW,
      ),
    ).toBe("Kai'Sa · 5º · ayer");
  });
});
