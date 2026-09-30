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
