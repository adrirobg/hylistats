import { describe, expect, it } from "vitest";
import type { AlbumEntry } from "@/domain/album";
import {
  type AlbumLocal,
  type AlbumParams,
  albumSearch,
  albumSections,
  cardLabel,
  cardSub,
  cardTitle,
  DEFAULT_ORDEN,
  DEFAULT_VISTA,
  defaultFiltro,
  effectiveState,
  matchesQuery,
  parseAlbumParams,
  resolveFiltro,
  withQuery,
} from "./album-view";
import { FILTER_PARAM, FILTER_UNWON, withSearchParam } from "./view-model";

const BASE = Date.UTC(2026, 8, 1);
const day = (n: number) => BASE + n * 86_400_000;

const NONE_STATS = {
  games: 0,
  firsts: 0,
  top3: 0,
  bestPlacement: null,
  avgPlacement: null,
  lastPlayedAt: null,
  firstWinAt: null,
  firstWinMatchId: null,
};

const entryOf = (
  championId: number,
  name: string,
  overrides: Partial<AlbumEntry> = {},
): AlbumEntry => ({
  championId,
  ddId: name.replace(/[^A-Za-z]/g, ""),
  name,
  portraitUrl: `https://cdn.test/${championId}.png`,
  state: "none",
  ...NONE_STATS,
  ...overrides,
});

// Verificados: Ahri (3 × 1º) y Yasuo (1). Jugados sin ganar: Aatrox (8 partidas, mejor 3º) y Zed
// (4 partidas, mejor 2º, más reciente). Sin jugar: Kai'Sa, Sett y Wukong (id `MonkeyKing`).
const AHRI = entryOf(103, "Ahri", {
  state: "won",
  games: 10,
  firsts: 3,
  top3: 6,
  bestPlacement: 1,
  avgPlacement: 3,
  lastPlayedAt: day(5),
  firstWinAt: day(1),
  firstWinMatchId: "EUW1_1",
});
const YASUO = entryOf(157, "Yasuo", {
  state: "won",
  games: 2,
  firsts: 1,
  top3: 2,
  bestPlacement: 1,
  avgPlacement: 2,
  lastPlayedAt: day(2),
  firstWinAt: day(2),
  firstWinMatchId: "EUW1_2",
});
const AATROX = entryOf(266, "Aatrox", {
  state: "played",
  games: 8,
  top3: 3,
  bestPlacement: 3,
  avgPlacement: 4.5,
  lastPlayedAt: day(3),
});
const ZED = entryOf(238, "Zed", {
  state: "played",
  games: 4,
  top3: 1,
  bestPlacement: 2,
  avgPlacement: 4,
  lastPlayedAt: day(9),
});
const KAISA = entryOf(145, "Kai'Sa", { ddId: "Kaisa" });
const SETT = entryOf(875, "Sett");
const WUKONG = entryOf(62, "Wukong", { ddId: "MonkeyKing" });

// Orden de `buildAlbum`: por nombre.
const ALBUM = [AATROX, AHRI, KAISA, SETT, WUKONG, YASUO, ZED];

const params = (overrides: Partial<AlbumParams> = {}): AlbumParams => ({
  vista: DEFAULT_VISTA,
  filtro: "todos",
  q: "",
  orden: DEFAULT_ORDEN,
  ...overrides,
});

const local = (targets: number[] = [], manual: number[] = []): AlbumLocal => ({
  targets: new Set(targets),
  manual: new Set(manual),
});

const names = (entries: AlbumEntry[]) => entries.map((e) => e.name);
const sections = (
  ...args: [AlbumLocal, AlbumParams] | [AlbumLocal, AlbumParams, AlbumEntry[]]
) => albumSections(args[2] ?? ALBUM, args[0], args[1]);

// --- URL ---------------------------------------------------------------------------------

describe("parseAlbumParams", () => {
  it("sin parámetros: vista álbum, sin filtro fijado, sin búsqueda, orden por estado", () => {
    expect(parseAlbumParams(new URLSearchParams(""))).toEqual({
      vista: "album",
      filtro: null,
      q: "",
      orden: "estado",
    });
  });

  it("lee los cuatro parámetros", () => {
    const search = "vista=lista&filtro=ganados&q=ahri&orden=mejor";
    expect(parseAlbumParams(new URLSearchParams(search))).toEqual({
      vista: "lista",
      filtro: "ganados",
      q: "ahri",
      orden: "mejor",
    });
  });

  it("cada filtro y cada orden válidos se entienden", () => {
    for (const filtro of [
      "objetivos",
      "sin-ganar",
      "sin-jugar",
      "ganados",
      "todos",
    ]) {
      const parsed = parseAlbumParams(new URLSearchParams({ filtro }));
      expect(parsed.filtro).toBe(filtro);
    }
    for (const orden of [
      "estado",
      "alfabetico",
      "intentos",
      "mejor",
      "reciente",
    ]) {
      expect(parseAlbumParams(new URLSearchParams({ orden })).orden).toBe(
        orden,
      );
    }
  });

  it("valores inválidos caen en el valor por defecto (también las mayúsculas)", () => {
    const search = "vista=tabla&filtro=Ganados&orden=zzz";
    expect(parseAlbumParams(new URLSearchParams(search))).toEqual({
      vista: "album",
      filtro: null,
      q: "",
      orden: "estado",
    });
  });

  it("q: recorta espacios y limita la longitud; repetido gana el primero", () => {
    expect(parseAlbumParams(new URLSearchParams("q=%20%20ahri%20")).q).toBe(
      "ahri",
    );
    expect(parseAlbumParams(new URLSearchParams("q=a&q=b")).q).toBe("a");
    expect(
      parseAlbumParams(new URLSearchParams({ q: "x".repeat(500) })).q,
    ).toHaveLength(40);
  });

  it("lo que pone «Marcar a mano» de la barra Arena God (T07) es un filtro válido", () => {
    const href = withSearchParam(
      "/euw/Foo-EUW",
      "tab=campeones",
      FILTER_PARAM,
      FILTER_UNWON,
    );
    const search = href.split("?")[1];
    expect(parseAlbumParams(new URLSearchParams(search)).filtro).toBe(
      "sin-ganar",
    );
  });
});

describe("albumSearch", () => {
  it("todo por defecto: query vacía (URL limpia)", () => {
    expect(albumSearch(params({ filtro: null }))).toBe("");
  });

  it("omite los valores por defecto y escribe el resto", () => {
    expect(albumSearch(params({ filtro: null, vista: "lista" }))).toBe(
      "vista=lista",
    );
    expect(albumSearch(params({ filtro: null, orden: "intentos" }))).toBe(
      "orden=intentos",
    );
    expect(albumSearch(params({ filtro: "sin-jugar", q: "ahri" }))).toBe(
      "filtro=sin-jugar&q=ahri",
    );
    expect(
      albumSearch({
        vista: "lista",
        filtro: "ganados",
        q: "a b",
        orden: "mejor",
      }),
    ).toBe("vista=lista&filtro=ganados&q=a+b&orden=mejor");
  });

  it("conserva los parámetros ajenos al álbum y sustituye los suyos", () => {
    expect(
      albumSearch(
        params({ filtro: "ganados", vista: "lista" }),
        "tab=campeones&filtro=todos&q=viejo&orden=mejor&vista=album&utm=1",
      ),
    ).toBe("tab=campeones&utm=1&vista=lista&filtro=ganados");
    // Sin nada del álbum que escribir, quita lo que hubiera y deja el resto.
    expect(
      albumSearch(params({ filtro: null }), new URLSearchParams("tab=x&q=y")),
    ).toBe("tab=x");
  });

  it("es la inversa de parseAlbumParams", () => {
    const samples: AlbumParams[] = [
      params({ filtro: null }),
      params({ filtro: "objetivos", vista: "lista", orden: "reciente" }),
      params({ filtro: "sin-ganar", q: "Kai'Sa" }),
      params({ filtro: null, q: "ñu & más=raro" }),
    ];
    for (const sample of samples) {
      const query = albumSearch(sample, "tab=campeones");
      expect(parseAlbumParams(new URLSearchParams(query))).toEqual(sample);
      expect(new URLSearchParams(query).get("tab")).toBe("campeones");
    }
  });

  it("recorta la búsqueda antes de escribirla", () => {
    expect(albumSearch(params({ filtro: null, q: "  ahri " }))).toBe("q=ahri");
    expect(albumSearch(params({ filtro: null, q: "   " }))).toBe("");
  });
});

describe("defaultFiltro y resolveFiltro", () => {
  it("D1: objetivos si hay objetivos; si no, todos", () => {
    expect(defaultFiltro(true)).toBe("objetivos");
    expect(defaultFiltro(false)).toBe("todos");
  });

  it("en «mi perfil» el filtro de la URL manda y, sin él, el por defecto", () => {
    expect(resolveFiltro(null, { mine: true, hasTargets: true })).toBe(
      "objetivos",
    );
    expect(resolveFiltro(null, { mine: true, hasTargets: false })).toBe(
      "todos",
    );
    expect(resolveFiltro("ganados", { mine: true, hasTargets: true })).toBe(
      "ganados",
    );
    expect(resolveFiltro("objetivos", { mine: true, hasTargets: false })).toBe(
      "objetivos",
    );
  });

  it("fuera de «mi perfil» no hay filtro de objetivos: cae en todos", () => {
    expect(resolveFiltro(null, { mine: false, hasTargets: true })).toBe(
      "todos",
    );
    expect(resolveFiltro("objetivos", { mine: false, hasTargets: false })).toBe(
      "todos",
    );
    expect(resolveFiltro("sin-jugar", { mine: false, hasTargets: false })).toBe(
      "sin-jugar",
    );
  });
});

describe("withQuery", () => {
  it("escribir con otro filtro cambia a todos (como la maqueta)", () => {
    expect(
      withQuery(params({ filtro: "sin-jugar" }), "ahri", "sin-jugar"),
    ).toEqual(params({ filtro: "todos", q: "ahri" }));
    // Filtro por defecto (sin fijar en la URL) que se resuelve a objetivos.
    expect(
      withQuery(params({ filtro: null }), "ahri", "objetivos").filtro,
    ).toBe("todos");
  });

  it("con todos (o sin texto) no toca el filtro; recorta el texto", () => {
    expect(withQuery(params({ filtro: null }), " ahri ", "todos")).toEqual(
      params({ filtro: null, q: "ahri" }),
    );
    expect(
      withQuery(params({ filtro: "ganados" }), "  ", "ganados").filtro,
    ).toBe("ganados");
    expect(withQuery(params({ filtro: "ganados" }), "", "ganados").q).toBe("");
  });
});

// --- Estado y búsqueda -------------------------------------------------------------------

describe("effectiveState", () => {
  it("sin marcas, el estado del dominio", () => {
    const none = new Set<number>();
    expect(effectiveState(AHRI, none)).toBe("won");
    expect(effectiveState(ZED, none)).toBe("played");
    expect(effectiveState(SETT, none)).toBe("none");
  });

  it("una marca manual sobre un jugado o un sin jugar da manual", () => {
    const manual = new Set([ZED.championId, SETT.championId]);
    expect(effectiveState(ZED, manual)).toBe("manual");
    expect(effectiveState(SETT, manual)).toBe("manual");
    expect(effectiveState(AATROX, manual)).toBe("played");
  });

  it("un campeón verificado manda sobre su marca manual", () => {
    expect(effectiveState(AHRI, new Set([AHRI.championId]))).toBe("won");
  });
});

describe("matchesQuery", () => {
  it("sin distinguir mayúsculas, subcadena del nombre", () => {
    expect(matchesQuery(AHRI, "ahr")).toBe(true);
    expect(matchesQuery(AHRI, "AHRI")).toBe(true);
    expect(matchesQuery(AHRI, "hri")).toBe(true);
    expect(matchesQuery(AHRI, "zed")).toBe(false);
  });

  it("sin tildes ni signos: «kaisa» casa con «Kai'Sa»", () => {
    expect(matchesQuery(KAISA, "kaisa")).toBe(true);
    expect(matchesQuery(KAISA, "kai'sa")).toBe(true);
    expect(matchesQuery(KAISA, "KAI SA")).toBe(true);
    expect(matchesQuery(entryOf(1, "Dr. Mundo"), "dr mundo")).toBe(true);
    expect(matchesQuery(entryOf(2, "Nunú y Willump"), "nunu")).toBe(true);
    expect(matchesQuery(entryOf(3, "Nunu"), "nunú")).toBe(true);
    expect(matchesQuery(entryOf(4, "Cho'Gath"), "chogath")).toBe(true);
  });

  it("también por el id de Data Dragon: «monkeyking» encuentra a Wukong", () => {
    expect(matchesQuery(WUKONG, "monkey")).toBe(true);
    expect(matchesQuery(WUKONG, "wukong")).toBe(true);
    expect(matchesQuery(entryOf(5, "Desconocido", { ddId: null }), "des")).toBe(
      true,
    );
    expect(
      matchesQuery(entryOf(5, "Desconocido", { ddId: null }), "null"),
    ).toBe(false);
  });

  it("una búsqueda vacía (o solo signos) casa con todo", () => {
    expect(matchesQuery(AHRI, "")).toBe(true);
    expect(matchesQuery(AHRI, "   ")).toBe(true);
    expect(matchesQuery(AHRI, "'")).toBe(true);
  });
});

// --- Bandas ------------------------------------------------------------------------------

describe("albumSections: filtros", () => {
  it("objetivos: los objetivos sin ganar (el manual cuenta como ganar)", () => {
    // Objetivos: Zed (jugado), Sett (sin jugar, con marca manual), Ahri (verificado), Kai'Sa.
    const result = sections(
      local(
        [ZED.championId, SETT.championId, AHRI.championId, KAISA.championId],
        [SETT.championId],
      ),
      params({ filtro: "objetivos" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: "objetivos",
      title: "Objetivos sin ganar",
      tone: "target",
    });
    expect(names(result[0].entries)).toEqual(["Kai'Sa", "Zed"]);
  });

  it("objetivos sin objetivos: vacío con el texto del brief; con todos ganados, otro", () => {
    const [none] = sections(local(), params({ filtro: "objetivos" }));
    expect(none.entries).toEqual([]);
    expect(none.empty).toBe(
      "Marca objetivos con ◎ en cualquier campeón para verlos aquí.",
    );
    const [done] = sections(
      local([AHRI.championId]),
      params({ filtro: "objetivos" }),
    );
    expect(done.entries).toEqual([]);
    expect(done.empty).toMatch(/^No tienes objetivos pendientes/);
  });

  it("sin-ganar: jugados sin ganar (un manual sale)", () => {
    const [plain] = sections(local(), params({ filtro: "sin-ganar" }));
    expect(plain).toMatchObject({
      key: "sin-ganar",
      title: "Jugados sin ganar",
      tone: "neutral",
    });
    expect(names(plain.entries)).toEqual(["Aatrox", "Zed"]);
    const [manual] = sections(
      local([], [ZED.championId]),
      params({ filtro: "sin-ganar" }),
    );
    expect(names(manual.entries)).toEqual(["Aatrox"]);
  });

  it("sin-jugar: sin partidas y sin marca manual", () => {
    const [plain] = sections(local(), params({ filtro: "sin-jugar" }));
    expect(plain.title).toBe("Sin jugar");
    expect(names(plain.entries)).toEqual(["Kai'Sa", "Sett", "Wukong"]);
    const [manual] = sections(
      local([], [SETT.championId]),
      params({ filtro: "sin-jugar" }),
    );
    expect(names(manual.entries)).toEqual(["Kai'Sa", "Wukong"]);
  });

  it("ganados: verificados y manuales, con tono dorado", () => {
    const [plain] = sections(local(), params({ filtro: "ganados" }));
    expect(plain).toMatchObject({
      key: "ganados",
      title: "Ganados",
      tone: "won",
    });
    expect(names(plain.entries)).toEqual(["Ahri", "Yasuo"]);
    const [manual] = sections(
      local([], [ZED.championId, AHRI.championId]),
      params({ filtro: "ganados" }),
    );
    expect(names(manual.entries)).toEqual(["Ahri", "Yasuo", "Zed"]);
  });

  it("filtro null: manda el por defecto según haya objetivos", () => {
    const withTargets = sections(
      local([ZED.championId]),
      params({ filtro: null }),
    );
    expect(withTargets.map((s) => s.key)).toEqual(["objetivos"]);
    const without = sections(local(), params({ filtro: null }));
    expect(without.map((s) => s.key)).toEqual([
      "sin-ganar",
      "sin-jugar",
      "ganados",
    ]);
  });

  it("los textos de vacío de cada banda", () => {
    const empty = sections(local(), params({ filtro: "todos" }), []);
    expect(empty.map((s) => [s.key, s.empty])).toEqual([
      ["sin-ganar", "Nada por aquí."],
      ["sin-jugar", "Has jugado todos."],
      ["ganados", "Aún sin victorias."],
    ]);
    const [ganados] = sections(local(), params({ filtro: "ganados" }), []);
    expect(ganados.empty).toBe("Aún sin victorias esta temporada.");
  });
});

describe("albumSections: todos", () => {
  it("bandas por estado, alfabéticas dentro de cada una", () => {
    const result = sections(local(), params({ filtro: "todos" }));
    expect(result.map((s) => [s.key, s.title, s.tone])).toEqual([
      ["sin-ganar", "Jugados sin ganar", "neutral"],
      ["sin-jugar", "Sin jugar", "neutral"],
      ["ganados", "Ganados", "won"],
    ]);
    expect(result.map((s) => names(s.entries))).toEqual([
      ["Aatrox", "Zed"],
      ["Kai'Sa", "Sett", "Wukong"],
      ["Ahri", "Yasuo"],
    ]);
  });

  it("los objetivos sin ganar tienen su banda y no se repiten en Jugados ni en Sin jugar", () => {
    const result = sections(
      local([ZED.championId, KAISA.championId, AHRI.championId]),
      params({ filtro: "todos" }),
    );
    expect(result.map((s) => s.key)).toEqual([
      "objetivos",
      "sin-ganar",
      "sin-jugar",
      "ganados",
    ]);
    expect(result[0].tone).toBe("target");
    expect(result.map((s) => names(s.entries))).toEqual([
      ["Kai'Sa", "Zed"],
      ["Aatrox"],
      ["Sett", "Wukong"],
      // Un objetivo ya ganado sigue en Ganados.
      ["Ahri", "Yasuo"],
    ]);
  });

  it("un objetivo ganado a mano no forma banda de objetivos", () => {
    const result = sections(
      local([ZED.championId], [ZED.championId]),
      params({ filtro: "todos" }),
    );
    expect(result.map((s) => s.key)).toEqual([
      "sin-ganar",
      "sin-jugar",
      "ganados",
    ]);
    expect(names(result[2].entries)).toEqual(["Ahri", "Yasuo", "Zed"]);
  });

  it("la banda de objetivos solo sale si hay alguno visible", () => {
    const result = sections(
      local([ZED.championId]),
      params({ filtro: "todos", q: "ahri" }),
    );
    expect(result.map((s) => s.key)).not.toContain("objetivos");
  });
});

describe("albumSections: orden", () => {
  it("alfabético: una única sección con el título del filtro", () => {
    const result = sections(
      local(),
      params({ filtro: "todos", orden: "alfabetico" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "todos", title: "Todos" });
    expect(names(result[0].entries)).toEqual([
      "Aatrox",
      "Ahri",
      "Kai'Sa",
      "Sett",
      "Wukong",
      "Yasuo",
      "Zed",
    ]);
  });

  it("intentos: más partidas primero", () => {
    const [section] = sections(local(), params({ orden: "intentos" }));
    expect(names(section.entries)).toEqual([
      "Ahri", // 10
      "Aatrox", // 8
      "Zed", // 4
      "Yasuo", // 2
      "Kai'Sa", // 0: por nombre
      "Sett",
      "Wukong",
    ]);
  });

  it("mejor puesto: el 1º primero y los sin partidas al final", () => {
    const [section] = sections(local(), params({ orden: "mejor" }));
    expect(names(section.entries)).toEqual([
      "Ahri", // 1º
      "Yasuo", // 1º
      "Zed", // 2º
      "Aatrox", // 3º
      "Kai'Sa",
      "Sett",
      "Wukong",
    ]);
  });

  it("último jugado: el más reciente primero y los sin partidas al final", () => {
    const [section] = sections(local(), params({ orden: "reciente" }));
    expect(names(section.entries)).toEqual([
      "Zed", // día 9
      "Ahri", // día 5
      "Aatrox", // día 3
      "Yasuo", // día 2
      "Kai'Sa",
      "Sett",
      "Wukong",
    ]);
  });

  it("con un filtro concreto ordena solo esa banda y conserva su título", () => {
    const [section] = sections(
      local(),
      params({ filtro: "sin-ganar", orden: "reciente" }),
    );
    expect(section).toMatchObject({
      key: "sin-ganar",
      title: "Jugados sin ganar",
    });
    expect(names(section.entries)).toEqual(["Zed", "Aatrox"]);
  });

  it("con orden por estado y filtro todos, cada banda va por nombre aunque la entrada venga desordenada", () => {
    const shuffled = [ZED, KAISA, AATROX, WUKONG, SETT, YASUO, AHRI];
    const result = sections(local(), params({ filtro: "todos" }), shuffled);
    expect(result.map((s) => names(s.entries))).toEqual([
      ["Aatrox", "Zed"],
      ["Kai'Sa", "Sett", "Wukong"],
      ["Ahri", "Yasuo"],
    ]);
  });

  it("no muta la lista de entrada", () => {
    const input = [ZED, AHRI, AATROX];
    const copy = [...input];
    sections(local(), params({ orden: "intentos" }), input);
    expect(input).toEqual(copy);
  });
});

describe("albumSections: búsqueda", () => {
  it("filtra dentro de las bandas y solo quedan las que tienen resultados", () => {
    const result = sections(local(), params({ filtro: "todos", q: "a" }));
    const flat = result.flatMap((s) => names(s.entries));
    expect(flat).toContain("Ahri");
    expect(flat).toContain("Kai'Sa");
    expect(flat).not.toContain("Zed");
    expect(flat).not.toContain("Sett");
  });

  it("por el id de Data Dragon", () => {
    const [section] = sections(
      local(),
      params({ filtro: "sin-jugar", q: "monkeyking" }),
    );
    expect(names(section.entries)).toEqual(["Wukong"]);
  });

  it("sin resultados: una única sección vacía que dice qué se buscó", () => {
    const result = sections(local(), params({ filtro: "todos", q: "zzz" }));
    expect(result).toEqual([
      {
        key: "sin-resultados",
        title: "",
        tone: "neutral",
        entries: [],
        empty: "Ningún campeón coincide con «zzz».",
      },
    ]);
  });

  it("sin resultados también con un filtro concreto y con otro orden", () => {
    for (const filtro of ["objetivos", "ganados", "todos"] as const) {
      for (const orden of ["estado", "intentos"] as const) {
        const result = sections(local(), params({ filtro, orden, q: "zzz" }));
        expect(result.map((s) => s.key)).toEqual(["sin-resultados"]);
      }
    }
  });

  it("un filtro sin resultados pero con búsqueda que sí casa en otro sitio muestra la banda vacía", () => {
    const [section] = sections(
      local(),
      params({ filtro: "sin-jugar", q: "ahri" }),
    );
    expect(section.key).toBe("sin-jugar");
    expect(section.entries).toEqual([]);
    expect(section.empty).toBe("Has jugado todos.");
  });
});

// --- Textos del cromo --------------------------------------------------------------------

describe("cardSub", () => {
  it("ganado: nº de 1º si hay más de uno; si no, las partidas", () => {
    expect(cardSub(AHRI, "won")).toBe("3× 1º");
    expect(cardSub(YASUO, "won")).toBe("2 part.");
  });

  it("manual, jugado y sin jugar", () => {
    expect(cardSub(ZED, "manual")).toBe("manual");
    expect(cardSub(ZED, "played")).toBe("×4 · mejor 2º");
    expect(cardSub(SETT, "none")).toBe("sin jugar");
  });
});

describe("cardLabel", () => {
  it("ganado verificado con objetivo", () => {
    expect(cardLabel(AHRI, "won", true)).toBe(
      "Ahri, ganado verificado, 3 primeros puestos, objetivo",
    );
    expect(cardLabel(YASUO, "won", false)).toBe(
      "Yasuo, ganado verificado, 1 primer puesto",
    );
  });

  it("manual, jugado y sin jugar", () => {
    expect(cardLabel(ZED, "manual", false)).toBe("Zed, ganado a mano");
    expect(cardLabel(ZED, "played", false)).toBe(
      "Zed, jugado sin ganar, 4 partidas, mejor puesto 2º",
    );
    expect(cardLabel(SETT, "none", true)).toBe("Sett, sin jugar, objetivo");
  });
});

describe("cardTitle", () => {
  it("solo el verificado lleva la fecha de su primer 1º", () => {
    expect(cardTitle(AHRI, "won")).toBe("1º el 2026-09-02 00:00 UTC");
    expect(cardTitle(AHRI, "manual")).toBeUndefined();
    expect(cardTitle(ZED, "played")).toBeUndefined();
  });
});
