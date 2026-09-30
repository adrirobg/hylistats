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

/** Pestañas del perfil; en esta iteración solo existe Campeones (el resto va en #3). */
export const PROFILE_TABS = ["campeones"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** `?tab` -> pestaña activa. Lo desconocido, repetido o ausente cae en `campeones`. */
export function parseProfileTab(
  value: string | string[] | undefined,
): ProfileTab {
  const first = Array.isArray(value) ? value[0] : value;
  return PROFILE_TABS.find((tab) => tab === first) ?? "campeones";
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
 * Segundos por partida pendiente al estimar el tiempo del backfill. Salen del limitador de Riot
 * con la key personal: 100 peticiones cada 2 minutos = 1,2 s por petición, y cada partida
 * pendiente es una petición de detalle (Match-V5).
 */
export const SECONDS_PER_MATCH = (2 * 60) / 100;

/** Minutos que faltan para descargar `remaining` partidas (redondeado hacia arriba, al menos 1). */
export function syncEtaMinutes(remaining: number): number {
  return Math.max(
    1,
    Math.ceil((Math.max(0, remaining) * SECONDS_PER_MATCH) / 60),
  );
}

/** Qué pinta la banda bajo el header; `null` = no hay banda. */
export type SyncBandModel =
  | { kind: "resolving" }
  | { kind: "listing"; listedIds: number }
  | { kind: "fetching"; fetched: number; total: number; etaMinutes: number }
  /** Key de Riot caducada: la pausa se pinta en azul acero; `progress` es el backfill a medias. */
  | {
      kind: "paused";
      progress: { fetched: number; total: number } | null;
    };

/**
 * Modelo de la banda. La pausa por key caducada manda sobre todo lo demás. El incremental no
 * tiene banda: su progreso va dentro del botón Actualizar (§4.10).
 */
export function syncBandModel(
  sync: SyncProgress | null,
  paused: boolean,
): SyncBandModel | null {
  const backfill = sync?.kind === "backfill" ? sync : null;
  if (paused) {
    return {
      kind: "paused",
      progress:
        backfill?.phase === "fetching" && backfill.total > 0
          ? { fetched: backfill.fetched, total: backfill.total }
          : null,
    };
  }
  if (!backfill) return null;
  switch (backfill.phase) {
    case "resolving":
      return { kind: "resolving" };
    case "listing":
      return { kind: "listing", listedIds: backfill.listedIds };
    case "fetching":
      return {
        kind: "fetching",
        fetched: backfill.fetched,
        total: backfill.total,
        etaMinutes: syncEtaMinutes(backfill.total - backfill.fetched),
      };
  }
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
