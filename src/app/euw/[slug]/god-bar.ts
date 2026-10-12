// Geometría de la barra del trofeo Dios de Arena (variante 1 de `propuestas-v5-dios.html`, `.gbar`).
// Funciones puras: el estado sale de `arenaGodState` y aquí solo se traduce a posiciones en % del
// ancho de la barra. Ninguna capa ni marca pasa del 100 % aunque el total o el oficial superen la
// meta. Sustituye a `god-ring.ts` (el anillo de la revisión v4), con la misma semántica de capas.

import { type ArenaGodState, wonChampionsCount } from "@/domain/arena-god";
import { ARENA_GOD_THRESHOLD } from "@/lib/config";

/** Lo que la barra necesita del estado de `arenaGodState`. */
export type GodBarInput = Pick<
  ArenaGodState,
  "verified" | "manual" | "total" | "official" | "goal"
>;

export interface GodBar {
  /** Ancho (%) de la capa de verificados (oro), desde el 0. */
  verified: number;
  /**
   * Final (%) de la capa de manuales (azul rayado): va de `verified` a aquí. Se pinta desde el 0,
   * bajo el oro, para que el extremo redondeado del oro tape su arranque.
   */
  total: number;
  /** Posición (%) de la marca del oficial; `null` sin contador. */
  official: number | null;
  /** Posición (%) de la Deidad (60): a medio camino con meta catálogo; 100 si la meta es 60. */
  deity: number;
  /** La meta es el catálogo (Dios): la Deidad es una marca intermedia y el final lleva «Dios · N». */
  godGoal: boolean;
  /** Deidad conseguida, como en `arenaGodGoal` (verificados u oficial, sin manuales): lleva ✓. */
  deityReached: boolean;
  /** Porcentaje de la cifra: `total / goal` entero, 100 solo con la meta cumplida. */
  percent: number;
}

/** Fracción de la meta en %, entre 0 y 100. */
const at = (value: number, goal: number) =>
  goal > 0 ? Math.min(100, Math.max(0, (value / goal) * 100)) : 0;

export function godBar(state: GodBarInput): GodBar {
  const { verified, total, official, goal } = state;
  const godGoal = goal !== ARENA_GOD_THRESHOLD;
  // Redondear 59/60 o 172/173 daría «100 %» sin la meta cumplida: el 100 se reserva para ella.
  const percent =
    total >= goal ? 100 : Math.min(99, Math.round(at(total, goal)));

  return {
    verified: at(verified, goal),
    total: at(total, goal),
    official: official === null ? null : at(official, goal),
    deity: godGoal ? at(ARENA_GOD_THRESHOLD, goal) : 100,
    godGoal,
    deityReached: wonChampionsCount(verified, official) >= ARENA_GOD_THRESHOLD,
    percent,
  };
}

/** «faltan N» del trofeo: lo que queda hasta la meta, nunca negativo. */
export const godRemaining = (state: Pick<ArenaGodState, "total" | "goal">) =>
  Math.max(0, state.goal - state.total);
