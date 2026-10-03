// Decisiones de presentación del álbum (brief §4.4 y §4.5, `renderAlbum` de la maqueta) como
// funciones puras, sin React ni navegador: la URL (`?vista`, `?filtro`, `?q`, `?orden`), el estado
// efectivo de cada cromo, la búsqueda y las bandas. El componente (`album.tsx`) solo las pinta.

import type { AlbumEntry } from "@/domain/album";
import type { HeatState } from "@/domain/heat";
import { HEAT_MIN_GAMES } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { FILTER_PARAM } from "./view-model";

// --- URL ---------------------------------------------------------------------------------

export const VISTAS = ["album", "lista"] as const;
export type Vista = (typeof VISTAS)[number];

// `sin-ganar` es el valor que pone «Marcar a mano» de la barra Arena God (`FILTER_UNWON`).
// `frio-calor` (F16 revisada, #25): solo los campeones con marca 🔥 o ❄️.
export const FILTROS = [
  "objetivos",
  "sin-ganar",
  "frio-calor",
  "sin-jugar",
  "ganados",
  "todos",
] as const;
export type Filtro = (typeof FILTROS)[number];

export const ORDENES = [
  "estado",
  "alfabetico",
  "intentos",
  "mejor",
  "reciente",
] as const;
export type Orden = (typeof ORDENES)[number];

export interface AlbumParams {
  vista: Vista;
  /** `null` = la URL no lo fija: manda el filtro por defecto (`defaultFiltro`). */
  filtro: Filtro | null;
  /** Búsqueda, sin espacios en los extremos; `""` = sin búsqueda. */
  q: string;
  orden: Orden;
}

export const DEFAULT_VISTA: Vista = "album";
export const DEFAULT_ORDEN: Orden = "estado";

const VISTA_PARAM = "vista";
const Q_PARAM = "q";
const ORDEN_PARAM = "orden";
const ALBUM_KEYS = [VISTA_PARAM, FILTER_PARAM, Q_PARAM, ORDEN_PARAM];

/** Longitud máxima de la búsqueda (un nombre de campeón no llega ni a la mitad). */
export const MAX_QUERY_LENGTH = 40;

/** Lo que se lee de una query: `URLSearchParams` y `useSearchParams()` lo cumplen. */
export type ParamSource = Pick<URLSearchParams, "get">;

function oneOf<T extends string>(
  values: readonly T[],
  value: string | null,
): T | null {
  return values.find((candidate) => candidate === value) ?? null;
}

/**
 * Query -> parámetros del álbum. Lo inválido o ausente cae en el valor por defecto (también el
 * `?orden=calor` de los enlaces viejos: frío/calor ya no es un orden sino el filtro `frio-calor`).
 */
export function parseAlbumParams(source: ParamSource): AlbumParams {
  return {
    vista: oneOf(VISTAS, source.get(VISTA_PARAM)) ?? DEFAULT_VISTA,
    filtro: oneOf(FILTROS, source.get(FILTER_PARAM)),
    q: (source.get(Q_PARAM) ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    orden: oneOf(ORDENES, source.get(ORDEN_PARAM)) ?? DEFAULT_ORDEN,
  };
}

/**
 * Parámetros -> query (sin `?`), la inversa de `parseAlbumParams`. Omite los valores por defecto
 * para que la URL quede limpia y conserva del `current` todo lo que no es del álbum (`?tab`…).
 */
export function albumSearch(
  params: AlbumParams,
  current: string | URLSearchParams = "",
): string {
  const search = new URLSearchParams(current);
  for (const key of ALBUM_KEYS) search.delete(key);
  if (params.vista !== DEFAULT_VISTA) search.set(VISTA_PARAM, params.vista);
  if (params.filtro !== null) search.set(FILTER_PARAM, params.filtro);
  const q = params.q.trim().slice(0, MAX_QUERY_LENGTH);
  if (q !== "") search.set(Q_PARAM, q);
  if (params.orden !== DEFAULT_ORDEN) search.set(ORDEN_PARAM, params.orden);
  return search.toString();
}

/** D1: «Objetivos sin ganar» si hay objetivos; si no, «Todos» agrupado por bandas. */
export function defaultFiltro(hasTargets: boolean): Filtro {
  return hasTargets ? "objetivos" : "todos";
}

/**
 * Filtro que se aplica. Objetivos y marcas solo existen en «mi perfil» (D12): en un perfil ajeno
 * el filtro de objetivos no se ofrece, y una URL que lo pide cae en «Todos».
 */
export function resolveFiltro(
  filtro: Filtro | null,
  local: { mine: boolean; hasTargets: boolean },
): Filtro {
  if (!local.mine)
    return filtro === null || filtro === "objetivos" ? "todos" : filtro;
  return filtro ?? defaultFiltro(local.hasTargets);
}

/**
 * Parámetros tras escribir `q`. Como en la maqueta, buscar con un filtro distinto de «Todos» lo
 * cambia a «Todos» (buscar «ahri» dentro de «Sin jugar» no encontraría nada útil). `filtro` es el
 * filtro ya resuelto.
 */
export function withQuery(
  params: AlbumParams,
  q: string,
  filtro: Filtro,
): AlbumParams {
  const next = q.trim();
  return {
    ...params,
    q: next,
    filtro: next !== "" && filtro !== "todos" ? "todos" : params.filtro,
  };
}

// --- Estado y búsqueda -------------------------------------------------------------------

/** Estado que se pinta: los tres del dominio más `manual` (ganado a mano, capa del navegador). */
export type CardState = "won" | "manual" | "played" | "none";

/**
 * Un campeón verificado (`won`) manda sobre la marca manual (brief §4.4): la marca ya no aporta
 * nada, igual que en la barra Arena God.
 */
export function effectiveState(
  entry: Pick<AlbumEntry, "state" | "championId">,
  manual: ReadonlySet<number>,
): CardState {
  if (entry.state === "won") return "won";
  return manual.has(entry.championId) ? "manual" : entry.state;
}

// Sin tildes, sin mayúsculas y sin signos ni espacios: «kaisa» casa con «Kai'Sa» y «dr mundo» con
// «Dr. Mundo».
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** ¿Casa el campeón con la búsqueda? Por el nombre de visualización o por el `id` de Data Dragon. */
export function matchesQuery(
  entry: Pick<AlbumEntry, "name" | "ddId">,
  q: string,
): boolean {
  const needle = fold(q);
  if (needle === "") return true;
  return (
    fold(entry.name).includes(needle) ||
    (entry.ddId !== null && fold(entry.ddId).includes(needle))
  );
}

// --- Bandas ------------------------------------------------------------------------------

export type SectionTone = "target" | "won" | "neutral";

export interface AlbumSection {
  key: string;
  /** Título de la banda; `""` = sin cabecera (solo el aviso de la búsqueda sin resultados). */
  title: string;
  tone: SectionTone;
  entries: AlbumEntry[];
  /** Qué decir si `entries` está vacío. */
  empty: string;
}

export interface AlbumLocal {
  /** `championId` marcados como objetivo (vacío fuera de «mi perfil»). */
  targets: ReadonlySet<number>;
  /** `championId` marcados como ganados a mano (vacío fuera de «mi perfil»). */
  manual: ReadonlySet<number>;
}

const byName = (a: AlbumEntry, b: AlbumEntry) =>
  a.name.localeCompare(b.name, "es") || a.championId - b.championId;

/** Los nulos al final, sea cual sea el sentido. */
function compareNullable(
  a: number | null,
  b: number | null,
  direction: 1 | -1,
): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

/**
 * Frío/calor que se muestra: F16 solo marca campeones sin 1º y una marca manual de «ganado» dice
 * justo lo contrario (`computeHeat` solo ve las partidas verificadas), así que un `manual` es
 * siempre neutral.
 */
export function effectiveHeat(
  entry: Pick<AlbumEntry, "heat">,
  state: CardState,
): HeatState {
  return state === "manual" ? "neutral" : entry.heat;
}

/** Nombre visible de la marca de frío/calor (F16); `null` si el cromo no la lleva. */
export const HEAT_LABEL: Record<HeatState, string | null> = {
  hot: "Modo diablo",
  cold: "Nevera",
  neutral: null,
};

/**
 * Orden dentro de una banda del filtro «Frío/calor» (con `orden = estado`): media ajustada menor,
 * o sea mejor, primero (en ❄️ la peor queda la última); empates por nombre y `championId`.
 */
const byHeat = (a: AlbumEntry, b: AlbumEntry): number =>
  compareNullable(a.heatAdjustedAvg, b.heatAdjustedAvg, 1) || byName(a, b);

const ORDER: Record<Orden, (a: AlbumEntry, b: AlbumEntry) => number> = {
  estado: byName, // dentro de cada banda
  alfabetico: byName,
  intentos: (a, b) => b.games - a.games || byName(a, b),
  mejor: (a, b) =>
    compareNullable(a.bestPlacement, b.bestPlacement, 1) || byName(a, b),
  reciente: (a, b) =>
    compareNullable(a.lastPlayedAt, b.lastPlayedAt, -1) || byName(a, b),
};

/** Título de cada filtro como banda (la maqueta llama «Jugados sin ganar» a la banda de «Sin ganar»). */
const BAND_TITLE: Record<Filtro, string> = {
  objetivos: "Objetivos sin ganar",
  "sin-ganar": "Jugados sin ganar",
  "frio-calor": "Frío/calor",
  "sin-jugar": "Sin jugar",
  ganados: "Ganados",
  todos: "Todos",
};

const BAND_TONE: Record<Filtro, SectionTone> = {
  objetivos: "target",
  "sin-ganar": "neutral",
  "frio-calor": "neutral",
  "sin-jugar": "neutral",
  ganados: "won",
  todos: "neutral",
};

/** Etiquetas del filtro segmentado. */
export const FILTRO_LABEL: Record<Filtro, string> = {
  ...BAND_TITLE,
  "sin-ganar": "Sin ganar",
};

export const ORDEN_LABEL: Record<Orden, string> = {
  estado: "Estado",
  alfabetico: "Alfabético",
  intentos: "Más intentados",
  mejor: "Mejor puesto",
  reciente: "Último jugado",
};

const EMPTY_TARGETS_NONE =
  "Marca objetivos con ◎ en cualquier campeón para verlos aquí.";
const EMPTY_TARGETS_DONE =
  "No tienes objetivos pendientes. Marca campeones con ◎ para verlos aquí.";
const EMPTY_HEAT = `Ningún campeón en modo diablo ni en la nevera. Solo se marcan los que aún no tienen un 1º, con ${HEAT_MIN_GAMES} partidas o más.`;

/** Bandas del filtro «Frío/calor», en el orden en que salen (los neutrales no salen). */
const HEAT_BANDS = [
  { heat: "hot", key: "modo-diablo", emoji: "🔥" },
  { heat: "cold", key: "nevera", emoji: "❄️" },
] as const satisfies readonly {
  heat: Exclude<HeatState, "neutral">;
  key: string;
  emoji: string;
}[];

/**
 * Secciones del álbum con la semántica de `renderAlbum` de la maqueta. La búsqueda se aplica
 * primero; un campeón ganado a mano cuenta como ganado (sale de «Sin ganar» y «Sin jugar»).
 *
 * - `objetivos`: objetivos sin ganar. `sin-ganar`: jugados sin ganar. `sin-jugar`. `ganados`:
 *   verificados y manuales.
 * - `todos`: bandas «Objetivos sin ganar» (solo si hay), «Jugados sin ganar» y «Sin jugar» (sin los
 *   objetivos) y «Ganados».
 * - Con `orden = estado` se agrupa en esas bandas (alfabético dentro de cada una); con otro orden
 *   sale una única sección con el título del filtro, ordenada.
 * - `frio-calor` (F16): solo los campeones con marca efectiva (`effectiveHeat`: un ganado a mano
 *   es neutral), en dos bandas, «🔥 Modo diablo» y «❄️ Nevera», sea cual sea el orden: las bandas
 *   mandan. Con `orden = estado` cada banda va por media ajustada (mejor primero); con otro orden,
 *   ese orden dentro de cada banda. Una banda vacía no sale; sin ninguna, una sección vacía que lo
 *   explica.
 * - Una búsqueda sin resultados da una única sección vacía que lo explica.
 *
 * `params.filtro` puede ser `null` (manda `defaultFiltro`); el componente lo pasa ya resuelto
 * (`resolveFiltro`).
 */
export function albumSections(
  entries: readonly AlbumEntry[],
  local: AlbumLocal,
  params: AlbumParams,
): AlbumSection[] {
  const filtro = params.filtro ?? defaultFiltro(local.targets.size > 0);
  const visible = entries.filter((entry) => matchesQuery(entry, params.q));
  if (visible.length === 0 && params.q !== "") {
    return [
      {
        key: "sin-resultados",
        title: "",
        tone: "neutral",
        entries: [],
        empty: `Ningún campeón coincide con «${params.q}».`,
      },
    ];
  }

  const stateOf = (entry: AlbumEntry) => effectiveState(entry, local.manual);
  const isWon = (entry: AlbumEntry) => {
    const state = stateOf(entry);
    return state === "won" || state === "manual";
  };
  const isTarget = (entry: AlbumEntry) => local.targets.has(entry.championId);
  const targets = visible.filter((e) => isTarget(e) && !isWon(e));
  const played = visible.filter((e) => stateOf(e) === "played");
  const none = visible.filter((e) => stateOf(e) === "none");
  const won = visible.filter(isWon);

  if (filtro === "frio-calor") {
    const sortedHeat = sortSection(
      params.orden === "estado" ? byHeat : ORDER[params.orden],
    );
    const bands = HEAT_BANDS.map(
      ({ heat, key, emoji }): AlbumSection => ({
        key,
        title: `${emoji} ${HEAT_LABEL[heat]}`,
        tone: "neutral",
        entries: visible.filter((e) => effectiveHeat(e, stateOf(e)) === heat),
        empty: "",
      }),
    ).filter((band) => band.entries.length > 0);
    if (bands.length === 0) {
      return [
        {
          key: "frio-calor",
          title: BAND_TITLE["frio-calor"],
          tone: "neutral",
          entries: [],
          empty: EMPTY_HEAT,
        },
      ];
    }
    return bands.map(sortedHeat);
  }

  const sorted = sortSection(ORDER[params.orden]);
  const section = (
    key: Filtro,
    entries: AlbumEntry[],
    empty: string,
  ): AlbumSection => ({
    key,
    title: BAND_TITLE[key],
    tone: BAND_TONE[key],
    entries,
    empty,
  });
  const emptyTargets =
    local.targets.size === 0 ? EMPTY_TARGETS_NONE : EMPTY_TARGETS_DONE;

  if (filtro === "todos") {
    if (params.orden !== "estado") {
      return [sorted(section("todos", visible, "Nada por aquí."))];
    }
    const noTargets = (e: AlbumEntry) => !isTarget(e);
    return [
      ...(targets.length > 0 ? [section("objetivos", targets, "")] : []),
      section("sin-ganar", played.filter(noTargets), "Nada por aquí."),
      section("sin-jugar", none.filter(noTargets), "Has jugado todos."),
      section("ganados", won, "Aún sin victorias."),
    ].map(sorted);
  }

  const single: Record<
    Exclude<Filtro, "todos" | "frio-calor">,
    AlbumSection
  > = {
    objetivos: section("objetivos", targets, emptyTargets),
    "sin-ganar": section("sin-ganar", played, "Nada por aquí."),
    "sin-jugar": section("sin-jugar", none, "Has jugado todos."),
    ganados: section("ganados", won, "Aún sin victorias esta temporada."),
  };
  return [sorted(single[filtro])];
}

/** Ordena las entradas de una sección (copia: las entradas de origen no se tocan). */
function sortSection(compare: (a: AlbumEntry, b: AlbumEntry) => number) {
  return (section: AlbumSection): AlbumSection => ({
    ...section,
    entries: [...section.entries].sort(compare),
  });
}

// --- Textos del cromo --------------------------------------------------------------------

type CardData = Pick<
  AlbumEntry,
  "name" | "games" | "firsts" | "bestPlacement" | "firstWinAt" | "heat"
>;

/** Dato secundario bajo el nombre (`subTxt` de la maqueta). */
export function cardSub(entry: CardData, state: CardState): string {
  switch (state) {
    case "won":
      return entry.firsts > 1 ? `${entry.firsts}× 1º` : `${entry.games} part.`;
    case "manual":
      return "manual";
    case "played":
      return `×${entry.games} · mejor ${entry.bestPlacement ?? "-"}º`;
    case "none":
      return "sin jugar";
  }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Nombre accesible del cromo: «Ahri, ganado verificado, 3 primeros puestos, objetivo». */
export function cardLabel(
  entry: CardData,
  state: CardState,
  isTarget: boolean,
): string {
  const parts = [entry.name];
  switch (state) {
    case "won":
      parts.push(
        "ganado verificado",
        plural(entry.firsts, "primer puesto", "primeros puestos"),
      );
      break;
    case "manual":
      parts.push("ganado a mano");
      break;
    case "played":
      parts.push(
        "jugado sin ganar",
        plural(entry.games, "partida", "partidas"),
      );
      if (entry.bestPlacement !== null) {
        parts.push(`mejor puesto ${entry.bestPlacement}º`);
      }
      break;
    case "none":
      parts.push("sin jugar");
      break;
  }
  const heat = HEAT_LABEL[effectiveHeat(entry, state)];
  if (heat !== null) parts.push(heat.toLowerCase());
  if (isTarget) parts.push("objetivo");
  return parts.join(", ");
}

/** Tooltip de un cromo verificado: cuándo cayó el primer 1º. */
export function cardTitle(
  entry: CardData,
  state: CardState,
): string | undefined {
  return state === "won" && entry.firstWinAt !== null
    ? `1º el ${formatDateTime(entry.firstWinAt)}`
    : undefined;
}
