import "server-only";
import { cache } from "react";
import { z } from "zod";

// Catálogo de campeones desde Data Dragon (CDN público de Riot: sin key y fuera del presupuesto
// de la Riot API). Sirve los nombres de visualización (`es_ES`) y los retratos del álbum. Si el
// CDN no responde el catálogo queda vacío y el álbum sigue funcionando con los campeones jugados,
// sin retratos (ver `buildAlbum`).

const DDRAGON_URL = "https://ddragon.leagueoflegends.com";
const LOCALE = "es_ES";

/** Vida en caché de las respuestas de Data Dragon (24 h, en segundos). */
const CACHE_SECONDS = 24 * 60 * 60;

/** Tiempo máximo para las dos peticiones juntas: una página no espera más por un CDN caído. */
const TIMEOUT_MS = 8_000;

export interface Champion {
  /** `key` de Data Dragon como número: es el `championId` de Match-V5. */
  championId: number;
  /** `id` de Data Dragon (`Fiddlesticks`, `MonkeyKing`): puede diferir del `championName` de la partida. */
  ddId: string;
  /** Nombre de visualización en `es_ES`. */
  name: string;
  portraitUrl: string | null;
}

export interface ChampionCatalog {
  /** Versión de Data Dragon usada para los retratos; `null` si no se pudo cargar el catálogo. */
  version: string | null;
  /** Ordenado por `name` (`localeCompare("es")`). */
  champions: Champion[];
}

// Solo los campos que se usan. `key` es un string numérico (`"266"`); el resto se descarta.
const ChampionEntry = z.object({
  key: z.string().regex(/^\d+$/),
  id: z.string().min(1),
  name: z.string().min(1),
  image: z.object({ full: z.string().min(1) }),
});
const ChampionJson = z.object({ data: z.record(z.string(), z.unknown()) });
const VersionsJson = z.array(z.string().min(1)).min(1);

/**
 * Construye el catálogo desde `champion.json`. Mapea por `Number(key)` (= `championId`), nunca
 * por nombre: `id` `Fiddlesticks` en Data Dragon llega como `FiddleSticks` en Match-V5. Las
 * entradas inválidas se ignoran (y si dos comparten `key` gana la primera); lanza solo si el
 * JSON no tiene la forma `{ data: {...} }`.
 */
export function parseChampionJson(
  json: unknown,
  version: string,
): ChampionCatalog {
  const { data } = ChampionJson.parse(json);
  const byId = new Map<number, Champion>();
  for (const value of Object.values(data)) {
    const entry = ChampionEntry.safeParse(value);
    if (!entry.success) continue;
    const championId = Number(entry.data.key);
    if (!Number.isSafeInteger(championId) || byId.has(championId)) continue;
    byId.set(championId, {
      championId,
      ddId: entry.data.id,
      name: entry.data.name,
      portraitUrl: `${DDRAGON_URL}/cdn/${encodeURIComponent(version)}/img/champion/${encodeURIComponent(entry.data.image.full)}`,
    });
  }
  const champions = [...byId.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "es") || a.championId - b.championId,
  );
  return { version, champions };
}

/**
 * URL del icono de invocador en Data Dragon para la versión del catálogo en uso; `null` si el
 * perfil no tiene icono guardado o no hay versión (catálogo no cargado): la cabecera usa entonces
 * el placeholder.
 */
export function profileIconUrl(
  version: string | null,
  profileIconId: number | null,
): string | null {
  if (version === null || profileIconId === null) return null;
  return `${DDRAGON_URL}/cdn/${encodeURIComponent(version)}/img/profileicon/${profileIconId}.png`;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  // `next.revalidate` es la caché de `fetch` de Next (Data Cache): 24 h por URL. Fuera de Next
  // (tests, scripts) el motivo `next` se ignora.
  const response = await fetchImpl(url, {
    next: { revalidate: CACHE_SECONDS },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
  return response.json();
}

/**
 * Descarga el catálogo: `versions.json` (la primera es la última versión) y después
 * `champion.json` de esa versión en `es_ES`. **Nunca lanza**: ante cualquier fallo (red,
 * timeout, HTTP no 200, JSON inválido o sin campeones) avisa con `console.warn` y devuelve
 * `{ version: null, champions: [] }`. Un fallo no se cachea (Next solo guarda respuestas 200),
 * así que la siguiente petición vuelve a intentarlo.
 *
 * `fetchImpl` se inyecta para probarlo sin red.
 */
export async function loadChampionCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<ChampionCatalog> {
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const versions = VersionsJson.parse(
      await fetchJson(fetchImpl, `${DDRAGON_URL}/api/versions.json`, signal),
    );
    const version = versions[0];
    const catalog = parseChampionJson(
      await fetchJson(
        fetchImpl,
        `${DDRAGON_URL}/cdn/${encodeURIComponent(version)}/data/${LOCALE}/champion.json`,
        signal,
      ),
      version,
    );
    if (catalog.champions.length === 0) {
      throw new Error("champion.json sin campeones válidos");
    }
    return catalog;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ddragon] catálogo de campeones no disponible: ${reason.slice(0, 200)}`,
    );
    return { version: null, champions: [] };
  }
}

/**
 * Catálogo para las páginas. La caché de 24 h la da `fetch` (ver `fetchJson`); `cache` de React
 * evita repetir la petición y el parseo de `champion.json` (~0,7 MB) dentro de un mismo render.
 */
export const getChampionCatalog = cache(() => loadChampionCatalog());
