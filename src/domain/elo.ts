// ELO interno de Arena de los miembros del grupo (iter-09, F24, F25). Funciones puras (sin BD,
// sin red y sin React) sobre las partidas de los miembros, ya filtradas por temporada y cola:
// rating de cada miembro, desglose de cada partida, liga, *provisional*, cambio del día y de la
// semana y orden de la Clasificación. Como en el resto del dominio, solo cuentan los puestos
// 1..6: una fila con un puesto fuera de rango se ignora.
//
// Nada se guarda: el rating se recalcula al leer (P9). Las claves de miembro (`puuid` en
// `GroupMatchRow`) son identificadores internos: no se muestran en la UI ni van en URLs.

import {
  ELO_LEAGUES,
  ELO_PLACEMENT_POINTS,
  ELO_PROVISIONAL_GAMES,
  ELO_SCALE,
  ELO_SLOPE,
  ELO_START_RATING,
  ELO_STRANGER_MULTIPLIERS,
} from "@/lib/config";
import { formatCount, formatDecimal } from "@/lib/format";
import {
  type DisplayedPeriod,
  displayedPeriod,
  type GroupMatchRow,
  periodKey,
} from "./group-titles";
import { PLACEMENTS } from "./stats";

const isPlacement = (value: number) =>
  (PLACEMENTS as readonly number[]).includes(value);

/** Tamaño de un equipo de Arena tríos. */
const TEAM_SIZE = 3;

// ---------------------------------------------------------------------------------------------
// Cambio de una partida (F24)
// ---------------------------------------------------------------------------------------------

/** Esperanza de un rating: `E = 1 / (1 + 10^((1500 − R) / 400))`; 0,5 con R = 1500. */
export function eloExpected(rating: number): number {
  return 1 / (1 + 10 ** ((ELO_START_RATING - rating) / ELO_SCALE));
}

/**
 * Cambio base de una partida: `puntos[puesto] − 44·(E − 0,5)`, con R el rating **antes** de la
 * partida. Con R = 1500 son exactamente los puntos del puesto.
 */
export function eloBaseChange(placement: number, ratingBefore: number): number {
  const points = ELO_PLACEMENT_POINTS[placement - 1];
  if (points === undefined || !isPlacement(placement)) {
    throw new Error(`Puesto fuera de 1..6: ${placement}`);
  }
  return points - ELO_SLOPE * (eloExpected(ratingBefore) - 0.5);
}

/**
 * Desconocidos de un miembro en una partida: `3 − miembros en su equipo` (él incluido), acotado
 * a 0..2.
 */
export function eloStrangers(membersInTeam: number): number {
  return Math.min(TEAM_SIZE - 1, Math.max(0, TEAM_SIZE - membersInTeam));
}

/**
 * Multiplicador por desconocidos (0..2): el de ganancia si el cambio base es positivo, el de
 * pérdida si es negativo y 1 si es 0.
 */
export function eloMultiplier(base: number, strangers: number): number {
  if (base === 0) return 1;
  const index = Math.min(TEAM_SIZE - 1, Math.max(0, strangers));
  const multipliers = ELO_STRANGER_MULTIPLIERS[index];
  return base > 0 ? multipliers.gain : multipliers.loss;
}

export interface EloChange {
  /** Cambio base (con la pendiente): no es la tabla de puntos salvo con R = 1500. */
  base: number;
  multiplier: number;
  /** Cambio final: `base × multiplier`. */
  delta: number;
}

/** Cambio de una partida a partir del puesto, el rating previo y los desconocidos. */
export function eloMatchChange(
  placement: number,
  ratingBefore: number,
  strangers: number,
): EloChange {
  const base = eloBaseChange(placement, ratingBefore);
  const multiplier = eloMultiplier(base, strangers);
  return { base, multiplier, delta: base * multiplier };
}

// ---------------------------------------------------------------------------------------------
// Ligas (F25)
// ---------------------------------------------------------------------------------------------

export type EloLeague = (typeof ELO_LEAGUES)[number];
export type EloLeagueId = EloLeague["id"];

/** Rating mostrado: el rating con decimales redondeado a entero (`Math.round`). */
export function roundRating(rating: number): number {
  return Math.round(rating);
}

/** Liga de un rating, decidida por el rating **redondeado** (1449,4 → Hierro; 1449,5 → Bronce). */
export function eloLeague(rating: number): EloLeague {
  const rounded = roundRating(rating);
  let league: EloLeague = ELO_LEAGUES[0];
  for (const candidate of ELO_LEAGUES) {
    if (rounded >= candidate.min) league = candidate;
  }
  return league;
}

// ---------------------------------------------------------------------------------------------
// Rating del grupo
// ---------------------------------------------------------------------------------------------

/** Una partida que cuenta para el rating de un miembro, con su desglose. */
export interface EloMatch {
  matchId: string;
  /** Epoch en ms del inicio de la partida. */
  gameStartTimestamp: number;
  placement: number;
  /** Compañeros de equipo que no son miembros del grupo (0..2). */
  strangers: number;
  base: number;
  multiplier: number;
  delta: number;
  ratingBefore: number;
  ratingAfter: number;
}

export interface EloMember {
  /** Clave del miembro (la `puuid` de sus filas). Interna: no exponer en UI ni URLs. */
  key: string;
  /** Rating con decimales: manda para el orden y los cálculos. */
  rating: number;
  /** Rating mostrado (`Math.round`). */
  roundedRating: number;
  /** Partidas de la temporada que cuentan para el rating. */
  games: number;
  /** Menos de `ELO_PROVISIONAL_GAMES` partidas. */
  provisional: boolean;
  /** Liga por el rating redondeado. */
  league: EloLeague;
  /** Partidas en orden cronológico, con su desglose. */
  history: EloMatch[];
  /** Suma de `delta` de sus partidas en el día mostrado; `null` si no jugó en él. */
  dayChange: number | null;
  /** Suma de `delta` de sus partidas en la semana mostrada; `null` si no jugó en ella. */
  weekChange: number | null;
}

export interface EloStanding extends EloMember {
  /** Posición 1..n en la Clasificación; los empates de rating redondeado la comparten (1, 1, 3). */
  position: number;
}

export interface GroupElo {
  /** Clasificación: todos los miembros, por rating (con decimales) de mayor a menor. */
  standings: EloStanding[];
  /** Día que muestra el bloque Hoy / Semana (`displayedPeriod`): el del cambio del día. */
  day: DisplayedPeriod;
  /** Semana que muestra el bloque Hoy / Semana: la del cambio de la semana. */
  week: DisplayedPeriod;
}

/** Orden cronológico: `gameStartTimestamp` y, a igualdad, `matchId` (comparación de texto). */
function chronological(a: GroupMatchRow, b: GroupMatchRow): number {
  if (a.gameStartTimestamp !== b.gameStartTimestamp) {
    return a.gameStartTimestamp - b.gameStartTimestamp;
  }
  if (a.matchId === b.matchId) return 0;
  return a.matchId < b.matchId ? -1 : 1;
}

/** Suma de `delta` de las partidas del periodo; `null` si no hay ninguna. */
function periodChange(
  history: readonly EloMatch[],
  period: DisplayedPeriod,
): number | null {
  let sum: number | null = null;
  for (const match of history) {
    if (periodKey(period.kind, match.gameStartTimestamp) === period.key) {
      sum = (sum ?? 0) + match.delta;
    }
  }
  return sum;
}

/**
 * ELO del grupo a partir de las partidas de los miembros (`rows`, ya filtradas a temporada y
 * colas) y de **todos** los miembros (`memberKeys`, también los que no tienen partidas: entran con
 * 1500, provisionales).
 *
 * - Las filas con puesto fuera de 1..6 y las de claves que no están en `memberKeys` se ignoran
 *   (un no miembro es un desconocido, no un miembro).
 * - Por cada partida, en orden cronológico, cada miembro usa su rating **antes** de ella: ninguno
 *   ve el cambio de otro en la misma partida. Los desconocidos se cuentan por las filas de miembros
 *   con el mismo `matchId` y `playerSubteamId`; miembros en equipos rivales puntúan cada uno por
 *   su puesto, sin trato especial.
 * - El cambio del día y de la semana se suma sobre el periodo de `displayedPeriod(rows, now, …)`,
 *   el mismo que muestra el bloque Hoy / Semana.
 */
export function computeGroupElo(
  rows: readonly GroupMatchRow[],
  memberKeys: readonly string[],
  now: number,
): GroupElo {
  const members = new Set(memberKeys);
  const counted = rows
    .filter((row) => members.has(row.puuid) && isPlacement(row.placement))
    .sort(chronological);

  const membersInTeam = new Map<string, number>();
  const teamKey = (row: GroupMatchRow) =>
    `${row.matchId}\u0000${row.playerSubteamId}`;
  for (const row of counted) {
    membersInTeam.set(teamKey(row), (membersInTeam.get(teamKey(row)) ?? 0) + 1);
  }

  const ratings = new Map<string, number>();
  const histories = new Map<string, EloMatch[]>();
  for (const key of members) {
    ratings.set(key, ELO_START_RATING);
    histories.set(key, []);
  }

  // Cada fila solo toca el rating de su miembro, así que procesarlas en orden cronológico basta
  // para que todos los de una partida usen su rating previo.
  for (const row of counted) {
    const ratingBefore = ratings.get(row.puuid) ?? ELO_START_RATING;
    const strangers = eloStrangers(membersInTeam.get(teamKey(row)) ?? 1);
    const change = eloMatchChange(row.placement, ratingBefore, strangers);
    const ratingAfter = ratingBefore + change.delta;
    ratings.set(row.puuid, ratingAfter);
    histories.get(row.puuid)?.push({
      matchId: row.matchId,
      gameStartTimestamp: row.gameStartTimestamp,
      placement: row.placement,
      strangers,
      ...change,
      ratingBefore,
      ratingAfter,
    });
  }

  const day = displayedPeriod(rows, now, "day");
  const week = displayedPeriod(rows, now, "week");

  const sorted = [...members]
    .map((key): EloMember => {
      const rating = ratings.get(key) ?? ELO_START_RATING;
      const history = histories.get(key) ?? [];
      return {
        key,
        rating,
        roundedRating: roundRating(rating),
        games: history.length,
        provisional: history.length < ELO_PROVISIONAL_GAMES,
        league: eloLeague(rating),
        history,
        dayChange: periodChange(history, day),
        weekChange: periodChange(history, week),
      };
    })
    .sort((a, b) => b.rating - a.rating || a.key.localeCompare(b.key));

  const standings: EloStanding[] = [];
  sorted.forEach((member, index) => {
    const previous = standings[index - 1];
    const position =
      previous && previous.roundedRating === member.roundedRating
        ? previous.position
        : index + 1;
    standings.push({ ...member, position });
  });

  return { standings, day, week };
}

// ---------------------------------------------------------------------------------------------
// Formato para la UI
// ---------------------------------------------------------------------------------------------

/** Redondeo simétrico (la mitad se aleja de 0): −14,5 → −15, como +14,5 → +15. */
function roundHalfAway(value: number, digits: number): number {
  const factor = 10 ** digits;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
}

/** Cambio con signo redondeado a entero: "+29", "-14", "0". */
export function formatEloChange(delta: number): string {
  const rounded = roundHalfAway(delta, 0);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "-"}${formatCount(Math.abs(rounded))}`;
}

/**
 * Cambio con signo y un decimal solo si no es entero (redondeado a una cifra): "+26,9", "-2,5",
 * "+25", "0". Para el desglose de una partida.
 */
export function formatEloChangeDetailed(delta: number): string {
  const rounded = roundHalfAway(delta, 1);
  if (rounded === 0) return "0";
  const abs = Math.abs(rounded);
  const text = Number.isInteger(abs) ? formatCount(abs) : formatDecimal(abs, 1);
  return `${rounded > 0 ? "+" : "-"}${text}`;
}
