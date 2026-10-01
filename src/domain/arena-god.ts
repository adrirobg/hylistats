// Dominio de la barra Arena God (brief §4.2 y §4.3, think.md F4 y F7): las tres capas de campeones
// ganados (verificados, marcas manuales y contador oficial de 602002), su comparación y los
// textos del aviso de descuadre. Funciones puras, sin React ni BD: la UI solo pinta lo que sale de
// aquí. Sustituye a `compareWithChallenge` (`stats.ts`) en la UI, porque esa no conoce los manuales.
//
// También decide cuándo se consigue el badge «Deidad de Arena» y la meta pasa a «Dios de Arena»
// (`arenaGodGoal`): una sola función, para que cabecera y barra no dupliquen la condición.

import { ARENA_GOD_THRESHOLD } from "@/lib/config";

// --- Badge y meta -------------------------------------------------------------------------

/** Nombre del badge que se consigue con `ARENA_GOD_THRESHOLD` campeones ganados, y de la meta antes. */
export const DEITY_NAME = "Deidad de Arena";
/** Nombre de la meta final: ganar con todos los campeones del catálogo. */
export const GOD_NAME = "Dios de Arena";
/** Condición del badge, en el tooltip de la cabecera. */
export const DEITY_CONDITION = `${ARENA_GOD_THRESHOLD} campeones distintos ganados esta temporada`;

export interface ArenaGodGoalInput {
  /** Campeones con algún 1º en el historial (verificados). Las marcas manuales no cuentan. */
  verified: number;
  /** Contador oficial de 602002; `null` si no se pudo leer. */
  official: number | null;
  /** Campeones del catálogo de datos estáticos; `0` si el catálogo no está disponible. */
  championTotal: number;
}

export interface ArenaGodGoal {
  /** Badge «Deidad de Arena» conseguido: `max(verificados, oficial ?? 0) >= ARENA_GOD_THRESHOLD`. */
  reached: boolean;
  /** Meta de la barra: `championTotal` con el badge conseguido; `ARENA_GOD_THRESHOLD` en otro caso. */
  goal: number;
  /** Nombre de la meta: `GOD_NAME` si `goal` es el catálogo entero, `DEITY_NAME` si sigue en 60. */
  name: string;
}

/**
 * Campeones ganados que cuentan para el badge: `max(verificados, oficial ?? 0)`. Es el valor que
 * decide «Deidad de Arena» y el que comparan los demás sitios de la app (p. ej. la tabla de
 * Temporada del grupo); las marcas manuales nunca cuentan.
 */
export const wonChampionsCount = (verified: number, official: number | null) =>
  Math.max(verified, official ?? 0);

/**
 * Badge y meta de la barra. Con el badge conseguido la meta pasa a ser el catálogo entero
 * («Dios de Arena»). Fallback: si el catálogo no está disponible (caído o vacío) o trae menos de
 * `ARENA_GOD_THRESHOLD` campeones (incompleto), no hay un N fiable: la meta se queda en 60 con el
 * nombre «Deidad de Arena», aunque el badge sí se muestre. Solo cuentan datos verificados y el
 * oficial; las marcas manuales viven en el navegador y no dan el badge.
 */
export function arenaGodGoal({
  verified,
  official,
  championTotal,
}: ArenaGodGoalInput): ArenaGodGoal {
  const reached = wonChampionsCount(verified, official) >= ARENA_GOD_THRESHOLD;
  const godGoal = reached && championTotal >= ARENA_GOD_THRESHOLD;
  return {
    reached,
    goal: godGoal ? championTotal : ARENA_GOD_THRESHOLD,
    name: godGoal ? GOD_NAME : DEITY_NAME,
  };
}

/** Título de la barra: «Dios de Arena · temporada actual». */
export const arenaGodHeading = (name: string) => `${name} · temporada actual`;

// --- Estado de las tres capas -------------------------------------------------------------

export interface ArenaGodInput {
  /** `championId` con algún 1º en el historial (lista verificada). */
  verifiedIds: readonly number[];
  /** `championId` marcados a mano en el navegador; los que ya están verificados no cuentan. */
  manualIds: readonly number[];
  /** Contador oficial de 602002; `null` si no se pudo leer. */
  official: number | null;
  /** Meta de la barra: `ARENA_GOD_THRESHOLD` o, con el badge conseguido, el catálogo (`arenaGodGoal`). */
  goal: number;
}

/**
 * - `unknown`: sin contador oficial.
 * - `match`: el oficial es igual a verificados + manuales.
 * - `missing`: el oficial es mayor; faltan campeones que el historial no muestra.
 * - `ahead`: el oficial es menor; aquí hay más victorias que en el contador.
 */
export type ArenaGodStatus = "unknown" | "match" | "missing" | "ahead";

export interface ArenaGodState {
  verified: number;
  /** Marcas manuales que aún no están verificadas. */
  manual: number;
  /** `verified + manual`. */
  total: number;
  official: number | null;
  goal: number;
  status: ArenaGodStatus;
  /** `official - total`: positivo si faltan (`missing`), negativo si sobran (`ahead`); `null` si `unknown`. */
  diff: number | null;
  /**
   * Solo en `ahead`: qué capa supera al oficial. `verified` = las victorias verificadas ya son más
   * que el contador (puede que Riot aún no lo haya actualizado); `manual` = solo lo supera al
   * sumar las marcas manuales (conviene revisarlas). `null` en el resto.
   */
  excess: "verified" | "manual" | null;
  /** Fin de la escala de la barra: el mayor de meta, oficial y total, al múltiplo de 10 superior. */
  scaleMax: number;
  /**
   * Valores de la escala, ascendentes y sin repetir: el 0, la meta y los regulares (múltiplos de
   * 20, o de 40 si `scaleMax > 100` para no apiñar etiquetas) hasta `scaleMax`. Se descartan los
   * regulares a menos de 20 de la meta, porque sus etiquetas se pisarían con la de la meta.
   */
  ticks: number[];
}

/** Paso de la escala y distancia mínima entre un tick regular y la meta. */
const TICK_STEP = 20;
/** Paso de la escala cuando `scaleMax` pasa de `WIDE_SCALE`. */
const WIDE_TICK_STEP = 40;
const WIDE_SCALE = 100;
const SCALE_ROUND = 10;

export function arenaGodState({
  verifiedIds,
  manualIds,
  official,
  goal,
}: ArenaGodInput): ArenaGodState {
  const verifiedSet = new Set(verifiedIds);
  // Una marca manual sobre un campeón ya verificado deja de ser un hueco: no cuenta dos veces.
  const manualSet = new Set(manualIds.filter((id) => !verifiedSet.has(id)));
  const verified = verifiedSet.size;
  const manual = manualSet.size;
  const total = verified + manual;

  const diff = official === null ? null : official - total;
  const status: ArenaGodStatus =
    diff === null
      ? "unknown"
      : diff === 0
        ? "match"
        : diff > 0
          ? "missing"
          : "ahead";
  const excess =
    status !== "ahead"
      ? null
      : official !== null && official < verified
        ? "verified"
        : "manual";

  const scaleMax =
    Math.ceil(Math.max(goal, official ?? 0, total) / SCALE_ROUND) * SCALE_ROUND;
  const step = scaleMax > WIDE_SCALE ? WIDE_TICK_STEP : TICK_STEP;
  const ticks = new Set<number>([goal]);
  for (let tick = 0; tick <= scaleMax; tick += step) {
    if (tick === 0 || Math.abs(tick - goal) >= TICK_STEP) ticks.add(tick);
  }

  return {
    verified,
    manual,
    total,
    official,
    goal,
    status,
    diff,
    excess,
    scaleMax,
    ticks: [...ticks].sort((a, b) => a - b),
  };
}

// --- Textos -------------------------------------------------------------------------------

/** «1 verificado» / «2 verificados». */
export const verifiedPhrase = (n: number) =>
  `${n} ${n === 1 ? "verificado" : "verificados"}`;

/** «1 manual» / «2 manuales». */
export const manualPhrase = (n: number) =>
  `${n} ${n === 1 ? "manual" : "manuales"}`;

/** «oficial 27» o, sin contador oficial (§4.3, `unknown`), «oficial sin dato»: nunca un 0 inventado. */
export const officialPhrase = (official: number | null) =>
  official === null ? "oficial sin dato" : `oficial ${official}`;

/** «Falta 1 campeón» / «Faltan 2 campeones». */
export const missingPhrase = (n: number) =>
  n === 1 ? "Falta 1 campeón" : `Faltan ${n} campeones`;

/** `aria-label` de la barra: «75 verificados, 0 manuales, contador oficial 75, objetivo 60». */
export function arenaGodLabel(state: ArenaGodState): string {
  const official =
    state.official === null
      ? "contador oficial no disponible"
      : `contador oficial ${state.official}`;
  return `${verifiedPhrase(state.verified)}, ${manualPhrase(state.manual)}, ${official}, objetivo ${state.goal}`;
}

/** Trozo de mensaje: texto normal o cifra en negrita. */
export type MessagePart = string | { strong: string };

/** El mensaje como texto plano (sin marcar las negritas). */
export const messageText = (parts: readonly MessagePart[]): string =>
  parts.map((part) => (typeof part === "string" ? part : part.strong)).join("");

/**
 * Mensaje del aviso de descuadre (brief §4.3), siempre en tono de fiabilidad: nunca es un error del
 * usuario. `checkedWhen` es cuándo se intentó leer el contador ya redactado («hace 5 min»,
 * «ayer»…), solo para `unknown`.
 */
export function arenaGodMessage(
  state: ArenaGodState,
  checkedWhen: string | null = null,
): MessagePart[] {
  const { official, total, verified, manual } = state;
  switch (state.status) {
    case "match":
      return ["Cuadra con el contador oficial."];
    case "missing":
      return [
        "El contador oficial dice ",
        { strong: String(official) },
        " y aquí hay ",
        { strong: String(total) },
        `. ${missingPhrase(state.diff ?? 0)} que el historial no muestra (partidas no devueltas por la API o no sincronizadas).`,
      ];
    case "ahead":
      return state.excess === "verified"
        ? [
            `Aquí hay más victorias verificadas (${verified}) que en el contador oficial (${official}). Puede que el contador de Riot aún no se haya actualizado.`,
          ]
        : [
            `Tus marcas manuales (${manual}) hacen que aquí haya más victorias (${total}) que en el contador oficial (${official}). Revísalas.`,
          ];
    case "unknown":
      return [
        `No se pudo leer el contador oficial${checkedWhen ? ` (${checkedWhen})` : ""}.`,
      ];
  }
}

/** Botones del aviso. `retry` y `sync` refrescan; `manual` y `why` no tocan el servidor. */
export type ArenaGodAction = "sync" | "manual" | "why" | "retry";

/**
 * Acciones de cada caso (brief §4.3). «Marcar a mano» solo en «mi perfil»: los manuales no
 * existen en perfiles ajenos.
 */
export function arenaGodActions(
  status: ArenaGodStatus,
  mine: boolean,
): ArenaGodAction[] {
  switch (status) {
    case "missing":
      return mine ? ["sync", "manual", "why"] : ["sync", "why"];
    case "ahead":
      return ["why"];
    case "unknown":
      return ["retry"];
    case "match":
      return [];
  }
}

/** Las tres capas en dos frases (tooltip `?` del §4.2 y botón «Qué significa»). */
export const ARENA_GOD_EXPLANATION =
  "Riot da el número oficial (la marca vertical) pero no la lista: la lista sale de tu historial de partidas, con los campeones verificados en oro y los que marcas a mano en azul rayado. Si el oficial es mayor, falta alguna partida en el historial o alguna marca a mano.";
