import { describe, expect, it } from "vitest";
import {
  ELO_LEAGUE_MARGIN,
  ELO_LEAGUES,
  ELO_PLACEMENT_POINTS,
  ELO_PROVISIONAL_GAMES,
  ELO_SLOPE,
  ELO_START_RATING,
  ELO_STRANGER_MULTIPLIERS,
  ELO_STREAK_MULTIPLIERS,
} from "@/lib/config";
import {
  computeGroupElo,
  type EloStanding,
  eloBaseChange,
  eloExpected,
  eloLeague,
  eloLeagueStep,
  eloMatchChange,
  eloMultiplier,
  eloStrangers,
  eloStreakMultiplier,
  formatEloChange,
  formatEloChangeDetailed,
} from "./elo";
import type { GroupMatchRow } from "./group-titles";

// Partidas sintéticas (sin BD ni red). Los instantes se construyen en UTC explícito (`Date.parse`
// con `Z`): no dependen de la zona horaria de la máquina. Madrid está a UTC+2 en verano (CEST).
// Los valores esperados están calculados aparte (a mano, con la fórmula de F24 y las cifras de
// F28), no con el módulo.

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

describe("cambio de una partida (F24, F28)", () => {
  it("con rating 1500 el cambio base son exactamente los puntos del puesto", () => {
    expect(eloExpected(1500)).toBe(0.5);
    expect([1, 2, 3, 4, 5, 6].map((p) => eloBaseChange(p, 1500))).toEqual([
      12.5, 6, 1, -2.5, -7.5, -9.5,
    ]);
    expect([...ELO_PLACEMENT_POINTS]).toEqual([12.5, 6, 1, -2.5, -7.5, -9.5]);
  });

  it("los 6 puestos a 1500 sin desconocidos dan +12,5 / +6 / +1 / −2,5 / −7,5 / −9,5", () => {
    const rows = [1, 2, 3, 4, 5, 6].flatMap((p, i) =>
      game(p, [`m${i}`, `x${i}`, `y${i}`]),
    );
    const keys = rows.map((r) => r.puuid);
    const { standings } = computeGroupElo(rows, keys, NOW);
    expect(
      [0, 1, 2, 3, 4, 5].map(
        (i) => standing(standings, `m${i}`).history[0].delta,
      ),
    ).toEqual([12.5, 6, 1, -2.5, -7.5, -9.5]);
  });

  it("pendiente por encima de 1500: gana menos y pierde más", () => {
    expect(eloBaseChange(1, 1600)).toBeCloseTo(9.41857, 4);
    expect(eloBaseChange(6, 1600)).toBeCloseTo(-12.58143, 4);
    expect(eloBaseChange(1, 1525)).toBeCloseTo(11.70985, 4);
  });

  it("pendiente por debajo de 1500: gana más y pierde menos", () => {
    expect(eloBaseChange(1, 1400)).toBeCloseTo(15.58143, 4);
    expect(eloBaseChange(6, 1400)).toBeCloseTo(-6.41857, 4);
  });

  it("multiplicadores con 0, 1 y 2 desconocidos y cambio base positivo y negativo", () => {
    expect(eloMatchChange(1, 1500, 0)).toEqual({
      base: 12.5,
      multiplier: 1,
      streakMultiplier: 1,
      delta: 12.5,
    });
    expect(eloMatchChange(1, 1500, 1).delta).toBeCloseTo(13.75, 10);
    expect(eloMatchChange(1, 1500, 2).delta).toBeCloseTo(15, 10);
    expect(eloMatchChange(6, 1500, 0)).toEqual({
      base: -9.5,
      multiplier: 1,
      streakMultiplier: 1,
      delta: -9.5,
    });
    expect(eloMatchChange(6, 1500, 1).delta).toBeCloseTo(-8.075, 10);
    expect(eloMatchChange(6, 1500, 2).delta).toBeCloseTo(-7.6, 10);
    expect(eloMultiplier(10, 1)).toBe(1.1);
    expect(eloMultiplier(-10, 1)).toBe(0.85);
    expect(eloMultiplier(10, 2)).toBe(1.2);
    expect(eloMultiplier(-10, 2)).toBe(0.8);
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
      base: 12.5,
      multiplier: 1.2,
    });
    expect(first("a").delta).toBeCloseTo(15, 10);
    expect(first("b")).toMatchObject({
      strangers: 1,
      base: 12.5,
      multiplier: 1.1,
    });
    expect(first("d")).toMatchObject({
      strangers: 0,
      base: -9.5,
      multiplier: 1,
      delta: -9.5,
    });
    expect(first("g")).toMatchObject({
      strangers: 2,
      multiplier: 0.8,
    });
    expect(first("g").delta).toBeCloseTo(-7.6, 10);
    expect(first("h")).toMatchObject({
      strangers: 1,
      multiplier: 0.85,
    });
    expect(first("h").delta).toBeCloseTo(-8.075, 10);
  });

  it("un no miembro del equipo (aunque tenga filas, p. ej. un perfil registrado) es desconocido", () => {
    // `z` va en el equipo de `a` pero no es miembro: `a` juega con 2 desconocidos.
    const rows = game(1, ["a", "z"]);
    const { standings } = computeGroupElo(rows, ["a"], NOW);
    expect(standings.map((s) => s.key)).toEqual(["a"]);
    expect(standings[0].history[0]).toMatchObject({
      strangers: 2,
      multiplier: 1.2,
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
      base: 12.5,
    });
    expect(standing(standings, "a").rating).toBeCloseTo(1515, 10);
    expect(standing(standings, "b").history[0]).toMatchObject({
      strangers: 2,
      base: -2.5,
      multiplier: 0.8,
      delta: -2,
    });
    expect(standing(standings, "b").rating).toBe(1498);
  });

  it("orden cronológico y cada partida usa el rating de antes de ella", () => {
    const first = game(1, ["a"], { at: DAY_TS });
    const second = game(1, ["a"], { at: DAY_TS + 10 * MINUTE });
    // Filas desordenadas a propósito.
    const { standings } = computeGroupElo([...second, ...first], ["a"], NOW);
    const [g1, g2] = standing(standings, "a").history;
    expect(g1.matchId).toBe(first[0].matchId);
    expect(g1).toMatchObject({ ratingBefore: 1500, ratingAfter: 1515 });
    expect(g2.ratingBefore).toBe(1515);
    expect(g2.base).toBeCloseTo(12.025387, 5);
    // Segundo 1º seguido: racha ×1,5 sobre `base × 1,2`.
    expect(g2.delta).toBeCloseTo(21.645696, 5);
    expect(g2.ratingAfter).toBeCloseTo(1536.645696, 5);
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
    // `a` llega a la partida compartida con 1515; `b` con 1500.
    const rows = [...game(1, ["a"]), ...game(1, ["a", "b"])];
    const { standings } = computeGroupElo(rows, ["a", "b"], NOW);
    const shared = (key: string) => standing(standings, key).history.at(-1);
    expect(shared("a")?.ratingBefore).toBe(1515);
    expect(shared("b")?.ratingBefore).toBe(1500);
    expect(shared("b")?.delta).toBeCloseTo(13.75, 10);
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
    // Calculado aparte paso a paso (ningún 1º seguido de otro: sin racha):
    // 1500 → +15 → 1515 → −2,528421 → 1512,471579 → −9,894687 → 1502,576891
    // → +7,102099 → 1509,678990 → −6,635408 → 1503,043582 → +0,903641 → 1503,947223
    // → +13,612538 → 1517,559760
    expect(a.history.map((m) => m.strangers)).toEqual([2, 1, 0, 2, 1, 0, 1]);
    expect(a.history.map((m) => m.ratingAfter)).toEqual([
      expect.closeTo(1515, 5),
      expect.closeTo(1512.471579, 5),
      expect.closeTo(1502.576891, 5),
      expect.closeTo(1509.67899, 5),
      expect.closeTo(1503.043582, 5),
      expect.closeTo(1503.947223, 5),
      expect.closeTo(1517.55976, 5),
    ]);
    expect(a.rating).toBeCloseTo(1517.55976, 5);
    expect(a.roundedRating).toBe(1518);
    // 1518 está en el corte de Oro sin margen, pero con margen no llega a 1520: sigue en Plata.
    expect(eloLeague(a.rating).name).toBe("Oro");
    expect(a.league.name).toBe("Plata");
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
    // Solo cuenta la de las 06:00 (6º con 2 desconocidos, rating previo 1515).
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
    expect(standing(standings, "a").dayChange).toBeCloseTo(15, 10);
    expect(standing(standings, "b").dayChange).toBeNull();
    expect(standing(standings, "b").weekChange).toBeCloseTo(15, 10);
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
    expect(standing(standings, "b").dayChange).toBe(6 * 1.2);
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
      ["a", 1, 1515],
      ["b", 1, 1515],
      ["c", 3, 1500],
      ["d", 4, 1492],
    ]);
  });

  it("comparte posición con el mismo redondeado aunque los decimales difieran", () => {
    // `b`: 3º, 4º y 3º solo -> +1,2 = 1501,2, −2,030394 = 1499,169606 y +1,231549 =
    // 1500,401155 (→ 1500). `a` sin partidas: 1500. Comparten la 2ª posición; `b` va antes por
    // decimales. `c`: 1º solo, 1515.
    const rows = [...solo("b", [3, 4, 3]), ...solo("c", [1])];
    const { standings } = computeGroupElo(rows, ["a", "b", "c"], NOW);
    expect(standing(standings, "b").rating).toBeCloseTo(1500.401155, 5);
    expect(standings.map((s) => [s.key, s.position, s.roundedRating])).toEqual([
      ["c", 1, 1515],
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
// F28 — Cifras, racha y liga con margen (AC1, AC2 y AC3 de iter-12)
// ---------------------------------------------------------------------------------------------

/** Liga de `ELO_LEAGUES` por id. */
const league = (id: string) => {
  const found = ELO_LEAGUES.find((l) => l.id === id);
  if (!found) throw new Error(`Sin liga ${id}`);
  return found;
};

describe("cifras de F28 (AC1)", () => {
  it.each([
    [1, 12.5],
    [2, 6],
    [3, 1],
    [4, -2.5],
    [5, -7.5],
    [6, -9.5],
  ])("con R = 1500 y sin desconocidos ni racha, el %dº da %s", (placement, delta) => {
    expect(eloMatchChange(placement, 1500, 0)).toEqual({
      base: delta,
      multiplier: 1,
      streakMultiplier: 1,
      delta,
    });
  });

  it("la pendiente es 22·(E − 0,5)", () => {
    expect(ELO_SLOPE).toBe(22);
    for (const rating of [1300, 1450, 1525, 1700]) {
      expect(eloBaseChange(2, rating)).toBeCloseTo(
        6 - 22 * (eloExpected(rating) - 0.5),
        10,
      );
    }
  });

  it("multiplicadores por desconocidos ×1,10/×0,85 y ×1,20/×0,80", () => {
    expect(ELO_STRANGER_MULTIPLIERS).toEqual([
      { gain: 1, loss: 1 },
      { gain: 1.1, loss: 0.85 },
      { gain: 1.2, loss: 0.8 },
    ]);
  });
});

describe("racha de 1º seguidos (AC2)", () => {
  it("multiplicador por longitud: 1 → ×1, 2 → ×1,5, 3 o más → ×2; sin racha, ×1", () => {
    expect([...ELO_STREAK_MULTIPLIERS]).toEqual([1, 1, 1.5, 2]);
    expect([0, 1, 2, 3, 4, 10].map(eloStreakMultiplier)).toEqual([
      1, 1, 1.5, 2, 2, 2,
    ]);
  });

  it("1, 2, 3 y 4 seguidos: ×1, ×1,5, ×2 y ×2", () => {
    const { standings } = computeGroupElo(solo("a", [1, 1, 1, 1]), ["a"], NOW);
    const a = standing(standings, "a");
    expect(a.history.map((m) => m.streak)).toEqual([1, 2, 3, 4]);
    expect(a.history.map((m) => m.streakMultiplier)).toEqual([1, 1.5, 2, 2]);
    // Calculado aparte (2 desconocidos, ×1,2): 1500 → +15 → 1515 → +21,645696 → 1536,645696
    // → +27,225746 → 1563,871442 → +25,200654 → 1589,072095.
    expect(a.history.map((m) => m.delta)).toEqual([
      expect.closeTo(15, 5),
      expect.closeTo(21.645696, 5),
      expect.closeTo(27.225746, 5),
      expect.closeTo(25.200654, 5),
    ]);
    expect(a.rating).toBeCloseTo(1589.072095, 5);
    expect(a.streak).toBe(4);
  });

  it("cualquier otro puesto corta la racha", () => {
    const { standings } = computeGroupElo(solo("a", [1, 1, 2, 1]), ["a"], NOW);
    const a = standing(standings, "a");
    expect(a.history.map((m) => m.streak)).toEqual([1, 2, 0, 1]);
    expect(a.history.map((m) => m.streakMultiplier)).toEqual([1, 1.5, 1, 1]);
    // 1536,645696 → 2º: +5,812873 → 1542,458569 → 1º sin racha: +13,394869 → 1555,853438.
    expect(a.rating).toBeCloseTo(1555.853438, 5);
    expect(a.streak).toBe(1);
  });

  it("la racha en curso es 0 si la última partida no fue 1º", () => {
    const { standings } = computeGroupElo(
      solo("a", [1, 1, 3]),
      ["a", "b"],
      NOW,
    );
    expect(standing(standings, "a").streak).toBe(0);
    expect(standing(standings, "b").streak).toBe(0);
  });

  it("cruza días: el último 1º de un día y el primero del siguiente cuentan como seguidos", () => {
    // 2026-09-29 23:00 Madrid (día 29) y 2026-09-30 20:00 (día 30).
    const rows = [
      ...game(1, ["a"], { at: at("2026-09-29T21:00:00Z") }),
      ...game(1, ["a"], { at: DAY_TS }),
    ];
    const { standings } = computeGroupElo(rows, ["a"], NOW);
    const a = standing(standings, "a");
    expect(a.history.map((m) => m.streak)).toEqual([1, 2]);
    expect(a.history[1].streakMultiplier).toBe(1.5);
    expect(a.dayChange).toBeCloseTo(21.645696, 5);
  });

  it("se combina con los desconocidos: base × 1,10 × 2", () => {
    // `a` y `b` juntos (1 desconocido), tres 1º seguidos.
    const rows = [
      ...game(1, ["a", "b"]),
      ...game(1, ["a", "b"]),
      ...game(1, ["a", "b"]),
    ];
    const { standings } = computeGroupElo(rows, ["a", "b"], NOW);
    const third = standing(standings, "a").history[2];
    expect(third).toMatchObject({
      streak: 3,
      multiplier: 1.1,
      streakMultiplier: 2,
    });
    expect(third.delta).toBeCloseTo(third.base * 1.1 * 2, 10);
    // 1500 → +13,75 → 1513,75 → +19,907076 → 1533,657076 → +25,162983 → 1558,820059.
    expect(third.delta).toBeCloseTo(25.162983, 5);
    expect(third.ratingAfter).toBeCloseTo(1558.820059, 5);
  });

  it("no se aplica a cambios no positivos", () => {
    // Un 1º siempre tiene cambio base positivo, así que se comprueba con la función del cambio.
    expect(eloMatchChange(4, 1500, 2, 3)).toEqual({
      base: -2.5,
      multiplier: 0.8,
      streakMultiplier: 1,
      delta: -2,
    });
    // 3º con R = 1700: cambio base negativo (−4,714432).
    const high = eloMatchChange(3, 1700, 0, 3);
    expect(high.base).toBeCloseTo(-4.714432, 5);
    expect(high.streakMultiplier).toBe(1);
    expect(high.delta).toBe(high.base);
  });
});

describe("liga con margen (AC3)", () => {
  it(`el margen es ${ELO_LEAGUE_MARGIN} sobre el rating redondeado`, () => {
    expect(ELO_LEAGUE_MARGIN).toBe(10);
  });

  it("sube al llegar a min + 10 de la superior y no sube en + 9", () => {
    expect(eloLeagueStep(league("plata"), 1520).id).toBe("oro");
    expect(eloLeagueStep(league("plata"), 1519).id).toBe("plata");
    expect(eloLeagueStep(league("plata"), 1519.5).id).toBe("oro");
    expect(eloLeagueStep(league("plata"), 1519.49).id).toBe("plata");
  });

  it("baja al llegar a min − 10 de la propia y no baja en − 9", () => {
    expect(eloLeagueStep(league("oro"), 1500).id).toBe("plata");
    expect(eloLeagueStep(league("oro"), 1501).id).toBe("oro");
    expect(eloLeagueStep(league("oro"), 1500.49).id).toBe("plata");
    expect(eloLeagueStep(league("oro"), 1500.5).id).toBe("oro");
  });

  it("dentro del margen se queda en la liga actual", () => {
    // 1505 es Plata sin margen, pero desde Oro no ha bajado a 1500.
    expect(eloLeague(1505).id).toBe("plata");
    expect(eloLeagueStep(league("oro"), 1505).id).toBe("oro");
    expect(eloLeagueStep(league("plata"), 1515).id).toBe("plata");
  });

  it("salta varias ligas con un cambio grande", () => {
    expect(eloLeagueStep(league("plata"), 1600).id).toBe("diamante");
    expect(eloLeagueStep(league("plata"), 1579).id).toBe("platino");
    expect(eloLeagueStep(league("plata"), 1400).id).toBe("hierro");
    expect(eloLeagueStep(league("plata"), 1441).id).toBe("bronce");
  });

  it("Hierro no tiene suelo y Diamante no tiene techo", () => {
    expect(eloLeagueStep(league("hierro"), 1000).id).toBe("hierro");
    expect(eloLeagueStep(league("hierro"), 1459).id).toBe("hierro");
    expect(eloLeagueStep(league("hierro"), 1460).id).toBe("bronce");
    expect(eloLeagueStep(league("diamante"), 2000).id).toBe("diamante");
    expect(eloLeagueStep(league("diamante"), 1561).id).toBe("diamante");
    expect(eloLeagueStep(league("diamante"), 1560).id).toBe("platino");
  });

  it("un miembro sin partidas está en Plata", () => {
    const { standings } = computeGroupElo([], ["a"], NOW);
    expect(standings[0]).toMatchObject({ streak: 0 });
    expect(standings[0].league.id).toBe("plata");
  });

  it("computeGroupElo lleva la liga con margen partida a partida", () => {
    // 2 desconocidos. Calculado aparte: 1º 1515 (Plata) · 1º 1536,645696 (Oro) · 6º 1528,120945
    // · 6º 1519,810236 · 6º 1511,709017 · 6º 1503,812558 (sigue en Oro: no ha bajado a 1500)
    // · 6º 1496,115996 (Plata).
    const placements = [1, 1, 6, 6, 6, 6];
    const six = computeGroupElo(solo("a", placements), ["a"], NOW);
    const a6 = standing(six.standings, "a");
    expect(a6.rating).toBeCloseTo(1503.812558, 5);
    expect(eloLeague(a6.rating).id).toBe("plata");
    expect(a6.league.id).toBe("oro");

    const seven = computeGroupElo(solo("a", [...placements, 6]), ["a"], NOW);
    const a7 = standing(seven.standings, "a");
    expect(a7.rating).toBeCloseTo(1496.115996, 5);
    expect(a7.league.id).toBe("plata");

    const climb = computeGroupElo(solo("a", [1, 1, 1, 1]), ["a"], NOW);
    // 1589,072095: Diamante (1580 o más) desde Plata, pasando por Oro y Platino.
    expect(standing(climb.standings, "a").league.id).toBe("diamante");
    const one = computeGroupElo(solo("a", [1]), ["a"], NOW);
    // 1515: sin margen sería Oro; con margen sigue en Plata.
    expect(standing(one.standings, "a").league.id).toBe("plata");
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
