import { describe, expect, it } from "vitest";
import type { Champion, ChampionCatalog } from "@/lib/ddragon";
import { type AlbumEntry, buildAlbum, lastGameAt, recentForm } from "./album";
import { type PlayerMatchRow, verifiedChampions } from "./stats";

// Filas y catálogo inline (sin BD, sin red, sin fixtures). Instantes: `t(n)` = n minutos desde
// una base fija, así el orden cronológico se lee en los tests.

const BASE = 1_790_000_000_000;
const t = (minutes: number) => BASE + minutes * 60_000;

let counter = 0;
function row(
  championId: number,
  placement: number,
  minutes: number,
  overrides: Partial<PlayerMatchRow> = {},
): PlayerMatchRow {
  counter += 1;
  return {
    matchId: `EUW1_${minutes}_${counter}`,
    gameCreation: t(minutes),
    championId,
    championName: `Champ${championId}`,
    placement,
    playerSubteamId: 1,
    ...overrides,
  };
}

const champion = (championId: number, ddId: string, name = ddId): Champion => ({
  championId,
  ddId,
  name,
  portraitUrl: `https://cdn.test/${ddId}.png`,
});

const catalogOf = (...champions: Champion[]): ChampionCatalog => ({
  version: "16.19.1",
  champions,
});

const EMPTY: ChampionCatalog = { version: null, champions: [] };

const AATROX = champion(266, "Aatrox");
const AHRI = champion(103, "Ahri");
const FIDDLE = champion(9, "Fiddlesticks");
const ZED = champion(238, "Zed");
const CATALOG = catalogOf(AATROX, AHRI, FIDDLE, ZED);

const entryOf = (album: AlbumEntry[], championId: number) => {
  const found = album.find((e) => e.championId === championId);
  if (!found) throw new Error(`sin entrada para ${championId}`);
  return found;
};

describe("buildAlbum: estados y cifras", () => {
  const rows = [
    row(103, 1, 10, { matchId: "m-ahri-1" }), // Ahri: 1º, 3º, 1º
    row(103, 3, 30),
    row(103, 1, 50, { matchId: "m-ahri-3" }),
    row(266, 4, 20), // Aatrox: 4º, 2º (sin 1º)
    row(266, 2, 40),
  ];
  const album = buildAlbum(CATALOG, rows);

  it("una entrada por campeón del catálogo, en orden alfabético", () => {
    expect(album.map((e) => e.name)).toEqual([
      "Aatrox",
      "Ahri",
      "Fiddlesticks",
      "Zed",
    ]);
  });

  it("won: algún 1º; usa el primero como verificación", () => {
    const ahri = entryOf(album, 103);
    expect(ahri).toEqual({
      championId: 103,
      ddId: "Ahri",
      name: "Ahri",
      portraitUrl: "https://cdn.test/Ahri.png",
      state: "won",
      games: 3,
      firsts: 2,
      top3: 3,
      bestPlacement: 1,
      avgPlacement: (1 + 3 + 1) / 3,
      lastPlayedAt: t(50),
      firstWinAt: t(10),
      firstWinMatchId: "m-ahri-1",
    });
  });

  it("played: partidas sin 1º", () => {
    const aatrox = entryOf(album, 266);
    expect(aatrox).toMatchObject({
      state: "played",
      games: 2,
      firsts: 0,
      top3: 1,
      bestPlacement: 2,
      avgPlacement: 3,
      lastPlayedAt: t(40),
      firstWinAt: null,
      firstWinMatchId: null,
    });
  });

  it("none: campeón del catálogo sin partidas", () => {
    expect(entryOf(album, 238)).toEqual({
      championId: 238,
      ddId: "Zed",
      name: "Zed",
      portraitUrl: "https://cdn.test/Zed.png",
      state: "none",
      games: 0,
      firsts: 0,
      top3: 0,
      bestPlacement: null,
      avgPlacement: null,
      lastPlayedAt: null,
      firstWinAt: null,
      firstWinMatchId: null,
    });
  });

  it("el primer 1º no depende del orden de las filas", () => {
    const shuffled = [
      row(103, 1, 50, { matchId: "m-ahri-3" }),
      row(103, 1, 10, { matchId: "m-ahri-1" }),
      row(103, 2, 30),
    ];
    const ahri = entryOf(buildAlbum(CATALOG, shuffled), 103);
    expect(ahri.firstWinAt).toBe(t(10));
    expect(ahri.firstWinMatchId).toBe("m-ahri-1");
    expect(ahri.lastPlayedAt).toBe(t(50));
  });

  it("con el mismo instante desempata por matchId, como verifiedChampions", () => {
    const tied = [
      row(103, 1, 10, { matchId: "EUW1_B" }),
      row(103, 1, 10, { matchId: "EUW1_A" }),
    ];
    const ahri = entryOf(buildAlbum(CATALOG, tied), 103);
    expect(ahri.firstWinMatchId).toBe("EUW1_A");
    expect(verifiedChampions(tied)[0].firstWinMatchId).toBe("EUW1_A");
  });

  it("ordena por nombre de visualización, no por id de Data Dragon", () => {
    const wukong = champion(62, "MonkeyKing", "Wukong");
    const nami = champion(267, "Nami");
    const album = buildAlbum(catalogOf(wukong, nami), []);
    expect(album.map((e) => e.name)).toEqual(["Nami", "Wukong"]);
  });
});

describe("buildAlbum: campeones fuera del catálogo o del rango", () => {
  it("casa Fiddlesticks por championId aunque Match-V5 lo llame FiddleSticks", () => {
    const rows = [row(9, 1, 5, { championName: "FiddleSticks" })];
    const album = buildAlbum(CATALOG, rows);
    expect(album.filter((e) => e.championId === 9)).toHaveLength(1);
    expect(entryOf(album, 9)).toMatchObject({
      ddId: "Fiddlesticks",
      name: "Fiddlesticks",
      state: "won",
    });
    expect(album).toHaveLength(CATALOG.champions.length);
  });

  it("un campeón jugado ausente del catálogo sale con su championName y sin retrato", () => {
    const rows = [
      row(950, 5, 10, { championName: "Viejo" }),
      row(950, 1, 20, { championName: "Nuevo" }),
    ];
    const album = buildAlbum(CATALOG, rows);
    expect(album).toHaveLength(CATALOG.champions.length + 1);
    // Nombre de la partida más reciente; se ordena entre los demás por ese nombre.
    expect(entryOf(album, 950)).toEqual({
      championId: 950,
      ddId: null,
      name: "Nuevo",
      portraitUrl: null,
      state: "won",
      games: 2,
      firsts: 1,
      top3: 1,
      bestPlacement: 1,
      avgPlacement: 3,
      lastPlayedAt: t(20),
      firstWinAt: t(20),
      firstWinMatchId: rows[1].matchId,
    });
    expect(album.map((e) => e.name)).toEqual([
      "Aatrox",
      "Ahri",
      "Fiddlesticks",
      "Nuevo",
      "Zed",
    ]);
  });

  it("con el catálogo vacío (Data Dragon caído) solo salen los campeones jugados", () => {
    const rows = [
      row(103, 2, 10, { championName: "Ahri" }),
      row(266, 1, 20, { championName: "Aatrox" }),
      row(103, 1, 30, { championName: "Ahri" }),
    ];
    const album = buildAlbum(EMPTY, rows);
    expect(album.map((e) => [e.name, e.state, e.ddId, e.portraitUrl])).toEqual([
      ["Aatrox", "won", null, null],
      ["Ahri", "won", null, null],
    ]);
    expect(buildAlbum(EMPTY, [])).toEqual([]);
  });

  it("ignora filas con puesto fuera de 1..6, igual que computeSummary", () => {
    const rows = [
      row(103, 0, 10),
      row(103, 7, 20),
      row(103, 3, 30),
      row(777, 9, 40), // solo filas inválidas: no aparece
    ];
    const album = buildAlbum(CATALOG, rows);
    expect(entryOf(album, 103)).toMatchObject({
      games: 1,
      avgPlacement: 3,
      lastPlayedAt: t(30),
    });
    expect(album.some((e) => e.championId === 777)).toBe(false);
  });
});

describe("buildAlbum: invariante con verifiedChampions", () => {
  const scenarios: Record<string, [ChampionCatalog, PlayerMatchRow[]]> = {
    "sin partidas": [CATALOG, []],
    "sin 1º": [CATALOG, [row(103, 2, 10), row(266, 6, 20)]],
    "mezcla con catálogo": [
      CATALOG,
      [
        row(103, 1, 10),
        row(103, 1, 20),
        row(266, 3, 30),
        row(9, 1, 40, { championName: "FiddleSticks" }),
        row(238, 4, 50),
      ],
    ],
    "victorias fuera del catálogo": [
      CATALOG,
      [row(950, 1, 10), row(951, 1, 20), row(951, 1, 30), row(103, 2, 40)],
    ],
    "catálogo vacío": [
      EMPTY,
      [row(103, 1, 10), row(266, 1, 20), row(9, 3, 30)],
    ],
    "puestos inválidos": [CATALOG, [row(103, 0, 10), row(266, 7, 20)]],
  };

  it.each(
    Object.entries(scenarios),
  )("los won coinciden con verifiedChampions: %s", (_name, [catalog, rows]) => {
    const album = buildAlbum(catalog, rows);
    const won = album.filter((e) => e.state === "won");
    const verified = verifiedChampions(rows);
    expect(won).toHaveLength(verified.length);
    for (const v of verified) {
      expect(entryOf(album, v.championId)).toMatchObject({
        state: "won",
        firsts: v.firsts,
        firstWinAt: v.firstWinAt,
        firstWinMatchId: v.firstWinMatchId,
      });
    }
  });
});

describe("recentForm", () => {
  // 25 partidas: la i-ésima (minuto i) con puesto 1 + (i % 6).
  const many = Array.from({ length: 25 }, (_, i) =>
    row(103 + (i % 3), 1 + (i % 6), i),
  );

  it("con más de 20 partidas devuelve las 20 últimas, la más reciente primero", () => {
    const form = recentForm(many);
    expect(form).toHaveLength(20);
    expect(form[0].gameCreation).toBe(t(24));
    expect(form[19].gameCreation).toBe(t(5));
    expect(form.map((g) => g.gameCreation)).toEqual(
      [...form.map((g) => g.gameCreation)].sort((a, b) => b - a),
    );
  });

  it("con menos de 20 partidas devuelve todas", () => {
    const few = many.slice(0, 3);
    expect(recentForm(few).map((g) => g.gameCreation)).toEqual([
      t(2),
      t(1),
      t(0),
    ]);
    expect(recentForm([])).toEqual([]);
  });

  it("solo expone los campos de la tira de forma", () => {
    const only = row(103, 2, 5, { championName: "Ahri" });
    expect(recentForm([only])).toEqual([
      {
        matchId: only.matchId,
        placement: 2,
        championId: 103,
        championName: "Ahri",
        gameCreation: t(5),
      },
    ]);
  });

  it("admite otro n y no depende del orden de entrada", () => {
    const desordenadas = [many[3], many[10], many[1], many[7]];
    expect(recentForm(desordenadas, 2).map((g) => g.gameCreation)).toEqual([
      t(10),
      t(7),
    ]);
    expect(recentForm(desordenadas, 0)).toEqual([]);
  });

  it("no modifica las filas de entrada", () => {
    const copy = [...many];
    recentForm(many);
    expect(many).toEqual(copy);
  });
});

describe("lastGameAt", () => {
  it("es el gameCreation de la última partida", () => {
    const rows = [row(103, 1, 30), row(266, 2, 10), row(9, 4, 20)];
    expect(lastGameAt(rows)).toBe(t(30));
  });

  it("es null sin partidas", () => {
    expect(lastGameAt([])).toBeNull();
  });
});
