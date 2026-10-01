// Decisiones de presentación de la vista del grupo (iter-05, T05) como funciones puras, sin React ni
// navegador: el parámetro del selector Hoy / Semana y su enlace, los textos del periodo, las filas
// del ranking y de los títulos y el contenido del apartado Títulos. Los componentes
// (`group-view.tsx`…) solo las pintan. Las cifras y reglas vienen del dominio (`group-titles`,
// `config.ts`): aquí no se redefine ninguna, solo se formatean con los mismos formateadores que
// usan los textos de "por qué" de los títulos (AC5: el valor de la tabla y el de la explicación
// coinciden por construcción).
//
// Los `puuid`/`puuids` que salen del dominio son CLAVES DE MIEMBRO (`GroupViewMember.key`), no
// puuids: ver la cabecera de `src/domain/group-view.ts`.

import {
  type AwardedTitle,
  formatAvgDamage,
  formatAvgPlacement,
  type GroupPeriodView,
  type PeriodKind,
  type PeriodRanking,
  type TeamStats,
  TITLE_DEFINITIONS,
  TITLE_RULES,
  type TitleDefinition,
  type TitleMetric,
  titleName,
} from "@/domain/group-titles";
import { GROUP_TEAM_MIN_GAMES } from "@/lib/config";
import { formatCount } from "@/lib/format";

/** Miembro tal como lo necesita la vista (subconjunto de `GroupViewMember`). */
export interface MemberRef {
  key: string;
  gameName: string;
  tagLine: string;
  slug: string;
}

// --- Selector Hoy / Semana (estado en la URL) -------------------------------------------------

/**
 * Parámetro de la URL que guarda el periodo mostrado. Propio y distinto de `?tab` para convivir
 * con las pestañas del perfil (`?tab=grupo&periodo=semana`).
 */
export const PERIODO_PARAM = "periodo";

export const PERIODOS = ["dia", "semana"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const DEFAULT_PERIODO: Periodo = "dia";

/** Etiqueta del selector. */
export const PERIODO_LABEL: Record<Periodo, string> = {
  dia: "Hoy",
  semana: "Semana",
};

export const PERIODO_KIND: Record<Periodo, PeriodKind> = {
  dia: "day",
  semana: "week",
};

/** `?periodo=` -> periodo; cualquier otro valor (o ninguno, o varios) es el día. */
export function parsePeriodo(value: string | string[] | null | undefined) {
  return PERIODOS.find((p) => p === value) ?? DEFAULT_PERIODO;
}

/**
 * Enlace al periodo `periodo` sobre la URL actual: cambia `?periodo` y conserva el resto
 * (`?tab=grupo`, `?campeon`…). El periodo por defecto no deja parámetro (URL limpia).
 */
export function periodoHref(
  pathname: string,
  search: string,
  periodo: Periodo,
): string {
  const params = new URLSearchParams(search);
  if (periodo === DEFAULT_PERIODO) params.delete(PERIODO_PARAM);
  else params.set(PERIODO_PARAM, periodo);
  const query = params.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

// --- Textos del periodo -----------------------------------------------------------------------

/**
 * Aviso de fecha cuando el periodo mostrado no es el actual (AC2): "Último día jugado: 29 sept" o
 * "Última semana jugada: 21 sept – 27 sept". `null` si es el actual.
 */
export function periodNotice(period: GroupPeriodView["period"]): string | null {
  if (period.isCurrent) return null;
  return period.kind === "day"
    ? `Último día jugado: ${period.label}`
    : `Última semana jugada: ${period.label}`;
}

/** Texto bajo el selector: qué periodo se está viendo (siempre con su fecha). */
export function periodCaption(period: GroupPeriodView["period"]): string {
  const name = period.kind === "day" ? "Día" : "Semana";
  return `${name}: ${period.label}`;
}

/** El mínimo de partidas del ranking, en texto: "3 partidas" / "5 partidas". */
export function minimumLabel(minGames: number): string {
  return `${formatCount(minGames)} partidas`;
}

const gamesText = (games: number) =>
  `${formatCount(games)} ${games === 1 ? "partida" : "partidas"}`;

// --- Ranking ----------------------------------------------------------------------------------

export interface RankingRow {
  key: string;
  member: MemberRef | null;
  /** `1`, `1`, `3`…: los empates comparten posición. */
  position: number;
  games: number;
  firsts: number;
  avgPlacement: string;
  avgDamage: string;
}

export interface BelowMinimumRow {
  key: string;
  member: MemberRef | null;
  games: number;
  /** "2 partidas". */
  gamesText: string;
}

export interface RankingModel {
  rows: RankingRow[];
  belowMinimum: BelowMinimumRow[];
  /** `true` si ningún miembro ha jugado en el periodo (ni con ni sin mínimo). */
  empty: boolean;
}

export function memberMap(
  members: readonly MemberRef[],
): ReadonlyMap<string, MemberRef> {
  return new Map(members.map((m) => [m.key, m]));
}

/** Filas del ranking del periodo: las cifras con los formateadores de los textos de "por qué". */
export function rankingModel(
  ranking: PeriodRanking,
  members: ReadonlyMap<string, MemberRef>,
): RankingModel {
  return {
    rows: ranking.ranked.map((entry) => ({
      key: entry.puuid,
      member: members.get(entry.puuid) ?? null,
      position: entry.position,
      games: entry.games,
      firsts: entry.firsts,
      avgPlacement: formatAvgPlacement(entry.avgPlacement),
      avgDamage: formatAvgDamage(entry.avgDamage),
    })),
    belowMinimum: ranking.belowMinimum.map((entry) => ({
      key: entry.puuid,
      member: members.get(entry.puuid) ?? null,
      games: entry.games,
      gamesText: gamesText(entry.games),
    })),
    empty: ranking.ranked.length === 0 && ranking.belowMinimum.length === 0,
  };
}

// --- Dúos y tríos del periodo -----------------------------------------------------------------

export interface TeamRow {
  key: string;
  kind: "duo" | "trio";
  members: (MemberRef | null)[];
  games: number;
  firsts: number;
  avgPlacement: string;
}

/**
 * Dúos y tríos del periodo con el mínimo de partidas juntos (`GROUP_TEAM_MIN_GAMES`), por partidas
 * descendente (a igual, tríos antes que dúos y después por clave: orden estable). Es la tabla en
 * la que aparecen los valores de los títulos de dúo y de trío.
 */
export function teamRows(
  teams: { duos: readonly TeamStats[]; trios: readonly TeamStats[] },
  members: ReadonlyMap<string, MemberRef>,
): TeamRow[] {
  const toRow = (kind: TeamRow["kind"], team: TeamStats): TeamRow => ({
    key: team.key,
    kind,
    members: team.puuids.map((key) => members.get(key) ?? null),
    games: team.games,
    firsts: team.firsts,
    avgPlacement: formatAvgPlacement(team.avgPlacement),
  });
  return [
    ...teams.trios.map((t) => toRow("trio", t)),
    ...teams.duos.map((t) => toRow("duo", t)),
  ]
    .filter((row) => row.games >= GROUP_TEAM_MIN_GAMES)
    .sort(
      (a, b) =>
        b.games - a.games ||
        (a.kind === b.kind ? 0 : a.kind === "trio" ? -1 : 1) ||
        a.key.localeCompare(b.key),
    );
}

// --- Títulos del periodo ----------------------------------------------------------------------

export interface TitleHolderRow {
  /** Clave de lista: título + poseedor. */
  key: string;
  /** Miembros que llevan el título (1 jugador, 2 de un dúo o 3 de un trío). */
  members: (MemberRef | null)[];
  /** El valor de la métrica del título, formateado como en las tablas: "4,60", "12.346", "3". */
  value: string;
  /** El valor con su unidad para mostrarlo junto al nombre: "4,60", "12.346", "3 primeros". */
  valueText: string;
  /** "5 partidas". */
  gamesText: string;
  /** Explicación completa (métrica, valor y partidas): lo que dice el `Badge`. */
  why: string;
}

export interface TitleRow {
  id: AwardedTitle["id"];
  kind: PeriodKind;
  /** Nombre visible con el periodo: "El trol del día". */
  name: string;
  holders: TitleHolderRow[];
}

/** Valor de la métrica del título con el mismo formato que la tabla donde aparece. */
export function metricValue(metric: TitleMetric, value: number): string {
  switch (metric) {
    case "avgPlacement":
      return formatAvgPlacement(value);
    case "avgDamage":
      return formatAvgDamage(value);
    case "firsts":
      return formatCount(value);
  }
}

/** `metricValue` con su unidad cuando el número solo no se entiende ("1 primero"). */
export function metricValueText(metric: TitleMetric, value: number): string {
  return metric === "firsts"
    ? `${metricValue(metric, value)} ${value === 1 ? "primero" : "primeros"}`
    : metricValue(metric, value);
}

/** Los títulos del periodo, en el orden de `TITLE_DEFINITIONS`, con sus poseedores. */
export function titleRows(
  titles: readonly AwardedTitle[],
  members: ReadonlyMap<string, MemberRef>,
): TitleRow[] {
  return titles.map((title) => ({
    id: title.id,
    kind: title.kind,
    name: title.name,
    holders: title.holders.map((holder) => ({
      key: `${title.id}-${holder.puuids.join(",")}`,
      members: holder.puuids.map((key) => members.get(key) ?? null),
      value: metricValue(title.metric, holder.value),
      valueText: metricValueText(title.metric, holder.value),
      gamesText: gamesText(holder.games),
      why: holder.why,
    })),
  }));
}

// --- Apartado Títulos -------------------------------------------------------------------------

/** Ancla del apartado Títulos: a ella enlaza la explicación de cada título (`/grupo#titulos`). */
export const TITLES_ANCHOR = "titulos";

/** Texto del enlace de la explicación de un título. */
export const TITLES_LINK_LABEL = "Cómo funcionan los títulos";

export interface TitleGuideRow {
  id: TitleDefinition["id"];
  /** "El trol". */
  name: string;
  /** Qué mide. */
  measures: string;
  /** Sus periodos con el nombre visible: ["El trol del día", "El trol de la semana"]. */
  periods: string[];
  /** El mínimo, con las cifras de `config.ts`. */
  minimum: string;
}

export interface TitlesGuide {
  titles: TitleGuideRow[];
  /** Reglas comunes (competencia, empates, cortes del día y de la semana). */
  rules: readonly string[];
}

/** Contenido fijo del apartado Títulos: los 7 títulos y las reglas comunes (todo del dominio). */
export function titlesGuide(): TitlesGuide {
  return {
    titles: TITLE_DEFINITIONS.map((def) => ({
      id: def.id,
      name: def.name,
      measures: def.description,
      periods: def.periods.map((kind) => titleName(def.id, kind)),
      minimum: def.minimumText,
    })),
    rules: TITLE_RULES,
  };
}
