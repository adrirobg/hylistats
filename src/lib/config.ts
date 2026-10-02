// Constantes y configuración de dominio de hylistats (sin acceso a BD ni a la Riot API).

/**
 * `queueId` de las dos colas de Arena tríos (6 equipos x 3) de la temporada. Ninguna está en
 * `queues.json`: no depender de él. La 1740 tiene el mismo formato que la 1750 y cuenta para el
 * challenge 602002; se añadió por decisión del supervisor (think.md F14). El orden importa: el
 * worker las lista en este orden y `sync_jobs.list_queue_index` es un índice en este array.
 */
export const ARENA_QUEUE_IDS = [1750, 1740] as const;

/** Challenge 602002 "Adapt to All Situations" (Arena God): campeones distintos con 1º puesto. */
export const CHALLENGE_ARENA_GOD = 602002;

/**
 * Meta de la barra Arena God: campeones ganados que pide el nivel MASTER de 602002 (thresholds
 * del `config` verificados en I1 §7.2: IRON 3 … MASTER 60).
 */
export const ARENA_GOD_THRESHOLD = 60;

/**
 * Días sin ninguna partida de Arena en la BD (de cualquier perfil) a partir de los cuales el
 * header sugiere que Arena está fuera de rotación. Riot no expone qué modos están activos, así
 * que se infiere de lo que ya hay guardado: no es un dato de Riot, solo una pista y se redacta
 * como tal ("puede que...").
 */
export const ARENA_QUIET_DAYS = 7;

/**
 * Partidas mínimas que debe tener un día de juego para entrar en «mejor/peor día» de la pestaña
 * Estadísticas (F17): con menos, un único buen resultado encabezaría el ranking.
 */
export const RECORD_DAY_MIN_GAMES = 3;

/**
 * Partidas mínimas de un miembro en la semana de juego para entrar en el ranking de la semana y
 * optar a sus títulos individuales (F21). El mínimo del día es `RECORD_DAY_MIN_GAMES`. Revisable
 * tras la sesión conjunta (F18).
 */
export const GROUP_WEEK_MIN_GAMES = 5;

/**
 * Partidas mínimas juntos en el periodo (día o semana) para que un dúo o un trío de miembros opte
 * a sus títulos (F21). También es el mínimo de las tablas de Dúos y Tríos de la temporada. Revisable
 * tras la sesión conjunta (F18).
 */
export const GROUP_TEAM_MIN_GAMES = 3;

/**
 * Frío/calor por campeón (F16). Solo aplica a campeones sin ningún 1º en la temporada, con al
 * menos `HEAT_MIN_GAMES` partidas. Valores revisables tras el uso con el grupo.
 */
export const HEAT_MIN_GAMES = 5;

/**
 * Peso del ajuste de F16 en partidas ("K"): la media del campeón se ajusta hacia la media global
 * como `(n·media_campeón + K·media_global) / (n + K)`. Revisable tras el uso.
 */
export const HEAT_PRIOR_GAMES = 5;

/**
 * Diferencia mínima en puestos entre la media ajustada y la global para marcar 🔥 (ajustada mejor)
 * o ❄️ (ajustada peor) en F16. Revisable tras el uso.
 */
export const HEAT_THRESHOLD = 0.4;

/** Inicio de la temporada de Arena por defecto (patch 26.10, mayo 2026). */
export const DEFAULT_SEASON_START = "2026-05-12T00:00:00Z";

// ISO 8601: fecha sola (se interpreta en UTC) o fecha y hora con zona explícita (`Z` o `±hh:mm`).
// Sin zona la hora dependería de la zona horaria del servidor.
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/**
 * Inicio de la temporada (instante UTC) desde `SEASON_START`; si no está definida (o está
 * vacía) se usa `DEFAULT_SEASON_START`. Lanza un error claro si el valor no es una fecha ISO 8601
 * válida: mejor fallar al arrancar que contar partidas contra una fecha equivocada.
 *
 * El argumento existe para poder probar la función sin tocar `process.env`.
 */
export function getSeasonStart(
  value: string | undefined = process.env.SEASON_START,
): Date {
  const text = value?.trim() || DEFAULT_SEASON_START;
  const parts = ISO_DATE.exec(text);
  const date = parts ? new Date(text) : null;
  // `Date` acepta "2026-02-31" y lo desborda a marzo: se comprueba que el día no rueda.
  const rolledOver =
    parts !== null &&
    new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3])).getUTCDate() !==
      +parts[3];
  if (!date || Number.isNaN(date.getTime()) || rolledOver) {
    throw new Error(
      `SEASON_START inválida: "${text}". Debe ser una fecha ISO 8601, p. ej. ${DEFAULT_SEASON_START}`,
    );
  }
  return date;
}

// ---------------------------------------------------------------------------------------------
// ELO del grupo (F24, F25). Todas revisables tras la sesión conjunta (F18).
// ---------------------------------------------------------------------------------------------

/** Rating con el que empieza la temporada cada miembro del grupo (F24). */
export const ELO_START_RATING = 1500;

/**
 * Puntos por puesto del cambio base (F24), con índice = puesto − 1: 1º +25, 2º +12, 3º +2,
 * 4º −5, 5º −15, 6º −19. Con un rating de 1500 el cambio base es exactamente este valor.
 */
export const ELO_PLACEMENT_POINTS = [25, 12, 2, -5, -15, -19] as const;

/**
 * Pendiente del cambio base (F24): `base = puntos[puesto] − ELO_SLOPE·(E − 0,5)`. Por encima de
 * 1500 se gana menos y se pierde más; por debajo, al revés.
 */
export const ELO_SLOPE = 44;

/** Escala de la esperanza (F24): `E = 1 / (1 + 10^((ELO_START_RATING − R) / ELO_SCALE))`. */
export const ELO_SCALE = 400;

/**
 * Multiplicador del cambio base por desconocidos en el equipo (F24), con índice = número de
 * desconocidos (0..2). `gain` se aplica si el cambio base es positivo y `loss` si es negativo:
 * jugar con desconocidos premia más al ganar y castiga menos al perder.
 */
export const ELO_STRANGER_MULTIPLIERS = [
  { gain: 1, loss: 1 },
  { gain: 1.15, loss: 0.75 },
  { gain: 1.3, loss: 0.5 },
] as const;

/**
 * Ligas del ELO (F25) por rating **redondeado**, de menor a mayor: cada una empieza en `min`
 * (incluido) y llega hasta el `min` de la siguiente. Hierro < 1450 · Bronce 1450–1479 · Plata
 * 1480–1509 (la de salida) · Oro 1510–1539 · Platino 1540–1569 · Diamante ≥ 1570.
 */
export const ELO_LEAGUES = [
  { id: "hierro", name: "Hierro", min: Number.NEGATIVE_INFINITY },
  { id: "bronce", name: "Bronce", min: 1450 },
  { id: "plata", name: "Plata", min: 1480 },
  { id: "oro", name: "Oro", min: 1510 },
  { id: "platino", name: "Platino", min: 1540 },
  { id: "diamante", name: "Diamante", min: 1570 },
] as const;

/** Partidas de la temporada por debajo de las cuales un miembro está *provisional* (F25). */
export const ELO_PROVISIONAL_GAMES = 10;
