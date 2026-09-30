// Decisiones de presentación de la pestaña Partidas (brief §3.5) como funciones puras, sin React ni
// navegador: la URL (`?q`, `?puesto`, `?companero`, `?n`, `?partida`), la resolución del filtro de
// campeón, las filas y el detalle ya con nombres, retratos e iconos, y los textos. El panel
// (`matches-panel.tsx`) y el detalle (`match-detail.tsx`) solo las pintan; la carga (`data.ts`) las
// usa para dar forma a lo que viaja a la página.

import type { AlbumEntry } from "@/domain/album";
import type {
  MatchDetail,
  MatchListRow,
  MatchMate,
  MatchPlayer,
  PuestoFilter,
} from "@/domain/matches";
import { formatDecimal, formatRelative } from "@/lib/format";
import type { GameData, GameIcon } from "@/lib/game-data";
import { normalizeRiotId, type RiotId, toRiotId } from "@/lib/riot-id";
import { MAX_QUERY_LENGTH, matchesQuery, type ParamSource } from "./album-view";
import { championSlug } from "./champion-panel-view";
import { MATCH_PARAM, matchHref } from "./view-model";

// --- URL ---------------------------------------------------------------------------------

/** Partidas por bloque (`?n` cuenta bloques) y máximo de bloques: 500 partidas como mucho. */
export const BLOCK_SIZE = 50;
export const MAX_BLOCKS = 10;

/** Cuántas partidas se piden para `blocks` bloques. */
export const matchListLimit = (blocks: number) => BLOCK_SIZE * blocks;

export const PUESTOS = ["1", "top3"] as const satisfies readonly PuestoFilter[];

export interface MatchParams {
  /** Búsqueda de campeón, sin espacios en los extremos; `""` = sin búsqueda. */
  q: string;
  /** `null` = todos los puestos. */
  puesto: PuestoFilter | null;
  /** Riot ID de un compañero de trío (`?companero=Nombre-TAG`); `null` = todos. */
  companero: RiotId | null;
  /** Bloques de 50 que se muestran (`?n`, de 1 a `MAX_BLOCKS`). */
  blocks: number;
  /** `matchId` de la partida abierta (`?partida`); `null` = ninguna. */
  partida: string | null;
}

export const DEFAULT_MATCH_PARAMS: MatchParams = {
  q: "",
  puesto: null,
  companero: null,
  blocks: 1,
  partida: null,
};

const Q_PARAM = "q";
const PUESTO_PARAM = "puesto";
const COMPANERO_PARAM = "companero";
const BLOCKS_PARAM = "n";
const MATCH_KEYS = [
  Q_PARAM,
  PUESTO_PARAM,
  COMPANERO_PARAM,
  BLOCKS_PARAM,
  MATCH_PARAM,
];

// `EUW1_7997909147`: letras, dígitos, `_` y `-`. Lo demás no puede ser un id de partida.
const MATCH_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * `Nombre-TAG` (`?companero`) -> Riot ID, separando por el ÚLTIMO `-` (el nombre puede llevar
 * guiones; el tag nunca). No decodifica: `searchParams` ya llega decodificado. `null` si no es un
 * Riot ID válido.
 */
export function parseCompanero(value: string | null): RiotId | null {
  if (value === null) return null;
  const at = value.lastIndexOf("-");
  return at < 0 ? null : toRiotId(value.slice(0, at), value.slice(at + 1));
}

/** Riot ID -> valor de `?companero` (`Nombre-TAG`), la inversa de `parseCompanero`. */
export const companeroParam = ({ gameName, tagLine }: RiotId) =>
  `${gameName.trim()}-${tagLine.trim()}`;

/** Query -> parámetros de Partidas. Lo inválido o ausente cae en el valor por defecto. */
export function parseMatchParams(source: ParamSource): MatchParams {
  const puesto = source.get(PUESTO_PARAM);
  const blocks = source.get(BLOCKS_PARAM);
  const partida = source.get(MATCH_PARAM);
  return {
    q: (source.get(Q_PARAM) ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    puesto: PUESTOS.find((p) => p === puesto) ?? null,
    companero: parseCompanero(source.get(COMPANERO_PARAM)),
    // Solo dígitos (`Number` aceptaría `0x5` o `5.0`); por encima del máximo se queda en el máximo.
    blocks:
      blocks !== null && /^\d{1,4}$/.test(blocks)
        ? Math.min(Math.max(Number(blocks), 1), MAX_BLOCKS)
        : 1,
    partida: partida !== null && MATCH_ID.test(partida) ? partida : null,
  };
}

/**
 * Parámetros -> query (sin `?`), la inversa de `parseMatchParams`. Omite los valores por defecto
 * para que la URL quede limpia y conserva de `current` todo lo que no es de Partidas (`?tab`…).
 */
export function matchSearch(
  params: MatchParams,
  current: string | URLSearchParams = "",
): string {
  const search = new URLSearchParams(current);
  for (const key of MATCH_KEYS) search.delete(key);
  const q = params.q.trim().slice(0, MAX_QUERY_LENGTH);
  if (q !== "") search.set(Q_PARAM, q);
  if (params.puesto !== null) search.set(PUESTO_PARAM, params.puesto);
  if (params.companero !== null) {
    search.set(COMPANERO_PARAM, companeroParam(params.companero));
  }
  if (params.blocks > 1) search.set(BLOCKS_PARAM, String(params.blocks));
  if (params.partida !== null) search.set(MATCH_PARAM, params.partida);
  return search.toString();
}

/** ¿Hay algún filtro puesto? (la partida abierta y los bloques no son filtros). */
export const hasFilters = (params: MatchParams) =>
  params.q !== "" || params.puesto !== null || params.companero !== null;

/** Los parámetros que filtran la lista (los demás, `n` y `partida`, no la cambian). */
export type FilterPatch = Partial<
  Pick<MatchParams, "q" | "puesto" | "companero">
>;

/**
 * Parámetros tras cambiar un filtro: la lista es otra, así que vuelve al primer bloque y se cierra
 * la partida abierta (podría no estar ya entre las que se ven).
 */
export const withFilter = (
  params: MatchParams,
  patch: FilterPatch,
): MatchParams => ({ ...params, ...patch, blocks: 1, partida: null });

/** Sin ningún filtro (el «Quitar filtros» del vacío). */
export const withoutFilters = (params: MatchParams): MatchParams =>
  withFilter(params, { q: "", puesto: null, companero: null });

/** Un bloque más de partidas (con el tope de `MAX_BLOCKS`). */
export const withMoreBlocks = (params: MatchParams): MatchParams => ({
  ...params,
  blocks: Math.min(params.blocks + 1, MAX_BLOCKS),
});

/** Ruta con la partida `matchId` abierta, o cerrada si ya lo estaba (`open`); el resto de la query se conserva. */
export function toggleMatchHref(
  pathname: string,
  search: string,
  matchId: string,
  open: boolean,
): string {
  const params = new URLSearchParams(search);
  if (open) params.delete(MATCH_PARAM);
  else params.set(MATCH_PARAM, matchId);
  const query = params.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

/** URL absoluta de una partida (lo que copia [Copiar enlace]): el perfil + `?tab=partidas&partida=…`. */
export function matchShareUrl(
  origin: string,
  pathname: string,
  matchId: string,
): string {
  return new URL(matchHref(pathname, "", matchId), origin).href;
}

// --- Filtro de campeón -------------------------------------------------------------------

/**
 * `championId` que casan con la búsqueda: por el nombre de visualización o el `id` de Data Dragon
 * (el álbum, `matchesQuery`) o por el `championName` de la partida (`games`). Sin tildes, sin
 * mayúsculas y sin signos, igual que el buscador del álbum. `undefined` si no hay nada que buscar.
 */
export function championIdsForQuery(
  album: readonly Pick<AlbumEntry, "championId" | "name" | "ddId" | "games">[],
  games: readonly { championId: number; championName: string }[],
  q: string,
): number[] | undefined {
  // Una búsqueda que se queda en nada al plegarla (`'`, espacios) casa con todo: es no buscar.
  if (matchesQuery({ name: "", ddId: null }, q)) return undefined;
  const ids = new Set<number>();
  for (const entry of album) {
    if (entry.games > 0 && matchesQuery(entry, q)) ids.add(entry.championId);
  }
  const seen = new Set<number>();
  for (const { championId, championName } of games) {
    if (seen.has(championId)) continue;
    seen.add(championId);
    if (matchesQuery({ name: championName, ddId: null }, q)) {
      ids.add(championId);
    }
  }
  return [...ids];
}

// --- Compañeros --------------------------------------------------------------------------

/** Mínimo de partidas juntos para salir en el selector de compañero. */
export const MIN_COMPANION_GAMES = 3;

/** Un compañero del selector (`ProfileView.matches.companions`). */
export interface Companion {
  gameName: string;
  tagLine: string;
  games: number;
}

/** Los compañeros con partidas suficientes, en el orden de entrada (más partidas primero). */
export const companionsForSelect = (
  list: readonly Companion[],
  min = MIN_COMPANION_GAMES,
): Companion[] =>
  list
    .filter((t) => t.games >= min && toRiotId(t.gameName, t.tagLine) !== null)
    .map(({ gameName, tagLine, games }) => ({ gameName, tagLine, games }));

export interface CompanionOption {
  /** Valor de `?companero`. */
  value: string;
  label: string;
}

/**
 * Opciones del selector: los compañeros de la lista y, si la URL pide uno que no llega al mínimo
 * (un enlace a mano), también ése al final: el selector debe mostrar lo que está filtrando.
 */
export function companionOptions(
  list: readonly Companion[],
  selected: RiotId | null,
): CompanionOption[] {
  const options = list.map((t) => ({
    value: companeroParam(t),
    label: `${t.gameName}#${t.tagLine} (${t.games})`,
  }));
  if (selected === null) return options;
  const norm = normalizeRiotId(selected.gameName, selected.tagLine);
  const known = list.find(
    (t) => normalizeRiotId(t.gameName, t.tagLine) === norm,
  );
  return known
    ? options
    : [
        ...options,
        {
          value: companeroParam(selected),
          label: `${selected.gameName}#${selected.tagLine}`,
        },
      ];
}

/** Valor del selector para el compañero de la URL (el de su opción); `""` = todos. */
export function selectedCompanionValue(
  options: readonly CompanionOption[],
  selected: RiotId | null,
): string {
  if (selected === null) return "";
  const value = companeroParam(selected);
  const norm = value.toLowerCase();
  return options.find((o) => o.value.toLowerCase() === norm)?.value ?? "";
}

// --- Datos de la página ------------------------------------------------------------------

/** Una fila de la lista, con lo que añade la carga: retrato y «nuevo 1º». */
export interface MatchRowData extends MatchListRow {
  /** Retrato del catálogo; `null` sin catálogo o si el campeón no está en él. */
  portraitUrl: string | null;
  /** `?campeon` que abre el panel del campeón de la fila (el del álbum). */
  championSlug: string;
  /** Es el primer 1º del jugador con este campeón: la partida que lo verifica en el álbum. */
  newFirst: boolean;
}

export interface MatchPlayerView
  extends Omit<MatchPlayer, "augments" | "items"> {
  portraitUrl: string | null;
  /** Solo los augments de los que hay datos (nombre e icono): nunca un id suelto. */
  augments: GameIcon[];
  /** Solo los objetos de los que hay datos, con el amuleto el último. */
  items: GameIcon[];
}

export interface MatchTeamView {
  placement: number;
  isOwnTeam: boolean;
  players: MatchPlayerView[];
}

/** El detalle de una partida tal y como viaja a la página. */
export interface MatchDetailView {
  /** La fila de la partida, para pintarla cuando no está en la lista (filtros, o más allá del bloque). */
  row: MatchRowData;
  teams: MatchTeamView[];
}

const firstWinIds = (album: readonly Pick<AlbumEntry, "firstWinMatchId">[]) =>
  new Set(album.flatMap((e) => (e.firstWinMatchId ? [e.firstWinMatchId] : [])));

const championIndex = (album: readonly AlbumEntry[]) =>
  new Map(album.map((entry) => [entry.championId, entry]));

/** Slug del panel de un campeón; si no está en el álbum, el del nombre de la partida. */
const slugFor = (
  champions: ReadonlyMap<number, AlbumEntry>,
  championId: number,
  fallbackName: string,
) => {
  const entry = champions.get(championId);
  return entry ? championSlug(entry) : fallbackName.toLowerCase();
};

/**
 * Filas de la lista con el nombre de visualización y el retrato del catálogo (el álbum) y la marca
 * «nuevo 1º». Sin el campeón en el álbum se queda con el nombre de la partida y sin retrato.
 */
export function matchRows(
  rows: readonly MatchListRow[],
  album: readonly AlbumEntry[],
): MatchRowData[] {
  const champions = championIndex(album);
  const firstWins = firstWinIds(album);
  return rows.map((row) => ({
    ...row,
    championName: champions.get(row.championId)?.name ?? row.championName,
    portraitUrl: champions.get(row.championId)?.portraitUrl ?? null,
    championSlug: slugFor(champions, row.championId, row.championName),
    newFirst: firstWins.has(row.matchId),
  }));
}

/**
 * Detalle con nombres de campeón y retratos del álbum y los augments y objetos resueltos con
 * `gameData`. Un id sin datos (fuente caída o id nuevo) se descarta.
 */
export function matchDetailView(
  detail: MatchDetail,
  album: readonly AlbumEntry[],
  gameData: GameData,
): MatchDetailView {
  const champions = championIndex(album);
  const nameOf = (id: number, fallback: string) =>
    champions.get(id)?.name ?? fallback;
  const resolve = (
    ids: readonly number[],
    from: ReadonlyMap<number, GameIcon>,
  ) =>
    ids.flatMap((id) => {
      const icon = from.get(id);
      return icon ? [icon] : [];
    });

  const teams = detail.teams.map((team) => ({
    placement: team.placement,
    isOwnTeam: team.isOwnTeam,
    players: team.players.map((player) => ({
      ...player,
      championName: nameOf(player.championId, player.championName),
      portraitUrl: champions.get(player.championId)?.portraitUrl ?? null,
      augments: resolve(player.augments, gameData.augments),
      items: resolve(player.items, gameData.items),
    })),
  }));
  const own = teams.find((team) => team.isOwnTeam);
  return {
    row: {
      matchId: detail.matchId,
      gameCreation: detail.gameCreation,
      gameDuration: detail.gameDuration,
      championId: detail.championId,
      championName: nameOf(detail.championId, detail.championName),
      placement: detail.placement,
      trio: (own?.players ?? [])
        .filter((p) => !p.isSelf)
        .map(({ gameName, tagLine }) => ({ gameName, tagLine })),
      portraitUrl: champions.get(detail.championId)?.portraitUrl ?? null,
      championSlug: slugFor(champions, detail.championId, detail.championName),
      newFirst: firstWinIds(album).has(detail.matchId),
    },
    teams,
  };
}

// --- Textos ------------------------------------------------------------------------------

/** Duración de la partida en minutos redondeados (al menos 1): «25 min». */
export const formatDuration = (seconds: number) =>
  `${Math.max(1, Math.round(seconds / 60))} min`;

/** «con Player013 · Player115»: los nombres del trío, sin el tag (el `title` lo lleva entero). */
export function trioText(trio: readonly MatchMate[]): string {
  return trio.length === 0
    ? "sin compañeros"
    : `con ${trio.map((mate) => mate.gameName).join(" · ")}`;
}

/** «Player013#ANON · Player115#ANON»: el trío con tag completo (tooltip). */
export const trioTitle = (trio: readonly MatchMate[]) =>
  trio.map((mate) => `${mate.gameName}#${mate.tagLine}`).join(" · ");

/**
 * Nombre accesible de la fila (un enlace que abre o cierra la partida; el estado lo dice
 * `aria-expanded`): «Ahri, 1º, nuevo 1º con este campeón, con A y B, 25 min, hace 2 h».
 */
export function matchRowLabel(row: MatchRowData, nowMs: number): string {
  return [
    row.championName,
    `${row.placement}º`,
    row.newFirst ? "nuevo 1º con este campeón" : null,
    row.trio.length === 0
      ? null
      : `con ${row.trio.map((mate) => mate.gameName).join(" y ")}`,
    formatDuration(row.gameDuration),
    formatRelative(row.gameCreation, nowMs),
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/** «234 partidas con estos filtros · se muestran las 50 más recientes». */
export function matchCountText(
  total: number,
  shown: number,
  filtered: boolean,
): string {
  const count = `${formatDecimal(total, 0)} ${total === 1 ? "partida" : "partidas"}`;
  const head = filtered ? `${count} con estos filtros` : count;
  return shown < total
    ? `${head} · se muestran las ${formatDecimal(shown, 0)} más recientes`
    : head;
}

/** Cifra grande en compacto: `842`, `18,4 k`. */
export const compactNumber = (value: number) =>
  value < 1000
    ? formatDecimal(value, 0)
    : `${formatDecimal(value / 1000, 1)} k`;

/** `12/3/8`. */
export const kdaText = (p: Pick<MatchPlayer, "kills" | "deaths" | "assists">) =>
  `${p.kills}/${p.deaths}/${p.assists}`;

/** ¿Algún jugador tiene al menos un icono de `kind`? Si no, el detalle dice «sin datos de …». */
export const hasIcons = (
  detail: Pick<MatchDetailView, "teams">,
  kind: "augments" | "items",
) => detail.teams.some((team) => team.players.some((p) => p[kind].length > 0));

/** Rótulo accesible de un equipo del detalle: «1º puesto · tu equipo». */
export const teamLabel = (
  team: Pick<MatchTeamView, "placement" | "isOwnTeam">,
) => `${team.placement}º puesto${team.isOwnTeam ? " · tu equipo" : ""}`;
