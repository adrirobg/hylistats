// Geometría del anillo del trofeo Dios de Arena (propuesta C2 de `.dev/research/cabecera`, `ringSvg`)
// e hitos de debajo. Funciones puras: el estado sale de `arenaGodState` y aquí solo se traduce a
// longitudes de arco y ángulos. El anillo empieza a las 12 y avanza en sentido horario; ninguna
// capa da más de una vuelta aunque el total o el oficial superen la meta.

import { type ArenaGodState, wonChampionsCount } from "@/domain/arena-god";
import { ARENA_GOD_THRESHOLD } from "@/lib/config";

/** Lo que el anillo necesita del estado de `arenaGodState`. */
export type GodRingInput = Pick<
  ArenaGodState,
  "verified" | "manual" | "total" | "official" | "goal"
>;

export interface GodRing {
  /** Perímetro del círculo de radio `radius`: longitud de la vuelta completa. */
  circumference: number;
  /** Longitud del arco de verificados (oro), desde las 12. */
  verifiedLength: number;
  /** Longitud del arco de manuales (azul), justo a continuación de los verificados. */
  manualLength: number;
  /** Ángulo (grados, horario desde las 12) de la marca del oficial; `null` sin contador. */
  officialAngle: number | null;
  /** Ángulo del hito de la Deidad (60) cuando la meta es el catálogo; `null` si la meta es 60. */
  milestoneAngle: number | null;
  /** El hito queda debajo de los arcos: se pinta como muesca y no como marca de oro. */
  milestoneCovered: boolean;
  /** Porcentaje del centro: `total / goal` entero, 100 solo con la meta cumplida. */
  percent: number;
}

/** Fracción de la vuelta, entre 0 y 1. */
const turn = (value: number, goal: number) =>
  goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;

export function godRing(state: GodRingInput, radius: number): GodRing {
  const { verified, total, official, goal } = state;
  const circumference = 2 * Math.PI * radius;
  const verifiedTurn = turn(verified, goal);
  const totalTurn = turn(total, goal);
  const milestoneTurn =
    goal === ARENA_GOD_THRESHOLD ? null : turn(ARENA_GOD_THRESHOLD, goal);
  // Redondear 59/60 o 172/173 daría «100 %» sin la meta cumplida: el 100 se reserva para ella.
  const percent =
    total >= goal ? 100 : Math.min(99, Math.round(totalTurn * 100));

  return {
    circumference,
    verifiedLength: verifiedTurn * circumference,
    manualLength: (totalTurn - verifiedTurn) * circumference,
    officialAngle: official === null ? null : turn(official, goal) * 360,
    milestoneAngle: milestoneTurn === null ? null : milestoneTurn * 360,
    milestoneCovered: milestoneTurn !== null && totalTurn >= milestoneTurn,
    percent,
  };
}

/** «faltan N» del trofeo: lo que queda hasta la meta, nunca negativo. */
export const godRemaining = (state: Pick<ArenaGodState, "total" | "goal">) =>
  Math.max(0, state.goal - state.total);

export interface GodMilestone {
  label: string;
  /** Conseguido: en oro y con corona. */
  done: boolean;
  /** Aún lejos (la meta final antes de la Deidad): en tenue. */
  later: boolean;
}

/**
 * Hitos bajo el anillo: la Deidad (60) y la meta final, el catálogo. La Deidad se consigue como en
 * `arenaGodGoal` (verificados u oficial, sin manuales). La meta final solo lleva cifra cuando ya es
 * la meta del anillo: con meta 60 el tamaño del catálogo no llega aquí.
 */
export function godMilestones(
  state: Pick<ArenaGodState, "verified" | "official" | "goal">,
): GodMilestone[] {
  const reached =
    wonChampionsCount(state.verified, state.official) >= ARENA_GOD_THRESHOLD;
  const catalogGoal = state.goal !== ARENA_GOD_THRESHOLD;
  const god = catalogGoal ? `Dios · ${state.goal}` : "Dios";
  return [
    { label: `Deidad · ${ARENA_GOD_THRESHOLD}`, done: reached, later: false },
    {
      label: reached ? god : `después, ${god}`,
      done: false,
      later: !reached,
    },
  ];
}
