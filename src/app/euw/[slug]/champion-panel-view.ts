// Decisiones de presentación del panel de campeón (brief §3.6, `?campeon=`) como funciones puras,
// sin React ni navegador: el slug de la URL, los datos que el servidor calcula solo con el panel
// abierto, las cifras, el texto del estado y los enlaces internos. El componente (`champion-panel.tsx`)
// solo las pinta.

import {
  type AlbumEntry,
  championSlug,
  type RecentGame,
  recentForm,
} from "@/domain/album";
import { NO_FIGURE, type ScoreboardFigure } from "@/domain/scoreboard";
import {
  computeSummary,
  PLACEMENTS,
  type Placement,
  type PlayerMatchRow,
} from "@/domain/stats";
import { formatDecimal, formatPercent, formatShortDate } from "@/lib/format";
import type { CardState } from "./album-view";
import { matchHref, withoutSearchParam, withSearchParam } from "./view-model";

// --- URL ---------------------------------------------------------------------------------

/** Parámetro que abre el panel sobre cualquier pestaña (`?campeon={slug}`). */
export const CHAMPION_PARAM = "campeon";

// El slug del campeón en la URL (`championSlug`) es del dominio del álbum; se reexporta aquí para
// que las vistas del panel sigan importándolo de su sitio de siempre.
export { championSlug };

/**
 * El campeón del álbum que corresponde a `?campeon`, sin distinguir mayúsculas. `null` si no
 * existe (o el valor viene vacío): entonces no se abre el panel.
 */
export function findChampionBySlug(
  album: readonly AlbumEntry[],
  slug: string,
): AlbumEntry | null {
  const needle = slug.trim().toLowerCase();
  if (needle === "") return null;
  return album.find((entry) => championSlug(entry) === needle) ?? null;
}

/** Abre el panel del campeón `slug` conservando el resto de la query (pestaña, filtros, partida…). */
export function championHref(
  pathname: string,
  search: string,
  slug: string,
): string {
  return withSearchParam(pathname, search, CHAMPION_PARAM, slug);
}

/** La misma URL sin `?campeon`: cerrar el panel. */
export function closeChampionHref(pathname: string, search: string): string {
  return withoutSearchParam(pathname, search, CHAMPION_PARAM);
}

/**
 * Enlace a una partida desde el panel. Va a la pestaña Partidas con esa partida abierta y sin
 * `?campeon`: el panel taparía justo la partida a la que se quiere llegar.
 */
export function panelMatchHref(
  pathname: string,
  search: string,
  matchId: string,
): string {
  const [path, query = ""] = closeChampionHref(pathname, search).split("?");
  return matchHref(path, query, matchId);
}

// --- Datos de la carga -------------------------------------------------------------------

/** Cuántas partidas recientes con el campeón trae el panel. */
export const RECENT_GAMES = 10;

/**
 * Lo que el servidor calcula solo con `?campeon` válido y viaja en `ProfileView.champion`. Las cifras
 * (partidas, 1º, top 3, puesto medio) ya vienen en el álbum; aquí van solo la distribución y las
 * últimas partidas, que el álbum no trae.
 */
export interface ChampionPanelData {
  championId: number;
  /** Partidas con el campeón por puesto (siempre las seis claves). */
  distribution: Record<Placement, number>;
  /** Las últimas `RECENT_GAMES` partidas con el campeón, la más reciente primero. */
  recent: RecentGame[];
}

const isPlacement = (value: number) =>
  (PLACEMENTS as readonly number[]).includes(value);

/** Datos del panel a partir de las filas del jugador (`stats.playerRows`), sin consultas nuevas. */
export function championPanelData(
  entry: Pick<AlbumEntry, "championId" | "name">,
  rows: readonly PlayerMatchRow[],
): ChampionPanelData {
  // Mismo criterio que el álbum: solo cuentan los puestos 1..6.
  const own = rows.filter(
    (row) => row.championId === entry.championId && isPlacement(row.placement),
  );
  return {
    championId: entry.championId,
    distribution: computeSummary(own).distribution,
    // El nombre de visualización es el del álbum, no el de la partida.
    recent: recentForm(own, RECENT_GAMES).map((game) => ({
      ...game,
      championName: entry.name,
    })),
  };
}

// --- Cifras y estado ---------------------------------------------------------------------

/**
 * Las cuatro cifras del panel: partidas, 1º, top 3 (0 decimales) y puesto medio (2 decimales). Sin
 * partidas solo «partidas» (`0`) es una cifra: el resto es `NO_FIGURE`, como en el marcador.
 */
export function championFigures(
  entry: Pick<AlbumEntry, "games" | "firsts" | "top3" | "avgPlacement">,
): ScoreboardFigure[] {
  const played = entry.games > 0;
  return [
    {
      key: "games",
      label: "partidas",
      value: formatDecimal(entry.games, 0),
      gold: false,
    },
    {
      key: "firsts",
      label: "1º",
      value: played ? formatDecimal(entry.firsts, 0) : NO_FIGURE,
      gold: true,
    },
    {
      key: "top3Rate",
      label: "top 3",
      value: played ? formatPercent(entry.top3 / entry.games, 0) : NO_FIGURE,
      gold: false,
    },
    {
      key: "avgPlacement",
      label: "puesto medio",
      value:
        entry.avgPlacement === null
          ? NO_FIGURE
          : formatDecimal(entry.avgPlacement),
      gold: false,
    },
  ];
}

export interface ChampionStatus {
  /** Lo principal, en negrita («Ganado · verificado ✓»). */
  label: string;
  /** Lo que le sigue tras un « · »; `null` si no hay. */
  detail: string | null;
  tone: "won" | "manual" | "neutral";
  /** Partida del primer 1º, para «ver partida» (solo en un verificado). */
  matchId: string | null;
}

/**
 * La línea de estado bajo el título. `state` es el efectivo (`effectiveState`: un verificado manda
 * sobre la marca manual). `nowMs` decide si la fecha lleva el año.
 */
export function championStatus(
  entry: Pick<
    AlbumEntry,
    "games" | "bestPlacement" | "firstWinAt" | "firstWinMatchId"
  >,
  state: CardState,
  nowMs: number,
): ChampionStatus {
  switch (state) {
    case "won":
      return {
        label: "Ganado · verificado ✓",
        detail:
          entry.firstWinAt === null
            ? null
            : `1º el ${formatShortDate(entry.firstWinAt, nowMs)}`,
        tone: "won",
        matchId: entry.firstWinMatchId,
      };
    case "manual":
      return {
        label: "Ganado a mano",
        detail:
          entry.games > 0
            ? "sin 1º en el historial"
            : "sin partidas esta temporada",
        tone: "manual",
        matchId: null,
      };
    case "played":
      return {
        label: "Jugado sin ganar",
        detail:
          entry.bestPlacement === null
            ? null
            : `mejor puesto ${entry.bestPlacement}º`,
        tone: "neutral",
        matchId: null,
      };
    case "none":
      return {
        label: "Sin jugar",
        detail: null,
        tone: "neutral",
        matchId: null,
      };
  }
}
