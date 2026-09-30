// Decisiones de presentación de la curva de campeones ganados (brief §3.3) como funciones puras,
// sin React ni recharts: el dominio de los ejes, dónde caen las marcas y los rótulos. El
// componente (`won-curve-chart.tsx`) solo las pinta.

import type { CurvePoint } from "@/domain/summary";
import { formatDecimal } from "@/lib/format";

const DAY = 24 * 60 * 60_000;

/** Una marca de mes a menos de esto del inicio del eje se omite: chocaría con la del inicio. */
const MIN_TICK_GAP = 10 * DAY;

/**
 * Dominio del eje X: del primer al último punto de la curva. Si empezaran y acabaran a la vez
 * (primer 1º al instante de sincronizar) se abre un día para que el eje tenga anchura.
 */
export function curveDomain(curve: readonly CurvePoint[]): [number, number] {
  const start = curve[0]?.at ?? 0;
  return [start, Math.max(curve[curve.length - 1]?.at ?? start, start + DAY)];
}

/**
 * Marcas del eje X: el inicio de la temporada y el día 1 de cada mes (UTC, como las fechas de
 * `lib/format.ts`) que caiga dentro del dominio. Se omite el mes que empieza a menos de
 * `MIN_TICK_GAP` del inicio, cuya marca taparía la del propio inicio.
 */
export function xTicks(startMs: number, endMs: number): number[] {
  const ticks = [startMs];
  const from = new Date(startMs);
  let month = Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1);
  while (month <= endMs) {
    if (month - startMs >= MIN_TICK_GAP) ticks.push(month);
    const date = new Date(month);
    month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return ticks;
}

/**
 * Eje Y: de 0 a lo que llegue más alto (el recuento o el umbral) más un margen, para que ni la
 * línea de la meta ni el último punto queden pegados al borde; las marcas van de 20 en 20 (de 50
 * en 50 pasados los 100 campeones), sin pasar de ese máximo.
 */
export function countAxis(
  count: number,
  threshold: number,
): { max: number; ticks: number[] } {
  const top = Math.max(count, threshold);
  const max = top + Math.max(3, Math.ceil(top / 12));
  const step = max > 100 ? 50 : 20;
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += step) ticks.push(value);
  return { max, ticks };
}

/** «1 campeón» / «23 campeones»: lo que dice el tooltip de cada punto. */
export function championsLabel(count: number): string {
  return `${formatDecimal(count, 0)} ${count === 1 ? "campeón" : "campeones"}`;
}
