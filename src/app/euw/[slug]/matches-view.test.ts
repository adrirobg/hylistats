import { describe, expect, it } from "vitest";
import type { AlbumEntry } from "@/domain/album";
import type { MatchDetail, MatchListRow } from "@/domain/matches";
import { EMPTY_GAME_DATA, type GameData, type GameIcon } from "@/lib/game-data";
import {
  BLOCK_SIZE,
  type Companion,
  championIdsForQuery,
  compactNumber,
  companeroParam,
  companionOptions,
  companionsForSelect,
  DEFAULT_MATCH_PARAMS,
  formatDuration,
  hasFilters,
  hasIcons,
  kdaText,
  MAX_BLOCKS,
  type MatchParams,
  matchCountText,
  matchDetailView,
  matchListLimit,
  matchRowLabel,
  matchRows,
  matchSearch,
  matchShareUrl,
  parseCompanero,
  parseMatchParams,
  selectedCompanionValue,
  teamLabel,
  toggleMatchHref,
  trioText,
  trioTitle,
  withFilter,
  withMoreBlocks,
  withoutFilters,
} from "./matches-view";

const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const NBSP = "\u00a0";

const params = (query: string) => parseMatchParams(new URLSearchParams(query));

describe("parseMatchParams", () => {
  it("sin query: los valores por defecto", () => {
    expect(params("")).toEqual(DEFAULT_MATCH_PARAMS);
  });

  it("lee q, puesto, companero, n y partida", () => {
    expect(
      params(
        "q=%20ahri%20&puesto=top3&companero=Player013-ANON&n=3&partida=EUW1_123",
      ),
    ).toEqual({
      q: "ahri",
      puesto: "top3",
      companero: { gameName: "Player013", tagLine: "ANON" },
      blocks: 3,
      partida: "EUW1_123",
    });
    expect(params("puesto=1").puesto).toBe("1");
  });

  it("lo inválido cae en el valor por defecto", () => {
    expect(params("puesto=2").puesto).toBeNull();
    expect(params("puesto=TOP3").puesto).toBeNull();
    expect(params("companero=sin-tag-valido-x").companero).toBeNull();
    expect(params("companero=Nombre").companero).toBeNull();
    expect(params("companero=").companero).toBeNull();
    // Un id de partida solo lleva letras, dígitos, `_` y `-`.
    expect(params("partida=../etc/passwd").partida).toBeNull();
    expect(params("partida=<script>").partida).toBeNull();
    expect(params(`partida=${"A".repeat(41)}`).partida).toBeNull();
    expect(params("partida=").partida).toBeNull();
  });

  it("n: solo enteros de 1 al máximo de bloques", () => {
    expect(params("n=1").blocks).toBe(1);
    expect(params("n=2").blocks).toBe(2);
    expect(params(`n=${MAX_BLOCKS}`).blocks).toBe(MAX_BLOCKS);
    expect(params("n=99").blocks).toBe(MAX_BLOCKS); // por encima, en el máximo
    expect(params("n=0").blocks).toBe(1);
    expect(params("n=-3").blocks).toBe(1);
    expect(params("n=2.5").blocks).toBe(1);
    expect(params("n=0x5").blocks).toBe(1);
    expect(params("n=abc").blocks).toBe(1);
    expect(params("n=99999999999").blocks).toBe(1);
  });

  it("q se recorta a 40 caracteres", () => {
    expect(params(`q=${"a".repeat(80)}`).q).toHaveLength(40);
  });

  it("acepta un objeto de `searchParams` de la página (clave repetida = la primera)", async () => {
    const { queryParams } = await import("./view-model");
    expect(
      parseMatchParams(queryParams({ q: ["ahri", "zed"], puesto: "1" })),
    ).toMatchObject({ q: "ahri", puesto: "1" });
  });
});

describe("parseCompanero / companeroParam", () => {
  it("separa por el último guion (el nombre puede llevar guiones)", () => {
    expect(parseCompanero("Mi-Nombre-EUW")).toEqual({
      gameName: "Mi-Nombre",
      tagLine: "EUW",
    });
    expect(parseCompanero("Nombre Largo-1991")).toEqual({
      gameName: "Nombre Largo",
      tagLine: "1991",
    });
  });

  it("no decodifica: un % es un carácter más (ya llega decodificado)", () => {
    expect(parseCompanero("100%real-EUW")).toEqual({
      gameName: "100%real",
      tagLine: "EUW",
    });
  });

  it("rechaza lo que no es un Riot ID", () => {
    expect(parseCompanero(null)).toBeNull();
    expect(parseCompanero("")).toBeNull();
    expect(parseCompanero("singuion")).toBeNull();
    expect(parseCompanero("ab-EUW")).toBeNull(); // nombre de menos de 3
    expect(parseCompanero("Nombre-X")).toBeNull(); // tag de menos de 2
    expect(parseCompanero("Nombre-TAGLARGO")).toBeNull(); // tag de más de 5
  });

  it("es la inversa: parse(companeroParam(id)) = id", () => {
    const id = { gameName: "Mi-Nombre", tagLine: "EUW" };
    expect(companeroParam(id)).toBe("Mi-Nombre-EUW");
    expect(parseCompanero(companeroParam(id))).toEqual(id);
  });

  it("nunca lleva puuid: el valor es solo Nombre-TAG", () => {
    expect(companeroParam({ gameName: "Player013", tagLine: "ANON" })).toBe(
      "Player013-ANON",
    );
  });
});

describe("matchSearch", () => {
  it("es la inversa de parseMatchParams y omite lo que va por defecto", () => {
    expect(matchSearch(DEFAULT_MATCH_PARAMS)).toBe("");
    const full: MatchParams = {
      q: "ahri",
      puesto: "top3",
      companero: { gameName: "Player013", tagLine: "ANON" },
      blocks: 2,
      partida: "EUW1_123",
    };
    const query = matchSearch(full);
    expect(query).toBe(
      "q=ahri&puesto=top3&companero=Player013-ANON&n=2&partida=EUW1_123",
    );
    expect(params(query)).toEqual(full);
  });

  it("conserva lo que no es de Partidas (?tab) y sustituye lo de Partidas", () => {
    expect(
      matchSearch(
        { ...DEFAULT_MATCH_PARAMS, puesto: "1" },
        "tab=partidas&q=viejo&n=4&partida=EUW1_1&campeon=ahri",
      ),
    ).toBe("tab=partidas&campeon=ahri&puesto=1");
  });

  it("codifica el texto de la búsqueda", () => {
    const query = matchSearch({ ...DEFAULT_MATCH_PARAMS, q: "kai'sa & co" });
    expect(params(query).q).toBe("kai'sa & co");
  });
});

describe("cambios de parámetros", () => {
  const base: MatchParams = {
    q: "ahri",
    puesto: "1",
    companero: { gameName: "Player013", tagLine: "ANON" },
    blocks: 3,
    partida: "EUW1_1",
  };

  it("cambiar un filtro vuelve al primer bloque y cierra la partida", () => {
    expect(withFilter(base, { puesto: "top3" })).toEqual({
      ...base,
      puesto: "top3",
      blocks: 1,
      partida: null,
    });
  });

  it("withoutFilters quita q, puesto y compañero", () => {
    expect(withoutFilters(base)).toEqual(DEFAULT_MATCH_PARAMS);
    expect(hasFilters(base)).toBe(true);
    expect(hasFilters(withoutFilters(base))).toBe(false);
    // Los bloques y la partida no son filtros.
    expect(
      hasFilters({ ...DEFAULT_MATCH_PARAMS, blocks: 4, partida: "X" }),
    ).toBe(false);
  });

  it("withMoreBlocks suma un bloque hasta el máximo", () => {
    expect(withMoreBlocks(DEFAULT_MATCH_PARAMS).blocks).toBe(2);
    expect(withMoreBlocks({ ...base, blocks: MAX_BLOCKS }).blocks).toBe(
      MAX_BLOCKS,
    );
    // No toca los filtros ni la partida abierta.
    expect(withMoreBlocks(base)).toEqual({ ...base, blocks: 4 });
  });

  it("matchListLimit: 50 partidas por bloque", () => {
    expect(BLOCK_SIZE).toBe(50);
    expect(matchListLimit(1)).toBe(50);
    expect(matchListLimit(MAX_BLOCKS)).toBe(500);
  });
});

describe("toggleMatchHref / matchShareUrl", () => {
  it("abre la partida conservando el resto de la query, y la cierra si ya estaba abierta", () => {
    const path = "/euw/BEJITO%20MAMBO-1991";
    expect(toggleMatchHref(path, "tab=partidas", "EUW1_1", false)).toBe(
      `${path}?tab=partidas&partida=EUW1_1`,
    );
    expect(
      toggleMatchHref(
        path,
        "tab=partidas&q=ahri&partida=EUW1_1",
        "EUW1_1",
        true,
      ),
    ).toBe(`${path}?tab=partidas&q=ahri`);
    // Otra partida abierta se sustituye.
    expect(
      toggleMatchHref(path, "tab=partidas&partida=EUW1_1", "EUW1_2", false),
    ).toBe(`${path}?tab=partidas&partida=EUW1_2`);
    // Sin más query, cerrar deja la ruta sola.
    expect(toggleMatchHref(path, "partida=EUW1_1", "EUW1_1", true)).toBe(path);
  });

  it("la URL a copiar es absoluta: el perfil + ?tab=partidas&partida=…, sin filtros", () => {
    expect(
      matchShareUrl(
        "https://hylistats.test",
        "/euw/BEJITO%20MAMBO-1991",
        "EUW1_7997909147",
      ),
    ).toBe(
      "https://hylistats.test/euw/BEJITO%20MAMBO-1991?tab=partidas&partida=EUW1_7997909147",
    );
  });
});

// --- Campeón -----------------------------------------------------------------------------

function entry(
  championId: number,
  name: string,
  ddId: string | null,
  overrides: Partial<AlbumEntry> = {},
): AlbumEntry {
  return {
    championId,
    ddId,
    name,
    portraitUrl: ddId ? `https://cdn.test/${ddId}.png` : null,
    state: "played",
    games: 1,
    firsts: 0,
    top3: 0,
    bestPlacement: 4,
    avgPlacement: 4,
    lastPlayedAt: 1,
    firstWinAt: null,
    firstWinMatchId: null,
    ...overrides,
  };
}

const ALBUM: AlbumEntry[] = [
  entry(103, "Ahri", "Ahri"),
  entry(62, "Wukong", "MonkeyKing"),
  entry(145, "Kai'Sa", "Kaisa"),
  entry(1, "Ryze", "Ryze", { games: 0, state: "none" }),
  entry(200, "Bel'Veth", null), // jugado pero fuera del catálogo: el nombre es el de la partida
];

describe("championIdsForQuery", () => {
  const games = [
    { championId: 103, championName: "Ahri" },
    { championId: 62, championName: "MonkeyKing" },
    { championId: 145, championName: "Kaisa" },
    { championId: 200, championName: "Belveth" },
  ];
  const ids = (q: string) =>
    championIdsForQuery(ALBUM, games, q)?.sort((a, b) => a - b);

  it("sin nada que buscar no hay filtro", () => {
    expect(ids("")).toBeUndefined();
    expect(ids("   ")).toBeUndefined();
    expect(ids("'")).toBeUndefined(); // se pliega a nada
  });

  it("casa por el nombre de visualización, sin tildes, mayúsculas ni signos", () => {
    expect(ids("AHRI")).toEqual([103]);
    expect(ids("kai'sa")).toEqual([145]);
    expect(ids("kaisa")).toEqual([145]);
    expect(ids("wuk")).toEqual([62]);
    expect(ids("bel veth")).toEqual([200]);
  });

  it("casa también por el id de Data Dragon (Wukong es MonkeyKing) y por el championName de la partida", () => {
    expect(ids("monkey")).toEqual([62]);
    // Un campeón fuera del catálogo: casa por el nombre de la partida (`Belveth` de Riot).
    expect(ids("belveth")).toEqual([200]);
    // Sin el campeón en el álbum, solo el `championName` de la partida lo encuentra.
    expect(
      championIdsForQuery(
        [],
        [{ championId: 7, championName: "Leblanc" }],
        "leblanc",
      ),
    ).toEqual([7]);
  });

  it("un campeón sin partidas no entra; ninguna coincidencia da una lista vacía", () => {
    expect(ids("ryze")).toEqual([]);
    expect(ids("zzz")).toEqual([]);
  });

  it("varios resultados", () => {
    expect(ids("k")).toEqual([62, 145]);
  });
});

// --- Compañeros --------------------------------------------------------------------------

describe("selector de compañero", () => {
  const list: Companion[] = [
    { gameName: "Player013", tagLine: "ANON", games: 10 },
    { gameName: "Player046", tagLine: "ANON", games: 5 },
    { gameName: "Player115", tagLine: "ANON", games: 2 },
    { gameName: "ab", tagLine: "X", games: 9 }, // Riot ID que no cabe en una URL
  ];

  it("companionsForSelect: al menos 3 partidas juntos y un Riot ID válido", () => {
    expect(companionsForSelect(list).map((t) => t.gameName)).toEqual([
      "Player013",
      "Player046",
    ]);
    expect(companionsForSelect(list, 1).map((t) => t.gameName)).toEqual([
      "Player013",
      "Player046",
      "Player115",
    ]);
  });

  it("solo copia nombre, tag y partidas (nada más viaja)", () => {
    const withExtra = [
      { gameName: "Player013", tagLine: "ANON", games: 10, firsts: 1, x: 1 },
    ];
    expect(companionsForSelect(withExtra)).toEqual([
      { gameName: "Player013", tagLine: "ANON", games: 10 },
    ]);
  });

  it("companionOptions: valor = Nombre-TAG y etiqueta con las partidas", () => {
    expect(companionOptions(companionsForSelect(list), null)).toEqual([
      { value: "Player013-ANON", label: "Player013#ANON (10)" },
      { value: "Player046-ANON", label: "Player046#ANON (5)" },
    ]);
  });

  it("un compañero de la URL que no llega al mínimo sale igualmente", () => {
    const selected = { gameName: "Player115", tagLine: "ANON" };
    const options = companionOptions(companionsForSelect(list), selected);
    expect(options.at(-1)).toEqual({
      value: "Player115-ANON",
      label: "Player115#ANON",
    });
    expect(selectedCompanionValue(options, selected)).toBe("Player115-ANON");
  });

  it("un compañero de la lista no se duplica, aunque la URL use otras mayúsculas", () => {
    const selected = { gameName: "player013", tagLine: "anon" };
    const options = companionOptions(companionsForSelect(list), selected);
    expect(options).toHaveLength(2);
    expect(selectedCompanionValue(options, selected)).toBe("Player013-ANON");
    expect(selectedCompanionValue(options, null)).toBe("");
  });
});

// --- Filas y detalle ---------------------------------------------------------------------

function row(overrides: Partial<MatchListRow> = {}): MatchListRow {
  return {
    matchId: "EUW1_1",
    gameCreation: NOW - 2 * 60 * 60_000,
    gameDuration: 1329,
    championId: 103,
    championName: "Ahri",
    placement: 1,
    trio: [
      { gameName: "Hylimichi", tagLine: "EUW" },
      { gameName: "TheCIutch", tagLine: "EUW" },
    ],
    ...overrides,
  };
}

describe("matchRows", () => {
  const album = [
    entry(103, "Ahri (catálogo)", "Ahri", { firstWinMatchId: "EUW1_1" }),
    entry(53, "Blitzcrank", "Blitzcrank", { firstWinMatchId: "EUW1_3" }),
  ];

  it("nombre y retrato del catálogo, y «nuevo 1º» solo en la partida que verifica al campeón", () => {
    const rows = matchRows(
      [
        row(),
        row({ matchId: "EUW1_2", placement: 1 }), // otro 1º con Ahri: no es el primero
        row({ matchId: "EUW1_3", championId: 53, championName: "Blitzcrank" }),
        row({ matchId: "EUW1_4", championId: 999, championName: "Nuevo" }),
      ],
      album,
    );
    expect(rows.map((r) => r.newFirst)).toEqual([true, false, true, false]);
    expect(rows[0]).toMatchObject({
      championName: "Ahri (catálogo)",
      portraitUrl: "https://cdn.test/Ahri.png",
    });
    // Sin el campeón en el álbum: el nombre de la partida y sin retrato.
    expect(rows[3]).toMatchObject({ championName: "Nuevo", portraitUrl: null });
  });
});

describe("textos de la fila", () => {
  it("formatDuration: minutos redondeados, al menos 1", () => {
    expect(formatDuration(1329)).toBe("22 min");
    expect(formatDuration(1504)).toBe("25 min");
    expect(formatDuration(89)).toBe("1 min");
    expect(formatDuration(0)).toBe("1 min");
  });

  it("trioText y trioTitle", () => {
    expect(trioText(row().trio)).toBe("con Hylimichi · TheCIutch");
    expect(trioTitle(row().trio)).toBe("Hylimichi#EUW · TheCIutch#EUW");
    expect(trioText([])).toBe("sin compañeros");
  });

  it("matchRowLabel: campeón, puesto, «nuevo 1º», compañeros, duración y hace cuánto", () => {
    const base = { ...row(), portraitUrl: null, newFirst: false };
    expect(matchRowLabel(base, NOW)).toBe(
      "Ahri, 1º, con Hylimichi y TheCIutch, 22 min, hace 2 h",
    );
    expect(matchRowLabel({ ...base, newFirst: true }, NOW)).toBe(
      "Ahri, 1º, nuevo 1º con este campeón, con Hylimichi y TheCIutch, 22 min, hace 2 h",
    );
    expect(matchRowLabel({ ...base, trio: [] }, NOW)).toBe(
      "Ahri, 1º, 22 min, hace 2 h",
    );
  });

  it("matchCountText", () => {
    expect(matchCountText(1, 1, false)).toBe("1 partida");
    expect(matchCountText(50, 50, false)).toBe("50 partidas");
    expect(matchCountText(234, 50, false)).toBe(
      "234 partidas · se muestran las 50 más recientes",
    );
    expect(matchCountText(3, 3, true)).toBe("3 partidas con estos filtros");
    expect(matchCountText(120, 50, true)).toBe(
      "120 partidas con estos filtros · se muestran las 50 más recientes",
    );
  });

  it("compactNumber y kdaText", () => {
    expect(compactNumber(842)).toBe("842");
    expect(compactNumber(999)).toBe("999");
    expect(compactNumber(1000)).toBe(`1,0${NBSP}k`);
    expect(compactNumber(18_432)).toBe(`18,4${NBSP}k`);
    expect(compactNumber(0)).toBe("0");
    expect(kdaText({ kills: 12, deaths: 3, assists: 8 })).toBe("12/3/8");
  });

  it("teamLabel", () => {
    expect(teamLabel({ placement: 5, isOwnTeam: true })).toBe(
      "5º puesto · tu equipo",
    );
    expect(teamLabel({ placement: 1, isOwnTeam: false })).toBe("1º puesto");
  });
});

describe("matchDetailView", () => {
  const player = (
    gameName: string,
    overrides: Partial<MatchDetail["teams"][number]["players"][number]> = {},
  ) => ({
    gameName,
    tagLine: "EUW",
    championId: 103,
    championName: "Ahri",
    kills: 1,
    deaths: 2,
    assists: 3,
    damage: 4000,
    gold: 5000,
    level: 12,
    augments: [] as number[],
    items: [] as number[],
    isSelf: false,
    ...overrides,
  });
  const detail: MatchDetail = {
    matchId: "EUW1_1",
    gameCreation: NOW,
    gameDuration: 1329,
    championId: 103,
    championName: "Ahri",
    placement: 5,
    teams: [
      { placement: 1, isOwnTeam: false, players: [player("Otro Uno")] },
      {
        placement: 5,
        isOwnTeam: true,
        players: [
          player("BEJITO MAMBO", {
            isSelf: true,
            augments: [181, 999],
            items: [3348, 223158, 888],
          }),
          player("Hylimichi", { championId: 999, championName: "Nuevo" }),
        ],
      },
    ],
  };
  const icon = (id: number, name: string): GameIcon => ({
    id,
    name,
    iconUrl: `https://cdn.test/${id}.png`,
  });
  const gameData: GameData = {
    items: new Map([
      [3348, icon(3348, "Barredora arcana")],
      [223158, icon(223158, "Botas de Arena")],
    ]),
    augments: new Map([[181, icon(181, "Adaptación")]]),
  };
  const album = [entry(103, "Ahri", "Ahri", { firstWinMatchId: "EUW1_1" })];

  it("resuelve augments y objetos con los datos y descarta los ids sin datos", () => {
    const view = matchDetailView(detail, album, gameData);
    const self = view.teams[1].players[0];
    expect(self.augments).toEqual([icon(181, "Adaptación")]);
    expect(self.items.map((i) => i.name)).toEqual([
      "Barredora arcana",
      "Botas de Arena",
    ]);
    // Nunca queda un id suelto: los dos objetos con datos son todo lo que hay.
    expect(JSON.stringify(self)).not.toContain("888");
  });

  it("sin datos de la fuente: ningún icono y hasIcons lo refleja", () => {
    const view = matchDetailView(detail, album, EMPTY_GAME_DATA);
    expect(hasIcons(view, "augments")).toBe(false);
    expect(hasIcons(view, "items")).toBe(false);
    const withData = matchDetailView(detail, album, gameData);
    expect(hasIcons(withData, "augments")).toBe(true);
    expect(hasIcons(withData, "items")).toBe(true);
  });

  it("solo hay «sin datos de objetos» si ningún jugador tiene objetos", () => {
    const onlyAugments: GameData = {
      items: new Map(),
      augments: gameData.augments,
    };
    const view = matchDetailView(detail, album, onlyAugments);
    expect(hasIcons(view, "augments")).toBe(true);
    expect(hasIcons(view, "items")).toBe(false);
  });

  it("la fila de la partida sale del propio detalle: campeón, puesto, trío sin el jugador y «nuevo 1º»", () => {
    const view = matchDetailView(detail, album, gameData);
    expect(view.row).toMatchObject({
      matchId: "EUW1_1",
      championName: "Ahri",
      placement: 5,
      portraitUrl: "https://cdn.test/Ahri.png",
      newFirst: true,
      trio: [{ gameName: "Hylimichi", tagLine: "EUW" }],
    });
    // Sin la partida como primer 1º de su campeón no lleva la marca.
    expect(matchDetailView(detail, [], gameData).row.newFirst).toBe(false);
  });

  it("nombre y retrato del catálogo por jugador; sin él, el de la partida", () => {
    const view = matchDetailView(detail, album, gameData);
    expect(view.teams[1].players[0]).toMatchObject({
      championName: "Ahri",
      portraitUrl: "https://cdn.test/Ahri.png",
    });
    expect(view.teams[1].players[1]).toMatchObject({
      championName: "Nuevo",
      portraitUrl: null,
    });
  });

  it("conserva isOwnTeam, isSelf y el orden de los equipos", () => {
    const view = matchDetailView(detail, album, gameData);
    expect(view.teams.map((t) => [t.placement, t.isOwnTeam])).toEqual([
      [1, false],
      [5, true],
    ]);
    expect(view.teams[1].players.map((p) => p.isSelf)).toEqual([true, false]);
  });
});
