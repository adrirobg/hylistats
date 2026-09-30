// Decisiones de presentación de los compañeros (brief §3.2 y §3.4) como funciones puras, sin React
// ni navegador: la URL (`?min`, `?orden`), el filtro por muestra mínima, el orden por columna y
// las cifras ya formateadas. El panel de la pestaña (`teammates-panel.tsx`) y el raíl
// (`teammates-rail.tsx`) solo las pintan.

import type { TeammateSummary } from "@/domain/queries";
import { formatDecimal, formatPercent, formatRelative } from "@/lib/format";
import { normalizeRiotId, profileSlug, toRiotId } from "@/lib/riot-id";
import type { ParamSource } from "./album-view";

// --- Muestra pequeña ---------------------------------------------------------------------

/** Por debajo de estas partidas juntos las cifras engañan (D6): se marcan con ⚠ y se atenúan. */
export const SMALL_SAMPLE = 5;
export const SMALL_SAMPLE_LABEL = `Muestra pequeña: menos de ${SMALL_SAMPLE} partidas`;

// --- URL ---------------------------------------------------------------------------------

/** Mínimo de partidas juntos que ofrece el control «Mostrar: ≥ N partidas». */
export const MIN_GAMES_OPTIONS = [1, 3, 5, 10] as const;
export type MinGames = (typeof MIN_GAMES_OPTIONS)[number];
export const DEFAULT_MIN_GAMES: MinGames = 3;

/**
 * Columnas por las que se ordena. Todas de mayor a menor salvo `medio` (el mejor puesto medio es
 * el más bajo): `ORDEN_DIRECTION`. Compañero no se ordena.
 */
export const ORDENES = [
  "partidas",
  "primeros",
  "pct1",
  "top3",
  "medio",
  "ultima",
] as const;
export type TeammateOrder = (typeof ORDENES)[number];
export const DEFAULT_ORDEN: TeammateOrder = "partidas";

export const ORDEN_DIRECTION: Record<TeammateOrder, "asc" | "desc"> = {
  partidas: "desc",
  primeros: "desc",
  pct1: "desc",
  top3: "desc",
  medio: "asc",
  ultima: "desc",
};

/** Cabecera de cada columna ordenable. */
export const ORDEN_LABEL: Record<TeammateOrder, string> = {
  partidas: "Partidas",
  primeros: "1º",
  pct1: "% 1º",
  top3: "Top 3",
  medio: "Puesto medio",
  ultima: "Última",
};

/** Opciones del selector de orden de las pantallas estrechas (sin cabeceras): dicen el sentido. */
export const ORDEN_SELECT_LABEL: Record<TeammateOrder, string> = {
  partidas: "Más partidas",
  primeros: "Más victorias (1º)",
  pct1: "Mayor % de 1º",
  top3: "Mayor % de top 3",
  medio: "Mejor puesto medio",
  ultima: "Más reciente",
};

export interface TeammateParams {
  min: MinGames;
  orden: TeammateOrder;
}

export const DEFAULT_TEAMMATE_PARAMS: TeammateParams = {
  min: DEFAULT_MIN_GAMES,
  orden: DEFAULT_ORDEN,
};

const MIN_PARAM = "min";
const ORDEN_PARAM = "orden";

/** Query -> parámetros de Compañeros. Lo desconocido o ausente cae en el valor por defecto. */
export function parseTeammateParams(source: ParamSource): TeammateParams {
  const min = source.get(MIN_PARAM);
  const orden = source.get(ORDEN_PARAM);
  return {
    // Comparado como texto: `Number` aceptaría `0x5` o `5.0`.
    min: MIN_GAMES_OPTIONS.find((n) => String(n) === min) ?? DEFAULT_MIN_GAMES,
    orden: ORDENES.find((o) => o === orden) ?? DEFAULT_ORDEN,
  };
}

/**
 * Parámetros -> query (sin `?`), la inversa de `parseTeammateParams`. Omite los valores por
 * defecto para que la URL quede limpia y conserva de `current` todo lo que no es de Compañeros
 * (`?tab`…).
 */
export function teammateSearch(
  params: TeammateParams,
  current: string | URLSearchParams = "",
): string {
  const search = new URLSearchParams(current);
  search.delete(MIN_PARAM);
  search.delete(ORDEN_PARAM);
  if (params.min !== DEFAULT_MIN_GAMES) {
    search.set(MIN_PARAM, String(params.min));
  }
  if (params.orden !== DEFAULT_ORDEN) search.set(ORDEN_PARAM, params.orden);
  return search.toString();
}

// --- Filtro y orden ----------------------------------------------------------------------

/** Compañeros con al menos `min` partidas juntos, en el orden de entrada. */
export function teammatesAtLeast(
  list: readonly TeammateSummary[],
  min: number,
): TeammateSummary[] {
  return list.filter((t) => t.games >= min);
}

type Compare = (a: TeammateSummary, b: TeammateSummary) => number;

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byGames: Compare = (a, b) => b.games - a.games;
const byFirsts: Compare = (a, b) => b.firsts - a.firsts;
// Los porcentajes se comparan multiplicando en cruz: exacto, sin redondeos de coma flotante.
const byPct1: Compare = (a, b) => b.firsts * a.games - a.firsts * b.games;
const byTop3: Compare = (a, b) => b.top3 * a.games - a.top3 * b.games;
const byAvg: Compare = (a, b) => a.avgPlacement - b.avgPlacement;
const byLast: Compare = (a, b) => b.lastPlayedAt - a.lastPlayedAt;
// Sin distinguir mayúsculas y, si aun así empatan, la cadena tal cual: orden total y estable.
const byName: Compare = (a, b) =>
  text(a.gameName.toLowerCase(), b.gameName.toLowerCase()) ||
  text(a.gameName, b.gameName) ||
  text(a.tagLine.toLowerCase(), b.tagLine.toLowerCase()) ||
  text(a.tagLine, b.tagLine);

const PRIMARY: Record<TeammateOrder, Compare> = {
  partidas: byGames,
  primeros: byFirsts,
  pct1: byPct1,
  top3: byTop3,
  medio: byAvg,
  ultima: byLast,
};

/**
 * Copia ordenada por la columna `orden`. Desempates deterministas, sea cual sea la columna: más
 * partidas, más 1º y nombre (así una lista con el mismo contenido sale siempre igual).
 */
export function sortTeammates(
  list: readonly TeammateSummary[],
  orden: TeammateOrder,
): TeammateSummary[] {
  const primary = PRIMARY[orden];
  return [...list].sort(
    (a, b) => primary(a, b) || byGames(a, b) || byFirsts(a, b) || byName(a, b),
  );
}

// --- Filas -------------------------------------------------------------------------------

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** Enlace al perfil del compañero en hylistats; `null` si su Riot ID no cabe en una URL de perfil. */
function profileHref(gameName: string, tagLine: string): string | null {
  return toRiotId(gameName, tagLine) === null
    ? null
    : `/euw/${profileSlug(gameName, tagLine)}`;
}

/** Claves únicas por fila: dos jugadores con el mismo Riot ID (uno renombrado) no colisionan. */
function keyer() {
  const seen = new Map<string, number>();
  return (norm: string) => {
    const count = seen.get(norm) ?? 0;
    seen.set(norm, count + 1);
    return count === 0 ? norm : `${norm}#${count}`;
  };
}

/** Una fila de la tabla (o tarjeta) de Compañeros, con las cifras ya formateadas (`es-ES`). */
export interface TeammateRow {
  /** Único en la lista: clave de React. */
  key: string;
  /** Riot ID normalizado (`normalizeRiotId`): con él se busca entre los favoritos. */
  norm: string;
  gameName: string;
  tagLine: string;
  href: string | null;
  games: number;
  firsts: number;
  /** `18,4 %`. */
  pct1: string;
  /** `58,3 %`. */
  top3: string;
  /** `3,10`. */
  medio: string;
  /** `hace 2 d`. */
  ultima: string;
  /** Menos de `SMALL_SAMPLE` partidas juntos. */
  small: boolean;
}

/**
 * Filas de la tabla: los compañeros con al menos `params.min` partidas juntos, ordenados por
 * `params.orden`, con las cifras formateadas y «hace cuánto» respecto a `nowMs`.
 */
export function teammateRows(
  list: readonly TeammateSummary[],
  params: TeammateParams,
  nowMs: number,
): TeammateRow[] {
  const key = keyer();
  return sortTeammates(teammatesAtLeast(list, params.min), params.orden).map(
    (t) => {
      const norm = normalizeRiotId(t.gameName, t.tagLine);
      return {
        key: key(norm),
        norm,
        gameName: t.gameName,
        tagLine: t.tagLine,
        href: profileHref(t.gameName, t.tagLine),
        games: t.games,
        firsts: t.firsts,
        pct1: formatPercent(ratio(t.firsts, t.games)),
        top3: formatPercent(ratio(t.top3, t.games)),
        medio: formatDecimal(t.avgPlacement),
        ultima: formatRelative(t.lastPlayedAt, nowMs),
        small: t.games < SMALL_SAMPLE,
      };
    },
  );
}

/** Cuántos compañeros salen en el raíl. */
export const RAIL_TEAMMATES = 5;

/** Una fila del raíl: compacta (`38 p · 18 % · 3,1`). */
export interface RailTeammate {
  key: string;
  gameName: string;
  tagLine: string;
  href: string | null;
  games: number;
  /** `18 %`, sin decimales. */
  pct1: string;
  /** `3,1`, un decimal. */
  medio: string;
  small: boolean;
}

/** Los `limit` compañeros con más partidas juntos, sin mínimo (los de muestra pequeña también salen). */
export function railTeammates(
  list: readonly TeammateSummary[],
  limit = RAIL_TEAMMATES,
): RailTeammate[] {
  const key = keyer();
  return sortTeammates(list, "partidas")
    .slice(0, limit)
    .map((t) => ({
      key: key(normalizeRiotId(t.gameName, t.tagLine)),
      gameName: t.gameName,
      tagLine: t.tagLine,
      href: profileHref(t.gameName, t.tagLine),
      games: t.games,
      pct1: formatPercent(ratio(t.firsts, t.games), 0),
      medio: formatDecimal(t.avgPlacement, 1),
      small: t.games < SMALL_SAMPLE,
    }));
}

// --- Vacío -------------------------------------------------------------------------------

/** Texto del vacío cuando ningún compañero llega al mínimo (§5: el umbral, y se puede bajar). */
export function emptyMessage(min: MinGames): string {
  return min === 1
    ? "Aún no hay compañeros en las partidas de esta temporada."
    : `Ningún compañero con ≥ ${min} partidas juntos.`;
}

/** ¿Se ofrece «Ver todos (≥ 1)»? Solo si el mínimo actual se puede bajar. */
export const canShowAll = (min: MinGames) => min > 1;
