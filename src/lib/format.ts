// Formato de fechas y números para la UI, en español. Módulo puro (sin React ni servidor): lo
// usan tanto las páginas de servidor como los componentes cliente. Las fechas se pintan en UTC
// (con el sufijo cuando lleva hora): así el servidor y el navegador dan siempre el mismo texto.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A partir de aquí "hace N d" deja de ser útil y se muestra la fecha. */
const RELATIVE_LIMIT_DAYS = 30;

const SHORT_DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Tiempo transcurrido entre `ms` y `now` (ambos en ms desde epoch): "ahora", "hace 5 min",
 * "hace 2 h", "ayer" (entre 24 y 48 h), "hace 3 d" y, desde 30 días, la fecha corta ("12 ene";
 * con el año si no es el actual). Una fecha futura (reloj desajustado) cuenta como "ahora".
 */
export function formatRelative(ms: number, now: number): string {
  const elapsed = now - ms;
  if (elapsed < MINUTE) return "ahora";
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `hace ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 2 * DAY) return "ayer";
  const days = Math.floor(elapsed / DAY);
  if (days < RELATIVE_LIMIT_DAYS) return `hace ${days} d`;
  return formatShortDate(ms, now);
}

/**
 * Fecha corta en UTC ("12 ene"), con el año si no es el de `now` ("12 ene 2025"). Sirve para
 * decir cuándo pasó algo sin depender de cuánto hace ("1º el 12 ene").
 */
export function formatShortDate(ms: number, now: number): string {
  const sameYear =
    new Date(ms).getUTCFullYear() === new Date(now).getUTCFullYear();
  return (sameYear ? SHORT_DATE : SHORT_DATE_YEAR).format(ms);
}

/** `2026-09-29 15:04 UTC`; `-` si no hay fecha. */
export function formatDateTime(date: Date | number | null): string {
  return date === null
    ? "-"
    : `${new Date(date).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// Un formateador por (estilo, decimales): construir un `Intl.NumberFormat` es caro y estos se
// llaman por cada fila de las tablas.
const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(
  style: "decimal" | "percent",
  digits: number,
): Intl.NumberFormat {
  const key = `${style}:${digits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("es-ES", {
      style,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormats.set(key, format);
  }
  return format;
}

/** Proporción (0–1) como porcentaje `es-ES`: `formatPercent(0.1837)` -> `18,4 %` (1 decimal). */
export function formatPercent(ratio: number, digits = 1): string {
  return numberFormat("percent", digits).format(ratio);
}

/** Número con coma decimal `es-ES`: `formatDecimal(3.1)` -> `3,10` (2 decimales por defecto). */
export function formatDecimal(value: number, digits = 2): string {
  return numberFormat("decimal", digits).format(value);
}

const COUNT = new Intl.NumberFormat("es-ES", {
  useGrouping: "always",
  maximumFractionDigits: 0,
});

/** Entero con separador de miles `es-ES`, también a partir de 4 cifras: `123456` -> `123.456`. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}
