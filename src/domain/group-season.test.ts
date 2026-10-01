import { describe, expect, it } from "vitest";
import { GROUP_TEAM_MIN_GAMES } from "@/lib/config";
import { arenaGodGoal, wonChampionsCount } from "./arena-god";
import {
  columnLeaders,
  computeSeasonRow,
  computeSeasonTable,
  computeSeasonTeams,
  defaultSortDirection,
  isSeasonLeader,
  SEASON_COLUMN_BY_ID,
  SEASON_COLUMNS,
  type SeasonColumnId,
  type SeasonMatchRow,
  type SeasonRow,
  seasonColumnsOf,
  sortSeasonRows,
} from "./group-season";
import { computeRecords } from "./records";
import { computeSummary, verifiedChampions } from "./stats";

// Partidas sintéticas (sin BD ni red).

const BASE = Date.parse("2026-09-30T18:00:00Z");
const MINUTE = 60_000;

let seq = 0;

interface GameOptions {
  champion?: number;
  kills?: number;
  deaths?: number;
  damage?: number;
  damageTaken?: number | null;
  spree?: number | null;
  subteam?: number;
  at?: number;
}

/** Una partida en la que `puuids` van en el mismo equipo y quedan en `placement`. */
function game(
  placement: number,
  puuids: string[],
  options: GameOptions = {},
): SeasonMatchRow[] {
  seq += 1;
  const ts = options.at ?? BASE + seq * MINUTE;
  const champion = options.champion ?? 1;
  return puuids.map((puuid) => ({
    puuid,
    matchId: `EUW1_${seq}`,
    gameCreation: ts,
    gameStartTimestamp: ts,
    championId: champion,
    championName: `Champ${champion}`,
    placement,
    playerSubteamId: options.subteam ?? 1,
    kills: options.kills ?? 5,
    deaths: options.deaths ?? 3,
    totalDamageDealtToChampions: options.damage ?? 10_000,
    totalDamageTaken:
      options.damageTaken === undefined ? 8_000 : options.damageTaken,
    largestKillingSpree: options.spree === undefined ? 2 : options.spree,
  }));
}

const team = (puuids: string[], placements: number[], options?: GameOptions) =>
  placements.flatMap((placement) => game(placement, puuids, options));

const keys = (teams: { key: string }[]) => teams.map((t) => t.key);

describe("computeSeasonTeams: umbral y orden", () => {
  it("usa GROUP_TEAM_MIN_GAMES: 3 partidas juntos entran y 2 no (dúos y tríos)", () => {
    expect(GROUP_TEAM_MIN_GAMES).toBe(3);
    const rows = [
      ...team(["A", "B", "C"], [1, 2, 3]), // trío A-B-C con 3
      ...team(["D", "E", "F"], [1, 2]), // trío D-E-F con 2
    ];
    const { duos, trios } = computeSeasonTeams(rows);
    expect(keys(trios)).toEqual(["A,B,C"]);
    // Los tres dúos de A-B-C (3 partidas) entran; los de D-E-F (2) no.
    expect(keys(duos).sort()).toEqual(["A,B", "A,C", "B,C"]);
    expect(Math.min(...duos.map((t) => t.games))).toBeGreaterThanOrEqual(3);
  });

  it("trío con un externo: no sale en Tríos, pero su dúo de miembros sí en Dúos", () => {
    // Solo A y B son miembros: las filas del externo no llegan (el grupo trae solo miembros).
    const rows = team(["A", "B"], [1, 1, 2]);
    const { duos, trios } = computeSeasonTeams(rows);
    expect(trios).toEqual([]);
    expect(keys(duos)).toEqual(["A,B"]);
    expect(duos[0]).toMatchObject({ games: 3, firsts: 2 });
  });

  it("cada equipo trae partidas, 1º, % de 1º y puesto medio", () => {
    const { duos } = computeSeasonTeams(team(["A", "B"], [1, 2, 3, 6]));
    expect(duos[0]).toMatchObject({
      key: "A,B",
      games: 4,
      firsts: 1,
      firstRate: 0.25,
      avgPlacement: 3,
    });
  });

  it("ordena por partidas descendente; desempate: más 1º, mejor puesto medio, clave", () => {
    const rows = [
      ...team(["A", "B"], [2, 2, 2]), // 3 partidas, 0 1º
      ...team(["C", "D"], [1, 1, 1, 4]), // 4 partidas
      ...team(["E", "F"], [1, 4, 4]), // 3 partidas, 1 1º, medio 3
      ...team(["G", "H"], [1, 2, 3]), // 3 partidas, 1 1º, medio 2 (mejor)
      ...team(["I", "J"], [1, 2, 3]), // idéntico a G-H: desempata la clave
    ];
    const { duos } = computeSeasonTeams(rows);
    expect(keys(duos)).toEqual(["C,D", "G,H", "I,J", "E,F", "A,B"]);
  });

  it("las filas con un puesto fuera de 1..6 no cuentan", () => {
    const rows = [...team(["A", "B"], [1, 2]), ...team(["A", "B"], [9])];
    expect(computeSeasonTeams(rows).duos).toEqual([]);
  });

  it("sin filas no hay equipos", () => {
    expect(computeSeasonTeams([])).toEqual({ duos: [], trios: [] });
  });
});

describe("columnLeaders", () => {
  const e = (key: string, value: number | null) => ({ key, value });

  it("el valor más alto lidera en las columnas high y el más bajo en las low", () => {
    const entries = [e("a", 3), e("b", 5), e("c", 4)];
    expect(columnLeaders(entries, "high")).toEqual(["b"]);
    expect(columnLeaders(entries, "low")).toEqual(["a"]);
  });

  it("en empate lideran todos los empatados", () => {
    const entries = [e("a", 5), e("b", 5), e("c", 4)];
    expect(columnLeaders(entries, "high")).toEqual(["a", "b"]);
    expect(columnLeaders([e("a", 2), e("b", 2), e("c", 4)], "low")).toEqual([
      "a",
      "b",
    ]);
  });

  it("la columna sin datos no tiene líder (vacía o todo null)", () => {
    expect(columnLeaders([], "high")).toEqual([]);
    expect(columnLeaders([e("a", null), e("b", null)], "high")).toEqual([]);
    expect(columnLeaders([e("a", null), e("b", null)], "low")).toEqual([]);
  });

  it("los null no compiten, y en high un 0 tampoco lidera", () => {
    expect(columnLeaders([e("a", null), e("b", 2)], "low")).toEqual(["b"]);
    expect(columnLeaders([e("a", 0), e("b", 0)], "high")).toEqual([]);
    expect(columnLeaders([e("a", 0), e("b", 1)], "high")).toEqual(["b"]);
  });

  it("empate con decimales equivalentes (1/3 y 2/6)", () => {
    const entries = [e("a", 1 / 3), e("b", 2 / 6), e("c", 0.3)];
    expect(columnLeaders(entries, "high")).toEqual(["a", "b"]);
  });
});

describe("columnas", () => {
  it("el puesto medio lidera por abajo y las demás por arriba", () => {
    for (const column of SEASON_COLUMNS) {
      expect(column.leader).toBe(column.id === "avgPlacement" ? "low" : "high");
    }
    expect(defaultSortDirection(SEASON_COLUMN_BY_ID.avgPlacement)).toBe("asc");
    expect(defaultSortDirection(SEASON_COLUMN_BY_ID.games)).toBe("desc");
  });

  it("cada columna está en una pestaña y hay 8 en Resumen y 7 en Récords", () => {
    expect(seasonColumnsOf("summary")).toHaveLength(8);
    expect(seasonColumnsOf("records")).toHaveLength(7);
    expect(new Set(SEASON_COLUMNS.map((c) => c.id)).size).toBe(
      SEASON_COLUMNS.length,
    );
  });
});

describe("computeSeasonTable", () => {
  const members = [
    { puuid: "A", official: null },
    { puuid: "B", official: null },
    { puuid: "C", official: null },
  ];

  it("una fila por miembro en el orden dado, también sin partidas; ignora a los no miembros", () => {
    const rows = [
      ...team(["B"], [1, 2], { subteam: 2 }),
      ...team(["X"], [1], { subteam: 3 }),
    ];
    const table = computeSeasonTable(members, rows);
    expect(table.rows.map((r) => r.puuid)).toEqual(["A", "B", "C"]);
    expect(table.rows[0].cells.games.value).toBe(0);
    expect(table.rows[0].cells.avgPlacement.value).toBeNull();
    expect(table.rows[0].cells.firstRate.value).toBeNull();
    expect(table.rows[0].cells.damage).toMatchObject({
      value: null,
      matchId: null,
    });
    expect(table.rows[1].cells.games.value).toBe(2);
  });

  it("líderes con empate y columna vacía", () => {
    const rows = [
      // A: 2 partidas, medio 1,5; B: 2 partidas, medio 1,5 (empate); C: 1 partida, medio 6.
      ...game(1, ["A"], { subteam: 1, kills: 9 }),
      ...game(2, ["A"], { subteam: 1, kills: 1 }),
      ...game(1, ["B"], { subteam: 1, kills: 9 }),
      ...game(2, ["B"], { subteam: 1, kills: 2 }),
      ...game(6, ["C"], {
        subteam: 1,
        kills: 4,
        spree: null,
        damageTaken: null,
      }),
    ];
    const table = computeSeasonTable(members, rows);
    expect(table.leaders.games.sort()).toEqual(["A", "B"]);
    expect(table.leaders.avgPlacement.sort()).toEqual(["A", "B"]);
    expect(table.leaders.kills.sort()).toEqual(["A", "B"]); // máximo 9 en ambos
    expect(table.leaders.firsts.sort()).toEqual(["A", "B"]);
    expect(table.leaders.firstRate.sort()).toEqual(["A", "B"]);
    expect(isSeasonLeader(table, "games", "C")).toBe(false);
    expect(isSeasonLeader(table, "games", "A")).toBe(true);
  });

  it("una columna sin datos no tiene líder", () => {
    const nobody = computeSeasonTable(members, []);
    for (const column of SEASON_COLUMNS) {
      expect(nobody.leaders[column.id]).toEqual([]);
    }
    // Sin racha de kills en nadie (dato ausente) tampoco hay líder en esa columna.
    const noSpree = computeSeasonTable(members, [
      ...game(1, ["A"], { spree: null }),
      ...game(2, ["B"], { spree: null }),
    ]);
    expect(noSpree.leaders.killingSpree).toEqual([]);
    expect(noSpree.leaders.kills.sort()).toEqual(["A", "B"]);
  });

  it("un dato ausente (null) solo vacía su celda: el récord sale del resto de partidas", () => {
    const rows = [
      ...game(6, ["C"], { spree: null, damageTaken: null }),
      ...game(5, ["C"], { spree: 4, damageTaken: 5_000 }),
    ];
    const row = computeSeasonTable(members, rows).rows[2];
    expect(row.cells.killingSpree.value).toBe(4);
    expect(row.cells.damageTaken.value).toBe(5_000);
  });

  it("los récords y las rachas conservan su matchId y su campeón", () => {
    const rows = [
      ...game(1, ["A"], { champion: 10, damage: 30_000, deaths: 0 }),
      ...game(1, ["A"], { champion: 11, damage: 20_000, deaths: 9 }),
      ...game(4, ["A"], { champion: 12, damage: 10_000 }),
      ...game(1, ["A"], { champion: 13, damage: 10_000 }),
    ];
    const [a] = computeSeasonTable([members[0]], rows).rows;
    const [m1, m2, m3, m4] = [
      rows[0].matchId,
      rows[1].matchId,
      rows[2].matchId,
      rows[3].matchId,
    ];
    expect(a.cells.damage).toMatchObject({
      value: 30_000,
      matchId: m1,
      championName: "Champ10",
    });
    expect(a.cells.deaths).toMatchObject({ value: 9, matchId: m2 });
    // Racha de 1º: m1..m2 (2); sin 1º: solo m3 (1). Enlazan a la última partida de la racha.
    expect(a.cells.winStreak).toMatchObject({
      value: 2,
      fromMatchId: m1,
      matchId: m2,
    });
    expect(a.cells.drought).toMatchObject({
      value: 1,
      fromMatchId: m3,
      matchId: m3,
    });
    expect(m4).toBeDefined();
    // Las celdas que no son un récord de una partida no traen matchId.
    expect(a.cells.games.matchId).toBeNull();
    expect(a.cells.wonChampions.matchId).toBeNull();
  });
});

describe("campeones ganados = max(verificados, oficial ?? 0)", () => {
  const rows = [
    ...game(1, ["A"], { champion: 1 }),
    ...game(1, ["A"], { champion: 2 }),
    ...game(1, ["A"], { champion: 2 }), // repetido: cuenta una vez
    ...game(3, ["A"], { champion: 3 }),
  ];

  it("sin oficial cuentan los verificados", () => {
    expect(
      computeSeasonRow({ puuid: "A", official: null }, rows).cells.wonChampions
        .value,
    ).toBe(2);
  });

  it("con un oficial mayor manda el oficial; con uno menor, los verificados", () => {
    expect(
      computeSeasonRow({ puuid: "A", official: 7 }, rows).cells.wonChampions
        .value,
    ).toBe(7);
    expect(
      computeSeasonRow({ puuid: "A", official: 1 }, rows).cells.wonChampions
        .value,
    ).toBe(2);
  });

  it("es la misma regla que decide el badge (arenaGodGoal)", () => {
    expect(wonChampionsCount(59, 60)).toBe(60);
    expect(wonChampionsCount(61, null)).toBe(61);
    expect(
      arenaGodGoal({ verified: 59, official: 60, championTotal: 170 }).reached,
    ).toBe(true);
    expect(
      arenaGodGoal({ verified: 59, official: 58, championTotal: 170 }).reached,
    ).toBe(false);
  });

  it("sin partidas sale del contador oficial si lo hay", () => {
    expect(
      computeSeasonRow({ puuid: "Z", official: 4 }, []).cells.wonChampions
        .value,
    ).toBe(4);
    expect(
      computeSeasonRow({ puuid: "Z", official: null }, []).cells.wonChampions
        .value,
    ).toBe(0);
  });
});

describe("equivalencia con el perfil", () => {
  // Varias partidas con campeones, daño, rachas y una de ellas con datos ausentes.
  const rows: SeasonMatchRow[] = [
    ...game(1, ["A"], { champion: 1, kills: 12, deaths: 0, damage: 31_000 }),
    ...game(1, ["A"], { champion: 1, kills: 8, deaths: 2, damage: 22_000 }),
    ...game(1, ["A"], { champion: 2, kills: 6, deaths: 4, damage: 18_000 }),
    ...game(4, ["A"], { champion: 3, kills: 3, deaths: 9, damage: 9_000 }),
    ...game(5, ["A"], { champion: 2, kills: 2, deaths: 7, damage: 7_000 }),
    ...game(2, ["A"], {
      champion: 4,
      kills: 4,
      deaths: 5,
      damage: 12_000,
      damageTaken: null,
      spree: null,
    }),
    ...game(1, ["A"], { champion: 5, kills: 7, deaths: 3, damage: 15_000 }),
    // Otro miembro, que no debe contaminar a A.
    ...game(1, ["B"], { champion: 9, kills: 30, deaths: 0, damage: 99_000 }),
  ];
  const aRows = rows.filter((row) => row.puuid === "A");

  it("cada celda de Resumen y Récords coincide con computeSummary/computeRecords/verificados", () => {
    const table = computeSeasonTable(
      [
        { puuid: "A", official: 9 },
        { puuid: "B", official: null },
      ],
      rows,
    );
    const a = table.rows[0].cells;

    const summary = computeSummary(aRows);
    const records = computeRecords(aRows);
    const verified = verifiedChampions(aRows).length;

    expect(a.games.value).toBe(summary.games);
    expect(a.firsts.value).toBe(summary.firsts);
    expect(a.firstRate.value).toBe(summary.firstRate);
    expect(a.avgPlacement.value).toBe(summary.avgPlacement);
    expect(a.wonChampions.value).toBe(Math.max(verified, 9));
    expect(a.firstTry.value).toBe(records.firstTry.count);
    expect(a.firstTryRate.value).toBe(records.firstTry.rate);
    expect(a.topChampion.value).toBe(records.topChampion?.firsts);
    expect(a.topChampion.championName).toBe(records.topChampion?.championName);

    for (const id of [
      "damage",
      "damageTaken",
      "kills",
      "killingSpree",
      "deaths",
    ] as const) {
      const entry = records.records[id];
      expect(a[id].value).toBe(entry?.value ?? null);
      expect(a[id].matchId).toBe(entry?.matchId ?? null);
      expect(a[id].championName).toBe(entry?.championName ?? null);
    }
    expect(a.winStreak.value).toBe(records.longestWinStreak?.length);
    expect(a.winStreak.matchId).toBe(records.longestWinStreak?.toMatchId);
    expect(a.winStreak.fromMatchId).toBe(records.longestWinStreak?.fromMatchId);
    expect(a.drought.value).toBe(records.longestDrought?.length);
    expect(a.drought.matchId).toBe(records.longestDrought?.toMatchId);
  });

  it("el orden de las filas de entrada no cambia nada", () => {
    const table = computeSeasonTable(
      [{ puuid: "A", official: null }],
      [...rows].reverse(),
    );
    const forward = computeSeasonTable([{ puuid: "A", official: null }], rows);
    expect(table.rows).toEqual(forward.rows);
  });
});

describe("sortSeasonRows", () => {
  const row = (
    puuid: string,
    values: Partial<Record<SeasonColumnId, number | null>>,
  ): SeasonRow => {
    const empty = {
      value: null,
      matchId: null,
      fromMatchId: null,
      championName: null,
    };
    const cells = Object.fromEntries(
      SEASON_COLUMNS.map((c) => [
        c.id,
        { ...empty, value: values[c.id] ?? null },
      ]),
    ) as SeasonRow["cells"];
    return { puuid, cells };
  };
  const rows = [
    row("a", { games: 10, avgPlacement: 3 }),
    row("b", { games: null, avgPlacement: null }),
    row("c", { games: 30, avgPlacement: 2 }),
    row("d", { games: 10, avgPlacement: 4 }),
  ];
  const ids = (list: SeasonRow[]) => list.map((r) => r.puuid);

  it("por defecto primero el líder: alto en partidas, bajo en puesto medio", () => {
    expect(ids(sortSeasonRows(rows, "games"))).toEqual(["c", "a", "d", "b"]);
    expect(ids(sortSeasonRows(rows, "avgPlacement"))).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });

  it("el sentido contrario invierte los valores, pero los vacíos siguen al final", () => {
    expect(ids(sortSeasonRows(rows, "games", "asc"))).toEqual([
      "a",
      "d",
      "c",
      "b",
    ]);
    expect(ids(sortSeasonRows(rows, "avgPlacement", "desc"))).toEqual([
      "d",
      "a",
      "c",
      "b",
    ]);
  });

  it("los empates conservan el orden de entrada y no muta la entrada", () => {
    const before = ids(rows);
    expect(ids(sortSeasonRows(rows, "games"))).toEqual(["c", "a", "d", "b"]);
    expect(ids(rows)).toEqual(before);
  });
});
