import { describe, expect, it } from "vitest";
import { albumSearch } from "./album-view";
import type { SyncProgress } from "./data";
import { matchSearch } from "./matches-view";
import {
  dataAgePhrase,
  emptyState,
  initials,
  MATCH_PARAM,
  matchHref,
  PROFILE_TABS,
  panelId,
  parseProfileTab,
  queryParams,
  SECONDS_PER_MATCH,
  syncBandModel,
  syncEtaMinutes,
  TAB_LABEL,
  tabForKey,
  tabHref,
  tabId,
  whenPhrase,
  withoutSearchParam,
  withSearchParam,
} from "./view-model";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);

describe("initials", () => {
  it("dos palabras: la inicial de cada una", () => {
    expect(initials("BEJITO MAMBO")).toBe("BM");
    expect(initials("  poro   veloz  ")).toBe("PV");
  });

  it("una palabra: sus dos primeras letras", () => {
    expect(initials("Faker")).toBe("FA");
    expect(initials("Z")).toBe("Z");
  });

  it("más de dos palabras: solo las dos primeras; y respeta caracteres no ASCII", () => {
    expect(initials("Uno Dos Tres")).toBe("UD");
    expect(initials("ñandú")).toBe("ÑA");
    expect(initials("𝐀𝐛 Cd")).toBe("𝐀C");
  });

  it("sin nombre: un comodín", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("parseProfileTab", () => {
  it("por defecto y ante cualquier valor desconocido: campeones", () => {
    expect(parseProfileTab(undefined)).toBe("campeones");
    expect(parseProfileTab("")).toBe("campeones");
    expect(parseProfileTab("otra")).toBe("campeones");
    expect(parseProfileTab("Resumen")).toBe("campeones");
    expect(parseProfileTab(["otra", "resumen"])).toBe("campeones");
  });

  it("acepta las cuatro pestañas; si se repite, manda la primera", () => {
    for (const tab of PROFILE_TABS) expect(parseProfileTab(tab)).toBe(tab);
    expect(parseProfileTab(["companeros", "x"])).toBe("companeros");
    expect(parseProfileTab(["partidas", "resumen"])).toBe("partidas");
  });
});

describe("pestañas: etiquetas e ids", () => {
  it("cuatro pestañas en el orden de la barra, con su etiqueta visible", () => {
    expect(PROFILE_TABS.map((tab) => TAB_LABEL[tab])).toEqual([
      "Campeones",
      "Resumen",
      "Compañeros",
      "Partidas",
    ]);
  });

  it("id de la pestaña y del panel que controla", () => {
    expect(tabId("companeros")).toBe("tab-companeros");
    expect(panelId("companeros")).toBe("panel-companeros");
  });
});

describe("tabHref", () => {
  const PATH = "/euw/Foo-EUW";

  it("campeones no lleva ?tab; las demás sí", () => {
    expect(tabHref(PATH, "", "campeones")).toBe(PATH);
    expect(tabHref(PATH, "", "resumen")).toBe(`${PATH}?tab=resumen`);
    expect(tabHref(PATH, "", "companeros")).toBe(`${PATH}?tab=companeros`);
    expect(tabHref(PATH, "", "partidas")).toBe(`${PATH}?tab=partidas`);
  });

  it("volver a campeones quita ?tab", () => {
    expect(tabHref(PATH, "tab=partidas", "campeones")).toBe(PATH);
  });

  it("borra los parámetros propios de la pestaña anterior", () => {
    expect(
      tabHref(PATH, "vista=lista&filtro=todos&q=ahri&orden=mejor", "partidas"),
    ).toBe(`${PATH}?tab=partidas`);
    expect(
      tabHref(
        PATH,
        "tab=partidas&q=ahri&puesto=1&companero=x&n=2&partida=EUW1_1",
        "campeones",
      ),
    ).toBe(PATH);
    expect(
      tabHref(PATH, "tab=companeros&min=5&orden=primeros", "resumen"),
    ).toBe(`${PATH}?tab=resumen`);
  });

  it("q y orden no pasan de una pestaña a otra aunque ambas los usen", () => {
    // `q` es del álbum y de partidas, `orden` del álbum y de compañeros: significan otra cosa.
    expect(tabHref(PATH, "q=ahri&orden=mejor", "partidas")).toBe(
      `${PATH}?tab=partidas`,
    );
    expect(tabHref(PATH, "q=ahri&orden=mejor", "companeros")).toBe(
      `${PATH}?tab=companeros`,
    );
    expect(tabHref(PATH, "tab=partidas&q=ahri", "campeones")).toBe(PATH);
  });

  it("conserva ?campeon (el panel abre sobre cualquier pestaña)", () => {
    expect(tabHref(PATH, "campeon=ahri&q=ahri", "partidas")).toBe(
      `${PATH}?campeon=ahri&tab=partidas`,
    );
    expect(tabHref(PATH, "tab=partidas&campeon=ahri&n=2", "resumen")).toBe(
      `${PATH}?tab=resumen&campeon=ahri`,
    );
  });

  it("conserva cualquier otro parámetro", () => {
    expect(tabHref(PATH, "utm=1&filtro=todos", "resumen")).toBe(
      `${PATH}?utm=1&tab=resumen`,
    );
  });

  it("la pestaña activa conserva sus propios parámetros y quita los ajenos", () => {
    expect(tabHref(PATH, "tab=partidas&q=ahri&puesto=1", "partidas")).toBe(
      `${PATH}?tab=partidas&q=ahri&puesto=1`,
    );
    // `orden` es de compañeros; `vista` es del álbum y aquí sobra.
    expect(
      tabHref(
        PATH,
        "tab=companeros&min=5&orden=top3&vista=lista",
        "companeros",
      ),
    ).toBe(`${PATH}?tab=companeros&min=5&orden=top3`);
    // Campeones activa (sin ?tab): sus filtros se quedan.
    expect(tabHref(PATH, "filtro=todos&orden=mejor&min=5", "campeones")).toBe(
      `${PATH}?filtro=todos&orden=mejor`,
    );
  });

  it("acepta la query con o sin ? y normaliza un ?tab desconocido", () => {
    expect(tabHref(PATH, "?tab=resumen", "partidas")).toBe(
      `${PATH}?tab=partidas`,
    );
    expect(tabHref(PATH, "tab=otra&filtro=todos", "resumen")).toBe(
      `${PATH}?tab=resumen`,
    );
    expect(tabHref(PATH, "tab=otra", "campeones")).toBe(PATH);
  });

  it("limpia todo lo que escribe el álbum (no se desincroniza de album-view)", () => {
    const album = albumSearch({
      vista: "lista",
      filtro: "sin-ganar",
      q: "ahri",
      orden: "mejor",
    });
    expect(album.split("&")).toHaveLength(4); // los cuatro parámetros del álbum, ninguno por defecto
    expect(tabHref(PATH, album, "resumen")).toBe(`${PATH}?tab=resumen`);
    expect(tabHref(PATH, album, "companeros")).toBe(`${PATH}?tab=companeros`);
  });
});

describe("matchHref", () => {
  const PATH = "/euw/BEJITO%20MAMBO-1991";

  it("abre la partida en la pestaña Partidas", () => {
    expect(MATCH_PARAM).toBe("partida");
    expect(matchHref(PATH, "", "EUW1_123")).toBe(
      `${PATH}?tab=partidas&partida=EUW1_123`,
    );
  });

  it("desde el álbum quita sus filtros y conserva ?campeon", () => {
    expect(
      matchHref(PATH, "vista=lista&filtro=todos&q=ahri&campeon=ahri", "EUW1_1"),
    ).toBe(`${PATH}?campeon=ahri&tab=partidas&partida=EUW1_1`);
  });

  it("desde Partidas cambia solo la partida y conserva sus filtros", () => {
    expect(
      matchHref(PATH, "tab=partidas&q=ahri&puesto=1&partida=EUW1_1", "EUW1_2"),
    ).toBe(`${PATH}?tab=partidas&q=ahri&puesto=1&partida=EUW1_2`);
  });

  it("desde otra pestaña quita los filtros de Partidas que pudieran haber quedado", () => {
    expect(matchHref(PATH, "tab=companeros&min=5&orden=top3", "EUW1_1")).toBe(
      `${PATH}?tab=partidas&partida=EUW1_1`,
    );
  });
});

describe("tabHref y los parámetros de Partidas", () => {
  it("limpia todo lo que escribe Partidas (no se desincroniza de matches-view)", () => {
    const partidas = matchSearch({
      q: "ahri",
      puesto: "1",
      companero: { gameName: "Player013", tagLine: "ANON" },
      blocks: 2,
      partida: "EUW1_1",
    });
    expect(partidas.split("&")).toHaveLength(5); // los cinco parámetros de Partidas
    expect(tabHref("/p", `tab=partidas&${partidas}`, "campeones")).toBe("/p");
    expect(tabHref("/p", `tab=partidas&${partidas}`, "resumen")).toBe(
      "/p?tab=resumen",
    );
  });
});

describe("tabForKey", () => {
  it("las flechas mueven el foco a la vecina y dan la vuelta en los extremos", () => {
    expect(tabForKey("campeones", "ArrowRight")).toBe("resumen");
    expect(tabForKey("resumen", "ArrowRight")).toBe("companeros");
    expect(tabForKey("partidas", "ArrowRight")).toBe("campeones");
    expect(tabForKey("resumen", "ArrowLeft")).toBe("campeones");
    expect(tabForKey("campeones", "ArrowLeft")).toBe("partidas");
  });

  it("Inicio y Fin saltan a los extremos", () => {
    expect(tabForKey("companeros", "Home")).toBe("campeones");
    expect(tabForKey("companeros", "End")).toBe("partidas");
  });

  it("el resto de teclas no navega (Enter y Espacio activan la pestaña, no la mueven)", () => {
    for (const key of ["Enter", " ", "ArrowUp", "ArrowDown", "Tab", "a"]) {
      expect(tabForKey("resumen", key)).toBeNull();
    }
  });
});

describe("whenPhrase", () => {
  it("relativos tal cual", () => {
    expect(whenPhrase(NOW - 25 * MINUTE, NOW)).toBe("hace 25 min");
    expect(whenPhrase(NOW - 30 * 1000, NOW)).toBe("ahora");
    expect(whenPhrase(NOW - 30 * HOUR, NOW)).toBe("ayer");
  });

  it("una fecha lleva artículo", () => {
    expect(whenPhrase(NOW - 60 * DAY, NOW)).toMatch(/^el \d/);
  });
});

describe("dataAgePhrase", () => {
  it("frases para el aviso «Datos de hace X»", () => {
    expect(dataAgePhrase(NOW - 3 * HOUR, NOW)).toBe("Datos de hace 3 h.");
    expect(dataAgePhrase(NOW - 30 * HOUR, NOW)).toBe("Datos de ayer.");
    expect(dataAgePhrase(NOW - 10 * 1000, NOW)).toBe("Datos de ahora mismo.");
    expect(dataAgePhrase(NOW - 60 * DAY, NOW)).toMatch(/^Datos del \d/);
  });

  it("sin sincronizar nunca", () => {
    expect(dataAgePhrase(null, NOW)).toBe("Aún no hay datos sincronizados.");
  });
});

describe("syncEtaMinutes", () => {
  it("1,2 s por partida (100 peticiones cada 2 min), redondeado hacia arriba", () => {
    expect(SECONDS_PER_MATCH).toBeCloseTo(1.2);
    // Maqueta: 504 - 212 = 292 partidas -> 350 s -> ~6 min.
    expect(syncEtaMinutes(292)).toBe(6);
    expect(syncEtaMinutes(100)).toBe(2);
    expect(syncEtaMinutes(50)).toBe(1);
  });

  it("nunca baja de 1 minuto ni sale negativo", () => {
    expect(syncEtaMinutes(0)).toBe(1);
    expect(syncEtaMinutes(1)).toBe(1);
    expect(syncEtaMinutes(-5)).toBe(1);
  });
});

describe("syncBandModel", () => {
  type Phase =
    | { phase: "resolving" }
    | { phase: "listing"; listedIds: number }
    | { phase: "fetching"; fetched: number; total: number };
  const backfill = (rest: Phase): SyncProgress => ({
    kind: "backfill",
    ...rest,
  });

  it("sin job y sin pausa: no hay banda", () => {
    expect(syncBandModel(null, false)).toBeNull();
  });

  it("backfill: resolviendo, listando y descargando con f / t y ETA", () => {
    expect(syncBandModel(backfill({ phase: "resolving" }), false)).toEqual({
      kind: "resolving",
    });
    expect(
      syncBandModel(backfill({ phase: "listing", listedIds: 200 }), false),
    ).toEqual({ kind: "listing", listedIds: 200 });
    expect(
      syncBandModel(
        backfill({ phase: "fetching", fetched: 212, total: 504 }),
        false,
      ),
    ).toEqual({ kind: "fetching", fetched: 212, total: 504, etaMinutes: 6 });
  });

  it("el incremental no tiene banda (su progreso va en el botón)", () => {
    const incremental: SyncProgress = {
      kind: "incremental",
      phase: "fetching",
      fetched: 1,
      total: 4,
    };
    expect(syncBandModel(incremental, false)).toBeNull();
  });

  it("key caducada: banda de pausa, con el progreso si hay un backfill descargando", () => {
    expect(syncBandModel(null, true)).toEqual({
      kind: "paused",
      progress: null,
    });
    expect(
      syncBandModel(
        backfill({ phase: "fetching", fetched: 307, total: 504 }),
        true,
      ),
    ).toEqual({ kind: "paused", progress: { fetched: 307, total: 504 } });
    expect(syncBandModel(backfill({ phase: "resolving" }), true)).toEqual({
      kind: "paused",
      progress: null,
    });
  });

  it("la pausa manda también sobre un incremental", () => {
    const incremental: SyncProgress = {
      kind: "incremental",
      phase: "resolving",
    };
    expect(syncBandModel(incremental, true)).toEqual({
      kind: "paused",
      progress: null,
    });
  });
});

describe("emptyState", () => {
  it("con partidas no hay estado vacío", () => {
    expect(
      emptyState({ games: 3, syncing: true, lastSyncedAt: null }),
    ).toBeNull();
  });

  it("sin partidas: sincronizando, nunca sincronizado o temporada vacía", () => {
    expect(emptyState({ games: 0, syncing: true, lastSyncedAt: null })).toBe(
      "syncing",
    );
    expect(emptyState({ games: 0, syncing: false, lastSyncedAt: null })).toBe(
      "never",
    );
    expect(emptyState({ games: 0, syncing: false, lastSyncedAt: 1 })).toBe(
      "empty",
    );
  });
});

describe("withSearchParam", () => {
  it("añade el parámetro a una query vacía", () => {
    expect(withSearchParam("/euw/Foo-EUW", "", "filtro", "sin-ganar")).toBe(
      "/euw/Foo-EUW?filtro=sin-ganar",
    );
  });

  it("conserva los demás parámetros", () => {
    expect(
      withSearchParam(
        "/euw/Foo-EUW",
        "?tab=campeones&q=ahri",
        "filtro",
        "sin-ganar",
      ),
    ).toBe("/euw/Foo-EUW?tab=campeones&q=ahri&filtro=sin-ganar");
  });

  it("sustituye el valor si ya existe, sin duplicarlo", () => {
    expect(
      withSearchParam(
        "/p",
        "filtro=todos&tab=campeones",
        "filtro",
        "sin-ganar",
      ),
    ).toBe("/p?filtro=sin-ganar&tab=campeones");
  });
});

describe("withoutSearchParam", () => {
  it("quita el parámetro y conserva el resto, en su orden", () => {
    expect(
      withoutSearchParam(
        "/euw/Foo-EUW",
        "?tab=partidas&campeon=ahri&partida=EUW1_1",
        "campeon",
      ),
    ).toBe("/euw/Foo-EUW?tab=partidas&partida=EUW1_1");
  });

  it("sin más parámetros queda la ruta limpia, sin `?`", () => {
    expect(withoutSearchParam("/euw/Foo-EUW", "campeon=ahri", "campeon")).toBe(
      "/euw/Foo-EUW",
    );
  });

  it("si el parámetro no está, deja la query como estaba", () => {
    expect(withoutSearchParam("/p", "tab=partidas", "campeon")).toBe(
      "/p?tab=partidas",
    );
    expect(withoutSearchParam("/p", "", "campeon")).toBe("/p");
  });
});

describe("queryParams", () => {
  it("lee la primera aparición de cada clave, o null", () => {
    const source = queryParams({
      tab: "companeros",
      min: ["5", "10"],
      orden: undefined,
      vacio: [],
    });
    expect(source.get("tab")).toBe("companeros");
    expect(source.get("min")).toBe("5");
    expect(source.get("orden")).toBeNull();
    expect(source.get("vacio")).toBeNull();
    expect(source.get("otra")).toBeNull();
  });
});
