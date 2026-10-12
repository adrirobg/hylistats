import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  championSplashUrl,
  getChampionCatalog,
  loadChampionCatalog,
  parseChampionJson,
  profileIconUrl,
} from "./ddragon";

// Datos mínimos escritos a mano con la forma real de `champion.json` (`data[id]` con `key`
// numérico como string). Ningún test llama a la red: el `fetch` se inyecta (o se sustituye el
// global en `getChampionCatalog`).

const VERSION = "16.19.1";
const CDN = "https://ddragon.leagueoflegends.com";
const VERSIONS_URL = `${CDN}/api/versions.json`;
const CHAMPION_URL = `${CDN}/cdn/${VERSION}/data/es_ES/champion.json`;

const champion = (
  id: string,
  key: string,
  name: string,
  full = `${id}.png`,
) => ({
  key,
  id,
  name,
  title: "ignorado",
  image: { full },
});

// `MonkeyKing` se muestra como "Wukong" y `Fiddlesticks` es el caso `FiddleSticks` de Match-V5.
const CHAMPION_JSON = {
  type: "champion",
  version: VERSION,
  data: {
    Aatrox: champion("Aatrox", "266", "Aatrox"),
    Fiddlesticks: champion("Fiddlesticks", "9", "Fiddlesticks"),
    MonkeyKing: champion("MonkeyKing", "62", "Wukong"),
    Ahri: champion("Ahri", "103", "Ahri"),
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** `fetch` falso: responde según la URL y guarda las llamadas. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<typeof fetch>(async (input) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`URL inesperada: ${String(input)}`);
    return route();
  });
}

const okRoutes = () => ({
  [VERSIONS_URL]: () => json([VERSION, "16.18.1", "16.17.1"]),
  [CHAMPION_URL]: () => json(CHAMPION_JSON),
});

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("parseChampionJson", () => {
  it("mapea por key numérico (string) y construye el retrato", () => {
    const catalog = parseChampionJson(CHAMPION_JSON, VERSION);
    expect(catalog.version).toBe(VERSION);
    const ahri = catalog.champions.find((c) => c.championId === 103);
    expect(ahri).toEqual({
      championId: 103,
      ddId: "Ahri",
      name: "Ahri",
      portraitUrl: `${CDN}/cdn/${VERSION}/img/champion/Ahri.png`,
    });
  });

  it("casa Fiddlesticks (id de Data Dragon) por el key 9, no por el nombre de Match-V5", () => {
    const catalog = parseChampionJson(CHAMPION_JSON, VERSION);
    const byId = new Map(catalog.champions.map((c) => [c.championId, c]));
    // Match-V5 envía `championName: "FiddleSticks"` con `championId: 9`.
    expect(byId.get(9)?.ddId).toBe("Fiddlesticks");
    expect(byId.get(9)?.name).toBe("Fiddlesticks");
    expect(byId.get(62)?.ddId).toBe("MonkeyKing");
    expect(byId.get(62)?.name).toBe("Wukong");
  });

  it("ordena por nombre de visualización (es), no por id de Data Dragon", () => {
    const catalog = parseChampionJson(CHAMPION_JSON, VERSION);
    expect(catalog.champions.map((c) => c.name)).toEqual([
      "Aatrox",
      "Ahri",
      "Fiddlesticks",
      "Wukong",
    ]);
  });

  it("ignora las entradas inválidas en lugar de fallar entero", () => {
    const catalog = parseChampionJson(
      {
        data: {
          Ahri: champion("Ahri", "103", "Ahri"),
          KeyNoNumerica: champion("KeyNoNumerica", "abc", "Rota"),
          SinKey: { id: "SinKey", name: "Sin key", image: { full: "x.png" } },
          SinImagen: { key: "1", id: "SinImagen", name: "Sin imagen" },
          NoEsObjeto: "texto",
          Nulo: null,
        },
      },
      VERSION,
    );
    expect(catalog.champions.map((c) => c.championId)).toEqual([103]);
  });

  it("con dos entradas con la misma key conserva la primera", () => {
    const catalog = parseChampionJson(
      {
        data: {
          Ahri: champion("Ahri", "103", "Ahri"),
          Copia: champion("Copia", "103", "Copia"),
        },
      },
      VERSION,
    );
    expect(catalog.champions).toHaveLength(1);
    expect(catalog.champions[0].ddId).toBe("Ahri");
  });

  it("lanza si el JSON no tiene la forma { data: {...} }", () => {
    expect(() => parseChampionJson({}, VERSION)).toThrow();
    expect(() => parseChampionJson(null, VERSION)).toThrow();
    expect(() => parseChampionJson({ data: [] }, VERSION)).toThrow();
  });
});

describe("profileIconUrl", () => {
  it("construye la URL con la versión del catálogo", () => {
    expect(profileIconUrl(VERSION, 7176)).toBe(
      `${CDN}/cdn/${VERSION}/img/profileicon/7176.png`,
    );
  });

  it("sin versión o sin icono: null", () => {
    expect(profileIconUrl(null, 7176)).toBeNull();
    expect(profileIconUrl(VERSION, null)).toBeNull();
  });
});

describe("championSplashUrl", () => {
  it("construye la URL del splash base, sin versión", () => {
    expect(championSplashUrl("Nocturne")).toBe(
      `${CDN}/cdn/img/champion/splash/Nocturne_0.jpg`,
    );
  });
});

describe("loadChampionCatalog", () => {
  it("carga la última versión y el catálogo en es_ES", async () => {
    const fetchImpl = fakeFetch(okRoutes());
    const catalog = await loadChampionCatalog(fetchImpl);
    expect(catalog.version).toBe(VERSION);
    expect(catalog.champions).toHaveLength(4);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      VERSIONS_URL,
      CHAMPION_URL,
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("pide las dos URLs con caché de 24 h de Next y un timeout", async () => {
    const fetchImpl = fakeFetch(okRoutes());
    await loadChampionCatalog(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.next?.revalidate).toBe(24 * 60 * 60);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("error de red: catálogo vacío, avisa y no lanza", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(loadChampionCatalog(fetchImpl)).resolves.toEqual({
      version: null,
      champions: [],
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("timeout (petición abortada): catálogo vacío", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    });
    await expect(loadChampionCatalog(fetchImpl)).resolves.toEqual({
      version: null,
      champions: [],
    });
  });

  it("HTTP no 200: catálogo vacío", async () => {
    const fetchImpl = fakeFetch({
      [VERSIONS_URL]: () => json({ error: "nope" }, 503),
    });
    const catalog = await loadChampionCatalog(fetchImpl);
    expect(catalog).toEqual({ version: null, champions: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("JSON inválido en versions.json o en champion.json: catálogo vacío", async () => {
    const badVersions = fakeFetch({
      [VERSIONS_URL]: () => new Response("<html>no es json</html>"),
    });
    await expect(loadChampionCatalog(badVersions)).resolves.toEqual({
      version: null,
      champions: [],
    });

    const badChampions = fakeFetch({
      ...okRoutes(),
      [CHAMPION_URL]: () => new Response("{ roto"),
    });
    await expect(loadChampionCatalog(badChampions)).resolves.toEqual({
      version: null,
      champions: [],
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("formas inesperadas (versions vacío, champion.json sin campeones válidos): catálogo vacío", async () => {
    const noVersions = fakeFetch({ [VERSIONS_URL]: () => json([]) });
    await expect(loadChampionCatalog(noVersions)).resolves.toEqual({
      version: null,
      champions: [],
    });

    const noChampions = fakeFetch({
      ...okRoutes(),
      [CHAMPION_URL]: () => json({ data: { X: { key: "abc" } } }),
    });
    await expect(loadChampionCatalog(noChampions)).resolves.toEqual({
      version: null,
      champions: [],
    });
  });
});

describe("getChampionCatalog", () => {
  it("usa el fetch global y devuelve el catálogo", async () => {
    const fetchImpl = fakeFetch(okRoutes());
    vi.stubGlobal("fetch", fetchImpl);
    const catalog = await getChampionCatalog();
    expect(catalog.version).toBe(VERSION);
    expect(catalog.champions).toHaveLength(4);
  });
});
