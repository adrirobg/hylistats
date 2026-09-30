import {
  and,
  asc,
  DrizzleQueryError,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "@/db";
import {
  type KEY_STATUSES,
  matches,
  matchFetch,
  profiles,
  type SyncJob,
  settings,
  syncJobs,
} from "@/db/schema";
import { storeMatch } from "@/domain/ingest";
import { extractChallenge } from "@/domain/stats";
import { ARENA_QUEUE_IDS, CHALLENGE_ARENA_GOD } from "@/lib/config";
import type { RiotApi } from "@/lib/riot/client";
import {
  RiotAuthError,
  RiotBadRequestError,
  RiotError,
  RiotNotFoundError,
  RiotSchemaError,
} from "@/lib/riot/errors";
import { PRIORITY, type Priority } from "@/lib/riot/limiter";

// Pasos del worker (sync-strategy.md §2): cada llamada a `runNextStep` elige UN trabajo, hace
// como mucho UNA petición a Riot y persiste el resultado. El estado vive entero en la BD
// (`sync_jobs` + `match_fetch`): antes de cada petición ya está guardado todo lo anterior y el
// resultado se guarda justo después, así que un `kill -9` en cualquier punto solo cuesta repetir
// la petición en curso (y `storeMatch` es idempotente).
//
// Máquina de estados de un job:
//   pending --Account-V1--> listing --Match-V5 ids (páginas de 100, una cola tras otra)--> fetching
//   fetching --detalle por matchId (match_fetch)--> [todos resueltos] --player-data--> done
//   error: Riot ID inexistente, fallo permanente o 5 fallos seguidos en pending/listing/cierre.
// Máquina de estados de `match_fetch` (única global por matchId):
//   pending --OK / ya en `matches`--> done · --404--> missing
//   pending --5xx/timeout/429--> pending (attempts++, nextAttemptAt con backoff) --5º--> error

/** `count` máximo de Match-V5 ids: una página llena significa que puede haber más. */
export const MATCH_IDS_PAGE_SIZE = 100;
/** Fallos seguidos que se toleran por job (pending/listing/cierre) y por partida. */
export const MAX_ATTEMPTS = 5;
/** Backoff entre reintentos del worker (encima de los reintentos propios del cliente). */
export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 10 * 60_000;
/** Margen del refresco incremental: se lista desde el fin de la última partida menos 60 s. */
export const INCREMENTAL_MARGIN_S = 60;

export type KeyStatus = (typeof KEY_STATUSES)[number];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export interface StepDeps {
  db: Db;
  riot: RiotApi;
  /** Epoch en ms. */
  now: () => number;
  /** Inicio de temporada: `startTime` del backfill. */
  seasonStart: Date;
  /** Línea de log (sin key ni puuids). */
  log: (message: string) => void;
}

export type StepResult =
  | { outcome: "worked"; jobId: number }
  | { outcome: "idle" }
  | {
      outcome: "paused";
      jobId: number;
      reason: string;
      /** `settings.updatedAt` en el momento de la pausa: si cambia, se reintenta. */
      baseline: Date;
    };

/** Espera tras el fallo número `attempts` (1, 2, ...): 30 s, 1 min, 2 min... hasta 10 min. */
export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1));
}

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  // Por si acaso: una key de Riot nunca debe acabar en un log ni en la BD.
  [/RGAPI-[\w-]+/g, "RGAPI-***"],
  // Cualquier cadena con forma de puuid (base64url largo).
  [/[A-Za-z0-9_-]{60,}/g, "***"],
];

/**
 * Mensaje de error apto para logs, `lastError` y `/api/health`. Los errores de Riot ya vienen
 * sin key ni puuid; los de Drizzle (`Failed query: ... params: ...`) llevan los parámetros de la
 * consulta (puuids), así que de ellos solo se usa el mensaje de `pg` (la causa).
 */
export function safeErrorMessage(error: unknown): string {
  let message: string;
  if (error instanceof RiotError) {
    message = error.message;
  } else if (error instanceof DrizzleQueryError) {
    message =
      error.cause instanceof Error ? error.cause.message : "error de BD";
  } else if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
  } else {
    message = String(error);
  }
  let safe = message.split("\n")[0] ?? "";
  for (const [pattern, replacement] of REDACTIONS) {
    safe = safe.replace(pattern, replacement);
  }
  return safe.slice(0, 300);
}

// --- Estado de la key (settings, fila id = 1) --------------------------------------------
// El worker NO toca `settings.updatedAt`: esa marca solo la mueve quien cambia la key
// (`/admin`), y el worker en pausa la vigila para saber cuándo reintentar (stack §7.1).

export interface KeyState {
  keyStatus: KeyStatus;
  updatedAt: Date;
}

export async function readKeyState(db: Db): Promise<KeyState> {
  const [row] = await db
    .select({ keyStatus: settings.keyStatus, updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return row ?? { keyStatus: "unknown", updatedAt: new Date(0) };
}

/** 401/403: `keyStatus = 'invalid'`. Devuelve `settings.updatedAt` (la referencia de la pausa). */
export async function markKeyInvalid(
  db: Db,
  reason: string,
  now: Date,
): Promise<Date> {
  const values = {
    keyStatus: "invalid" as const,
    keyStatusSince: now,
    keyStatusReason: reason,
  };
  const [row] = await db
    .update(settings)
    .set({ ...values, updatedAt: sql`${settings.updatedAt}` })
    .where(eq(settings.id, 1))
    .returning({ updatedAt: settings.updatedAt });
  if (row) return row.updatedAt;
  const [inserted] = await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoNothing()
    .returning({ updatedAt: settings.updatedAt });
  return inserted?.updatedAt ?? now;
}

/** Primera petición OK con una key: `keyStatus = 'ok'` (si no lo estaba ya). */
export async function markKeyOk(db: Db, now: Date): Promise<void> {
  await db
    .update(settings)
    .set({
      keyStatus: "ok",
      keyStatusSince: now,
      keyStatusReason: null,
      updatedAt: sql`${settings.updatedAt}`,
    })
    .where(and(eq(settings.id, 1), ne(settings.keyStatus, "ok")));
}

/**
 * Arranque con una key marcada `invalid` que no está en BD (sale de `RIOT_API_KEY`): vuelve a
 * `unknown` para reprobarla una vez. Devuelve `true` si cambió algo.
 */
export async function markKeyUnknown(db: Db, now: Date): Promise<boolean> {
  const rows = await db
    .update(settings)
    .set({
      keyStatus: "unknown",
      keyStatusSince: now,
      keyStatusReason: null,
      updatedAt: sql`${settings.updatedAt}`,
    })
    .where(and(eq(settings.id, 1), eq(settings.keyStatus, "invalid")))
    .returning({ id: settings.id });
  return rows.length > 0;
}

// --- Selección del trabajo ---------------------------------------------------------------

interface JobRow {
  job: SyncJob;
  gameName: string;
  tagLine: string;
  /** Interno: nunca va a logs ni a mensajes de error. */
  puuid: string | null;
}

type Action =
  | { type: "resolve" }
  | { type: "list" }
  | { type: "fetch"; matchId: string }
  | { type: "close" };

interface Work {
  row: JobRow;
  action: Action;
}

const riotIdOf = (row: JobRow) => `${row.gameName}#${row.tagLine}`;
const label = (row: JobRow) => `job ${row.job.id} (${riotIdOf(row)})`;

function selectJobs(db: Queryable) {
  return db
    .select({
      job: syncJobs,
      gameName: profiles.gameName,
      tagLine: profiles.tagLine,
      puuid: profiles.puuid,
    })
    .from(syncJobs)
    .innerJoin(profiles, eq(profiles.id, syncJobs.profileId));
}

/** Job sin backoff pendiente (`nextRunAt` vacío o vencido). */
const isDue = (now: Date) =>
  or(isNull(syncJobs.nextRunAt), lte(syncJobs.nextRunAt, now));

/**
 * Siguiente trabajo según las prioridades de sync-strategy.md §2:
 * (1) jobs interactivos en `pending`/`listing`; (2) el resto de `pending`/`listing` (listar es
 * barato y da el total para la barra de progreso); (3) detalle de los `fetching` en round-robin
 * (`lastServedAt` más antiguo primero, los interactivos antes).
 */
async function pickWork(db: Db, now: Date): Promise<Work | null> {
  const [early] = await selectJobs(db)
    .where(and(inArray(syncJobs.status, ["pending", "listing"]), isDue(now)))
    .orderBy(desc(syncJobs.interactive), asc(syncJobs.id))
    .limit(1);
  if (early) {
    return {
      row: early,
      action: { type: early.job.status === "pending" ? "resolve" : "list" },
    };
  }

  const candidates = await selectJobs(db)
    .where(and(eq(syncJobs.status, "fetching"), isDue(now)))
    .orderBy(
      desc(syncJobs.interactive),
      sql`${syncJobs.lastServedAt} asc nulls first`,
      asc(syncJobs.id),
    );
  for (const row of candidates) {
    const action = await nextFetchAction(db, row.job, now);
    if (action) return { row, action };
  }
  return null;
}

/**
 * En un job `fetching`: el primer id (en el orden del job: más reciente primero) cuyo
 * `match_fetch` esté `pending` y vencido; `close` si ya están todos resueltos; `null` si solo
 * quedan partidas esperando su backoff.
 */
async function nextFetchAction(
  db: Db,
  job: SyncJob,
  now: Date,
): Promise<Action | null> {
  if (job.matchIds.length === 0) return { type: "close" };
  const rows = await db
    .select({
      matchId: matchFetch.matchId,
      status: matchFetch.status,
      nextAttemptAt: matchFetch.nextAttemptAt,
    })
    .from(matchFetch)
    .where(inArray(matchFetch.matchId, job.matchIds));
  const byId = new Map(rows.map((r) => [r.matchId, r]));
  let waiting = false;
  for (const matchId of job.matchIds) {
    const row = byId.get(matchId);
    // Sin fila (no debería pasar: se crean al listar) cuenta como pendiente.
    if (!row) return { type: "fetch", matchId };
    if (row.status !== "pending") continue;
    if (!row.nextAttemptAt || row.nextAttemptAt <= now) {
      return { type: "fetch", matchId };
    }
    waiting = true;
  }
  return waiting ? null : { type: "close" };
}

// --- Persistencia común ------------------------------------------------------------------

/** `fetched` = ids del job resueltos (`done`/`missing`/`error`), para los jobs que casen. */
async function recountFetched(q: Queryable, filter: SQL | undefined) {
  await q
    .update(syncJobs)
    .set({
      fetched: sql`(select count(*)::int from match_fetch mf where mf.match_id = any(sync_jobs.match_ids) and mf.status in ('done', 'missing', 'error'))`,
    })
    .where(and(eq(syncJobs.status, "fetching"), filter));
}

/**
 * Marca el job como servido para el round-robin (y reinicia su contador de fallos: ha avanzado).
 * `lastServedAt` crece siempre (aunque dos pasos caigan en el mismo milisegundo o el reloj
 * retroceda) para que la rotación no se atasque.
 */
async function markServed(q: Queryable, jobId: number, now: Date) {
  await q
    .update(syncJobs)
    .set({
      attempts: 0,
      lastServedAt: sql`greatest(${now.toISOString()}::timestamptz, coalesce((select max(s.last_served_at) from sync_jobs s where s.status = 'fetching'), ${now.toISOString()}::timestamptz) + interval '1 millisecond')`,
    })
    .where(eq(syncJobs.id, jobId));
}

/**
 * Resuelve una partida en `match_fetch` y recalcula `fetched` de TODOS los jobs `fetching` que
 * la contienen (una partida compartida hace avanzar el progreso de cada perfil).
 */
async function resolveMatchFetch(
  db: Db,
  jobId: number,
  matchId: string,
  status: "done" | "missing" | "error",
  now: Date,
  extra: { attempts?: number; lastError?: string | null; served: boolean },
) {
  await db.transaction(async (tx) => {
    const values = {
      status,
      nextAttemptAt: null,
      lastError: extra.lastError ?? null,
      ...(extra.attempts === undefined ? {} : { attempts: extra.attempts }),
    };
    await tx
      .insert(matchFetch)
      .values({ matchId, ...values })
      .onConflictDoUpdate({ target: matchFetch.matchId, set: values });
    await recountFetched(tx, sql`${matchId} = any(${syncJobs.matchIds})`);
    if (extra.served) await markServed(tx, jobId, now);
  });
}

/** Ids en el orden de llegada (dentro de cada cola, más reciente primero), sin duplicados. */
function mergeIds(existing: readonly string[], page: readonly string[]) {
  return [...new Set([...existing, ...page])];
}

/** Parte numérica de un `matchId` (`EUW1_7999000010` -> 7999000010); -1 si no la tiene. */
function matchNumber(matchId: string): number {
  const digits = matchId.slice(matchId.lastIndexOf("_") + 1);
  return /^\d+$/.test(digits) ? Number(digits) : -1;
}

/**
 * Ids de más reciente a más antigua. En una misma plataforma (EUW1) la parte numérica del
 * `matchId` crece con el tiempo, así que ordenarla equivale a ordenar por fecha sin pedir el
 * detalle. Cada cola llega ordenada por separado; al fusionarlas hay que reordenar para que el
 * detalle se descargue de más reciente a más antigua entre las dos. Desempate por el texto.
 */
function sortNewestFirst(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const diff = matchNumber(b) - matchNumber(a);
    if (diff !== 0) return diff;
    return a < b ? 1 : a > b ? -1 : 0;
  });
}

function requirePuuid(row: JobRow): string {
  if (!row.puuid) throw new Error(`${label(row)}: el perfil no tiene puuid`);
  return row.puuid;
}

const priorityOf = (job: SyncJob, fallback: Priority): Priority =>
  job.interactive ? PRIORITY.interactive : fallback;

// --- Pasos -------------------------------------------------------------------------------

/** pending: Riot ID -> puuid (Account-V1, prioridad interactiva) y paso a `listing`. */
async function resolveAccount(deps: StepDeps, row: JobRow, now: Date) {
  const { db } = deps;
  const { job } = row;
  const toListing = {
    status: "listing" as const,
    startedAt: job.startedAt ?? now,
    attempts: 0,
    nextRunAt: null,
    lastError: null,
  };
  if (row.puuid) {
    await db.update(syncJobs).set(toListing).where(eq(syncJobs.id, job.id));
    return;
  }

  let account: Awaited<ReturnType<RiotApi["getAccountByRiotId"]>>;
  try {
    account = await deps.riot.getAccountByRiotId(
      row.gameName,
      row.tagLine,
      PRIORITY.interactive,
    );
  } catch (error) {
    // 404 (o 400: Riot ID mal formado): el perfil no existe en Riot. No se reintenta.
    if (
      error instanceof RiotNotFoundError ||
      error instanceof RiotBadRequestError
    ) {
      await db.transaction(async (tx) => {
        await tx
          .update(profiles)
          .set({ status: "not_found" })
          .where(eq(profiles.id, job.profileId));
        await tx
          .update(syncJobs)
          .set({
            status: "error",
            lastError: "Riot ID no encontrado",
            startedAt: job.startedAt ?? now,
            finishedAt: now,
            nextRunAt: null,
          })
          .where(eq(syncJobs.id, job.id));
      });
      deps.log(`${label(row)}: Riot ID no encontrado`);
      return;
    }
    throw error;
  }

  // Otra fila ya tiene ese puuid (p. ej. un cambio de Riot ID): no se duplica el jugador.
  const [other] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(eq(profiles.puuid, account.puuid), ne(profiles.id, job.profileId)),
    )
    .limit(1);
  if (other) {
    await db
      .update(syncJobs)
      .set({
        status: "error",
        lastError: `la cuenta ya está registrada como el perfil ${other.id}`,
        startedAt: job.startedAt ?? now,
        finishedAt: now,
        nextRunAt: null,
      })
      .where(eq(syncJobs.id, job.id));
    deps.log(`${label(row)}: cuenta ya registrada como perfil ${other.id}`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        status: "active",
      })
      .where(eq(profiles.id, job.profileId));
    await tx.update(syncJobs).set(toListing).where(eq(syncJobs.id, job.id));
  });
  deps.log(
    `job ${job.id} (${account.gameName}#${account.tagLine}): Riot ID resuelto`,
  );
}

/**
 * `startTime` del incremental: fin de la partida más reciente que ya listó un job `done` de ESTE
 * perfil (menos 60 s de margen), o el inicio de temporada si no hay ninguna.
 *
 * Se usan las partidas listadas por los jobs del propio perfil, no todas las partidas en las que
 * aparece: un amigo que refresca antes puede haber guardado ya la última partida en trío, y
 * partir de ella saltaría las partidas que el perfil jugó sin él entre medias. Además, así el
 * valor no cambia mientras el job pagina (ningún job de este perfil termina entretanto).
 */
async function incrementalStartTime(
  db: Db,
  profileId: number,
  seasonStartS: number,
): Promise<number> {
  const result = await db.execute<{ last_end: string | number | null }>(sql`
    select max(m.game_end_timestamp) as last_end
    from matches m
    where m.match_id in (
      select unnest(j.match_ids) from sync_jobs j
      where j.profile_id = ${profileId} and j.status = 'done'
    )`);
  const lastEnd = result.rows[0]?.last_end;
  if (lastEnd === null || lastEnd === undefined) return seasonStartS;
  const fromLast = Math.floor(Number(lastEnd) / 1000) - INCREMENTAL_MARGIN_S;
  return Math.max(seasonStartS, fromLast);
}

/**
 * listing: una página de ids de la cola `ARENA_QUEUE_IDS[listQueueIndex]`, desde `listCursor`.
 * - Página llena -> se guardan ids y cursor en la misma escritura y se sigue con la misma cola.
 * - Página incompleta con más colas por delante -> se guardan los ids, se pasa a la cola
 *   siguiente (`listQueueIndex + 1`, cursor a 0) y el job sigue en `listing`.
 * - Página incompleta en la última cola -> fin del listado: los ids de todas las colas se ordenan
 *   de más reciente a más antigua, se crean las filas de `match_fetch`, se resuelven sin petición
 *   las que ya están en `matches` y el job pasa a `fetching`.
 *
 * Backfill: todos los ids de la temporada (el total del progreso). Incremental: solo los que no
 * están en `matches`, con un único `startTime` para las dos colas; sin ninguno nuevo, el job queda
 * con 0 ids y el siguiente paso lo cierra (AC5: 1 petición de ids por cola y ninguna de detalle).
 */
async function listPage(deps: StepDeps, row: JobRow) {
  const { db } = deps;
  const { job } = row;
  const puuid = requirePuuid(row);
  const queueId = ARENA_QUEUE_IDS[job.listQueueIndex];
  if (queueId === undefined) {
    throw new Error(`${label(row)}: cola ${job.listQueueIndex} fuera de rango`);
  }
  const lastQueue = job.listQueueIndex >= ARENA_QUEUE_IDS.length - 1;
  const seasonStartS = Math.floor(deps.seasonStart.getTime() / 1000);
  const startTime =
    job.kind === "backfill"
      ? seasonStartS
      : await incrementalStartTime(db, job.profileId, seasonStartS);

  const page = await deps.riot.getMatchIds(
    puuid,
    {
      start: job.listCursor,
      count: MATCH_IDS_PAGE_SIZE,
      queue: queueId,
      startTime,
    },
    priorityOf(job, PRIORITY.list),
  );
  // Si entra una partida nueva mientras se pagina, los desplazamientos corren una posición y la
  // siguiente página repite ids: `mergeIds` los descarta (no se salta ninguno).
  const merged = mergeIds(job.matchIds, page);
  const listCursor = job.listCursor + page.length;
  const reset = { attempts: 0, nextRunAt: null, lastError: null };

  if (page.length >= MATCH_IDS_PAGE_SIZE) {
    await db
      .update(syncJobs)
      .set({ matchIds: merged, listCursor, ...reset })
      .where(eq(syncJobs.id, job.id));
    deps.log(`${label(row)}: ${merged.length} ids listados, sigue`);
    return;
  }

  if (!lastQueue) {
    await db
      .update(syncJobs)
      .set({
        matchIds: merged,
        listQueueIndex: job.listQueueIndex + 1,
        listCursor: 0,
        ...reset,
      })
      .where(eq(syncJobs.id, job.id));
    deps.log(
      `${label(row)}: cola ${queueId} completa (${merged.length} ids), sigue con la siguiente`,
    );
    return;
  }

  const ids = sortNewestFirst(merged);
  const queued = await db.transaction(async (tx) => {
    let queue = ids;
    if (job.kind === "incremental" && ids.length > 0) {
      const known = await tx
        .select({ matchId: matches.matchId })
        .from(matches)
        .where(inArray(matches.matchId, ids));
      const knownIds = new Set(known.map((k) => k.matchId));
      queue = ids.filter((id) => !knownIds.has(id));
    }
    if (queue.length > 0) {
      await tx
        .insert(matchFetch)
        .values(queue.map((matchId) => ({ matchId })))
        .onConflictDoNothing();
      // Ya descargadas por otro perfil (o por un paso que murió tras `storeMatch`).
      await tx
        .update(matchFetch)
        .set({ status: "done", nextAttemptAt: null, lastError: null })
        .where(
          and(
            inArray(matchFetch.matchId, queue),
            ne(matchFetch.status, "done"),
            sql`exists (select 1 from matches m where m.match_id = match_fetch.match_id)`,
          ),
        );
    }
    await tx
      .update(syncJobs)
      .set({
        status: "fetching",
        matchIds: queue,
        totalIds: queue.length,
        listCursor,
        ...reset,
      })
      .where(eq(syncJobs.id, job.id));
    await recountFetched(tx, eq(syncJobs.id, job.id));
    return queue.length;
  });
  deps.log(`${label(row)}: listado completo, ${queued} partidas en cola`);
}

/** fetching: detalle de una partida -> `storeMatch` -> `match_fetch` resuelto. */
async function fetchMatch(
  deps: StepDeps,
  row: JobRow,
  matchId: string,
  now: Date,
) {
  const { db } = deps;
  const { job } = row;

  // La trajo otro job, o el proceso murió entre `storeMatch` y la marca: sin petición.
  const [stored] = await db
    .select({ matchId: matches.matchId })
    .from(matches)
    .where(eq(matches.matchId, matchId))
    .limit(1);
  if (stored) {
    await resolveMatchFetch(db, job.id, matchId, "done", now, {
      served: false,
    });
    return;
  }

  let detail: Awaited<ReturnType<RiotApi["getMatch"]>>;
  try {
    detail = await deps.riot.getMatch(
      matchId,
      priorityOf(job, PRIORITY.detail),
    );
  } catch (error) {
    if (error instanceof RiotAuthError) throw error;
    if (error instanceof RiotNotFoundError) {
      // 404: no existe o expiró. No se reintenta.
      await resolveMatchFetch(db, job.id, matchId, "missing", now, {
        served: true,
      });
      deps.log(`${label(row)}: ${matchId} no existe (missing)`);
      return;
    }
    await registerFetchFailure(deps, row, matchId, error, now);
    return;
  }

  await storeMatch(db, detail.match, detail.raw);
  await resolveMatchFetch(db, job.id, matchId, "done", now, { served: true });
  const [progress] = await db
    .select({ fetched: syncJobs.fetched, totalIds: syncJobs.totalIds })
    .from(syncJobs)
    .where(eq(syncJobs.id, job.id));
  if (
    progress &&
    (progress.fetched % 25 === 0 || progress.fetched === progress.totalIds)
  ) {
    deps.log(`${label(row)}: ${progress.fetched}/${progress.totalIds}`);
  }
}

/** Fallo no-auth del detalle: reintento con backoff; permanente o al 5º intento, `error`. */
async function registerFetchFailure(
  deps: StepDeps,
  row: JobRow,
  matchId: string,
  error: unknown,
  now: Date,
) {
  const { db } = deps;
  const lastError = safeErrorMessage(error);
  const [current] = await db
    .select({ attempts: matchFetch.attempts })
    .from(matchFetch)
    .where(eq(matchFetch.matchId, matchId));
  const attempts = (current?.attempts ?? 0) + 1;
  const permanent =
    error instanceof RiotBadRequestError || error instanceof RiotSchemaError;

  if (permanent || attempts >= MAX_ATTEMPTS) {
    await resolveMatchFetch(db, row.job.id, matchId, "error", now, {
      attempts,
      lastError,
      served: true,
    });
    deps.log(`${label(row)}: ${matchId} en error (${lastError})`);
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(matchFetch)
      .set({
        attempts,
        lastError,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
      })
      .where(eq(matchFetch.matchId, matchId));
    await markServed(tx, row.job.id, now);
  });
  deps.log(
    `${label(row)}: ${matchId} falló (intento ${attempts}/${MAX_ATTEMPTS}): ${lastError}`,
  );
}

/**
 * Cierre: contador del challenge 602002 (Challenges-V1, host `euw1`), icono de invocador
 * (Summoner-V4, host `euw1`), `lastSyncedAt` y job `done`. También en el incremental sin
 * partidas nuevas: el criterio AC5 cuenta peticiones de ids (1 por cola), y refrescar el contador
 * oficial en cada sync es lo que permite compararlo con la lista verificada (va a otro host, con
 * su propia ventana de límite). Si `player-data` falla por algo que no es la key, se anota en
 * `lastError` y el job se cierra igualmente. Con el icono igual (`summoner: …`): las dos
 * llamadas son independientes y un fallo de una no quita la otra.
 */
async function closeJob(deps: StepDeps, row: JobRow, now: Date) {
  const { db } = deps;
  const { job } = row;
  let challenge: ReturnType<typeof extractChallenge> = null;
  let profileIconId: number | null = null;
  const closeErrors: string[] = [];
  if (row.puuid) {
    try {
      const playerData = await deps.riot.getPlayerData(
        row.puuid,
        priorityOf(job, PRIORITY.list),
      );
      challenge = extractChallenge(playerData, CHALLENGE_ARENA_GOD);
    } catch (error) {
      if (error instanceof RiotAuthError) throw error;
      closeErrors.push(`player-data: ${safeErrorMessage(error)}`);
    }
    try {
      const summoner = await deps.riot.getSummonerByPuuid(
        row.puuid,
        priorityOf(job, PRIORITY.list),
      );
      profileIconId = summoner.profileIconId;
    } catch (error) {
      if (error instanceof RiotAuthError) throw error;
      closeErrors.push(`summoner: ${safeErrorMessage(error)}`);
    }
  }
  const closeError = closeErrors.length > 0 ? closeErrors.join("; ") : null;

  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({
        lastSyncedAt: now,
        // Si falla la llamada se conserva el icono que ya hubiera.
        ...(profileIconId !== null ? { profileIconId } : {}),
        ...(challenge
          ? {
              challengeValue: challenge.value,
              challengeLevel: challenge.level,
              challengeCheckedAt: now,
            }
          : {}),
      })
      .where(eq(profiles.id, job.profileId));
    await recountFetched(tx, eq(syncJobs.id, job.id));
    await tx
      .update(syncJobs)
      .set({
        status: "done",
        finishedAt: now,
        lastError: closeError,
        nextRunAt: null,
      })
      .where(eq(syncJobs.id, job.id));
  });
  const challengeText = challenge ? `, 602002 = ${challenge.value}` : "";
  deps.log(
    `${label(row)}: terminado (${job.kind}, ${job.totalIds} partidas${challengeText})${closeError ? ` [${closeError}]` : ""}`,
  );
}

/**
 * Fallo de un paso que no es de auth ni lo gestiona el propio paso (5xx/429 persistentes al
 * listar, error de BD, bug...): backoff del job; permanente o al 5º fallo seguido, `error`.
 */
async function failJob(deps: StepDeps, row: JobRow, error: unknown, now: Date) {
  const lastError = safeErrorMessage(error);
  const attempts = row.job.attempts + 1;
  const permanent =
    error instanceof RiotBadRequestError ||
    error instanceof RiotSchemaError ||
    error instanceof RiotNotFoundError;
  if (permanent || attempts >= MAX_ATTEMPTS) {
    await deps.db
      .update(syncJobs)
      .set({
        status: "error",
        attempts,
        lastError,
        finishedAt: now,
        nextRunAt: null,
      })
      .where(eq(syncJobs.id, row.job.id));
    deps.log(`${label(row)}: error (${lastError})`);
    return;
  }
  await deps.db
    .update(syncJobs)
    .set({
      attempts,
      lastError,
      nextRunAt: new Date(now.getTime() + retryDelayMs(attempts)),
    })
    .where(eq(syncJobs.id, row.job.id));
  deps.log(
    `${label(row)}: fallo ${attempts}/${MAX_ATTEMPTS}, se reintenta (${lastError})`,
  );
}

/**
 * Ejecuta el siguiente paso de trabajo. `idle` si no hay nada que hacer ahora; `paused` si Riot
 * rechazó la key (401/403 o no hay key): se marca `settings.keyStatus = 'invalid'` y el job y su
 * `match_fetch` quedan exactamente como estaban (sin consumir intento).
 */
export async function runNextStep(deps: StepDeps): Promise<StepResult> {
  const now = new Date(deps.now());
  const work = await pickWork(deps.db, now);
  if (!work) return { outcome: "idle" };
  const { row, action } = work;

  try {
    switch (action.type) {
      case "resolve":
        await resolveAccount(deps, row, now);
        break;
      case "list":
        await listPage(deps, row);
        break;
      case "fetch":
        await fetchMatch(deps, row, action.matchId, now);
        break;
      case "close":
        await closeJob(deps, row, now);
        break;
    }
  } catch (error) {
    if (error instanceof RiotAuthError) {
      const reason = safeErrorMessage(error);
      const baseline = await markKeyInvalid(deps.db, reason, now);
      deps.log(`${label(row)}: key rechazada por Riot, worker en pausa`);
      return { outcome: "paused", jobId: row.job.id, reason, baseline };
    }
    await failJob(deps, row, error, now);
  }
  return { outcome: "worked", jobId: row.job.id };
}
