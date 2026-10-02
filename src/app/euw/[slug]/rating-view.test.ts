import { describe, expect, it } from "vitest";
import { roundRating } from "@/domain/elo";
import { ELO_LEAGUES, ELO_START_RATING } from "@/lib/config";
import {
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
  it("deja margen por arriba y por debajo, en múltiplos del paso de las marcas", () => {
    const points = ratingPoints([
      { gameStartTimestamp: 1, ratingAfter: 1495 },
      { gameStartTimestamp: 2, ratingAfter: 1525 },
    ]);
    // Recorrido 30, margen 10 -> 1485..1535 con paso 10 -> 1480..1540.
    expect(ratingAxis(points)).toEqual({
      min: 1480,
      max: 1540,
      ticks: [1480, 1490, 1500, 1510, 1520, 1530, 1540],
    });
  });

  it("alarga el paso con un recorrido grande y nunca pasa de 5 tramos", () => {
    const points = ratingPoints([
      { gameStartTimestamp: 1, ratingAfter: 1400 },
      { gameStartTimestamp: 2, ratingAfter: 1620 },
    ]);
    const axis = ratingAxis(points);
    expect(axis.min).toBeLessThan(1400);
    expect(axis.max).toBeGreaterThan(1620);
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
