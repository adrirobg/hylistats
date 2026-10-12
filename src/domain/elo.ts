// ELO interno de Arena de los miembros del grupo (iter-09, F24, F25; iter-12, F28). Funciones
// puras (sin BD, sin red y sin React) sobre las partidas de los miembros, ya filtradas por
// temporada y cola: rating de cada miembro, desglose de cada partida (con la racha de 1º seguidos),
// liga con margen, *provisional*, cambio del día y de la semana y orden de la Clasificación. Como
// en el resto del dominio, solo cuentan los puestos 1..6: una fila con un puesto fuera de rango se
// ignora.
//
// F28 estabiliza el rating: los puntos y la pendiente van a la mitad, los multiplicadores por
// desconocidos se suavizan, un 1º tras otro multiplica la ganancia (racha) y la liga solo cambia
// al pasar el corte con un margen (`ELO_LEAGUE_MARGIN`).
//
// Nada se guarda: el rating se recalcula al leer (P9). Las claves de miembro (`puuid` en
// `GroupMatchRow`) son identificadores internos: no se muestran en la UI ni van en URLs.

import {
  ELO_LEAGUE_MARGIN,
  ELO_LEAGUES,
  ELO_PLACEMENT_POINTS,
  ELO_PROVISIONAL_GAMES,
  ELO_SCALE,
  ELO_SLOPE,
  ELO_START_RATING,
  ELO_STRANGER_MULTIPLIERS,
  ELO_STREAK_MULTIPLIERS,
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
// Cambio de una partida (F24, F28)
// ---------------------------------------------------------------------------------------------

/** Esperanza de un rating: `E = 1 / (1 + 10^((1500 − R) / 400))`; 0,5 con R = 1500. */
export function eloExpected(rating: number): number {
  return 1 / (1 + 10 ** ((ELO_START_RATING - rating) / ELO_SCALE));
}

/**
 * Cambio base de una partida: `puntos[puesto] − 22·(E − 0,5)`, con R el rating **antes** de la
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

/**
 * Multiplicador de racha (F28) para `streak` 1º seguidos con la partida actual incluida: 1 → ×1,
 * 2 → ×1,5, 3 o más → ×2 (`ELO_STREAK_MULTIPLIERS`, con tope en el último valor). Sin racha
 * (0 o menos) es 1.
 */
export function eloStreakMultiplier(streak: number): number {
  if (streak <= 0) return 1;
  const index = Math.min(ELO_STREAK_MULTIPLIERS.length - 1, streak);
  return ELO_STREAK_MULTIPLIERS[index] ?? 1;
}

export interface EloChange {
  /** Cambio base (con la pendiente): no es la tabla de puntos salvo con R = 1500. */
  base: number;
  /** Multiplicador por desconocidos. */
  multiplier: number;
  /**
   * Multiplicador de racha (F28): el de `eloStreakMultiplier` si `base × multiplier` es positivo;
   * si no, 1.
   */
  streakMultiplier: number;
  /** Cambio final: `base × multiplier × streakMultiplier`. */
  delta: number;
}

/**
 * Cambio de una partida a partir del puesto, el rating previo, los desconocidos y la racha
 * (`streak`, 1º seguidos con esta partida; 0 si no es 1º).
 */
export function eloMatchChange(
  placement: number,
  ratingBefore: number,
  strangers: number,
  streak = 0,
): EloChange {
  const base = eloBaseChange(placement, ratingBefore);
  const multiplier = eloMultiplier(base, strangers);
  const streakMultiplier =
    base * multiplier > 0 ? eloStreakMultiplier(streak) : 1;
  return {
    base,
    multiplier,
    streakMultiplier,
    delta: base * multiplier * streakMultiplier,
  };
}

// ---------------------------------------------------------------------------------------------
// Ligas (F25, margen de F28)
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

/**
 * Liga tras una partida con margen (F28), sobre el rating **redondeado**: desde `current`, sube
 * mientras haya liga superior y el rating llegue a su `min + ELO_LEAGUE_MARGIN`, y baja mientras
 * se quede en el `min` de la actual `− ELO_LEAGUE_MARGIN` o por debajo. Puede saltar varias ligas;
 * Hierro no tiene suelo y Diamante no tiene techo. Con margen, Plata → Oro al llegar a 1520 y
 * Oro → Plata al llegar a 1500.
 */
export function eloLeagueStep(current: EloLeague, rating: number): EloLeague {
  const rounded = roundRating(rating);
  let index = ELO_LEAGUES.findIndex((league) => league.id === current.id);
  for (;;) {
    const upper = ELO_LEAGUES[index + 1];
    if (!upper || rounded < upper.min + ELO_LEAGUE_MARGIN) break;
    index += 1;
  }
  while (rounded <= ELO_LEAGUES[index].min - ELO_LEAGUE_MARGIN) index -= 1;
  return ELO_LEAGUES[index];
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
  /**
   * 1º seguidos del miembro con esta partida incluida (F28); 0 si no es 1º. Cuenta sus partidas
   * en orden cronológico y no se corta al cambiar de día.
   */
  streak: number;
  base: number;
  /** Multiplicador por desconocidos. */
  multiplier: number;
  /** Multiplicador de racha (F28): 1 si no hay racha o si el cambio tras los desconocidos no es positivo. */
  streakMultiplier: number;
  /** `base × multiplier × streakMultiplier`. */
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
  /**
   * Liga con margen (F28): la de `eloLeagueStep` tras cada partida de su historial, desde Plata
   * (la de 1500). Puede no coincidir con `eloLeague(rating)` mientras el rating esté en el margen.
   */
  league: EloLeague;
  /** Racha en curso (F28): 1º seguidos al final de su historial; 0 si la última no fue 1º. */
  streak: number;
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
 * - La racha (1º seguidos) y la liga con margen se llevan por miembro sobre sus partidas en orden
 *   cronológico; la liga empieza en la de `ELO_START_RATING` (Plata).
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

  const startLeague = eloLeague(ELO_START_RATING);
  const ratings = new Map<string, number>();
  const streaks = new Map<string, number>();
  const leagues = new Map<string, EloLeague>();
  const histories = new Map<string, EloMatch[]>();
  for (const key of members) {
    ratings.set(key, ELO_START_RATING);
    streaks.set(key, 0);
    leagues.set(key, startLeague);
    histories.set(key, []);
  }

  // Cada fila solo toca el rating, la racha y la liga de su miembro, así que procesarlas en orden
  // cronológico basta para que todos los de una partida usen su rating previo.
  for (const row of counted) {
    const ratingBefore = ratings.get(row.puuid) ?? ELO_START_RATING;
    const strangers = eloStrangers(membersInTeam.get(teamKey(row)) ?? 1);
    const streak = row.placement === 1 ? (streaks.get(row.puuid) ?? 0) + 1 : 0;
    const change = eloMatchChange(
      row.placement,
      ratingBefore,
      strangers,
      streak,
    );
    const ratingAfter = ratingBefore + change.delta;
    ratings.set(row.puuid, ratingAfter);
    streaks.set(row.puuid, streak);
    leagues.set(
      row.puuid,
      eloLeagueStep(leagues.get(row.puuid) ?? startLeague, ratingAfter),
    );
    histories.get(row.puuid)?.push({
      matchId: row.matchId,
      gameStartTimestamp: row.gameStartTimestamp,
      placement: row.placement,
      strangers,
      streak,
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
        league: leagues.get(key) ?? startLeague,
        streak: streaks.get(key) ?? 0,
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
