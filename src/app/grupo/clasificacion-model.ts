// Presentación del bloque Clasificación (iter-09, T03) como funciones puras, sin React: filas de la
// tabla del ELO, cabeceras de los cambios del día y de la semana y la nota que explica la regla. El
// orden, las posiciones compartidas, el rating, la liga y el *provisional* vienen del dominio
// (`src/domain/elo.ts`, ya en `GroupView.elo`); los números de la nota salen de `config.ts`: aquí no
// se escribe ninguna cifra de la regla a mano.
//
// Las claves de `EloStanding.key` son claves de miembro (`GroupViewMember.key`), como en el resto
// de la vista del grupo.

import { type EloStanding, eloLeague, formatEloChange } from "@/domain/elo";
import type { DisplayedPeriod } from "@/domain/group-titles";
import {
  ELO_LEAGUE_MARGIN,
  ELO_LEAGUES,
  ELO_PLACEMENT_POINTS,
  ELO_PROVISIONAL_GAMES,
  ELO_START_RATING,
  ELO_STRANGER_MULTIPLIERS,
  ELO_STREAK_MULTIPLIERS,
} from "@/lib/config";
import { formatCount, formatDecimal } from "@/lib/format";
import type { MemberRef } from "./group-view-model";

/** Texto de un cambio de periodo: "+29" / "-14" / "0" o "—" si el miembro no jugó. */
export const NO_CHANGE_TEXT = "—";

export type ChangeTone = "up" | "down" | "flat" | "none";

export interface ChangeCell {
  text: string;
  /** `up` (suma), `down` (resta), `flat` (0 al redondear) o `none` (no jugó en el periodo). */
  tone: ChangeTone;
}

/** Cambio de un periodo para la celda: con signo y entero, "—" si no jugó. */
export function changeCell(change: number | null): ChangeCell {
  if (change === null) return { text: NO_CHANGE_TEXT, tone: "none" };
  const text = formatEloChange(change);
  if (text === "0") return { text, tone: "flat" };
  return { text, tone: text.startsWith("+") ? "up" : "down" };
}

export interface ClasificacionRow {
  key: string;
  member: MemberRef | null;
  /** `1`, `1`, `3`…: los empates de rating redondeado comparten posición. */
  position: number;
  leagueId: string;
  leagueName: string;
  /** Rating redondeado a entero, sin separador de miles ("1526"). */
  rating: string;
  day: ChangeCell;
  week: ChangeCell;
  games: string;
  provisional: boolean;
}

export function clasificacionRows(
  standings: readonly EloStanding[],
  members: ReadonlyMap<string, MemberRef>,
): ClasificacionRow[] {
  return standings.map((standing) => ({
    key: standing.key,
    member: members.get(standing.key) ?? null,
    position: standing.position,
    leagueId: standing.league.id,
    leagueName: standing.league.name,
    rating: String(standing.roundedRating),
    day: changeCell(standing.dayChange),
    week: changeCell(standing.weekChange),
    games: formatCount(standing.games),
    provisional: standing.provisional,
  }));
}

export interface ChangeHeader {
  /** Texto completo (lectores de pantalla y contenedores anchos). */
  label: string;
  /** Versión corta para contenedores estrechos; solo si el periodo es el actual. */
  short?: string;
  /** `true` si el periodo mostrado no es el actual: la cabecera lleva su fecha y puede partirse. */
  dated: boolean;
}

/**
 * Cabecera de una columna de cambio. Con el periodo actual, "Hoy" / "Semana" (como el selector del
 * bloque Hoy / Semana); si el mostrado es el último con partidas, con su fecha ("Día 29 sept",
 * "Sem. 21 sept – 27 sept"), la misma etiqueta que el bloque Hoy / Semana.
 */
export function changeHeader(period: DisplayedPeriod): ChangeHeader {
  if (period.isCurrent) {
    return period.kind === "day"
      ? { label: "Hoy", dated: false }
      : { label: "Semana", short: "Sem.", dated: false };
  }
  return {
    label: `${period.kind === "day" ? "Día" : "Sem."} ${period.label}`,
    dated: true,
  };
}

// --- Nota de la regla -------------------------------------------------------------------------

/** Número sin ceros de relleno (hasta 2 decimales): 12,5 · 1,1 · 0,85 · 2. */
function numberText(value: number): string {
  return Number.isInteger(value)
    ? formatCount(value)
    : formatDecimal(value, 2).replace(/0$/, "");
}

/**
 * Signo con el menos tipográfico (U+2212), como el resto de la prosa de la nota, y los decimales
 * de los puntos de F28: "+12,5", "−2,5", "+6".
 */
const signed = (value: number) =>
  `${value > 0 ? "+" : "−"}${numberText(Math.abs(value))}`;

/** Multiplicador sin ceros de relleno: 1,1 · 1,2 · 0,85 · 0,8 · 1,5 · 2. */
const multiplierText = numberText;

/** "1º +12,5 · 2º +6 · …" a partir de `ELO_PLACEMENT_POINTS`. */
export function placementPointsText(): string {
  return ELO_PLACEMENT_POINTS.map(
    (points, index) => `${index + 1}º ${signed(points)}`,
  ).join(" · ");
}

/** Una frase por número de desconocidos con multiplicador distinto de ×1 al ganar o al perder. */
export function strangerMultipliersText(): string {
  const parts: string[] = [];
  ELO_STRANGER_MULTIPLIERS.forEach(({ gain, loss }, strangers) => {
    if (strangers === 0 || (gain === 1 && loss === 1)) return;
    const noun = strangers === 1 ? "desconocido" : "desconocidos";
    parts.push(
      `${strangers} ${noun}: ×${multiplierText(gain)} al ganar y ×${multiplierText(loss)} al perder`,
    );
  });
  return parts.join("; ");
}

/**
 * Multiplicadores de racha (F28) distintos de ×1, a partir de `ELO_STREAK_MULTIPLIERS`: "2 primeros
 * seguidos: ×1,5; 3 o más: ×2". El último valor vale para esa racha o más larga.
 */
export function streakMultipliersText(): string {
  const last = ELO_STREAK_MULTIPLIERS.length - 1;
  const parts: string[] = [];
  ELO_STREAK_MULTIPLIERS.forEach((multiplier, streak) => {
    if (streak === 0 || multiplier === 1) return;
    const count =
      streak === last ? `${formatCount(streak)} o más` : formatCount(streak);
    parts.push(
      `${count}${parts.length === 0 ? " primeros seguidos" : ""}: ×${multiplierText(multiplier)}`,
    );
  });
  return parts.join("; ");
}

/**
 * Margen de las ligas (F28) con el ejemplo de la liga de salida y la de arriba, a partir de
 * `ELO_LEAGUE_MARGIN` y `ELO_LEAGUES`: "… (de Plata se pasa a Oro con 1520 y se vuelve con 1500)".
 */
export function leagueMarginText(): string {
  const margin = formatCount(ELO_LEAGUE_MARGIN);
  const start = eloLeague(ELO_START_RATING);
  const upper =
    ELO_LEAGUES[ELO_LEAGUES.findIndex((l) => l.id === start.id) + 1];
  const example = upper
    ? ` (de ${start.name} se pasa a ${upper.name} con ${String(upper.min + ELO_LEAGUE_MARGIN)} y se vuelve con ${String(upper.min - ELO_LEAGUE_MARGIN)})`
    : "";
  return `se sube al llegar ${margin} por encima del corte de la liga de arriba y se baja al quedarse ${margin} por debajo del de la tuya${example}`;
}

/** "Hierro < 1450 · Bronce 1450–1479 · … · Diamante ≥ 1570" a partir de `ELO_LEAGUES`. */
export function leaguesText(): string {
  return ELO_LEAGUES.map((league, index) => {
    const next = ELO_LEAGUES[index + 1];
    if (!next) return `${league.name} ≥ ${league.min}`;
    if (!Number.isFinite(league.min)) return `${league.name} < ${next.min}`;
    return `${league.name} ${league.min}–${next.min - 1}`;
  }).join(" · ");
}

export interface ClasificacionNote {
  /** Párrafos de la nota, en orden. */
  paragraphs: string[];
}

export function clasificacionNote(): ClasificacionNote {
  return {
    paragraphs: [
      `Todos empiezan la temporada en ${String(ELO_START_RATING)}. Cada partida de Arena suma o resta según el puesto (con ${String(ELO_START_RATING)}): ${placementPointsText()}. Cuanto más alto estás, un poco menos ganas y un poco más pierdes; por debajo, al revés.`,
      `Los compañeros de equipo que no son del grupo cuentan como desconocidos y cambian el resultado: ${strangerMultipliersText()}.`,
      `Los 1º seguidos tienen premio, solo en las partidas que suman (${streakMultipliersText()}). La racha sigue aunque cambie el día; cualquier otro puesto la corta.`,
      `Ligas por rating redondeado: ${leaguesText()}. Para que la liga no suba y baje en el mismo día hay margen: ${leagueMarginText()}. Con menos de ${formatCount(ELO_PROVISIONAL_GAMES)} partidas en la temporada, la fila es provisional. Solo cuenta la temporada actual.`,
    ],
  };
}
