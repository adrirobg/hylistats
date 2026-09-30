// Errores del cliente Riot. Los mensajes llevan host (`europe`/`euw1`), ruta sin query y
// status; NUNCA cabeceras ni la key (ni el `message` de errores de red, que en Node puede
// citar el valor de una cabecera inválida). La ruta que se muestra ya viene sin puuid.

export interface RiotErrorContext {
  /** Host de enrutado: `europe` o `euw1`. */
  host: string;
  /** Ruta sin query (con el puuid ya enmascarado). */
  path: string;
  status?: number;
}

/** Base de los errores del cliente Riot. */
export class RiotError extends Error {
  override name = "RiotError";
  readonly host: string;
  readonly path: string;
  readonly status: number | undefined;

  constructor(context: RiotErrorContext, detail?: string) {
    const status = context.status === undefined ? "" : ` -> ${context.status}`;
    super(
      `Riot ${context.host} ${context.path}${status}${detail ? `: ${detail}` : ""}`,
    );
    this.host = context.host;
    this.path = context.path;
    this.status = context.status;
  }
}

/** 401/403 o sin key: la key falta, caducó o fue revocada. No se reintenta. */
export class RiotAuthError extends RiotError {
  override name = "RiotAuthError";
}

/** 404: la partida no existe o expiró (~2 años). No se reintenta. */
export class RiotNotFoundError extends RiotError {
  override name = "RiotNotFoundError";
}

/** 400 (y otros 4xx inesperados): petición mal formada. No se reintenta. */
export class RiotBadRequestError extends RiotError {
  override name = "RiotBadRequestError";
}

/** 5xx, timeout o error de red que persiste tras agotar los reintentos. */
export class RiotRetryableError extends RiotError {
  override name = "RiotRetryableError";
}

/**
 * Marca fija con la que empieza el mensaje de un `RiotRateLimitError`. El worker guarda ese
 * mensaje tal cual en `lastError` (`sync_jobs` y `match_fetch`) y `classifyRetry` lo busca ahí
 * para saber que un reintento pendiente es por el límite de peticiones. Es un contrato entre las
 * dos mitades: el texto del mensaje puede cambiar, la marca no (y ningún otro error la lleva).
 */
export const RATE_LIMIT_MARKER = "[rate-limit]";

/** 429 que persiste tras agotar los reintentos. */
export class RiotRateLimitError extends RiotError {
  override name = "RiotRateLimitError";

  constructor(context: RiotErrorContext, detail?: string) {
    super(context, detail);
    this.message = `${RATE_LIMIT_MARKER} ${this.message}`;
  }
}

/**
 * Por qué hay un reintento pendiente, a partir del `lastError` guardado: `rate_limit` si viene de
 * un `RiotRateLimitError` (lleva `RATE_LIMIT_MARKER`) y `error` para todo lo demás (5xx, red, un
 * `lastError` vacío o anterior a la marca). La página solo recibe esta categoría, nunca el texto.
 */
export function classifyRetry(
  lastError: string | null,
): "rate_limit" | "error" {
  return lastError?.includes(RATE_LIMIT_MARKER) ? "rate_limit" : "error";
}

/** 200 con un cuerpo que no es JSON o no cumple el esquema Zod. No se reintenta. */
export class RiotSchemaError extends RiotError {
  override name = "RiotSchemaError";
}
