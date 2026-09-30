import { describe, expect, it } from "vitest";
import {
  championsLabel,
  countAxis,
  curveDomain,
  xTicks,
} from "./won-curve-view";

const DAY = 24 * 60 * 60_000;
const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);

describe("curveDomain", () => {
  it("va del primer al último punto", () => {
    expect(
      curveDomain([
        { at: 100, count: 0 },
        { at: 3 * DAY, count: 2 },
        { at: 5 * DAY, count: 2 },
      ]),
    ).toEqual([100, 5 * DAY]);
  });

  it("abre un día si empieza y acaba a la vez, para que el eje tenga anchura", () => {
    expect(
      curveDomain([
        { at: 1_000, count: 0 },
        { at: 1_000, count: 1 },
      ]),
    ).toEqual([1_000, 1_000 + DAY]);
  });
});

describe("xTicks", () => {
  it("el inicio y el día 1 de cada mes dentro del dominio", () => {
    // 12 may -> 30 sep: inicio, 1 jun, 1 jul, 1 ago y 1 sep.
    expect(xTicks(utc(2026, 5, 12), utc(2026, 9, 30))).toEqual([
      utc(2026, 5, 12),
      utc(2026, 6, 1),
      utc(2026, 7, 1),
      utc(2026, 8, 1),
      utc(2026, 9, 1),
    ]);
  });

  it("omite el mes que empieza a menos de 10 días del inicio", () => {
    expect(xTicks(utc(2026, 5, 25), utc(2026, 7, 15))).toEqual([
      utc(2026, 5, 25),
      utc(2026, 7, 1),
    ]);
    // Justo a 10 días: se queda.
    expect(xTicks(utc(2026, 5, 22), utc(2026, 6, 20))).toEqual([
      utc(2026, 5, 22),
      utc(2026, 6, 1),
    ]);
  });

  it("no pasa del final del dominio y cruza el fin de año", () => {
    expect(xTicks(utc(2026, 11, 5), utc(2027, 1, 10))).toEqual([
      utc(2026, 11, 5),
      utc(2026, 12, 1),
      utc(2027, 1, 1),
    ]);
    expect(xTicks(utc(2026, 5, 12), utc(2026, 5, 30))).toEqual([
      utc(2026, 5, 12),
    ]);
  });
});

describe("countAxis", () => {
  it("de 0 a algo más que el umbral, con marcas cada 20", () => {
    const { max, ticks } = countAxis(23, 60);
    expect(max).toBe(65);
    expect(ticks).toEqual([0, 20, 40, 60]);
  });

  it("si el recuento supera el umbral, el margen cuelga del recuento", () => {
    const { max, ticks } = countAxis(72, 60);
    expect(max).toBe(78);
    expect(ticks).toEqual([0, 20, 40, 60]);
  });

  it("sin campeones el máximo lo pone el umbral", () => {
    expect(countAxis(0, 60).max).toBe(65);
  });

  it("pasados los 100 las marcas van de 50 en 50", () => {
    const { max, ticks } = countAxis(120, 60);
    expect(max).toBe(130);
    expect(ticks).toEqual([0, 50, 100]);
  });

  it("con un umbral pequeño el margen no baja de 3", () => {
    expect(countAxis(0, 5).max).toBe(8);
  });
});

describe("championsLabel", () => {
  it("singular y plural", () => {
    expect(championsLabel(1)).toBe("1 campeón");
    expect(championsLabel(0)).toBe("0 campeones");
    expect(championsLabel(23)).toBe("23 campeones");
  });
});
