// Constantes y configuración de dominio de hylistats (sin acceso a BD ni a la Riot API).

/** `queueId` de Arena actual (tríos, 6 equipos x 3). No está en `queues.json`: no depender de él. */
export const ARENA_QUEUE_ID = 1750;

/** Challenge 602002 "Adapt to All Situations" (Arena God): campeones distintos con 1º puesto. */
export const CHALLENGE_ARENA_GOD = 602002;

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
