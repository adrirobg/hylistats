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

/** 429 que persiste tras agotar los reintentos. */
export class RiotRateLimitError extends RiotError {
  override name = "RiotRateLimitError";
}

/** 200 con un cuerpo que no es JSON o no cumple el esquema Zod. No se reintenta. */
export class RiotSchemaError extends RiotError {
  override name = "RiotSchemaError";
}
