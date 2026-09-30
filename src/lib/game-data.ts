import "server-only";
import { cache } from "react";
import { z } from "zod";

// Datos estáticos del detalle de una partida (brief §3.5): nombre e icono de cada objeto (Data
// Dragon) y de cada augment (CommunityDragon). La partida guarda solo ids. Igual que el catálogo de
// campeones (`ddragon.ts`), es un CDN público sin key y fuera del presupuesto de la Riot API, y si
// no responde no rompe nada: el detalle sale sin iconos y dice «sin datos» (§5), nunca ids sueltos.
//
// - Objetos: `item.json` de Data Dragon (`es_ES`), que trae todos los de Arena; el icono es
//   `img/item/{id}.png` de la misma versión que los retratos.
// - Augments: `cherry-augments.json` del cliente (CommunityDragon `es_es`). La otra fuente
//   (`cdragon/arena/*.json`) está incompleta: le faltan ~18 % de los ids vistos. Los iconos viven
//   en la carpeta `default` aunque el JSON sea localizado (los assets no dependen del idioma).

const DDRAGON_URL = "https://ddragon.leagueoflegends.com";
const CDRAGON_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global";
const LOCALE = "es_ES";

/** Vida en caché de las respuestas (24 h, en segundos), como el catálogo de campeones. */
const CACHE_SECONDS = 24 * 60 * 60;

/** Tiempo máximo para las dos descargas juntas: una partida no espera más por un CDN caído. */
const TIMEOUT_MS = 8_000;

/** Nombre e icono de un objeto o un augment. */
export interface GameIcon {
  id: number;
  /** Nombre de visualización (`es_ES`): texto alternativo y tooltip del icono. */
  name: string;
  iconUrl: string;
}

export interface GameData {
  items: ReadonlyMap<number, GameIcon>;
  augments: ReadonlyMap<number, GameIcon>;
}

/** Sin datos (por defecto y ante cualquier fallo): ningún objeto ni augment se resuelve. */
export const EMPTY_GAME_DATA: GameData = {
  items: new Map(),
  augments: new Map(),
};

// Solo los campos que se usan; las entradas que no los cumplan se ignoran.
const ItemEntry = z.object({
  name: z.string().min(1),
  image: z.object({ full: z.string().min(1) }),
});
const ItemsJson = z.object({ data: z.record(z.string(), z.unknown()) });

/** Ids de Data Dragon: enteros positivos escritos con solo dígitos (`"3348"`). */
const ID = /^\d+$/;

/**
 * Objetos desde `item.json`, por id numérico. Las entradas inválidas se ignoran; lanza solo si el
 * JSON no tiene la forma `{ data: {...} }`.
 */
export function parseItemsJson(
  json: unknown,
  version: string,
): Map<number, GameIcon> {
  const { data } = ItemsJson.parse(json);
  const items = new Map<number, GameIcon>();
  for (const [key, value] of Object.entries(data)) {
    const entry = ItemEntry.safeParse(value);
    if (!entry.success || !ID.test(key)) continue;
    const id = Number(key);
    if (!Number.isSafeInteger(id)) continue;
    items.set(id, {
      id,
      name: entry.data.name,
      iconUrl: `${DDRAGON_URL}/cdn/${encodeURIComponent(version)}/img/item/${encodeURIComponent(entry.data.image.full)}`,
    });
  }
  return items;
}

const AugmentEntry = z.object({
  id: z.number().int().positive(),
  nameTRA: z.string().min(1),
  augmentSmallIconPath: z.string().min(1),
});
const AugmentsJson = z.array(z.unknown());

/** Prefijo de las rutas del cliente (`/lol-game-data/assets/ASSETS/UX/...`), que la CDN no lleva. */
const CLIENT_ASSETS = /^\/lol-game-data\/assets\//i;

/**
 * Augments desde `cherry-augments.json`, por id numérico. El icono es la ruta del cliente sin su
 * prefijo y en minúsculas, bajo `default`. Las entradas inválidas (o con una ruta que no es de los
 * assets del cliente) se ignoran; lanza solo si el JSON no es un array.
 */
export function parseAugmentsJson(json: unknown): Map<number, GameIcon> {
  const augments = new Map<number, GameIcon>();
  for (const value of AugmentsJson.parse(json)) {
    const entry = AugmentEntry.safeParse(value);
    if (
      !entry.success ||
      !CLIENT_ASSETS.test(entry.data.augmentSmallIconPath)
    ) {
      continue;
    }
    const path = entry.data.augmentSmallIconPath
      .replace(CLIENT_ASSETS, "")
      .toLowerCase();
    augments.set(entry.data.id, {
      id: entry.data.id,
      name: entry.data.nameTRA,
      iconUrl: `${CDRAGON_URL}/default/${path.split("/").map(encodeURIComponent).join("/")}`,
    });
  }
  return augments;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  // `next.revalidate`: caché de `fetch` de Next (Data Cache), 24 h por URL. Fuera de Next (tests,
  // scripts) el motivo `next` se ignora.
  const response = await fetchImpl(url, {
    next: { revalidate: CACHE_SECONDS },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
  return response.json();
}

/** Ejecuta `load`; ante cualquier fallo avisa con `console.warn` y devuelve el mapa vacío. */
async function orEmpty(
  what: string,
  load: () => Promise<Map<number, GameIcon>>,
): Promise<Map<number, GameIcon>> {
  try {
    return await load();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[game-data] ${what} no disponibles: ${reason.slice(0, 200)}`);
    return new Map();
  }
}

/**
 * Descarga objetos y augments. **Nunca lanza**: cada fuente falla por separado (red, timeout, HTTP
 * no 200 o JSON inválido) con un `console.warn` y deja su mapa vacío; un fallo no se cachea (Next
 * solo guarda respuestas 200). Los objetos necesitan la `version` de Data Dragon (la del catálogo de
 * campeones): sin ella no se pide `item.json` y los objetos quedan sin datos.
 *
 * `fetchImpl` se inyecta para probarlo sin red.
 */
export async function loadGameData(
  version: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<GameData> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const [items, augments] = await Promise.all([
    version === null
      ? new Map<number, GameIcon>()
      : orEmpty("objetos", async () =>
          parseItemsJson(
            await fetchJson(
              fetchImpl,
              `${DDRAGON_URL}/cdn/${encodeURIComponent(version)}/data/${LOCALE}/item.json`,
              signal,
            ),
            version,
          ),
        ),
    orEmpty("augments", async () =>
      parseAugmentsJson(
        await fetchJson(
          fetchImpl,
          `${CDRAGON_URL}/${LOCALE.toLowerCase()}/v1/cherry-augments.json`,
          signal,
        ),
      ),
    ),
  ]);
  return { items, augments };
}

/**
 * Datos para el detalle de una partida. La caché de 24 h la da `fetch` (ver `fetchJson`); `cache`
 * de React evita repetir la petición y el parseo dentro de un mismo render.
 */
export const getGameData = cache((version: string | null) =>
  loadGameData(version),
);
