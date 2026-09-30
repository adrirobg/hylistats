import "server-only";
import type { ZodType } from "zod";
import { getDb } from "@/db";
import {
  RiotAuthError,
  RiotBadRequestError,
  RiotNotFoundError,
  RiotRateLimitError,
  RiotRetryableError,
  RiotSchemaError,
} from "./errors";
import { getRiotApiKey, type RiotKey } from "./key";
import { HostLimiter, type Limiter, type Priority, sleep } from "./limiter";
import {
  AccountDto,
  MatchDto,
  MatchIdsDto,
  PlayerDataDto,
  SummonerDto,
} from "./schemas";

// Cliente fino de la Riot API (stack.md §6): limitador por host -> `fetch` con la key ->
// política de errores de sync-strategy.md §2. Todo se inyecta para poder probarlo sin red.
// La key solo viaja en la cabecera `X-Riot-Token`; jamás en mensajes, métricas ni logs.

/** Hosts de enrutado de EUW: regional (Account, Match-V5) y plataforma (Challenges). */
export const RIOT_HOSTS = {
  europe: "https://europe.api.riotgames.com",
  euw1: "https://euw1.api.riotgames.com",
} as const;
export type RiotHost = keyof typeof RIOT_HOSTS;

// Un valor por método de la API que se usa (cuenta las peticiones en `RiotMetrics`). Los límites
// de método (`riot-api.md` §3) nunca son el límite efectivo (gobierna el de app por host, en
// `limiter.ts`), así que el limitador no los modela: account `1000:60`, matchIds/match `2000:10`,
// summoner `2000:60`, playerData `20000:10,1200000:600`.
export type RiotEndpoint =
  | "account"
  | "matchIds"
  | "match"
  | "playerData"
  | "summoner"
  | "validate";

export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_ATTEMPTS = 5;
/** `validateKey` lo espera una persona en `/admin`: un solo reintento. */
export const VALIDATE_MAX_ATTEMPTS = 2;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** Tope al `Retry-After` que se acepta: uno absurdo no debe congelar el worker durante horas. */
export const MAX_RETRY_AFTER_MS = 5 * 60_000;
/** `count` máximo de Match-V5 ids (101 devuelve 400). */
export const MAX_MATCH_IDS_COUNT = 100;
// Los epoch en segundos rondan 1,8e9 y en ms 1,8e12: por encima de este umbral se ve que son ms.
const MAX_EPOCH_SECONDS = 100_000_000_000;

/** Riot ID con el que `validateKey` comprueba la key (existe y es del supervisor). */
export const DEFAULT_VALIDATION_RIOT_ID = {
  gameName: "BEJITO MAMBO",
  tagLine: "1991",
} as const;

export interface MatchIdsQuery {
  /** Desplazamiento desde la partida más reciente. */
  start: number;
  /** 0..100. */
  count: number;
  /** Epoch en SEGUNDOS (no ms): solo partidas posteriores. */
  startTime?: number;
  /** `1750` = Arena tríos. */
  queue: number;
}

export type KeyValidation = "ok" | "invalid" | "error";

/**
 * Superficie del cliente que consumen ingesta y worker. Para tests basta un objeto que la
 * implemente (p. ej. servir los fixtures de `tests/fixtures/`).
 */
export interface RiotApi {
  /** Riot ID -> puuid (Account-V1, `europe`). */
  getAccountByRiotId(
    gameName: string,
    tagLine: string,
    priority: Priority,
  ): Promise<AccountDto>;
  /** Ids de partida, la más reciente primero (Match-V5, `europe`). */
  getMatchIds(
    puuid: string,
    query: MatchIdsQuery,
    priority: Priority,
  ): Promise<string[]>;
  /** Detalle de partida (Match-V5, `europe`); `raw` es el JSON original (para `rawGz`). */
  getMatch(
    matchId: string,
    priority: Priority,
  ): Promise<{ match: MatchDto; raw: string }>;
  /** Challenges-V1 `player-data` (`euw1`, ~41 KB). */
  getPlayerData(puuid: string, priority: Priority): Promise<PlayerDataDto>;
  /** Summoner-V4 `by-puuid` (`euw1`): icono de perfil y nivel. */
  getSummonerByPuuid(puuid: string, priority: Priority): Promise<SummonerDto>;
  /** Comprueba una key candidata (la de `/admin`) sin guardarla ni usar `getKey`. */
  validateKey(candidateKey: string): Promise<KeyValidation>;
}

/** Contadores en memoria del cliente (contienen solo números; nunca la key). */
export interface RiotMetrics {
  /** Peticiones HTTP enviadas por tipo de endpoint (cada reintento cuenta). */
  requests: Record<RiotEndpoint, number>;
  status429: number;
  retries: number;
  /** Epoch ms de la última petición enviada. */
  lastRequestAt: number | null;
}

export function createRiotMetrics(): RiotMetrics {
  return {
    requests: {
      account: 0,
      matchIds: 0,
      match: 0,
      playerData: 0,
      summoner: 0,
      validate: 0,
    },
    status429: 0,
    retries: 0,
    lastRequestAt: null,
  };
}

/** Subconjunto de `fetch` que usa el cliente (`globalThis.fetch` lo cumple). */
export type RiotFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export interface RiotClientDeps {
  fetch: RiotFetch;
  /** Se invoca antes de cada intento (sin caché): un cambio de key surte efecto al instante. */
  getKey: () => Promise<RiotKey | null>;
  limiters: Record<RiotHost, Limiter>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Uniforme en [0, 1) para el jitter. */
  random: () => number;
  metrics: RiotMetrics;
}

export interface RiotClientOptions {
  /** Riot ID que usa `validateKey`. */
  validationRiotId?: { gameName: string; tagLine: string };
}

/**
 * Backoff exponencial con jitter: base 1 s, tope 30 s. El intento `n` espera entre la mitad
 * y la totalidad de `min(30 s, 1 s * 2^(n-1))`.
 */
export function computeBackoffMs(
  attempt: number,
  random: () => number,
): number {
  const ceiling = Math.min(
    BACKOFF_MAX_MS,
    BACKOFF_BASE_MS * 2 ** (attempt - 1),
  );
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

// Las keys de Riot son ASCII imprimible sin espacios. Una key con saltos de línea, espacios
// o no ASCII haría lanzar a `fetch` (y su mensaje de error puede citar la cabecera).
const KEY_SHAPE = /^[\x21-\x7e]+$/;

/** `Retry-After` en segundos -> ms (acotado). `undefined` si falta o no es un número. */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(Math.ceil(seconds * 1000), MAX_RETRY_AFTER_MS);
}

/**
 * Describe un fallo de `fetch` sin usar su `message`: en Node un valor de cabecera inválido
 * aparece citado en el mensaje, y la cabecera lleva la key.
 */
function describeFetchError(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) {
    return `error de red (${code})`;
  }
  return "error de red";
}

function describeIssues(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
    .join("; ");
}

/** Libera la conexión de una respuesta cuyo cuerpo no se necesita. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Ignorado: solo se intenta liberar el socket.
  }
}

interface RequestSpec<T> {
  endpoint: RiotEndpoint;
  host: RiotHost;
  /** Ruta real (con los segmentos ya codificados). */
  path: string;
  /** Ruta para mensajes de error: igual que `path` pero sin puuid. */
  logPath: string;
  query?: URLSearchParams;
  priority: Priority;
  schema: ZodType<T>;
  /** Key a usar en lugar de `getKey` (validación de una key candidata). */
  key?: string;
  maxAttempts: number;
}

export function createRiotClient(
  deps: RiotClientDeps,
  options: RiotClientOptions = {},
): RiotApi {
  const { metrics } = deps;
  const validationRiotId =
    options.validationRiotId ?? DEFAULT_VALIDATION_RIOT_ID;

  async function request<T>(
    spec: RequestSpec<T>,
  ): Promise<{ data: T; text: string }> {
    const context = { host: spec.host, path: spec.logPath };
    const limiter = deps.limiters[spec.host];
    const query = spec.query?.toString();
    const url = `${RIOT_HOSTS[spec.host]}${spec.path}${query ? `?${query}` : ""}`;

    for (let attempt = 1; ; attempt++) {
      await limiter.acquire(spec.priority);

      // La key se lee justo antes de enviar, en cada intento: si `/admin` la cambia mientras
      // esperábamos hueco, se usa la nueva.
      const key = spec.key ?? (await deps.getKey())?.key;
      if (!key) throw new RiotAuthError(context, "no key");
      if (!KEY_SHAPE.test(key)) {
        throw new RiotAuthError(context, "formato de key inválido");
      }

      metrics.requests[spec.endpoint]++;
      metrics.lastRequestAt = deps.now();

      let status: number;
      let retryAfter: string | null;
      let text = "";
      try {
        const response = await deps.fetch(url, {
          headers: { "X-Riot-Token": key },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        status = response.status;
        retryAfter = response.headers.get("Retry-After");
        if (response.ok) text = await response.text();
        else await discardBody(response);
      } catch (error) {
        // Timeout o red: reintento con backoff.
        if (attempt >= spec.maxAttempts) {
          throw new RiotRetryableError(
            context,
            `${describeFetchError(error)} tras ${attempt} intentos`,
          );
        }
        metrics.retries++;
        await deps.sleep(computeBackoffMs(attempt, deps.random));
        continue;
      }

      if (status >= 200 && status < 300) {
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new RiotSchemaError(
            { ...context, status },
            "el cuerpo no es JSON",
          );
        }
        const parsed = spec.schema.safeParse(json);
        if (!parsed.success) {
          throw new RiotSchemaError(
            { ...context, status },
            describeIssues(parsed.error),
          );
        }
        return { data: parsed.data, text };
      }

      if (status === 429) {
        metrics.status429++;
        // Se bloquea el host entero (el límite es por host): el próximo `acquire` espera.
        const delay =
          parseRetryAfterMs(retryAfter) ??
          computeBackoffMs(attempt, deps.random);
        limiter.blockUntil(deps.now() + delay);
        if (attempt >= spec.maxAttempts) {
          throw new RiotRateLimitError(
            { ...context, status },
            `límite de peticiones tras ${attempt} intentos`,
          );
        }
        metrics.retries++;
        continue;
      }

      if (status >= 500) {
        if (attempt >= spec.maxAttempts) {
          throw new RiotRetryableError(
            { ...context, status },
            `error del servidor tras ${attempt} intentos`,
          );
        }
        metrics.retries++;
        await deps.sleep(computeBackoffMs(attempt, deps.random));
        continue;
      }

      // Sin reintento: repetirlo no cambiaría el resultado.
      if (status === 401 || status === 403) {
        throw new RiotAuthError({ ...context, status });
      }
      if (status === 404) throw new RiotNotFoundError({ ...context, status });
      throw new RiotBadRequestError({ ...context, status });
    }
  }

  return {
    async getAccountByRiotId(gameName, tagLine, priority) {
      const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
      const { data } = await request({
        endpoint: "account",
        host: "europe",
        path,
        logPath: path,
        priority,
        schema: AccountDto,
        maxAttempts: MAX_ATTEMPTS,
      });
      return data;
    },

    async getMatchIds(puuid, { start, count, startTime, queue }, priority) {
      if (
        !Number.isInteger(count) ||
        count < 0 ||
        count > MAX_MATCH_IDS_COUNT
      ) {
        throw new RangeError(
          `count debe estar entre 0 y ${MAX_MATCH_IDS_COUNT}`,
        );
      }
      if (!Number.isInteger(start) || start < 0) {
        throw new RangeError("start debe ser un entero >= 0");
      }
      if (!Number.isInteger(queue) || queue < 0) {
        throw new RangeError("queue debe ser un entero >= 0");
      }
      if (
        startTime !== undefined &&
        (!Number.isInteger(startTime) ||
          startTime < 0 ||
          startTime >= MAX_EPOCH_SECONDS)
      ) {
        throw new RangeError("startTime va en segundos epoch, no en ms");
      }
      const query = new URLSearchParams({
        queue: String(queue),
        start: String(start),
        count: String(count),
      });
      if (startTime !== undefined) query.set("startTime", String(startTime));
      const { data } = await request({
        endpoint: "matchIds",
        host: "europe",
        path: `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
        logPath: "/lol/match/v5/matches/by-puuid/:puuid/ids",
        query,
        priority,
        schema: MatchIdsDto,
        maxAttempts: MAX_ATTEMPTS,
      });
      return data;
    },

    async getMatch(matchId, priority) {
      const path = `/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
      const { data, text } = await request({
        endpoint: "match",
        host: "europe",
        path,
        logPath: path,
        priority,
        schema: MatchDto,
        maxAttempts: MAX_ATTEMPTS,
      });
      return { match: data, raw: text };
    },

    async getPlayerData(puuid, priority) {
      const { data } = await request({
        endpoint: "playerData",
        host: "euw1",
        path: `/lol/challenges/v1/player-data/${encodeURIComponent(puuid)}`,
        logPath: "/lol/challenges/v1/player-data/:puuid",
        priority,
        schema: PlayerDataDto,
        maxAttempts: MAX_ATTEMPTS,
      });
      return data;
    },

    async getSummonerByPuuid(puuid, priority) {
      const { data } = await request({
        endpoint: "summoner",
        host: "euw1",
        path: `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
        logPath: "/lol/summoner/v4/summoners/by-puuid/:puuid",
        priority,
        schema: SummonerDto,
        maxAttempts: MAX_ATTEMPTS,
      });
      return data;
    },

    async validateKey(candidateKey) {
      const key = candidateKey.trim();
      if (!KEY_SHAPE.test(key)) return "invalid";
      const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(validationRiotId.gameName)}/${encodeURIComponent(validationRiotId.tagLine)}`;
      try {
        await request({
          endpoint: "validate",
          host: "europe",
          path,
          logPath: path,
          priority: 0,
          schema: AccountDto,
          key,
          maxAttempts: VALIDATE_MAX_ATTEMPTS,
        });
        return "ok";
      } catch (error) {
        // Solo 401/403 prueba que la key es mala; cualquier otro fallo es "no se pudo comprobar".
        return error instanceof RiotAuthError ? "invalid" : "error";
      }
    },
  };
}

// --- Singletons -----------------------------------------------------------------------
// Limitadores y métricas viven en `globalThis`: `instrumentation.ts` y las rutas de Next
// pueden cargar copias distintas de este módulo, y el límite (por host y por key) debe ser
// uno solo. El cliente en sí no guarda estado, así que cada copia del módulo crea el suyo.

interface RiotState {
  limiters: Record<RiotHost, HostLimiter>;
  metrics: RiotMetrics;
}

const globalForRiot = globalThis as typeof globalThis & {
  __hylistatsRiot?: RiotState;
};

function getState(): RiotState {
  globalForRiot.__hylistatsRiot ??= {
    limiters: { europe: new HostLimiter(), euw1: new HostLimiter() },
    metrics: createRiotMetrics(),
  };
  return globalForRiot.__hylistatsRiot;
}

/** Un limitador por host, compartido por todo el proceso. */
export function getLimiters(): Record<RiotHost, HostLimiter> {
  return getState().limiters;
}

/** Contadores en vivo del cliente compartido (solo lectura para quien los consulta). */
export function getRiotMetrics(): Readonly<RiotMetrics> {
  return getState().metrics;
}

let sharedClient: RiotApi | undefined;

/** Cliente con dependencias reales: `fetch` global, key de `settings` -> entorno, reloj real. */
export function getRiotClient(): RiotApi {
  sharedClient ??= createRiotClient({
    // Envoltorio (no `fetch.bind`) para resolver `globalThis.fetch` en cada llamada.
    fetch: (url, init) => fetch(url, init),
    getKey: () => getRiotApiKey(getDb()),
    limiters: getLimiters(),
    now: Date.now,
    sleep,
    random: Math.random,
    metrics: getState().metrics,
  });
  return sharedClient;
}
