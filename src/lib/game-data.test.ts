import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_GAME_DATA,
  loadGameData,
  parseAugmentsJson,
  parseItemsJson,
} from "./game-data";

// Datos mínimos escritos a mano con la forma real de `item.json` (Data Dragon) y de
// `cherry-augments.json` (CommunityDragon). Ningún test llama a la red: el `fetch` se inyecta.

const VERSION = "16.19.1";
const DDRAGON = "https://ddragon.leagueoflegends.com";
const CDRAGON =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global";
const ITEMS_URL = `${DDRAGON}/cdn/${VERSION}/data/es_ES/item.json`;
const AUGMENTS_URL = `${CDRAGON}/es_es/v1/cherry-augments.json`;

const ITEMS_JSON = {
  type: "item",
  version: VERSION,
  data: {
    "3348": {
      name: "Barredora arcana",
      image: { full: "3348.png" },
      gold: { total: 0 },
    },
    "223158": { name: "Botas de Arena", image: { full: "223158.png" } },
    // Entradas inválidas: sin nombre, sin imagen, y clave que no es un id.
    "1": { image: { full: "1.png" } },
    "2": { name: "Sin imagen" },
    abc: { name: "No es un id", image: { full: "abc.png" } },
  },
};

const AUGMENTS_JSON = [
  {
    id: 181,
    nameTRA: "Adaptación",
    simpleNameTRA: "Adapt",
    augmentSmallIconPath:
      "/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/Adapt_small.png",
    rarity: "kSilver",
  },
  {
    // Augment del cliente compartido con ARAM Mayhem (`Kiwi`).
    id: 2009,
    nameTRA: "Fanático",
    augmentSmallIconPath:
      "/lol-game-data/assets/ASSETS/UX/Kiwi/Augments/Icons/Zealot_small.png",
    rarity: "kGold",
  },
  // Entradas inválidas: sin nombre, sin ruta, id no numérico y ruta que no es de los assets.
  { id: 3, augmentSmallIconPath: "/lol-game-data/assets/x.png" },
  { id: 4, nameTRA: "Sin ruta" },
  {
    id: "5",
    nameTRA: "Id texto",
    augmentSmallIconPath: "/lol-game-data/assets/x.png",
  },
  {
    id: 6,
    nameTRA: "Ruta rara",
    augmentSmallIconPath: "https://otro.example/x.png",
  },
  null,
];

describe("parseItemsJson", () => {
  it("mapea por id numérico con nombre e icono de la versión pedida; ignora lo inválido", () => {
    const items = parseItemsJson(ITEMS_JSON, VERSION);
    expect([...items.keys()]).toEqual([3348, 223158]);
    expect(items.get(3348)).toEqual({
      id: 3348,
      name: "Barredora arcana",
      iconUrl: `${DDRAGON}/cdn/${VERSION}/img/item/3348.png`,
    });
  });

  it("lanza si el JSON no tiene la forma { data: {...} }", () => {
    expect(() => parseItemsJson([], VERSION)).toThrow();
    expect(() => parseItemsJson({ data: 3 }, VERSION)).toThrow();
  });
});

describe("parseAugmentsJson", () => {
  it("icono = ruta del cliente sin su prefijo, en minúsculas, bajo default", () => {
    const augments = parseAugmentsJson(AUGMENTS_JSON);
    expect([...augments.keys()]).toEqual([181, 2009]);
    expect(augments.get(181)).toEqual({
      id: 181,
      name: "Adaptación",
      iconUrl: `${CDRAGON}/default/assets/ux/cherry/augments/icons/adapt_small.png`,
    });
    expect(augments.get(2009)?.iconUrl).toBe(
      `${CDRAGON}/default/assets/ux/kiwi/augments/icons/zealot_small.png`,
    );
  });

  it("lanza si el JSON no es un array", () => {
    expect(() => parseAugmentsJson({ data: [] })).toThrow();
  });
});

describe("loadGameData", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const fakeFetch = (routes: Record<string, () => Response>) =>
    vi.fn<typeof fetch>(async (input) => {
      const route = routes[String(input)];
      if (!route) throw new Error(`URL inesperada: ${String(input)}`);
      return route();
    });
  const okRoutes = () => ({
    [ITEMS_URL]: () => json(ITEMS_JSON),
    [AUGMENTS_URL]: () => json(AUGMENTS_JSON),
  });

  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("descarga objetos (localizados, de la versión del catálogo) y augments, con caché de 24 h", async () => {
    const fetchImpl = fakeFetch(okRoutes());
    const data = await loadGameData(VERSION, fetchImpl);

    expect(data.items.size).toBe(2);
    expect(data.augments.size).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]).toMatchObject({ next: { revalidate: 24 * 60 * 60 } });
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("sin versión no pide los objetos, pero sí los augments (no dependen de la versión)", async () => {
    const fetchImpl = fakeFetch(okRoutes());
    const data = await loadGameData(null, fetchImpl);
    expect(data.items.size).toBe(0);
    expect(data.augments.size).toBe(2);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      AUGMENTS_URL,
    ]);
  });

  it("cada fuente falla por separado y nunca lanza", async () => {
    // Objetos con HTTP 500; los augments llegan.
    const noItems = await loadGameData(
      VERSION,
      fakeFetch({ ...okRoutes(), [ITEMS_URL]: () => json({}, 500) }),
    );
    expect(noItems.items.size).toBe(0);
    expect(noItems.augments.size).toBe(2);

    // Augments con JSON inválido; los objetos llegan.
    const noAugments = await loadGameData(
      VERSION,
      fakeFetch({ ...okRoutes(), [AUGMENTS_URL]: () => json({ no: "array" }) }),
    );
    expect(noAugments.items.size).toBe(2);
    expect(noAugments.augments.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("sin red: los dos mapas vacíos y un aviso por fuente", async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const data = await loadGameData(VERSION, offline);
    expect(data.items.size).toBe(0);
    expect(data.augments.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("EMPTY_GAME_DATA no resuelve nada", () => {
    expect(EMPTY_GAME_DATA.items.size).toBe(0);
    expect(EMPTY_GAME_DATA.augments.size).toBe(0);
  });
});
