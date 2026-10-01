// Decisiones de presentación de los bloques Equipos y Temporada (iter-05, T06) como funciones
// puras, sin React ni navegador: filas de las tablas de Dúos y Tríos, formato de cada celda de la
// tabla de Temporada, orden por columna y enlaces a las partidas. Los componentes
// (`group-view.tsx`, `season-table.tsx`) solo las pintan. Las cifras y las reglas (columnas,
// líderes, orden) vienen de `group-season`: aquí no se redefine ninguna, solo se formatean con los
// mismos formateadores que usa el perfil del miembro (AC8: cada valor coincide con el del perfil).
//
// Este módulo lo importa un componente de cliente (`season-table.tsx`): solo depende de módulos
// puros (sin `server-only`). Los `puuid` de `SeasonRow`/`TeamStats` son CLAVES DE MIEMBRO
// (`GroupViewMember.key`), ver la cabecera de `src/domain/group-view.ts`.

import { matchHref } from "@/app/euw/[slug]/view-model";
import {
  defaultSortDirection,
  SEASON_COLUMN_BY_ID,
  type SeasonCell,
  type SeasonColumn,
  type SeasonColumnId,
  type SeasonRow,
  type SeasonTab,
  type SeasonTable,
  type SortDirection,
  seasonColumnsOf,
  sortSeasonRows,
} from "@/domain/group-season";
import { formatAvgPlacement, type TeamStats } from "@/domain/group-titles";
import { NO_FIGURE } from "@/domain/scoreboard";
import { formatCount, formatDecimal, formatPercent } from "@/lib/format";
import type { MemberRef } from "./group-view-model";

// --- Equipos de temporada (Dúos y Tríos) -----------------------------------------------------

export interface SeasonTeamRow {
  key: string;
  /** Miembros del equipo (2 o 3), en el orden de `TeamStats.puuids`. */
  members: (MemberRef | null)[];
  games: number;
  firsts: number;
  /** `18,4 %`: el mismo formato que el % de 1º del marcador del perfil. */
  firstRate: string;
  /** `2,33`. */
  avgPlacement: string;
}

/**
 * Filas de una tabla de equipos de temporada, **en el orden que da el dominio**
 * (`computeSeasonTeams`: más partidas juntos; desempate estable). Ya vienen filtradas por el
 * mínimo de partidas juntos: aquí no se reordena ni se vuelve a filtrar.
 */
export function seasonTeamRows(
  teams: readonly TeamStats[],
  members: ReadonlyMap<string, MemberRef>,
): SeasonTeamRow[] {
  return teams.map((team) => ({
    key: team.key,
    members: team.puuids.map((key) => members.get(key) ?? null),
    games: team.games,
    firsts: team.firsts,
    firstRate: formatPercent(team.firstRate),
    avgPlacement: formatAvgPlacement(team.avgPlacement),
  }));
}

// --- Pestañas ---------------------------------------------------------------------------------

export const SEASON_TABS: readonly { id: SeasonTab; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "records", label: "Récords" },
];

// --- Orden ------------------------------------------------------------------------------------

/** Orden activo de la tabla; `null` es el orden de los miembros (el del grupo). */
export interface SeasonSort {
  columnId: SeasonColumnId;
  direction: SortDirection;
}

/**
 * Orden tras pulsar la cabecera de `columnId`: una columna nueva empieza por su sentido de líder
 * (`defaultSortDirection`: el mejor primero) y pulsar la activa invierte el sentido.
 */
export function nextSort(
  current: SeasonSort | null,
  columnId: SeasonColumnId,
): SeasonSort {
  if (current?.columnId === columnId) {
    return {
      columnId,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return {
    columnId,
    direction: defaultSortDirection(SEASON_COLUMN_BY_ID[columnId]),
  };
}

export type AriaSort = "ascending" | "descending" | "none";

/** `aria-sort` de la cabecera de `columnId`. */
export function ariaSortOf(
  sort: SeasonSort | null,
  columnId: SeasonColumnId,
): AriaSort {
  if (sort?.columnId !== columnId) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

// --- Celdas -----------------------------------------------------------------------------------

/** Una celda lista para pintar. */
export interface SeasonCellModel {
  /** Texto principal ya formateado; `—` sin dato. */
  text: string;
  /** Segunda línea pequeña: el campeón del récord ("Ahri") o los 1º del campeón ("4 × 1º"). */
  detail: string | null;
  /** Destino del enlace a la partida del récord (en el perfil de su dueño); `null` si no enlaza. */
  href: string | null;
  /** `true` si el miembro lidera la columna (en empate, todos los empatados). */
  leader: boolean;
}

/** Enlace a una partida en el perfil de su dueño: `/euw/<slug>?tab=partidas&partida=<matchId>`. */
export function seasonMatchHref(slug: string, matchId: string): string {
  return matchHref(`/euw/${slug}`, "", matchId);
}

/**
 * Formato de cada columna, tomado del perfil del miembro:
 * - partidas y 1º: `formatDecimal(n, 0)`, como el marcador (`scoreboardFigures`);
 * - % de 1º: `formatPercent` con 1 decimal, como el marcador;
 * - puesto medio: `formatAvgPlacement` (2 decimales), como el marcador y Estadísticas;
 * - victorias a la primera y su %: `formatCount` y `formatPercent` (1 decimal), como `firstTryModel`;
 * - récords y rachas: `formatCount`, como las tarjetas de Estadísticas;
 * - campeones ganados: el entero de la barra de Deidad / Dios de Arena.
 */
function formatValue(columnId: SeasonColumnId, value: number): string {
  switch (columnId) {
    case "games":
    case "firsts":
      return formatDecimal(value, 0);
    case "firstRate":
    case "firstTryRate":
      return formatPercent(value);
    case "avgPlacement":
      return formatAvgPlacement(value);
    default:
      return formatCount(value);
  }
}

/** La celda de `cell` en la columna `columnId` del miembro `member` (que da el slug del enlace). */
export function seasonCellModel(
  columnId: SeasonColumnId,
  cell: SeasonCell,
  member: MemberRef | null,
  leader: boolean,
): SeasonCellModel {
  if (cell.value === null) {
    return { text: NO_FIGURE, detail: null, href: null, leader: false };
  }
  const href =
    cell.matchId !== null && member
      ? seasonMatchHref(member.slug, cell.matchId)
      : null;
  if (columnId === "topChampion") {
    // `value` son los 1º del campeón; el campeón es lo que se lee primero.
    return {
      text: cell.championName ?? NO_FIGURE,
      detail: `${formatCount(cell.value)} × 1º`,
      href,
      leader,
    };
  }
  return {
    text: formatValue(columnId, cell.value),
    // Solo los récords de una partida traen campeón (en las rachas es `null`).
    detail: cell.championName,
    href,
    leader,
  };
}

// --- Modelo de la tabla -----------------------------------------------------------------------

export interface SeasonColumnModel {
  id: SeasonColumnId;
  label: string;
  ariaSort: AriaSort;
}

export interface SeasonRowModel {
  /** Clave del miembro. */
  key: string;
  member: MemberRef | null;
  cells: Record<string, SeasonCellModel>;
}

export interface SeasonTableModel {
  columns: SeasonColumnModel[];
  rows: SeasonRowModel[];
}

/**
 * La tabla de una pestaña lista para pintar: sus columnas con `aria-sort` y una fila por miembro,
 * ordenada por `sort` (`null`: el orden de los miembros) con `sortSeasonRows` y con el líder de
 * cada columna marcado (`table.leaders`).
 */
export function seasonTableModel(
  table: SeasonTable,
  members: ReadonlyMap<string, MemberRef>,
  tab: SeasonTab,
  sort: SeasonSort | null,
): SeasonTableModel {
  const columns: SeasonColumn[] = seasonColumnsOf(tab);
  // Un orden de la otra pestaña no existe aquí: se ignora.
  const active =
    sort && columns.some((c) => c.id === sort.columnId) ? sort : null;
  const rows: readonly SeasonRow[] = active
    ? sortSeasonRows(table.rows, active.columnId, active.direction)
    : table.rows;
  return {
    columns: columns.map((column) => ({
      id: column.id,
      label: column.label,
      ariaSort: ariaSortOf(active, column.id),
    })),
    rows: rows.map((row) => {
      const member = members.get(row.puuid) ?? null;
      const cells: Record<string, SeasonCellModel> = {};
      for (const column of columns) {
        cells[column.id] = seasonCellModel(
          column.id,
          row.cells[column.id],
          member,
          table.leaders[column.id].includes(row.puuid),
        );
      }
      return { key: row.puuid, member, cells };
    }),
  };
}
