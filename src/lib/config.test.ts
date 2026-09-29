import { describe, expect, it } from "vitest";
import {
  ARENA_QUEUE_IDS,
  CHALLENGE_ARENA_GOD,
  DEFAULT_SEASON_START,
  getSeasonStart,
} from "./config";

describe("constantes de dominio", () => {
  it("Arena tríos son las colas 1750 y 1740 (en ese orden) y Arena God el challenge 602002", () => {
    expect(ARENA_QUEUE_IDS).toEqual([1750, 1740]);
    expect(CHALLENGE_ARENA_GOD).toBe(602002);
  });
});

describe("getSeasonStart", () => {
  it("usa el valor por defecto sin SEASON_START (o vacía)", () => {
    const expected = new Date("2026-05-12T00:00:00Z");
    expect(DEFAULT_SEASON_START).toBe("2026-05-12T00:00:00Z");
    expect(getSeasonStart(undefined)).toEqual(expected);
    expect(getSeasonStart("")).toEqual(expected);
    expect(getSeasonStart("   ")).toEqual(expected);
  });

  it("lee SEASON_START del entorno cuando no se pasa argumento", () => {
    const previous = process.env.SEASON_START;
    try {
      process.env.SEASON_START = "2026-06-01T12:30:00Z";
      expect(getSeasonStart().toISOString()).toBe("2026-06-01T12:30:00.000Z");
    } finally {
      if (previous === undefined) delete process.env.SEASON_START;
      else process.env.SEASON_START = previous;
    }
  });

  it("acepta fechas ISO con zona explícita, con offset o solo el día (UTC)", () => {
    expect(getSeasonStart("2026-07-01T00:00:00Z").getTime()).toBe(
      Date.UTC(2026, 6, 1),
    );
    expect(getSeasonStart("2026-07-01T02:00:00+02:00").getTime()).toBe(
      Date.UTC(2026, 6, 1),
    );
    expect(getSeasonStart("2026-07-01").getTime()).toBe(Date.UTC(2026, 6, 1));
    expect(getSeasonStart(" 2026-07-01T00:00Z ").getTime()).toBe(
      Date.UTC(2026, 6, 1),
    );
  });

  it.each([
    "mañana",
    "12",
    "2026-13-01",
    "2026-02-31",
    "2026-05-12T00:00:00", // sin zona: ambigua
    "2026/05/12",
  ])("rechaza %j con un error que nombra SEASON_START", (value) => {
    expect(() => getSeasonStart(value)).toThrow(/SEASON_START inválida/);
  });
});
