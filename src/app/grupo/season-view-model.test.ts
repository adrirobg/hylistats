import { describe, expect, it } from "vitest";
import {
  computeSeasonTable,
  computeSeasonTeams,
  type SeasonMatchRow,
  type SeasonTable,
} from "@/domain/group-season";
import { computeRecords } from "@/domain/records";
import { scoreboardFigures } from "@/domain/scoreboard";
import { computeSummary } from "@/domain/stats";
import { formatPercent } from "@/lib/format";
import { type MemberRef, memberMap } from "./group-view-model";
import {
  ariaSortOf,
  nextSort,
  seasonCellModel,
  seasonMatchHref,
  seasonTableModel,
  seasonTeamRows,
} from "./season-view-model";

// Partidas sintéticas (sin BD ni red). Claves de miembro "1", "2", "3".

const BASE = Date.parse("2026-09-30T18:00:00Z");
let seq = 0;

interface GameOptions {
  champion?: number;
  kills?: number;
  deaths?: number;
  damage?: number;
}

function game(
  placement: number,
  keys: string[],
  options: GameOptions = {},
): SeasonMatchRow[] {
  seq += 1;
  const ts = BASE + seq * 60_000;
  const champion = options.champion ?? 1;
  return keys.map((puuid) => ({
    puuid,
    matchId: `EUW1_${seq}`,
    gameCreation: ts,
    gameStartTimestamp: ts,
    championId: champion,
    championName: `Champ${champion}`,
    placement,
    playerSubteamId: 1,
    kills: options.kills ?? 5,
    deaths: options.deaths ?? 3,
    totalDamageDealtToChampions: options.damage ?? 10_000,
    totalDamageTaken: 8_000,
    largestKillingSpree: 2,
  }));
}

const member = (key: string, gameName: string): MemberRef => ({
  key,
  gameName,
  tagLine: "EUW",
  slug: `${gameName}-EUW`,
});
const MEMBERS = memberMap([
  member("1", "Ana"),
  member("2", "Beto"),
  member("3", "Cris"),
]);

// Ana: 4 partidas (2 de 1º). Beto: 3 (1 de 1º). Cris: sin partidas.
const ROWS: SeasonMatchRow[] = [
  ...game(1, ["1", "2"], { damage: 30_000, champion: 7 }),
  ...game(1, ["1"], { damage: 12_000, champion: 7, kills: 20 }),
  ...game(3, ["1", "2"], { champion: 8 }),
  ...game(4, ["1", "2"], { champion: 9 }),
];
const TABLE: SeasonTable = computeSeasonTable(
  [
    { puuid: "1", official: null },
    { puuid: "2", official: null },
    { puuid: "3", official: 7 },
  ],
  ROWS,
);
const rowsOf = (model: ReturnType<typeof seasonTableModel>) =>
  model.rows.map((r) => r.key);

describe("seasonMatchHref", () => {
  it("enlaza a la partida en el perfil de su dueño", () => {
    expect(seasonMatchHref("Ana-EUW", "EUW1_42")).toBe(
      "/euw/Ana-EUW?tab=partidas&partida=EUW1_42",
    );
  });
});

describe("nextSort / ariaSortOf", () => {
  it("una columna nueva empieza por el sentido del líder (puesto medio asc, el resto desc)", () => {
    expect(nextSort(null, "avgPlacement")).toEqual({
      columnId: "avgPlacement",
      direction: "asc",
    });
    expect(nextSort(null, "games")).toEqual({
      columnId: "games",
      direction: "desc",
    });
  });

  it("pulsar la columna activa invierte el sentido; otra columna reinicia", () => {
    const first = nextSort(null, "games");
    const second = nextSort(first, "games");
    expect(second.direction).toBe("asc");
    expect(nextSort(second, "games").direction).toBe("desc");
    expect(nextSort(second, "firsts")).toEqual({
      columnId: "firsts",
      direction: "desc",
    });
  });

  it("aria-sort: none salvo en la columna activa", () => {
    const sort = { columnId: "games", direction: "desc" } as const;
    expect(ariaSortOf(sort, "games")).toBe("descending");
    expect(ariaSortOf({ ...sort, direction: "asc" }, "games")).toBe(
      "ascending",
    );
    expect(ariaSortOf(sort, "firsts")).toBe("none");
    expect(ariaSortOf(null, "games")).toBe("none");
  });
});

describe("seasonTableModel: orden", () => {
  it("sin orden: el de los miembros", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "summary", null);
    expect(rowsOf(model)).toEqual(["1", "2", "3"]);
    expect(model.columns.every((c) => c.ariaSort === "none")).toBe(true);
  });

  it("ordena por partidas (desc) con el miembro sin partidas el último, y aria-sort en su cabecera", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "summary", {
      columnId: "games",
      direction: "desc",
    });
    expect(rowsOf(model)).toEqual(["1", "2", "3"]);
    const asc = seasonTableModel(TABLE, MEMBERS, "summary", {
      columnId: "games",
      direction: "asc",
    });
    // Cris tiene 0 partidas (dato 0, no null): va primero en ascendente.
    expect(rowsOf(asc)).toEqual(["3", "2", "1"]);
    expect(asc.columns.find((c) => c.id === "games")?.ariaSort).toBe(
      "ascending",
    );
  });

  it("puesto medio: el más bajo primero y los sin dato siempre al final", () => {
    const sort = nextSort(null, "avgPlacement");
    const model = seasonTableModel(TABLE, MEMBERS, "summary", sort);
    // Ana (1+1+3+4)/4 = 2,25; Beto (1+3+4)/3 = 2,67; Cris sin partidas.
    expect(rowsOf(model)).toEqual(["1", "2", "3"]);
    const desc = seasonTableModel(TABLE, MEMBERS, "summary", {
      columnId: "avgPlacement",
      direction: "desc",
    });
    expect(rowsOf(desc)).toEqual(["2", "1", "3"]);
  });

  it("un orden de la otra pestaña se ignora", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "records", {
      columnId: "games",
      direction: "asc",
    });
    expect(rowsOf(model)).toEqual(["1", "2", "3"]);
    expect(model.columns.every((c) => c.ariaSort === "none")).toBe(true);
  });

  it("las columnas de cada pestaña son las del dominio, en orden", () => {
    expect(
      seasonTableModel(TABLE, MEMBERS, "summary", null).columns.map(
        (c) => c.label,
      ),
    ).toEqual([
      "Partidas",
      "1º",
      "% de 1º",
      "Puesto medio",
      "Campeones ganados",
      "Victorias a la primera",
      "% a la primera",
      "Campeón con más 1º",
    ]);
    expect(
      seasonTableModel(TABLE, MEMBERS, "records", null).columns.map(
        (c) => c.id,
      ),
    ).toEqual([
      "damage",
      "damageTaken",
      "kills",
      "killingSpree",
      "deaths",
      "winStreak",
      "drought",
    ]);
  });
});

describe("seasonTableModel: líderes y enlaces", () => {
  it("marca al líder de cada columna: el más bajo en puesto medio y el más alto en el resto", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "summary", null);
    const leader = (id: string) =>
      model.rows.filter((r) => r.cells[id].leader).map((r) => r.key);
    expect(leader("games")).toEqual(["1"]);
    expect(leader("avgPlacement")).toEqual(["1"]); // 2,25 < 2,67
    expect(leader("firsts")).toEqual(["1"]);
    // Cris: campeones ganados salen del contador oficial (7) y lidera.
    expect(leader("wonChampions")).toEqual(["3"]);
  });

  it("en empate lideran todos los empatados", () => {
    const rows = [...game(1, ["1", "2"]), ...game(2, ["1", "2"])];
    const table = computeSeasonTable(
      [
        { puuid: "1", official: null },
        { puuid: "2", official: null },
      ],
      rows,
    );
    const model = seasonTableModel(table, MEMBERS, "summary", null);
    expect(model.rows.map((r) => r.cells.games.leader)).toEqual([true, true]);
  });

  it("un récord enlaza a su partida en el perfil de su dueño, con su campeón", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "records", null);
    const ana = model.rows[0];
    // El máximo de daño de Ana (30.000) es la primera partida de ROWS.
    expect(ana.cells.damage.text).toBe("30.000");
    expect(ana.cells.damage.detail).toBe("Champ7");
    expect(ana.cells.damage.href).toBe(
      `/euw/Ana-EUW?tab=partidas&partida=${ROWS[0].matchId}`,
    );
    // El enlace de Beto va al perfil de Beto.
    expect(model.rows[1].cells.damage.href).toContain("/euw/Beto-EUW?");
  });

  it("la racha enlaza a la última partida de la racha y no trae campeón", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "records", null);
    const cell = model.rows[0].cells.winStreak;
    // Ana: 1º, 1º y luego 3º: racha de 2, cuya última partida es la segunda.
    expect(cell.text).toBe("2");
    expect(cell.detail).toBeNull();
    expect(cell.href).toBe(
      `/euw/Ana-EUW?tab=partidas&partida=${ROWS[2].matchId}`,
    );
  });

  it("sin dato: guion, sin enlace y sin liderar", () => {
    const model = seasonTableModel(TABLE, MEMBERS, "records", null);
    const cris = model.rows[2];
    expect(cris.cells.damage).toEqual({
      text: "—",
      detail: null,
      href: null,
      leader: false,
    });
  });
});

describe("seasonCellModel: formato igual que el perfil", () => {
  const ana = ROWS.filter((r) => r.puuid === "1");
  const row = TABLE.rows[0];
  const text = (id: Parameters<typeof seasonCellModel>[0]) =>
    seasonCellModel(id, row.cells[id], MEMBERS.get("1") ?? null, false).text;

  it("Resumen: las cifras del marcador del perfil (partidas, 1º, % de 1º, puesto medio)", () => {
    const figures = Object.fromEntries(
      scoreboardFigures(computeSummary(ana)).map((f) => [f.key, f.value]),
    );
    expect(text("games")).toBe(figures.games);
    expect(text("firsts")).toBe(figures.firsts);
    expect(text("firstRate")).toBe(figures.firstRate);
    expect(text("avgPlacement")).toBe(figures.avgPlacement);
    expect(text("firstRate")).toBe(formatPercent(0.5));
    expect(text("avgPlacement")).toBe("2,25");
  });

  it("victorias a la primera y su %, como firstTryModel de Estadísticas", () => {
    const { firstTry } = computeRecords(ana);
    expect(text("firstTry")).toBe(String(firstTry.count));
    // 1 campeón ganado (el 7, ganado a la primera): 100,0 %.
    expect(firstTry.wonChampions).toBe(1);
    expect(text("firstTryRate")).toBe(formatPercent(1));
  });

  it("campeón con más 1º: el campeón y sus 1º", () => {
    const cell = seasonCellModel(
      "topChampion",
      row.cells.topChampion,
      MEMBERS.get("1") ?? null,
      false,
    );
    expect(cell.text).toBe("Champ7");
    expect(cell.detail).toBe("2 × 1º");
    expect(cell.href).toBeNull();
  });

  it("récords con separador de miles, como las tarjetas de Estadísticas", () => {
    const big = computeSeasonTable(
      [{ puuid: "1", official: null }],
      game(1, ["1"], { damage: 123_456 }),
    );
    expect(
      seasonCellModel(
        "damage",
        big.rows[0].cells.damage,
        MEMBERS.get("1") ?? null,
        false,
      ).text,
    ).toBe("123.456");
  });
});

describe("seasonTeamRows", () => {
  it("respeta el orden del dominio y formatea el % de 1º como el marcador", () => {
    const rows = [
      ...game(1, ["1", "2"]),
      ...game(2, ["1", "2"]),
      ...game(2, ["1", "2"]),
      ...game(1, ["1", "3"]),
      ...game(1, ["1", "3"]),
      ...game(1, ["1", "3"]),
      ...game(3, ["1", "3"]),
    ];
    const { duos } = computeSeasonTeams(rows);
    const result = seasonTeamRows(duos, MEMBERS);
    expect(result.map((r) => r.key)).toEqual(duos.map((d) => d.key));
    expect(result[0].members.map((m) => m?.gameName)).toEqual(["Ana", "Cris"]);
    expect(result[0]).toMatchObject({
      games: 4,
      firsts: 3,
      firstRate: formatPercent(0.75),
      avgPlacement: "1,50",
    });
  });

  it("una clave desconocida deja un miembro nulo (la UI pinta un guion)", () => {
    const rows = [
      ...game(1, ["1", "9"]),
      ...game(1, ["1", "9"]),
      ...game(1, ["1", "9"]),
    ];
    const [row] = seasonTeamRows(computeSeasonTeams(rows).duos, MEMBERS);
    expect(row.members.map((m) => m?.gameName ?? null)).toEqual(["Ana", null]);
  });
});
