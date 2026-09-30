// Decisiones de presentación de la página de perfil como funciones puras (sin React), para poder
// probarlas: la UI de este repo no tiene jsdom, así que lo que no es JSX vive aquí.

import { formatRelative } from "@/lib/format";
import type { SyncProgress } from "./data";

// --- Identidad ---------------------------------------------------------------------------

/**
 * Iniciales del avatar (sin icono de invocador, spec): la primera letra de las dos primeras
 * palabras del nombre, o las dos primeras letras si es una sola. `BEJITO MAMBO` -> `BM`.
 */
export function initials(gameName: string): string {
  const words = gameName.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? words.slice(0, 2).map((w) => [...w][0])
      : [...(words[0] ?? "")].slice(0, 2);
  return letters.join("").toUpperCase() || "?";
}

// --- Pestañas ----------------------------------------------------------------------------

/** Pestañas del perfil, en el orden de la barra (`?tab`; `campeones` es la de por defecto). */
export const PROFILE_TABS = [
  "campeones",
  "resumen",
  "estadisticas",
  "companeros",
  "partidas",
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const DEFAULT_TAB: ProfileTab = "campeones";

/** Texto visible de cada pestaña. */
export const TAB_LABEL: Record<ProfileTab, string> = {
  campeones: "Campeones",
  resumen: "Resumen",
  estadisticas: "Estadísticas",
  companeros: "Compañeros",
  partidas: "Partidas",
};

/** `id` de la pestaña y del panel que controla: `aria-controls` / `aria-labelledby` las cruzan. */
export const tabId = (tab: ProfileTab) => `tab-${tab}`;
export const panelId = (tab: ProfileTab) => `panel-${tab}`;

/** `?tab` -> pestaña activa. Lo desconocido, repetido o ausente cae en `campeones`. */
export function parseProfileTab(
  value: string | string[] | undefined,
): ProfileTab {
  const first = Array.isArray(value) ? value[0] : value;
  return PROFILE_TABS.find((tab) => tab === first) ?? DEFAULT_TAB;
}

/**
 * Pestaña que recibe el foco con una tecla del teclado sobre la pestaña `from` (patrón WAI-ARIA
 * con activación manual: las flechas solo mueven el foco, Enter o Espacio activan). Las flechas dan
 * la vuelta en los extremos; `null` = la tecla no navega.
 */
export function tabForKey(from: ProfileTab, key: string): ProfileTab | null {
  const last = PROFILE_TABS.length - 1;
  const index = PROFILE_TABS.indexOf(from);
  switch (key) {
    case "ArrowRight":
      return PROFILE_TABS[index === last ? 0 : index + 1];
    case "ArrowLeft":
      return PROFILE_TABS[index === 0 ? last : index - 1];
    case "Home":
      return PROFILE_TABS[0];
    case "End":
      return PROFILE_TABS[last];
    default:
      return null;
  }
}

// --- Frescura ----------------------------------------------------------------------------

/**
 * `formatRelative` con la preposición que necesita cada forma en una frase: "hace 5 min" y
 * "ayer" solos, pero una fecha ("12 ene") va con artículo: "el 12 ene".
 */
export function whenPhrase(ms: number, now: number): string {
  const text = formatRelative(ms, now);
  return /^(hace|ahora|ayer)/.test(text) ? text : `el ${text}`;
}

/** "Datos de hace 3 h" / "Datos del 12 ene" para el aviso de error de la API. */
export function dataAgePhrase(lastSyncedAt: number | null, now: number) {
  if (lastSyncedAt === null) return "Aún no hay datos sincronizados.";
  const text = formatRelative(lastSyncedAt, now);
  if (/^(hace|ayer)/.test(text)) return `Datos de ${text}.`;
  return text === "ahora" ? "Datos de ahora mismo." : `Datos del ${text}.`;
}

// --- Banda de sincronización (§4.10) -----------------------------------------------------

/**
 * Segundos por petición a Riot al estimar tiempos. Salen del limitador con la key personal: 100
 * peticiones cada 2 minutos = 1,2 s por petición, y cada partida pendiente es una petición de
 * detalle (Match-V5).
 */
export const SECONDS_PER_MATCH = (2 * 60) / 100;

/**
 * Minutos que faltan para descargar `remaining` partidas (redondeado hacia arriba, al menos 1).
 * `sharing` son los otros perfiles que descargan a la vez: las peticiones se reparten en
 * round-robin, así que a este le toca 1 de cada `sharing + 1` y el tiempo se multiplica por eso.
 */
export function syncEtaMinutes(remaining: number, sharing = 0): number {
  return Math.max(
    1,
    Math.ceil(
      (Math.max(0, remaining) *
        SECONDS_PER_MATCH *
        (Math.max(0, sharing) + 1)) /
        60,
    ),
  );
}

/**
 * Peticiones que gasta un job de otro perfil antes de pasar a descargar: Account-V1 y las
 * páginas de ids (100 por página, en cada cola de Arena). Es una cifra gruesa a propósito: el
 * total real depende de cuántas partidas tenga cada uno y no se conoce hasta listarlas.
 */
export const REQUESTS_PER_JOB_START = 10;

/**
 * Minutos hasta que le toca a un job con `ahead` jobs por delante (los `pending`/`listing` que
 * `pickWork` sirve antes; ver `SyncQueue`): cada uno gasta `REQUESTS_PER_JOB_START` peticiones a
 * `SECONDS_PER_MATCH` segundos. Redondeado hacia arriba y nunca menos de 1.
 */
export function queueStartMinutes(ahead: number): number {
  return Math.max(
    1,
    Math.ceil(
      (Math.max(0, ahead) * REQUESTS_PER_JOB_START * SECONDS_PER_MATCH) / 60,
    ),
  );
}

/** Minutos hasta `retryAt` (redondeado hacia arriba, al menos 1). `now` en ms. */
export function retryMinutes(retryAt: Date, now: number): number {
  return Math.max(1, Math.ceil((retryAt.getTime() - now) / 60_000));
}

/** "cola compartida con 1 perfil" / "cola compartida con 3 perfiles". */
export function sharingPhrase(sharing: number): string {
  return `cola compartida con ${sharing} ${sharing === 1 ? "perfil" : "perfiles"}`;
}

/** Aviso del límite de peticiones, en llano y sin códigos (§5). Lo usan la banda y el header. */
export function rateLimitPhrase(minutes: number): string {
  return `Límite de peticiones alcanzado: la sincronización se reanuda sola en ~${minutes} min`;
}

/** Texto del botón Actualizar mientras el incremental espera su turno: "En cola (2º)…". */
export function queuedLabel(position: number): string {
  return `En cola (${position}º)…`;
}

/** Qué pinta la banda bajo el header; `null` = no hay banda. */
export type SyncBandModel =
  | { kind: "resolving" }
  | { kind: "listing"; listedIds: number }
  | {
      kind: "fetching";
      fetched: number;
      total: number;
      /** Ya multiplicado por `sharing + 1`. */
      etaMinutes: number;
      /** Otros perfiles descargando a la vez; con `> 0` el texto lo dice. */
      sharing: number;
    }
  /** Key de Riot caducada: la pausa se pinta en azul acero; `progress` es el backfill a medias. */
  | {
      kind: "paused";
      progress: { fetched: number; total: number } | null;
    }
  /** Límite de peticiones de Riot: pausa que se reanuda sola. Mismo tono que la pausa por key. */
  | {
      kind: "rate_limit";
      minutes: number;
      progress: { fetched: number; total: number } | null;
    }
  /** Detrás de otros perfiles en la cola compartida (`position` = `ahead + 1`). */
  | { kind: "queued"; position: number; startMinutes: number };

/** Partidas descargadas de un backfill en `fetching` (con total conocido); si no, `null`. */
function fetchProgress(
  sync: SyncProgress | null,
): { fetched: number; total: number } | null {
  return sync?.phase === "fetching" && sync.total > 0
    ? { fetched: sync.fetched, total: sync.total }
    : null;
}

/**
 * Modelo de la banda. La pausa por key caducada manda sobre todo lo demás; luego el límite de
 * peticiones (progreso congelado, con la cuenta atrás hasta `retryAt`) y la cola. El incremental
 * no tiene banda: su estado va en el botón Actualizar o en el header (`incrementalStatus`, §4.10).
 * `now` en ms.
 */
export function syncBandModel(
  sync: SyncProgress | null,
  paused: boolean,
  now: number,
): SyncBandModel | null {
  const backfill = sync?.kind === "backfill" ? sync : null;
  if (paused) {
    return { kind: "paused", progress: fetchProgress(backfill) };
  }
  if (!backfill) return null;
  if (backfill.reason === "rate_limit" && backfill.retryAt) {
    return {
      kind: "rate_limit",
      minutes: retryMinutes(backfill.retryAt, now),
      progress: fetchProgress(backfill),
    };
  }
  if (backfill.queue && backfill.queue.ahead > 0) {
    return {
      kind: "queued",
      position: backfill.queue.ahead + 1,
      startMinutes: queueStartMinutes(backfill.queue.ahead),
    };
  }
  switch (backfill.phase) {
    case "resolving":
      return { kind: "resolving" };
    case "listing":
      return { kind: "listing", listedIds: backfill.listedIds };
    case "fetching": {
      const sharing = backfill.queue?.sharing ?? 0;
      return {
        kind: "fetching",
        fetched: backfill.fetched,
        total: backfill.total,
        etaMinutes: syncEtaMinutes(backfill.total - backfill.fetched, sharing),
        sharing,
      };
    }
  }
}

/** Estado del incremental que el header pinta (botón o aviso), porque no tiene banda. */
export type IncrementalStatus =
  /** Esperando turno tras otros perfiles: va en el texto del botón (`queuedLabel`). */
  | { kind: "queued"; position: number }
  /** Límite de peticiones: va en un aviso bajo el header (`rateLimitPhrase`). */
  | { kind: "rate_limit"; minutes: number };

/**
 * Lo que el header dice de un incremental en curso, o `null` si va todo normal. Mismas reglas que
 * la banda del backfill: la key caducada manda (la explica la banda) y el límite de peticiones
 * va antes que la cola. `now` en ms.
 */
export function incrementalStatus(
  sync: SyncProgress | null,
  paused: boolean,
  now: number,
): IncrementalStatus | null {
  if (paused || sync?.kind !== "incremental") return null;
  if (sync.reason === "rate_limit" && sync.retryAt) {
    return { kind: "rate_limit", minutes: retryMinutes(sync.retryAt, now) };
  }
  if (sync.queue && sync.queue.ahead > 0) {
    return { kind: "queued", position: sync.queue.ahead + 1 };
  }
  return null;
}

// --- Arena fuera de rotación (§5) --------------------------------------------------------

/**
 * Etiqueta del header cuando la última partida de Arena de la BD (`lastArenaGameAt`, ms) es
 * antigua: "Sin partidas de Arena desde el 12 sep: puede que Arena esté fuera de rotación". Se
 * redacta como posibilidad ("puede que"): Riot no dice qué modos están activos.
 */
export function arenaQuietPhrase(lastArenaGameAt: number, now: number): string {
  return `Sin partidas de Arena desde ${whenPhrase(lastArenaGameAt, now)}: puede que Arena esté fuera de rotación`;
}

// --- Estados vacíos (§5) -----------------------------------------------------------------

/**
 * Qué mostrar en lugar del álbum cuando no hay partidas:
 * - `syncing`: hay un job en curso, los datos llegan (esqueleto);
 * - `never`: nunca se ha sincronizado y no hay job (fallo o key caducada);
 * - `empty`: se sincronizó y no hay partidas de Arena en la temporada;
 * - `null`: hay partidas, se muestran.
 */
export function emptyState(input: {
  games: number;
  syncing: boolean;
  lastSyncedAt: number | null;
}): "syncing" | "never" | "empty" | null {
  if (input.games > 0) return null;
  if (input.syncing) return "syncing";
  return input.lastSyncedAt === null ? "never" : "empty";
}

// --- URL ---------------------------------------------------------------------------------

/** Parámetro y valor del filtro del álbum «sin ganar» (lo lee T08); «Marcar a mano» lo activa. */
export const FILTER_PARAM = "filtro";
export const FILTER_UNWON = "sin-ganar";

/**
 * `searchParams` de la página (un objeto, con `string[]` si la clave se repite) como fuente de
 * `get`, igual que `URLSearchParams`: la primera aparición de cada clave, o `null`.
 */
export function queryParams(query: {
  [key: string]: string | string[] | undefined;
}): { get(key: string): string | null } {
  return {
    get(key) {
      const value = query[key];
      return (Array.isArray(value) ? value[0] : value) ?? null;
    },
  };
}

/** Ruta con `key=value` puesto en la query actual, conservando el resto (`?tab`…). */
export function withSearchParam(
  pathname: string,
  search: string,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(search);
  params.set(key, value);
  return `${pathname}?${params}`;
}

/** Ruta con `key` quitado de la query actual, conservando el resto (`?tab`…). */
export function withoutSearchParam(
  pathname: string,
  search: string,
  key: string,
): string {
  const params = new URLSearchParams(search);
  params.delete(key);
  const query = params.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

const TAB_PARAM = "tab";

/**
 * Parámetros de la URL que pertenecen a cada pestaña. `q` y `orden` se repiten entre pestañas con
 * otro significado (el `orden` del álbum no es el de los compañeros), así que nunca pasan de una a
 * otra. `campeon` (el panel del campeón, sobre cualquier pestaña) no es de ninguna y se conserva.
 */
const TAB_PARAMS: Record<ProfileTab, readonly string[]> = {
  campeones: ["vista", FILTER_PARAM, "q", "orden"],
  resumen: [],
  estadisticas: [],
  companeros: ["min", "orden"],
  partidas: ["q", "puesto", "companero", "n", "partida"],
};

/**
 * Enlace a una pestaña conservando la query actual (`search`, con o sin `?`). Pone `?tab` (o lo
 * quita para `campeones`) y borra los parámetros propios de las pestañas, salvo los de `tab` si ya
 * se estaba en ella: pulsar la pestaña activa no toca sus filtros. El resto (`campeon`…) se conserva.
 */
export function tabHref(
  pathname: string,
  search: string,
  tab: ProfileTab,
): string {
  const params = new URLSearchParams(search);
  const from = parseProfileTab(params.get(TAB_PARAM) ?? undefined);
  const keep = new Set(from === tab ? TAB_PARAMS[tab] : []);
  for (const owned of Object.values(TAB_PARAMS)) {
    for (const key of owned) if (!keep.has(key)) params.delete(key);
  }
  if (tab === DEFAULT_TAB) params.delete(TAB_PARAM);
  else params.set(TAB_PARAM, tab);
  const query = params.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

/**
 * Destino de «Marcar a mano» (barra Arena God): el álbum filtrado por «sin ganar». Se pulsa desde
 * cualquier pestaña, así que parte de `tabHref(…, "campeones")`: vuelve a Campeones (`?tab` fuera),
 * quita los parámetros de las demás pestañas y conserva `?campeon`; el filtro va encima. Desde
 * Campeones se conservan sus filtros (`vista`, `q`, `orden`) y solo cambia `filtro`.
 */
export function markByHandHref(pathname: string, search: string): string {
  const [path, query = ""] = tabHref(pathname, search, "campeones").split("?");
  return withSearchParam(path, query, FILTER_PARAM, FILTER_UNWON);
}

/** Parámetro de la partida abierta en Partidas (`?partida={matchId}`). */
export const MATCH_PARAM = "partida";

/**
 * Enlace a una partida: la pestaña Partidas con `?partida={matchId}` abierta. Viene de otra pestaña
 * o de otra partida, así que parte de `tabHref`: quita los filtros de las demás pestañas (los del
 * álbum) y conserva el resto (`?campeon`…). Desde el raíl, `search` vacío da un enlace limpio, sin
 * filtros de Partidas que pudieran dejar la partida fuera de la lista.
 */
export function matchHref(
  pathname: string,
  search: string,
  matchId: string,
): string {
  const [path, query = ""] = tabHref(pathname, search, "partidas").split("?");
  return withSearchParam(path, query, MATCH_PARAM, matchId);
}
