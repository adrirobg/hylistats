import { describe, expect, it } from "vitest";
import {
  GROUP_TEAM_MIN_GAMES,
  GROUP_WEEK_MIN_GAMES,
  RECORD_DAY_MIN_GAMES,
} from "@/lib/config";
import {
  type AwardedTitle,
  awardTitles,
  computeGroupPeriod,
  computePlayerStats,
  computeTeams,
  displayedPeriod,
  type GroupMatchRow,
  gameDayStart,
  gameWeek,
  periodOf,
  rankPlayers,
  TITLE_DEFINITIONS,
  TITLE_RULES,
  type TitleId,
  titlesOf,
} from "./group-titles";
import { gameDay } from "./records";

// Partidas sintéticas (sin BD ni red). Los instantes se construyen en UTC explícito (`Date.parse`
// con `Z`): no dependen de la zona horaria de la máquina. Madrid está a UTC+2 en verano (CEST) y a
// UTC+1 en invierno (CET).

const at = (iso: string) => Date.parse(iso);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Miércoles 2026-09-30, 20:00 en Madrid: día de juego 2026-09-30, semana del lunes 2026-09-28. */
const DAY_TS = at("2026-09-30T18:00:00Z");
/** `now` dentro del mismo día de juego. */
const NOW = at("2026-09-30T22:00:00Z");

let seq = 0;

interface GameOptions {
  at?: number;
  matchId?: string;
  subteam?: number;
  /** Daño a campeones de cada fila (uno para todas o uno por miembro). */
  damage?: number | number[];
}

/** Una partida en la que `puuids` (miembros) van en el mismo equipo y quedan en `placement`. */
function game(
  placement: number,
  puuids: string[],
  options: GameOptions = {},
): GroupMatchRow[] {
  seq += 1;
  const ts = options.at ?? DAY_TS + seq * MINUTE;
  const matchId = options.matchId ?? `EUW1_${seq}`;
  return puuids.map((puuid, i) => ({
    puuid,
    matchId,
    gameStartTimestamp: ts,
    gameCreation: ts,
    playerSubteamId: options.subteam ?? 1,
    placement,
    totalDamageDealtToChampions: Array.isArray(options.damage)
      ? options.damage[i]
      : (options.damage ?? 10_000),
  }));
}

/** Partidas de un miembro solo (sin otros miembros en su equipo), una por puesto. */
function solo(
  puuid: string,
  placements: number[],
  options: Omit<GameOptions, "matchId"> = {},
): GroupMatchRow[] {
  return placements.flatMap((placement) => game(placement, [puuid], options));
}

/** Partidas de un equipo de miembros, una por puesto. */
function team(
  puuids: string[],
  placements: number[],
  options: Omit<GameOptions, "matchId"> = {},
): GroupMatchRow[] {
  return placements.flatMap((placement) => game(placement, puuids, options));
}

const find = (titles: AwardedTitle[], id: TitleId) =>
  titles.find((title) => title.id === id);
const holdersOf = (titles: AwardedTitle[], id: TitleId) =>
  find(titles, id)?.holders.map((holder) => holder.puuids);

const day = (rows: GroupMatchRow[]) => computeGroupPeriod(rows, NOW, "day");
const week = (rows: GroupMatchRow[]) => computeGroupPeriod(rows, NOW, "week");

describe("semana de juego", () => {
  it("empieza el lunes a las 06:00 de Madrid: 05:59 es la semana anterior", () => {
    // Lunes 2026-09-28 (CEST, UTC+2): 05:59 local = 03:59Z; 06:00 local = 04:00Z.
    expect(gameWeek(at("2026-09-28T03:59:00Z"))).toBe("2026-09-21");
    expect(gameWeek(at("2026-09-28T03:59:59.999Z"))).toBe("2026-09-21");
    expect(gameWeek(at("2026-09-28T04:00:00Z"))).toBe("2026-09-28");
  });

  it("el domingo por la noche y la madrugada del lunes siguen en la semana", () => {
    expect(gameWeek(at("2026-10-04T21:30:00Z"))).toBe("2026-09-28"); // dom 23:30
    expect(gameWeek(at("2026-10-05T01:00:00Z"))).toBe("2026-09-28"); // lun 03:00
    expect(gameWeek(DAY_TS)).toBe("2026-09-28"); // miércoles
  });

  it("semana del 2026-03-29 (paso a CEST el domingo): dura 7 días menos 1 h", () => {
    // Empieza el lunes 23 a las 06:00 CET (05:00Z) y acaba el lunes 30 a las 06:00 CEST (04:00Z).
    expect(gameWeek(at("2026-03-23T04:59:00Z"))).toBe("2026-03-16");
    expect(gameWeek(at("2026-03-23T05:00:00Z"))).toBe("2026-03-23");
    // Domingo 29 a las 05:30 CEST (03:30Z): día de juego del sábado 28, misma semana.
    expect(gameWeek(at("2026-03-29T03:30:00Z"))).toBe("2026-03-23");
    expect(gameWeek(at("2026-03-30T03:59:00Z"))).toBe("2026-03-23");
    expect(gameWeek(at("2026-03-30T04:00:00Z"))).toBe("2026-03-30");

    const period = periodOf("week", "2026-03-23");
    expect(period.start).toBe(at("2026-03-23T05:00:00Z"));
    expect(period.end).toBe(at("2026-03-30T04:00:00Z"));
    expect(period.end - period.start).toBe(7 * 24 * HOUR - HOUR);
    expect(period.lastDay).toBe("2026-03-29");
  });

  it("semana del 2026-10-25 (vuelta a CET el domingo): dura 7 días más 1 h", () => {
    // Empieza el lunes 19 a las 06:00 CEST (04:00Z) y acaba el lunes 26 a las 06:00 CET (05:00Z).
    expect(gameWeek(at("2026-10-19T03:59:00Z"))).toBe("2026-10-12");
    expect(gameWeek(at("2026-10-19T04:00:00Z"))).toBe("2026-10-19");
    // Domingo 25 a las 05:30 CET (04:30Z): día de juego del sábado 24, misma semana.
    expect(gameWeek(at("2026-10-25T04:30:00Z"))).toBe("2026-10-19");
    expect(gameWeek(at("2026-10-26T04:59:00Z"))).toBe("2026-10-19");
    expect(gameWeek(at("2026-10-26T05:00:00Z"))).toBe("2026-10-26");

    const period = periodOf("week", "2026-10-19");
    expect(period.start).toBe(at("2026-10-19T04:00:00Z"));
    expect(period.end).toBe(at("2026-10-26T05:00:00Z"));
    expect(period.end - period.start).toBe(7 * 24 * HOUR + HOUR);
  });

  it("es coherente con gameDay y con los límites del periodo en las semanas con cambio de hora", () => {
    for (const [from, to] of [
      ["2026-03-16T00:00:00Z", "2026-04-07T00:00:00Z"],
      ["2026-10-12T00:00:00Z", "2026-11-03T00:00:00Z"],
    ]) {
      for (let ts = at(from); ts < at(to); ts += 15 * MINUTE) {
        const key = gameWeek(ts);
        const monday = new Date(`${key}T00:00:00Z`);
        expect(monday.getUTCDay()).toBe(1);
        const dayPeriod = periodOf("day", gameDay(ts));
        expect(ts).toBeGreaterThanOrEqual(dayPeriod.start);
        expect(ts).toBeLessThan(dayPeriod.end);
        const weekPeriod = periodOf("week", key);
        expect(ts).toBeGreaterThanOrEqual(weekPeriod.start);
        expect(ts).toBeLessThan(weekPeriod.end);
      }
    }
  });

  it("gameDayStart es las 06:00 de Madrid, también en los días de cambio de hora", () => {
    expect(gameDayStart("2026-09-30")).toBe(at("2026-09-30T04:00:00Z"));
    expect(gameDayStart("2026-01-15")).toBe(at("2026-01-15T05:00:00Z"));
    expect(gameDayStart("2026-03-29")).toBe(at("2026-03-29T04:00:00Z"));
    expect(gameDayStart("2026-10-25")).toBe(at("2026-10-25T05:00:00Z"));
  });
});

describe("periodo mostrado", () => {
  it("con partidas en el periodo actual, muestra el actual", () => {
    const rows = solo("A", [2]);
    const dayPeriod = displayedPeriod(rows, NOW, "day");
    expect(dayPeriod).toMatchObject({
      kind: "day",
      key: "2026-09-30",
      label: "30 sept",
      isCurrent: true,
      start: at("2026-09-30T04:00:00Z"),
      end: at("2026-10-01T04:00:00Z"),
    });
    const weekPeriod = displayedPeriod(rows, NOW, "week");
    expect(weekPeriod).toMatchObject({
      kind: "week",
      key: "2026-09-28",
      label: "28 sept – 4 oct",
      isCurrent: true,
    });
  });

  it("con el día actual vacío, muestra el último día con partidas e indica su fecha", () => {
    const rows = [
      ...solo("A", [3], { at: at("2026-09-27T18:00:00Z") }), // domingo 27
      ...solo("B", [1], { at: at("2026-09-29T02:00:00Z") }), // mar 04:00 -> día lunes 28
      ...solo("C", [2], { at: at("2026-09-20T18:00:00Z") }),
    ];
    const now = at("2026-09-30T10:00:00Z");
    const dayPeriod = displayedPeriod(rows, now, "day");
    expect(dayPeriod).toMatchObject({
      key: "2026-09-28",
      label: "28 sept",
      isCurrent: false,
    });
    // La semana actual (lunes 28) sí tiene la partida de B.
    expect(displayedPeriod(rows, now, "week")).toMatchObject({
      key: "2026-09-28",
      isCurrent: true,
    });
  });

  it("con la semana actual vacía, muestra la última semana con partidas", () => {
    const rows = [
      ...solo("A", [3], { at: at("2026-09-20T18:00:00Z") }), // semana del 14
      ...solo("B", [1], { at: at("2026-09-27T18:00:00Z") }), // semana del 21
    ];
    const view = week(rows);
    expect(view.period).toMatchObject({
      key: "2026-09-21",
      label: "21 sept – 27 sept",
      isCurrent: false,
    });
    expect(view.ranking.belowMinimum.map((p) => p.puuid)).toEqual(["B"]);
  });

  it("indica el año si no es el de now", () => {
    const rows = solo("A", [3], { at: at("2025-12-30T18:00:00Z") });
    expect(displayedPeriod(rows, NOW, "week").label).toBe(
      "29 dic 2025 – 4 ene",
    );
  });

  it("sin ninguna partida, muestra el periodo actual vacío", () => {
    const view = day([]);
    expect(view.period).toMatchObject({ key: "2026-09-30", isCurrent: true });
    expect(view.ranking).toEqual({ ranked: [], belowMinimum: [] });
    expect(view.teams).toEqual({ duos: [], trios: [] });
    expect(view.titles).toEqual([]);
  });

  it("ignora filas con puesto fuera de 1..6 y periodos posteriores al actual", () => {
    const rows = [
      ...solo("A", [3], { at: at("2026-09-28T18:00:00Z") }),
      ...solo("B", [0], { at: at("2026-09-29T18:00:00Z") }),
      ...solo("C", [2], { at: at("2026-10-02T18:00:00Z") }), // futuro
    ];
    expect(displayedPeriod(rows, NOW, "day").key).toBe("2026-09-28");
  });

  it("solo cuentan las partidas del periodo mostrado", () => {
    const rows = [
      ...solo("A", [1, 1, 1]),
      ...solo("A", [6, 6, 6], { at: at("2026-09-29T18:00:00Z") }),
    ];
    const view = day(rows);
    expect(view.ranking.ranked).toHaveLength(1);
    expect(view.ranking.ranked[0]).toMatchObject({ games: 3, firsts: 3 });
    expect(week(rows).ranking.ranked[0]).toMatchObject({
      games: 6,
      firsts: 3,
      avgPlacement: 3.5,
    });
  });
});

describe("ranking del periodo", () => {
  it("ordena por puesto medio con partidas y 1º; los que no llegan al mínimo van aparte", () => {
    const rows = [
      ...solo("A", [4, 4, 4]),
      ...solo("B", [1, 2, 3, 1]),
      ...solo("C", [1, 1]), // por debajo del mínimo del día
    ];
    const { ranked, belowMinimum } = day(rows).ranking;
    expect(ranked).toEqual([
      expect.objectContaining({
        position: 1,
        puuid: "B",
        games: 4,
        firsts: 2,
        avgPlacement: 1.75,
      }),
      expect.objectContaining({
        position: 2,
        puuid: "A",
        games: 3,
        firsts: 0,
        avgPlacement: 4,
      }),
    ]);
    expect(belowMinimum).toEqual([
      expect.objectContaining({ puuid: "C", games: 2, firsts: 2 }),
    ]);
  });

  it("los empates de puesto medio comparten posición (1, 1, 1, 4)", () => {
    const rows = [
      ...solo("A", [2, 2, 2]),
      ...solo("B", [1, 2, 3]),
      ...solo("C", [3, 3, 3]),
      ...solo("D", [1, 3, 2, 2, 3, 1]), // 2,00 con 6 partidas: igual que A y B
    ];
    const { ranked } = day(rows).ranking;
    expect(ranked.map((entry) => [entry.puuid, entry.position])).toEqual([
      ["D", 1], // mismo puesto medio: primero el de más partidas
      ["A", 1],
      ["B", 1],
      ["C", 4],
    ]);
  });

  it(`mínimo del día: ${RECORD_DAY_MIN_GAMES} partidas; de la semana: ${GROUP_WEEK_MIN_GAMES}`, () => {
    expect(RECORD_DAY_MIN_GAMES).toBe(3);
    expect(GROUP_WEEK_MIN_GAMES).toBe(5);
    const players = computePlayerStats([
      ...solo("A", [1, 1, 1, 1, 1]),
      ...solo("B", [1, 1, 1, 1]),
      ...solo("C", [1, 1, 1]),
      ...solo("D", [1, 1]),
    ]);
    const dayRanking = rankPlayers(players, RECORD_DAY_MIN_GAMES);
    expect(dayRanking.ranked.map((p) => p.puuid)).toEqual(["A", "B", "C"]);
    expect(dayRanking.belowMinimum.map((p) => p.puuid)).toEqual(["D"]);
    const weekRanking = rankPlayers(players, GROUP_WEEK_MIN_GAMES);
    expect(weekRanking.ranked.map((p) => p.puuid)).toEqual(["A"]);
    expect(weekRanking.belowMinimum.map((p) => p.puuid)).toEqual([
      "B",
      "C",
      "D",
    ]);
  });
});

describe("dúos y tríos", () => {
  it("un trío de miembros aporta el trío y sus tres dúos (dúo dentro de un trío)", () => {
    const { duos, trios } = computeTeams(team(["C", "A", "B"], [1, 3, 5]));
    expect(trios).toEqual([
      {
        puuids: ["A", "B", "C"],
        key: "A,B,C",
        games: 3,
        firsts: 1,
        firstRate: 1 / 3,
        avgPlacement: 3,
        lastPlayedAt: expect.any(Number),
      },
    ]);
    expect(duos.map((duo) => duo.key)).toEqual(["A,B", "A,C", "B,C"]);
    for (const duo of duos) {
      expect(duo).toMatchObject({ games: 3, firsts: 1, avgPlacement: 3 });
    }
  });

  it("un trío con un externo no es trío pero sí genera su dúo", () => {
    // Solo llegan filas de miembros: A y B con un externo en el equipo son dos filas.
    const { duos, trios } = computeTeams(team(["A", "B"], [2, 2, 2]));
    expect(trios).toEqual([]);
    expect(duos).toEqual([
      expect.objectContaining({ puuids: ["A", "B"], games: 3 }),
    ]);
  });

  it("equipo = misma partida y mismo playerSubteamId; un miembro solo no genera nada", () => {
    const rows = [
      ...game(1, ["A", "B"], { matchId: "M1", subteam: 3 }),
      ...game(4, ["C", "D"], { matchId: "M1", subteam: 5 }),
      ...game(6, ["E"], { matchId: "M1", subteam: 2 }),
    ];
    const { duos, trios } = computeTeams(rows);
    expect(trios).toEqual([]);
    expect(duos.map((duo) => [duo.key, duo.avgPlacement])).toEqual([
      ["A,B", 1],
      ["C,D", 4],
    ]);
  });

  it("junta las partidas de un mismo dúo en tríos distintos", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 2]),
      ...team(["A", "B"], [6]),
      ...team(["A", "B", "D"], [3]),
    ];
    const { duos, trios } = computeTeams(rows);
    expect(duos.find((duo) => duo.key === "A,B")).toMatchObject({
      games: 4,
      firsts: 1,
      avgPlacement: 3,
    });
    expect(trios.map((trio) => [trio.key, trio.games])).toEqual([
      ["A,B,C", 2],
      ["A,B,D", 1],
    ]);
  });
});

describe("títulos individuales", () => {
  it("El trol, El pacifista y El D-d-d-diablo del día con su porqué", () => {
    const rows = [
      ...solo("A", [5, 4, 5, 4, 5], { damage: 8_000 }),
      ...solo("B", [1, 2, 3], { damage: 30_000 }),
      ...solo("C", [2, 2, 2], { damage: 15_000 }),
    ];
    const { titles } = day(rows);
    expect(find(titles, "troll")).toEqual({
      id: "troll",
      kind: "day",
      subject: "player",
      metric: "avgPlacement",
      name: "El trol del día",
      holders: [
        {
          puuids: ["A"],
          value: 4.6,
          games: 5,
          firsts: 0,
          avgPlacement: 4.6,
          avgDamage: 8_000,
          why: "Peor puesto medio del día: 4,60 en 5 partidas",
        },
      ],
    });
    expect(find(titles, "pacifist")?.holders).toEqual([
      expect.objectContaining({
        puuids: ["A"],
        value: 8_000,
        games: 5,
        why: "Menos daño medio a campeones del día: 8.000 por partida en 5 partidas",
      }),
    ]);
    expect(find(titles, "devil")).toMatchObject({
      name: "El D-d-d-diablo del día",
      metric: "avgDamage",
      holders: [
        {
          puuids: ["B"],
          value: 30_000,
          why: "Más daño medio a campeones del día: 30.000 por partida en 3 partidas",
        },
      ],
    });
  });

  it("el daño medio es por partida, no el total", () => {
    const rows = [
      ...solo("A", [3, 3, 3, 3, 3, 3], { damage: 10_000 }), // 60.000 en total
      ...solo("B", [3, 3, 3], { damage: 15_000 }), // 45.000 en total
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "devil")).toEqual([["B"]]);
    expect(holdersOf(titles, "pacifist")).toEqual([["A"]]);
  });

  it("empate en la métrica y en partidas: el título se comparte", () => {
    const rows = [
      ...solo("A", [6, 4, 5], { damage: 9_000 }),
      ...solo("B", [5, 5, 5], { damage: 9_000 }),
      ...solo("C", [1, 1, 1], { damage: 20_000 }),
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "troll")).toEqual([["A"], ["B"]]);
    expect(holdersOf(titles, "pacifist")).toEqual([["A"], ["B"]]);
    expect(find(titles, "troll")?.holders.map((h) => h.value)).toEqual([5, 5]);
  });

  it("empate en la métrica: desempata quien jugó más partidas", () => {
    const rows = [
      ...solo("A", [5, 5, 5, 5], { damage: 9_000 }), // 4 partidas
      ...solo("B", [5, 5, 5], { damage: 9_000 }), // 3 partidas, mismas medias
      ...solo("C", [1, 1, 1], { damage: 20_000 }),
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "troll")).toEqual([["A"]]);
    expect(holdersOf(titles, "pacifist")).toEqual([["A"]]);
    expect(find(titles, "troll")?.holders[0]).toMatchObject({
      value: 5,
      games: 4,
    });
  });

  it("un solo clasificado: no se otorga ningún título individual", () => {
    const rows = [...solo("A", [6, 6, 6]), ...solo("B", [1, 1])];
    const { titles } = day(rows);
    expect(find(titles, "troll")).toBeUndefined();
    expect(find(titles, "pacifist")).toBeUndefined();
    expect(find(titles, "devil")).toBeUndefined();
  });

  it("jugador justo en el mínimo del día opta; uno por debajo no", () => {
    const rows = [
      ...solo("A", [4, 4, 4]), // 3: justo en el mínimo
      ...solo("B", [2, 2, 2]),
      ...solo("C", [6, 6]), // 2: por debajo, aunque sería el peor
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "troll")).toEqual([["A"]]);
  });

  it("de la semana: mínimo de 5 partidas y nombre con el periodo", () => {
    const rows = [
      ...solo("A", [4, 4, 4, 4, 4]), // 5: justo en el mínimo
      ...solo("B", [2, 2, 2, 2, 2, 2]),
      ...solo("C", [6, 6, 6, 6]), // 4: por debajo
    ];
    const { titles, ranking } = week(rows);
    expect(ranking.belowMinimum.map((p) => p.puuid)).toEqual(["C"]);
    expect(find(titles, "troll")).toMatchObject({
      kind: "week",
      name: "El trol de la semana",
      holders: [
        {
          puuids: ["A"],
          why: "Peor puesto medio de la semana: 4,00 en 5 partidas",
        },
      ],
    });
    expect(find(titles, "pacifist")?.name).toBe("El pacifista de la semana");
    expect(find(titles, "devil")?.name).toBe("El D-d-d-diablo de la semana");
    // En el día (mismo miércoles) C sí llega al mínimo de 3 y es el trol.
    expect(holdersOf(day(rows).titles, "troll")).toEqual([["C"]]);
  });
});

describe("títulos de trío", () => {
  it("Equipo roto (más 1º) y Equipo mental boom (peor puesto medio) del día", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 1, 4]),
      ...team(["D", "E", "F"], [1, 5, 6]),
    ];
    const { titles } = day(rows);
    expect(find(titles, "brokenTrio")).toEqual({
      id: "brokenTrio",
      kind: "day",
      subject: "trio",
      metric: "firsts",
      name: "Equipo roto del día",
      holders: [
        {
          puuids: ["A", "B", "C"],
          value: 2,
          games: 3,
          firsts: 2,
          avgPlacement: 2,
          avgDamage: null,
          why: "Más 1º juntos del día: 2 en 3 partidas (puesto medio 2,00)",
        },
      ],
    });
    expect(find(titles, "boomTrio")).toMatchObject({
      name: "Equipo mental boom del día",
      holders: [
        {
          puuids: ["D", "E", "F"],
          value: 4,
          why: "Peor puesto medio juntos del día: 4,00 en 3 partidas",
        },
      ],
    });
  });

  it("Equipo roto: a igual nº de 1º desempata el mejor puesto medio", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 3, 3]),
      ...team(["D", "E", "F"], [1, 2, 2]),
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "brokenTrio")).toEqual([["D", "E", "F"]]);
  });

  it("Equipo roto: empate en 1º y en puesto medio, el título se comparte", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 3, 5]),
      ...team(["D", "E", "F"], [1, 4, 4]),
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "brokenTrio")).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]);
    expect(holdersOf(titles, "boomTrio")).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]);
  });

  it("Equipo roto: a igual nº de 1º y puesto medio desempatan las partidas juntos", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 4, 4, 3]), // 1 primero, 3,00 en 4 partidas
      ...team(["D", "E", "F"], [1, 4, 4]), // 1 primero, 3,00 en 3 partidas
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "brokenTrio")).toEqual([["A", "B", "C"]]);
    // Mental boom: mismo puesto medio, también gana el de más partidas.
    expect(holdersOf(titles, "boomTrio")).toEqual([["A", "B", "C"]]);
  });

  it("Equipo roto exige al menos un 1º: si ningún trío tiene 1º, no se otorga", () => {
    const rows = [
      ...team(["A", "B", "C"], [2, 2, 3]),
      ...team(["D", "E", "F"], [5, 5, 6]),
    ];
    const { titles } = day(rows);
    expect(find(titles, "brokenTrio")).toBeUndefined();
    // El resto de títulos de trío no cambia.
    expect(holdersOf(titles, "boomTrio")).toEqual([["D", "E", "F"]]);
  });

  it("Equipo roto con un solo 1º del mejor trío: se otorga", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 5, 5]),
      ...team(["D", "E", "F"], [2, 2, 2]),
    ];
    expect(find(day(rows).titles, "brokenTrio")?.holders).toEqual([
      expect.objectContaining({
        puuids: ["A", "B", "C"],
        value: 1,
        why: "Más 1º juntos del día: 1 en 3 partidas (puesto medio 3,67)",
      }),
    ]);
  });

  it("el mismo trío puede ser roto y mental boom a la vez", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 6, 6]), // más 1º y peor puesto medio (4,33)
      ...team(["D", "E", "F"], [2, 2, 2]),
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "brokenTrio")).toEqual([["A", "B", "C"]]);
    expect(holdersOf(titles, "boomTrio")).toEqual([["A", "B", "C"]]);
  });

  it("un solo trío clasificado: no se otorga", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 1, 1]),
      ...team(["D", "E", "F"], [6, 6]), // por debajo del mínimo
    ];
    const { titles } = day(rows);
    expect(find(titles, "brokenTrio")).toBeUndefined();
    expect(find(titles, "boomTrio")).toBeUndefined();
  });

  it(`trío justo en el mínimo (${GROUP_TEAM_MIN_GAMES} juntos) opta; uno por debajo no`, () => {
    expect(GROUP_TEAM_MIN_GAMES).toBe(3);
    const rows = [
      ...team(["A", "B", "C"], [4, 4, 4]), // 3: justo en el mínimo
      ...team(["D", "E", "F"], [2, 2, 2, 2]),
      ...team(["A", "D", "G"], [6, 6]), // 2: por debajo, aunque sería el peor
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "boomTrio")).toEqual([["A", "B", "C"]]);
  });

  it("un trío con un externo no opta a títulos de trío pero sí su dúo a los de dúo", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 1, 1]),
      ...team(["D", "E"], [6, 6, 6]), // D y E con un externo
    ];
    const { titles, teams } = day(rows);
    expect(teams.trios.map((trio) => trio.key)).toEqual(["A,B,C"]);
    expect(find(titles, "brokenTrio")).toBeUndefined(); // un solo trío
    expect(holdersOf(titles, "boomDuo")).toEqual([["D", "E"]]);
  });

  it("en la semana: nombre con el periodo y el mismo mínimo de partidas juntos", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 2, 2]),
      ...team(["D", "E", "F"], [3, 3, 3], { at: at("2026-09-28T18:00:00Z") }),
    ];
    const { titles } = week(rows);
    expect(find(titles, "brokenTrio")?.name).toBe("Equipo roto de la semana");
    expect(find(titles, "boomTrio")).toMatchObject({
      name: "Equipo mental boom de la semana",
      holders: [
        {
          puuids: ["D", "E", "F"],
          why: "Peor puesto medio juntos de la semana: 3,00 en 3 partidas",
        },
      ],
    });
  });
});

describe("títulos de dúo", () => {
  it("Pareja rota y Pareja mental boom; los dúos de un trío cuentan", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 1, 3]), // aporta A-B, A-C y B-C
      ...team(["A", "B"], [1]), // A-B: 4 partidas, 3 primeros, 1,50
      ...team(["D", "E"], [6, 5, 6]),
    ];
    const { titles } = day(rows);
    expect(find(titles, "brokenDuo")).toMatchObject({
      name: "Pareja rota del día",
      subject: "duo",
      holders: [
        {
          puuids: ["A", "B"],
          value: 3,
          games: 4,
          avgPlacement: 1.5,
          why: "Más 1º juntos del día: 3 en 4 partidas (puesto medio 1,50)",
        },
      ],
    });
    expect(find(titles, "boomDuo")).toMatchObject({
      name: "Pareja mental boom del día",
      holders: [
        {
          puuids: ["D", "E"],
          value: 17 / 3,
          why: "Peor puesto medio juntos del día: 5,67 en 3 partidas",
        },
      ],
    });
    // Un solo trío: sin títulos de trío.
    expect(find(titles, "brokenTrio")).toBeUndefined();
  });

  it("Pareja rota: a igual nº de 1º desempata el mejor puesto medio", () => {
    const rows = [
      ...team(["A", "B"], [1, 4, 4]),
      ...team(["C", "D"], [1, 3, 3]),
    ];
    expect(holdersOf(day(rows).titles, "brokenDuo")).toEqual([["C", "D"]]);
  });

  it("Pareja rota: a igual nº de 1º y puesto medio desempatan las partidas juntos", () => {
    const rows = [
      ...team(["A", "B"], [1, 4, 4, 3]), // 1 primero, 3,00 en 4 partidas
      ...team(["C", "D"], [1, 4, 4]), // 1 primero, 3,00 en 3 partidas
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "brokenDuo")).toEqual([["A", "B"]]);
    expect(holdersOf(titles, "boomDuo")).toEqual([["A", "B"]]);
  });

  it("Pareja rota exige al menos un 1º: sin ninguno no se otorga; con uno sí", () => {
    const none = [
      ...team(["A", "B"], [2, 2, 2]),
      ...team(["C", "D"], [4, 4, 4]),
    ];
    expect(find(day(none).titles, "brokenDuo")).toBeUndefined();
    expect(holdersOf(day(none).titles, "boomDuo")).toEqual([["C", "D"]]);
    const one = [
      ...team(["A", "B"], [2, 2, 2]),
      ...team(["C", "D"], [1, 4, 4]),
    ];
    expect(holdersOf(day(one).titles, "brokenDuo")).toEqual([["C", "D"]]);
  });

  it("empate (mismas partidas): los tres dúos de un trío comparten el título", () => {
    const rows = [
      ...team(["A", "B", "C"], [5, 5, 5]),
      ...team(["D", "E"], [1, 1, 1]),
    ];
    const { titles } = day(rows);
    expect(holdersOf(titles, "boomDuo")).toEqual([
      ["A", "B"],
      ["A", "C"],
      ["B", "C"],
    ]);
  });

  it("un solo dúo clasificado: no se otorga; justo en el mínimo sí", () => {
    const one = [...team(["A", "B"], [1, 1, 1]), ...team(["C", "D"], [6, 6])];
    expect(find(day(one).titles, "brokenDuo")).toBeUndefined();
    expect(find(day(one).titles, "boomDuo")).toBeUndefined();
    const two = [...one, ...team(["C", "D"], [6])];
    expect(holdersOf(day(two).titles, "brokenDuo")).toEqual([["A", "B"]]);
    expect(holdersOf(day(two).titles, "boomDuo")).toEqual([["C", "D"]]);
  });
});

describe("títulos por jugador (badges)", () => {
  it("un título de dúo o trío sale para cada uno de sus miembros", () => {
    const rows = [
      ...team(["A", "B", "C"], [1, 1, 2], { damage: 20_000 }),
      ...team(["D", "E", "F"], [5, 6, 6], { damage: 5_000 }),
    ];
    const { titles } = day(rows);
    const idsOf = (puuid: string) =>
      titlesOf(titles, puuid).map(({ title }) => title.id);
    for (const puuid of ["A", "B", "C"]) {
      expect(idsOf(puuid)).toEqual(
        expect.arrayContaining(["devil", "brokenTrio", "brokenDuo"]),
      );
      expect(idsOf(puuid)).not.toContain("troll");
    }
    for (const puuid of ["D", "E", "F"]) {
      expect(idsOf(puuid)).toEqual(
        expect.arrayContaining(["troll", "pacifist", "boomTrio", "boomDuo"]),
      );
    }
    // Cada miembro ve su propio dúo, con su porqué.
    const duoOfA = titlesOf(titles, "A").filter(
      ({ title }) => title.id === "brokenDuo",
    );
    expect(duoOfA.map(({ holder }) => holder.puuids)).toEqual([
      ["A", "B"],
      ["A", "C"],
    ]);
    expect(titlesOf(titles, "Z")).toEqual([]);
  });
});

describe("definiciones y reglas", () => {
  it("lista los 7 títulos con su métrica, periodos y mínimo", () => {
    expect(TITLE_DEFINITIONS.map((d) => [d.id, d.name, d.subject])).toEqual([
      ["troll", "El trol", "player"],
      ["pacifist", "El pacifista", "player"],
      ["devil", "El D-d-d-diablo", "player"],
      ["brokenTrio", "Equipo roto", "trio"],
      ["boomTrio", "Equipo mental boom", "trio"],
      ["brokenDuo", "Pareja rota", "duo"],
      ["boomDuo", "Pareja mental boom", "duo"],
    ]);
    for (const def of TITLE_DEFINITIONS) {
      expect(def.periods).toEqual(["day", "week"]);
      expect(def.description).not.toBe("");
    }
    expect(TITLE_DEFINITIONS[0].minGames).toEqual({ day: 3, week: 5 });
    expect(TITLE_DEFINITIONS[0].minimumText).toBe(
      "3 partidas en el día y 5 en la semana",
    );
    expect(TITLE_DEFINITIONS[3].minGames).toEqual({ day: 3, week: 3 });
    expect(TITLE_DEFINITIONS[3].minimumText).toBe(
      "3 partidas juntos en el periodo",
    );
    expect(TITLE_RULES.join(" ")).toMatch(/al menos 2 clasificados/);
    expect(TITLE_RULES.join(" ")).toMatch(/más partidas/);
    expect(TITLE_RULES.join(" ")).toMatch(/empatados comparten el título/);
    expect(TITLE_DEFINITIONS[3].description).toMatch(/al menos uno/);
    expect(TITLE_DEFINITIONS[5].description).toMatch(/al menos uno/);
  });

  it("awardTitles sin clasificados no otorga nada", () => {
    expect(awardTitles("day", [], { duos: [], trios: [] })).toEqual([]);
  });
});
