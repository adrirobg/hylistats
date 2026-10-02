// Decisiones de presentación de la gráfica de evolución del rating (iter-09, T06) como funciones
// puras, sin React ni recharts: puntos, dominio de los ejes y ligas visibles. El componente
// (`rating-chart.tsx`) solo las pinta. El rating y la liga vienen del dominio del ELO
// (`src/domain/elo.ts`); aquí no se repite ninguna regla.

import { roundRating } from "@/domain/elo";
import type { EloSeriesPoint } from "@/domain/group-view";
import { ELO_LEAGUES, ELO_START_RATING } from "@/lib/config";
import { formatCount } from "@/lib/format";

const DAY = 24 * 60 * 60_000;

export interface RatingPoint {
  /** Epoch en ms del inicio de la partida. */
  at: number;
  /** Rating tras la partida, con decimales. */
  rating: number;
  /** Rating mostrado (entero): el de la cabecera en el último punto. */
  rounded: number;
  /** Cambio de la partida: `rating` menos el de antes (el rating inicial en la primera). */
  delta: number;
}

/**
 * Puntos de la gráfica: uno por partida, en el orden de la serie (cronológico). El cambio sale de
 * la diferencia con el punto anterior, que es exactamente el `delta` de la partida.
 */
export function ratingPoints(series: readonly EloSeriesPoint[]): RatingPoint[] {
  let before = ELO_START_RATING;
  return series.map((point) => {
    const delta = point.ratingAfter - before;
    before = point.ratingAfter;
    return {
      at: point.gameStartTimestamp,
      rating: point.ratingAfter,
      rounded: roundRating(point.ratingAfter),
      delta,
    };
  });
}

/**
 * Dominio del eje X: de la primera a la última partida. Si empezaran y acabaran a la vez (una sola
 * partida) se abre un día para que el eje tenga anchura.
 */
export function ratingDomain(points: readonly RatingPoint[]): [number, number] {
  const start = points[0]?.at ?? 0;
  return [start, Math.max(points[points.length - 1]?.at ?? start, start + DAY)];
}

/** Pasos posibles entre marcas del eje Y, de menor a mayor. */
const STEPS = [10, 20, 50, 100, 200, 500, 1000];
/** Máximo de tramos entre marcas: más se amontonan a 375 px. */
const MAX_INTERVALS = 5;

/**
 * Eje Y: de lo más bajo a lo más alto que llegó el rating, con un margen (un 15 % del recorrido,
 * 10 puntos como mínimo) para que ni la línea ni el punto final queden pegados al borde. Los
 * límites son múltiplos del paso de las marcas, que es el menor de `STEPS` con 5 tramos o menos.
 */
export function ratingAxis(points: readonly RatingPoint[]): {
  min: number;
  max: number;
  ticks: number[];
} {
  const values = points.map((p) => p.rating);
  const low = values.length > 0 ? Math.min(...values) : ELO_START_RATING;
  const high = values.length > 0 ? Math.max(...values) : ELO_START_RATING;
  const pad = Math.max(10, Math.ceil((high - low) * 0.15));
  const span = high - low + 2 * pad;
  const step =
    STEPS.find((candidate) => span / candidate <= MAX_INTERVALS) ??
    STEPS[STEPS.length - 1];
  const min = Math.floor((low - pad) / step) * step;
  const max = Math.ceil((high + pad) / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max; value += step) ticks.push(value);
  return { min, max, ticks };
}

export interface LeagueBand {
  id: string;
  name: string;
  /** Tramo de la liga recortado al eje: `from < to`. */
  from: number;
  to: number;
}

/**
 * Ligas que se ven en el eje `[min, max]`, de menor a mayor y recortadas a él. La liga se decide
 * por el rating redondeado, así que su frontera en el rating con decimales es `min − 0,5`
 * (1510 empieza en 1509,5). Hierro no tiene suelo y Diamante no tiene techo.
 */
export function visibleLeagues(min: number, max: number): LeagueBand[] {
  const bands: LeagueBand[] = [];
  ELO_LEAGUES.forEach((league, index) => {
    const next = ELO_LEAGUES[index + 1];
    const lower = Number.isFinite(league.min)
      ? league.min - 0.5
      : Number.NEGATIVE_INFINITY;
    const upper = next ? next.min - 0.5 : Number.POSITIVE_INFINITY;
    const from = Math.max(lower, min);
    const to = Math.min(upper, max);
    if (from < to) bands.push({ id: league.id, name: league.name, from, to });
  });
  return bands;
}

/** «1 partida» / «23 partidas». */
function gamesLabel(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "partida" : "partidas"}`;
}

/** Texto equivalente a la gráfica: «Oro · 1526 tras 23 partidas de la temporada». */
export function ratingCaption(
  leagueName: string,
  rating: number,
  games: number,
): string {
  return `${leagueName} · ${rating} tras ${gamesLabel(games)} de la temporada.`;
}
