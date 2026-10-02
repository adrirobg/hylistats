// Resultado de un "Actualizar" (brief §4.1): compara los datos de antes y de después y decide qué
// dice el toast. Funciones puras, sin React: las usan `use-refresh.tsx` y `profile-states.tsx`, y
// las prueban los tests.

/** Lo que la vista sabe del perfil en un instante; se compara la foto previa con la actual. */
export interface RefreshSnapshot {
  games: number;
  /** Campeones verificados (con algún 1º). */
  champions: readonly { championId: number; championName: string }[];
  lastSyncedAt: number | null;
  /** Instante del último job fallido (`lastJobError`); `null` si el último terminado no falló. */
  errorAt: number | null;
  /** Hay un job en curso. */
  active: boolean;
}

export interface RefreshOutcome {
  newGames: number;
  /** Nombres de los campeones que hoy son verificados y antes no (los de 1º nuevos). */
  newChampions: string[];
}

/** Qué cambió entre la foto previa y la actual (nunca negativo: un recuento a la baja es "nada"). */
export function refreshOutcome(
  prev: RefreshSnapshot,
  next: RefreshSnapshot,
): RefreshOutcome {
  const known = new Set(prev.champions.map((c) => c.championId));
  return {
    newGames: Math.max(0, next.games - prev.games),
    newChampions: next.champions
      .filter((c) => !known.has(c.championId))
      .map((c) => c.championName),
  };
}

/** "A", "A y B", "A, B y C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * Texto del toast: "+3 partidas · **nuevo 1º con Ahri**" o "Sin partidas nuevas". `highlight` va
 * destacado (oro) tras el `lead`.
 */
export function outcomeMessage({ newGames, newChampions }: RefreshOutcome): {
  lead: string;
  highlight: string | null;
} {
  const highlight =
    newChampions.length === 0
      ? null
      : `${newChampions.length === 1 ? "nuevo" : "nuevos"} 1º con ${joinNames(newChampions)}`;
  if (newGames === 0 && highlight === null) {
    return { lead: "Sin partidas nuevas", highlight: null };
  }
  return {
    lead: `+${newGames} ${newGames === 1 ? "partida" : "partidas"}`,
    highlight,
  };
}

// --- Vigilancia de un "Actualizar" pulsado en esta pestaña --------------------------------

/** Un "Actualizar" en marcha: la foto de antes de pulsar y si ya se vio el job en curso. */
export interface RefreshWatch {
  before: RefreshSnapshot;
  sawActive: boolean;
}

/** Empieza a vigilar; si ya había un job activo al pulsar, cuenta como visto. */
export const startWatch = (before: RefreshSnapshot): RefreshWatch => ({
  before,
  sawActive: before.active,
});

export type WatchStep =
  /** Sigue en marcha (`watch` es la misma referencia si no cambió nada). */
  | { settled: null; watch: RefreshWatch }
  /** Terminó bien: toca mostrar `refreshOutcome(watch.before, now)`. */
  | { settled: "ok"; watch: null }
  /** El job falló: el aviso del header ya lo dice, no hay toast de resultado. */
  | { settled: "error"; watch: null };

/**
 * Avanza la vigilancia con la foto actual. Termina cuando ya no hay job en curso y o se vio uno
 * o `lastSyncedAt` cambió (el job pudo empezar y acabar entre dos consultas del estado); si en
 * su lugar hay un error de job nuevo, termina en `error`.
 *
 * La foto mezcla el estado (job, `lastSyncedAt`, error) con los datos de la página (partidas y
 * campeones). `dataCurrent = false` dice que esos datos aún no son los de la versión del estado
 * (falta el repintado que trae las partidas nuevas): el resultado espera a que lleguen. Si el job
 * no guardó nada, la versión no cambia, no hay repintado y el resultado sale ya ("Sin partidas
 * nuevas").
 */
export function advanceWatch(
  watch: RefreshWatch,
  now: RefreshSnapshot,
  dataCurrent = true,
): WatchStep {
  if (now.active) {
    return watch.sawActive
      ? { settled: null, watch }
      : { settled: null, watch: { ...watch, sawActive: true } };
  }
  if (now.errorAt !== null && now.errorAt !== watch.before.errorAt) {
    return { settled: "error", watch: null };
  }
  if (watch.sawActive || now.lastSyncedAt !== watch.before.lastSyncedAt) {
    return dataCurrent
      ? { settled: "ok", watch: null }
      : { settled: null, watch };
  }
  return { settled: null, watch };
}
