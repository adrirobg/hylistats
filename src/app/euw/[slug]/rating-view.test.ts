import { describe, expect, it } from "vitest";
import { roundRating } from "@/domain/elo";
import { ELO_LEAGUES, ELO_START_RATING } from "@/lib/config";
import {
  leagueBoundaries,
  leagueLabels,
  MIN_LABEL_BAND,
  PLOT_HEIGHT,
  ratingAxis,
  ratingCaption,
  ratingDomain,
  ratingPoints,
  visibleLeagues,
} from "./rating-view";

const DAY = 24 * 60 * 60_000;
const series = [
  { gameStartTimestamp: 1_000, ratingAfter: 1525 },
  { gameStartTimestamp: 2_000, ratingAfter: 1512.5 },
  { gameStartTimestamp: 3_000, ratingAfter: 1526.4 },
];

describe("ratingPoints", () => {
  it("un punto por partida, con el cambio respecto al anterior (el inicial en la primera)", () => {
    const points = ratingPoints(series);
    expect(points.map((p) => p.at)).toEqual([1_000, 2_000, 3_000]);
    expect(points[0].delta).toBe(1525 - ELO_START_RATING);
    expect(points[1].delta).toBe(-12.5);
    expect(points[2].delta).toBeCloseTo(13.9, 10);
  });

  it("el último punto es el rating mostrado (redondeado), como en la cabecera", () => {
    const last = ratingPoints(series).at(-1);
    expect(last?.rating).toBe(1526.4);
    expect(last?.rounded).toBe(roundRating(1526.4));
    expect(last?.rounded).toBe(1526);
  });

  it("sin partidas, sin puntos", () => {
    expect(ratingPoints([])).toEqual([]);
  });
});

describe("ratingDomain", () => {
  it("va de la primera a la última partida", () => {
    expect(ratingDomain(ratingPoints(series))).toEqual([1_000, 1_000 + DAY]);
    const spread = ratingPoints([
      { gameStartTimestamp: 5, ratingAfter: 1510 },
      { gameStartTimestamp: 5 * DAY, ratingAfter: 1520 },
    ]);
    expect(ratingDomain(spread)).toEqual([5, 5 * DAY]);
  });

  it("abre un día si hay una sola partida", () => {
    const one = ratingPoints([{ gameStartTimestamp: 7, ratingAfter: 1510 }]);
    expect(ratingDomain(one)).toEqual([7, 7 + DAY]);
  });
});

describe("ratingAxis", () => {
  it("margen del 5 % (10 puntos como mínimo) y límites y marcas cada 50", () => {
    const points = ratingPoints([
      { gameStartTimestamp: 1, ratingAfter: 1495 },
      { gameStartTimestamp: 2, ratingAfter: 1525 },
    ]);
    // Recorrido 30, margen 10 -> 1485..1535 -> 1450..1550.
    expect(ratingAxis(points)).toEqual({
      min: 1450,
      max: 1550,
      ticks: [1450, 1500, 1550],
    });
  });

  it("con un recorrido de ~200 puntos queda más o menos en 1400..1650", () => {
    const points = ratingPoints([
      { gameStartTimestamp: 1, ratingAfter: 1420 },
      { gameStartTimestamp: 2, ratingAfter: 1625 },
      { gameStartTimestamp: 3, ratingAfter: 1549 },
    ]);
    // Margen ceil(205 · 0,05) = 11 -> 1409..1636 -> 1400..1650.
    expect(ratingAxis(points)).toEqual({
      min: 1400,
      max: 1650,
      ticks: [1400, 1450, 1500, 1550, 1600, 1650],
    });
  });

  it("alarga el paso con un recorrido enorme y nunca pasa de 5 tramos", () => {
    const axis = ratingAxis(
      ratingPoints([
        { gameStartTimestamp: 1, ratingAfter: 1000 },
        { gameStartTimestamp: 2, ratingAfter: 1700 },
      ]),
    );
    expect(axis.min).toBeLessThan(1000);
    expect(axis.max).toBeGreaterThan(1700);
    expect(axis.ticks.length - 1).toBeLessThanOrEqual(6);
    expect(axis.ticks[0]).toBe(axis.min);
    expect(axis.ticks.at(-1)).toBe(axis.max);
  });

  it("con un solo punto el eje lo rodea", () => {
    const axis = ratingAxis(
      ratingPoints([{ gameStartTimestamp: 1, ratingAfter: 1500 }]),
    );
    expect(axis.min).toBeLessThan(1500);
    expect(axis.max).toBeGreaterThan(1500);
  });

  it("sin puntos, rodea el rating inicial", () => {
    const axis = ratingAxis([]);
    expect(axis.min).toBeLessThan(ELO_START_RATING);
    expect(axis.max).toBeGreaterThan(ELO_START_RATING);
  });
});

describe("visibleLeagues", () => {
  it("solo las ligas que caen en el eje, de menor a mayor y recortadas a él", () => {
    const bands = visibleLeagues(1480, 1545);
    expect(bands.map((b) => b.id)).toEqual(["plata", "oro", "platino"]);
    // Las fronteras son el rating con decimales que da ese entero al redondear (min − 0,5).
    expect(bands[0]).toEqual({
      id: "plata",
      name: "Plata",
      from: 1480,
      to: 1509.5,
    });
    expect(bands[1]).toEqual({
      id: "oro",
      name: "Oro",
      from: 1509.5,
      to: 1539.5,
    });
    expect(bands[2]).toEqual({
      id: "platino",
      name: "Platino",
      from: 1539.5,
      to: 1545,
    });
  });

  it("recorta Hierro (sin suelo) y Diamante (sin techo) al eje", () => {
    const low = visibleLeagues(1400, 1460);
    expect(low[0]).toEqual({
      id: "hierro",
      name: "Hierro",
      from: 1400,
      to: 1449.5,
    });
    expect(low[1]).toEqual({
      id: "bronce",
      name: "Bronce",
      from: 1449.5,
      to: 1460,
    });
    const high = visibleLeagues(1560, 1620);
    expect(high.at(-1)).toEqual({
      id: "diamante",
      name: "Diamante",
      from: 1569.5,
      to: 1620,
    });
  });

  it("cubre el eje entero sin huecos ni solapes", () => {
    const bands = visibleLeagues(1380, 1640);
    expect(bands[0].from).toBe(1380);
    expect(bands.at(-1)?.to).toBe(1640);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].from).toBe(bands[i - 1].to);
    }
    // Los nombres salen de la config: ninguna liga inventada.
    for (const band of bands) {
      expect(
        ELO_LEAGUES.some((l) => l.id === band.id && l.name === band.name),
      ).toBe(true);
    }
  });
});

describe("leagueLabels", () => {
  it("una etiqueta en el centro de cada franja con altura de sobra", () => {
    const bands = visibleLeagues(1400, 1650);
    const labels = leagueLabels(bands, 1400, 1650);
    expect(labels.map((l) => l.id)).toEqual([
      "hierro",
      "bronce",
      "plata",
      "oro",
      "platino",
      "diamante",
    ]);
    expect(labels.find((l) => l.id === "oro")).toEqual({
      id: "oro",
      name: "Oro",
      at: 1524.5,
    });
    // El centro cae dentro de su franja.
    for (const label of labels) {
      const band = bands.find((b) => b.id === label.id);
      expect(label.at).toBeGreaterThan(band?.from ?? Number.NaN);
      expect(label.at).toBeLessThan(band?.to ?? Number.NaN);
    }
  });

  it("omite la franja recortada demasiado baja para su etiqueta", () => {
    // Eje 1450..1550: Bronce queda en 1450..1479,5 (sí) y Diamante no entra; con el eje 1450..1571 el
    // trozo de Diamante (1569,5..1571) mide menos de 14 px y no lleva etiqueta.
    const bands = visibleLeagues(1450, 1571);
    const labels = leagueLabels(bands, 1450, 1571);
    expect(bands.at(-1)?.id).toBe("diamante");
    expect(labels.some((l) => l.id === "diamante")).toBe(false);
    expect(labels.some((l) => l.id === "platino")).toBe(true);
  });

  it("usa la altura del gráfico: 14 px justos sí caben", () => {
    // Franja de 10 puntos en un eje de 100 con 140 px -> 14 px.
    const band = { id: "x", name: "X", from: 0, to: 10 };
    expect(MIN_LABEL_BAND).toBe(14);
    expect(leagueLabels([band], 0, 100, 140)).toHaveLength(1);
    expect(leagueLabels([band], 0, 100, 139)).toHaveLength(0);
    expect(PLOT_HEIGHT).toBeGreaterThan(0);
  });
});

describe("leagueBoundaries", () => {
  it("las fronteras entre franjas visibles, sin los bordes del eje", () => {
    expect(leagueBoundaries(visibleLeagues(1400, 1650))).toEqual([
      1449.5, 1479.5, 1509.5, 1539.5, 1569.5,
    ]);
    expect(leagueBoundaries(visibleLeagues(1490, 1500))).toEqual([]);
  });
});

describe("ratingCaption", () => {
  it("dice liga, rating y partidas", () => {
    expect(ratingCaption("Oro", 1526, 23)).toBe(
      "Oro · 1526 tras 23 partidas de la temporada.",
    );
    expect(ratingCaption("Plata", 1500, 1)).toBe(
      "Plata · 1500 tras 1 partida de la temporada.",
    );
  });
});
