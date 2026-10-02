import { describe, expect, it } from "vitest";
import {
  ELO_PLACEMENT_POINTS,
  ELO_PROVISIONAL_GAMES,
  ELO_START_RATING,
} from "@/lib/config";
import {
  computeGroupElo,
  type EloStanding,
  eloBaseChange,
  eloExpected,
  eloLeague,
  eloMatchChange,
  eloMultiplier,
  eloStrangers,
  formatEloChange,
  formatEloChangeDetailed,
} from "./elo";
import type { GroupMatchRow } from "./group-titles";

// Partidas sintéticas (sin BD ni red). Los instantes se construyen en UTC explícito (`Date.parse`
// con `Z`): no dependen de la zona horaria de la máquina. Madrid está a UTC+2 en verano (CEST).
// Los valores esperados están calculados aparte (a mano, con la fórmula de F24), no con el módulo.

const at = (iso: string) => Date.parse(iso);
const MINUTE = 60_000;

/** Miércoles 2026-09-30, 20:00 en Madrid: día de juego 2026-09-30, semana del lunes 2026-09-28. */
const DAY_TS = at("2026-09-30T18:00:00Z");
/** `now` dentro del mismo día de juego (00:00 del 1 oct en Madrid, aún día 30). */
const NOW = at("2026-09-30T22:00:00Z");

let seq = 0;

interface GameOptions {
  at?: number;
  matchId?: string;
  subteam?: number;
}

/** Una partida en la que `keys` (miembros) van en el mismo equipo y quedan en `placement`. */
function game(
  placement: number,
  keys: string[],
  options: GameOptions = {},
): GroupMatchRow[] {
  seq += 1;
  const ts = options.at ?? DAY_TS + seq * MINUTE;
  const matchId = options.matchId ?? `EUW1_${String(seq).padStart(6, "0")}`;
  return keys.map((puuid) => ({
    puuid,
    matchId,
    gameStartTimestamp: ts,
    gameCreation: ts,
    playerSubteamId: options.subteam ?? 1,
    placement,
    totalDamageDealtToChampions: 10_000,
  }));
}

/** Partidas de un miembro solo (2 desconocidos), una por puesto. */
function solo(
  key: string,
  placements: number[],
  options: Omit<GameOptions, "matchId"> = {},
): GroupMatchRow[] {
  return placements.flatMap((placement) => game(placement, [key], options));
}

const standing = (standings: EloStanding[], key: string): EloStanding => {
  const found = standings.find((s) => s.key === key);
  if (!found) throw new Error(`Sin miembro ${key}`);
  return found;
};

// ---------------------------------------------------------------------------------------------
// AC1 — Cálculo
// ---------------------------------------------------------------------------------------------

describe("cambio de una partida (F24)", () => {
  it("con rating 1500 el cambio base son exactamente los puntos del puesto", () => {
    expect(eloExpected(1500)).toBe(0.5);
    expect([1, 2, 3, 4, 5, 6].map((p) => eloBaseChange(p, 1500))).toEqual([
      25, 12, 2, -5, -15, -19,
    ]);
    expect([...ELO_PLACEMENT_POINTS]).toEqual([25, 12, 2, -5, -15, -19]);
  });

  it("los 6 puestos a 1500 sin desconocidos dan +25 / +12 / +2 / −5 / −15 / −19", () => {
    const rows = [1, 2, 3, 4, 5, 6].flatMap((p, i) =>
      game(p, [`m${i}`, `x${i}`, `y${i}`]),
    );
    const keys = rows.map((r) => r.puuid);
    const { standings } = computeGroupElo(rows, keys, NOW);
    expect(
      [0, 1, 2, 3, 4, 5].map(
        (i) => standing(standings, `m${i}`).history[0].delta,
      ),
    ).toEqual([25, 12, 2, -5, -15, -19]);
  });

  it("pendiente por encima de 1500: gana menos y pierde más", () => {
    expect(eloBaseChange(1, 1600)).toBeCloseTo(18.83714, 4);
    expect(eloBaseChange(6, 1600)).toBeCloseTo(-25.16286, 4);
    expect(eloBaseChange(1, 1525)).toBeCloseTo(23.4197, 4);
  });

  it("pendiente por debajo de 1500: gana más y pierde menos", () => {
    expect(eloBaseChange(1, 1400)).toBeCloseTo(31.16286, 4);
    expect(eloBaseChange(6, 1400)).toBeCloseTo(-12.83714, 4);
  });

  it("multiplicadores con 0, 1 y 2 desconocidos y cambio base positivo y negativo", () => {
    expect(eloMatchChange(1, 1500, 0)).toEqual({
      base: 25,
      multiplier: 1,
      delta: 25,
    });
    expect(eloMatchChange(1, 1500, 1).delta).toBeCloseTo(28.75, 10);
    expect(eloMatchChange(1, 1500, 2).delta).toBeCloseTo(32.5, 10);
    expect(eloMatchChange(6, 1500, 0)).toEqual({
      base: -19,
      multiplier: 1,
      delta: -19,
    });
    expect(eloMatchChange(6, 1500, 1).delta).toBeCloseTo(-14.25, 10);
    expect(eloMatchChange(6, 1500, 2).delta).toBeCloseTo(-9.5, 10);
    expect(eloMultiplier(10, 1)).toBe(1.15);
    expect(eloMultiplier(-10, 1)).toBe(0.75);
    expect(eloMultiplier(10, 2)).toBe(1.3);
    expect(eloMultiplier(-10, 2)).toBe(0.5);
    // Cambio base 0: multiplicador 1.
    expect(eloMultiplier(0, 2)).toBe(1);
  });

  it("los desconocidos son 3 − miembros del equipo, acotados a 0..2", () => {
    expect([0, 1, 2, 3, 4].map(eloStrangers)).toEqual([2, 2, 1, 0, 0]);
  });

  it("cuenta los desconocidos por las filas de miembros del mismo equipo", () => {
    const rows = [
      ...game(1, ["a"]), // 2 desconocidos
      ...game(1, ["b", "c"]), // 1 desconocido
      ...game(6, ["d", "e", "f"]), // 0
      ...game(6, ["g"]), // 2
      ...game(6, ["h", "i"]), // 1
    ];
    const { standings } = computeGroupElo(
      rows,
      ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      NOW,
    );
    const first = (key: string) => standing(standings, key).history[0];
    expect(first("a")).toMatchObject({
      strangers: 2,
      base: 25,
      multiplier: 1.3,
    });
    expect(first("a").delta).toBeCloseTo(32.5, 10);
    expect(first("b")).toMatchObject({
      strangers: 1,
      base: 25,
      multiplier: 1.15,
    });
    expect(first("d")).toMatchObject({
      strangers: 0,
      base: -19,
      multiplier: 1,
      delta: -19,
    });
    expect(first("g")).toMatchObject({
      strangers: 2,
      multiplier: 0.5,
      delta: -9.5,
    });
    expect(first("h")).toMatchObject({
      strangers: 1,
      multiplier: 0.75,
      delta: -14.25,
    });
  });

  it("un no miembro del equipo (aunque tenga filas, p. ej. un perfil registrado) es desconocido", () => {
    // `z` va en el equipo de `a` pero no es miembro: `a` juega con 2 desconocidos.
    const rows = game(1, ["a", "z"]);
    const { standings } = computeGroupElo(rows, ["a"], NOW);
    expect(standings.map((s) => s.key)).toEqual(["a"]);
    expect(standings[0].history[0]).toMatchObject({
      strangers: 2,
      multiplier: 1.3,
    });
  });

  it("miembros en equipos rivales puntúan cada uno por el puesto de su equipo", () => {
    const rows = [
      ...game(1, ["a"], { matchId: "EUW1_R", subteam: 1 }),
      ...game(4, ["b"], { matchId: "EUW1_R", subteam: 2 }),
    ];
    const { standings } = computeGroupElo(rows, ["a", "b"], NOW);
    expect(standing(standings, "a").history[0]).toMatchObject({
      strangers: 2,
      base: 25,
    });
    expect(standing(standings, "a").rating).toBeCloseTo(1532.5, 10);
    expect(standing(standings, "b").history[0]).toMatchObject({
      strangers: 2,
      base: -5,
      multiplier: 0.5,
      delta: -2.5,
    });
    expect(standing(standings, "b").rating).toBe(1497.5);
  });

  it("orden cronológico y cada partida usa el rating de antes de ella", () => {
    const first = game(1, ["a"], { at: DAY_TS });
    const second = game(1, ["a"], { at: DAY_TS + 10 * MINUTE });
    // Filas desordenadas a propósito.
    const { standings } = computeGroupElo([...second, ...first], ["a"], NOW);
    const [g1, g2] = standing(standings, "a").history;
    expect(g1.matchId).toBe(first[0].matchId);
    expect(g1).toMatchObject({ ratingBefore: 1500, ratingAfter: 1532.5 });
    expect(g2.ratingBefore).toBe(1532.5);
    expect(g2.base).toBeCloseTo(22.948046, 5);
    expect(g2.delta).toBeCloseTo(29.83246, 5);
    expect(g2.ratingAfter).toBeCloseTo(1562.33246, 5);
  });

  it("a igual inicio, desempata el matchId", () => {
    const rows = [
      ...game(6, ["a"], { at: DAY_TS, matchId: "EUW1_B" }),
      ...game(1, ["a"], { at: DAY_TS, matchId: "EUW1_A" }),
    ];
    const { standings } = computeGroupElo(rows, ["a"], NOW);
    expect(standing(standings, "a").history.map((m) => m.matchId)).toEqual([
      "EUW1_A",
      "EUW1_B",
    ]);
  });

  it("en una misma partida cada miembro usa su propio rating previo", () => {
    // `a` llega a la partida compartida con 1532,5; `b` con 1500.
    const rows = [...game(1, ["a"]), ...game(1, ["a", "b"])];
    const { standings } = computeGroupElo(rows, ["a", "b"], NOW);
    const shared = (key: string) => standing(standings, key).history.at(-1);
    expect(shared("a")?.ratingBefore).toBe(1532.5);
    expect(shared("b")?.ratingBefore).toBe(1500);
    expect(shared("b")?.delta).toBeCloseTo(28.75, 10);
  });

  it("ignora las filas con puesto fuera de 1..6", () => {
    const rows = [...game(0, ["a"]), ...game(7, ["a"]), ...game(2, ["a"])];
    const { standings } = computeGroupElo(rows, ["a"], NOW);
    expect(standing(standings, "a").games).toBe(1);
  });

  it(`provisional con ${ELO_PROVISIONAL_GAMES - 1} partidas y no con ${ELO_PROVISIONAL_GAMES}`, () => {
    const rows = [
      ...solo("a", Array(ELO_PROVISIONAL_GAMES - 1).fill(3)),
      ...solo("b", Array(ELO_PROVISIONAL_GAMES).fill(3)),
    ];
    const { standings } = computeGroupElo(rows, ["a", "b"], NOW);
    expect(standing(standings, "a")).toMatchObject({
      games: 9,
      provisional: true,
    });
    expect(standing(standings, "b")).toMatchObject({
      games: 10,
      provisional: false,
    });
  });

  it("una temporada sintética de varias partidas acaba en el valor calculado a mano", () => {
    // (puesto, compañeros miembros de `a`) -> desconocidos 2, 1, 0, 2, 1, 0, 1.
    const rows = [
      ...game(1, ["a"]),
      ...game(4, ["a", "b"]),
      ...game(6, ["a", "b", "c"]),
      ...game(2, ["a"]),
      ...game(5, ["a", "c"]),
      ...game(3, ["a", "b", "c"]),
      ...game(1, ["a", "b"]),
    ];
    const { standings } = computeGroupElo(rows, ["a", "b", "c"], NOW);
    const a = standing(standings, "a");
    // Calculado aparte paso a paso:
    // 1500 → +32,5 → 1532,5 → −5,288965 → 1527,211035 → −20,719518 → 1506,491517
    // → +15,065697 → 1521,557214 → −12,272458 → 1509,284756 → +1,412219 → 1510,696975
    // → +27,9713 → 1538,668275
    expect(a.history.map((m) => m.strangers)).toEqual([2, 1, 0, 2, 1, 0, 1]);
    expect(a.history.map((m) => m.ratingAfter)).toEqual([
      expect.closeTo(1532.5, 5),
      expect.closeTo(1527.211035, 5),
      expect.closeTo(1506.491517, 5),
      expect.closeTo(1521.557214, 5),
      expect.closeTo(1509.284756, 5),
      expect.closeTo(1510.696975, 5),
      expect.closeTo(1538.668275, 5),
    ]);
    expect(a.rating).toBeCloseTo(1538.668275, 5);
    expect(a.roundedRating).toBe(1539);
    expect(a.league.name).toBe("Oro");
    expect(a.games).toBe(7);
    expect(a.provisional).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// AC2 — Ligas y periodos
// ---------------------------------------------------------------------------------------------

describe("ligas (F25)", () => {
  it.each([
    [1449, "Hierro"],
    [1450, "Bronce"],
    [1479, "Bronce"],
    [1480, "Plata"],
    [1509, "Plata"],
    [1510, "Oro"],
    [1539, "Oro"],
    [1540, "Platino"],
    [1569, "Platino"],
    [1570, "Diamante"],
    [1200, "Hierro"],
    [1800, "Diamante"],
  ])("%d → %s", (rating, name) => {
    expect(eloLeague(rating).name).toBe(name);
  });

  it("se decide por el rating redondeado", () => {
    expect(eloLeague(1449.4).name).toBe("Hierro");
    expect(eloLeague(1449.5).name).toBe("Bronce");
    expect(eloLeague(1569.49).name).toBe("Platino");
    expect(eloLeague(1569.5).name).toBe("Diamante");
  });

  it("el rating inicial es Plata (la de salida)", () => {
    expect(eloLeague(ELO_START_RATING).id).toBe("plata");
  });
});

describe("cambio del día y de la semana", () => {
  it("el día de juego corta a las 06:00 de Madrid", () => {
    // 2026-09-30 05:59 Madrid (día 29) y 06:00 (día 30).
    const rows = [
      ...game(1, ["a"], { at: at("2026-09-30T03:59:00Z") }),
      ...game(6, ["a"], { at: at("2026-09-30T04:00:00Z") }),
    ];
    const { standings, day } = computeGroupElo(rows, ["a"], NOW);
    expect(day).toMatchObject({ key: "2026-09-30", isCurrent: true });
    const a = standing(standings, "a");
    // Solo cuenta la de las 06:00 (6º con 2 desconocidos, rating previo 1532,5).
    expect(a.dayChange).toBeCloseTo(a.history[1].delta, 10);
    expect(a.dayChange).toBeLessThan(0);
  });

  it("la semana corta el lunes a las 06:00 de Madrid", () => {
    // Lunes 2026-09-28 05:59 Madrid (semana del 21) y 06:00 (semana del 28).
    const rows = [
      ...game(1, ["a"], { at: at("2026-09-28T03:59:00Z") }),
      ...game(6, ["a"], { at: at("2026-09-28T04:00:00Z") }),
      ...game(2, ["a"], { at: DAY_TS }),
    ];
    const { standings, week } = computeGroupElo(rows, ["a"], NOW);
    expect(week).toMatchObject({ key: "2026-09-28", isCurrent: true });
    const a = standing(standings, "a");
    expect(a.weekChange).toBeCloseTo(
      a.history[1].delta + a.history[2].delta,
      10,
    );
    // El día mostrado es el 30: solo la última.
    expect(a.dayChange).toBeCloseTo(a.history[2].delta, 10);
  });

  it("un miembro que no jugó en el periodo tiene cambio null", () => {
    const rows = [
      ...game(1, ["a"], { at: DAY_TS }),
      ...game(1, ["b"], { at: at("2026-09-29T18:00:00Z") }),
    ];
    const { standings } = computeGroupElo(rows, ["a", "b", "c"], NOW);
    expect(standing(standings, "a").dayChange).toBeCloseTo(32.5, 10);
    expect(standing(standings, "b").dayChange).toBeNull();
    expect(standing(standings, "b").weekChange).toBeCloseTo(32.5, 10);
    expect(standing(standings, "c")).toMatchObject({
      dayChange: null,
      weekChange: null,
    });
  });

  it("con el periodo actual vacío, el del último día y la última semana jugados", () => {
    const rows = [
      ...game(1, ["a"], { at: at("2026-09-29T18:00:00Z") }),
      ...game(6, ["a"], { at: DAY_TS }),
      ...game(2, ["b"], { at: DAY_TS }),
    ];
    // Lunes 2026-10-05 12:00 UTC: ni hoy ni esta semana ha jugado nadie.
    const now = at("2026-10-05T12:00:00Z");
    const { standings, day, week } = computeGroupElo(rows, ["a", "b"], now);
    expect(day).toMatchObject({
      key: "2026-09-30",
      isCurrent: false,
      label: "30 sept",
    });
    expect(week).toMatchObject({ key: "2026-09-28", isCurrent: false });
    const a = standing(standings, "a");
    expect(a.dayChange).toBeCloseTo(a.history[1].delta, 10);
    expect(a.weekChange).toBeCloseTo(
      a.history[0].delta + a.history[1].delta,
      10,
    );
    expect(standing(standings, "b").dayChange).toBe(12 * 1.3);
  });
});

// ---------------------------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------------------------

describe("clasificación", () => {
  it("ordena por rating y los empates de rating redondeado comparten posición (1, 1, 3)", () => {
    const rows = [...solo("b", [1]), ...solo("a", [1]), ...solo("d", [6])];
    const { standings } = computeGroupElo(rows, ["a", "b", "c", "d"], NOW);
    expect(standings.map((s) => [s.key, s.position, s.roundedRating])).toEqual([
      ["a", 1, 1533],
      ["b", 1, 1533],
      ["c", 3, 1500],
      ["d", 4, 1491],
    ]);
  });

  it("comparte posición con el mismo redondeado aunque los decimales difieran", () => {
    // `b`: 4º y 3º solo -> 1497,5 y después +2,805790 = 1500,305790 (→ 1500). `a` sin partidas:
    // 1500. Comparten la 2ª posición; `b` va antes por decimales. `c`: 1º solo, 1532,5.
    const rows = [...solo("b", [4, 3]), ...solo("c", [1])];
    const { standings } = computeGroupElo(rows, ["a", "b", "c"], NOW);
    expect(standing(standings, "b").rating).toBeCloseTo(1500.30579, 5);
    expect(standings.map((s) => [s.key, s.position, s.roundedRating])).toEqual([
      ["c", 1, 1533],
      ["b", 2, 1500],
      ["a", 2, 1500],
    ]);
  });

  it("los miembros sin partidas entran con 1500, provisionales y en Plata", () => {
    const { standings } = computeGroupElo([], ["a", "b"], NOW);
    expect(standings).toEqual([
      expect.objectContaining({
        key: "a",
        position: 1,
        rating: 1500,
        roundedRating: 1500,
        games: 0,
        provisional: true,
        history: [],
        dayChange: null,
        weekChange: null,
      }),
      expect.objectContaining({ key: "b", position: 1 }),
    ]);
    expect(standings[0].league.name).toBe("Plata");
  });
});

// ---------------------------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------------------------

describe("formato del cambio", () => {
  it("entero con signo", () => {
    expect(formatEloChange(29.4)).toBe("+29");
    expect(formatEloChange(-14.2)).toBe("-14");
    expect(formatEloChange(-14.5)).toBe("-15");
    expect(formatEloChange(14.5)).toBe("+15");
    expect(formatEloChange(0)).toBe("0");
    expect(formatEloChange(-0.4)).toBe("0");
  });

  it("con un decimal solo si no es entero", () => {
    expect(formatEloChangeDetailed(26.93)).toBe("+26,9");
    expect(formatEloChangeDetailed(-2.5)).toBe("-2,5");
    expect(formatEloChangeDetailed(25)).toBe("+25");
    expect(formatEloChangeDetailed(-19)).toBe("-19");
    expect(formatEloChangeDetailed(24.98)).toBe("+25");
    expect(formatEloChangeDetailed(0.04)).toBe("0");
    expect(formatEloChangeDetailed(0)).toBe("0");
  });
});
