import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "@/db";
import {
  ACTIVE_SYNC_JOB_STATUSES,
  matchFetch,
  type SyncJob,
  syncJobs,
} from "@/db/schema";
import { getKeyStatus } from "@/lib/admin/key-service";
import { classifyRetry } from "@/lib/riot/errors";
import { listGroupMembers } from "./group";
import { countActiveGroupSyncs } from "./group-sync";
import { type OldestSync, oldestSyncOf } from "./group-view";

// Estado de la sincronización de un perfil y del grupo: job activo y progreso, cola, error del
// último job, pausa por key y "sincronizado hace…". Lo leen la página del perfil
// (`loadProfilePage`) y la petición de estado (`/api/estado`), que lo consulta cada pocos
// segundos: aquí solo hay consultas ligeras a `sync_jobs`, `match_fetch`, `profiles` y `settings`,
// nunca el cálculo del grupo ni el de las stats. Ningún texto de error sale de este módulo.

/**
 * Por qué un job espera para reintentar: `rate_limit` (Riot devolvió 429 de forma persistente) o
 * `error` (5xx, red...). Sale de clasificar el `lastError` en el servidor (`classifyRetry`); el
 * texto nunca viaja.
 */
export type RetryReason = "rate_limit" | "error";

/**
 * Cola compartida de la personal key, en recuentos (sin ids ni perfiles ajenos). Los recuentos
 * siguen el orden de `pickWork` (`src/worker/steps.ts`):
 * - `ahead`: jobs de otros perfiles en `pending`/`listing` que se sirven antes que este (solo con
 *   este job en `pending`/`listing`; en `fetching` vale 0);
 * - `sharing`: otros jobs en `fetching` con los que este reparte las peticiones (solo con este
 *   job en `fetching`; si no, 0).
 */
export interface SyncQueue {
  ahead: number;
  sharing: number;
}

/** Progreso del job activo. Fases: `pending` -> resolviendo, `listing` -> listando, `fetching` -> descargando. */
export type SyncProgress = {
  kind: "backfill" | "incremental";
  /**
   * Cuándo se reintenta el job si ahora está esperando (backoff): su `nextRunAt` futuro o, en
   * `fetching`, la `nextAttemptAt` más próxima si todas las partidas que faltan esperan la suya.
   * `null` si no espera.
   */
  retryAt: Date | null;
  /** Motivo de la espera; `null` exactamente cuando `retryAt` es `null`. */
  reason: RetryReason | null;
  /** Otros jobs delante o repartiendo con este; `null` si no hay ninguno (o si el job espera a reintentar). */
  queue: SyncQueue | null;
} & (
  | { phase: "resolving" }
  // Durante el listado `totalIds` vale 0 (se fija al acabar de listar): se cuentan los ids ya listados.
  | { phase: "listing"; listedIds: number }
  | { phase: "fetching"; fetched: number; total: number }
);

/** El job activo tal como lo lee `loadSyncProgress` (con lo que no sale de este módulo). */
interface ActiveJob {
  id: number;
  status: SyncJob["status"];
  interactive: boolean;
  nextRunAt: Date | null;
  /** Solo para clasificarlo (`classifyRetry`): el texto no sale del servidor. */
  lastError: string | null;
}

/** Job sin backoff pendiente: la misma condición que `isDue` de `pickWork`. */
const dueAt = (now: Date) =>
  or(isNull(syncJobs.nextRunAt), lte(syncJobs.nextRunAt, now));

/**
 * Si el job está esperando para reintentar: su `nextRunAt` si es futuro (`pickWork` se lo salta
 * entero) y, en `fetching`, la `nextAttemptAt` más próxima si TODAS las partidas que faltan
 * esperan la suya. Para lo segundo basta la primera fila pendiente por `nextAttemptAt` (los
 * vacíos, que están listos, primero): si esa ya venció o no tiene espera, hay algo que descargar.
 */
async function loadRetry(
  db: Db,
  job: ActiveJob,
  now: Date,
): Promise<{ retryAt: Date; reason: RetryReason } | null> {
  if (job.nextRunAt && job.nextRunAt > now) {
    return { retryAt: job.nextRunAt, reason: classifyRetry(job.lastError) };
  }
  if (job.status !== "fetching") return null;
  const [next] = await db
    .select({
      nextAttemptAt: matchFetch.nextAttemptAt,
      lastError: matchFetch.lastError,
    })
    .from(matchFetch)
    .innerJoin(syncJobs, sql`${matchFetch.matchId} = any(${syncJobs.matchIds})`)
    .where(and(eq(syncJobs.id, job.id), eq(matchFetch.status, "pending")))
    .orderBy(sql`${matchFetch.nextAttemptAt} asc nulls first`)
    .limit(1);
  if (!next?.nextAttemptAt || next.nextAttemptAt <= now) return null;
  return {
    retryAt: next.nextAttemptAt,
    reason: classifyRetry(next.lastError),
  };
}

/**
 * Cuántos jobs de otros perfiles hay delante o repartiendo con este, con el criterio de
 * `pickWork`:
 * - `pending`/`listing`: se sirven antes que cualquier `fetching`, por `interactive desc, id asc`.
 *   Delante están los `pending`/`listing` sin backoff con más prioridad: los interactivos si este
 *   no lo es y, entre iguales, los de `id` menor.
 * - `fetching`: reparto en round-robin entre los `fetching` sin backoff. Un job interactivo solo
 *   reparte con otros interactivos (los demás esperan a que acaben); uno que no lo es, con todos.
 *   Aproximación: no mira si a esos jobs les queda algo que pedir (toda su cola puede estar en
 *   backoff), así que puede contar de más un instante.
 * Solo recuentos: ni ids ni perfiles ajenos.
 */
async function loadQueue(
  db: Db,
  job: ActiveJob,
  now: Date,
): Promise<SyncQueue | null> {
  const fetching = job.status === "fetching";
  const others: SQL | undefined = and(ne(syncJobs.id, job.id), dueAt(now));
  const scope = fetching
    ? and(
        eq(syncJobs.status, "fetching"),
        job.interactive ? eq(syncJobs.interactive, true) : undefined,
      )
    : and(
        inArray(syncJobs.status, ["pending", "listing"]),
        job.interactive
          ? and(eq(syncJobs.interactive, true), lt(syncJobs.id, job.id))
          : or(eq(syncJobs.interactive, true), lt(syncJobs.id, job.id)),
      );
  const [row] = await db
    .select({ n: count() })
    .from(syncJobs)
    .where(and(others, scope));
  const n = row?.n ?? 0;
  if (n === 0) return null;
  return fetching ? { ahead: 0, sharing: n } : { ahead: n, sharing: 0 };
}

/** Job activo del perfil (`pending`/`listing`/`fetching`) como progreso; `null` si no hay. */
async function loadSyncProgress(
  db: Db,
  profileId: number,
  now: Date,
): Promise<SyncProgress | null> {
  const [job] = await db
    .select({
      id: syncJobs.id,
      kind: syncJobs.kind,
      status: syncJobs.status,
      interactive: syncJobs.interactive,
      totalIds: syncJobs.totalIds,
      fetched: syncJobs.fetched,
      nextRunAt: syncJobs.nextRunAt,
      lastError: syncJobs.lastError,
      // Solo el recuento: el array puede tener miles de ids y la página se refresca cada 3 s.
      listedIds: sql<number>`cardinality(${syncJobs.matchIds})`.mapWith(Number),
    })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.profileId, profileId),
        inArray(syncJobs.status, [...ACTIVE_SYNC_JOB_STATUSES]),
      ),
    )
    .orderBy(desc(syncJobs.id))
    .limit(1);
  if (!job || job.status === "done" || job.status === "error") return null;
  const [retry, queue] = await Promise.all([
    loadRetry(db, job, now),
    loadQueue(db, job, now),
  ]);
  // Un job que espera su reintento no está en la cola: no se sirve hasta `retryAt`.
  const wait = {
    retryAt: retry?.retryAt ?? null,
    reason: retry?.reason ?? null,
    queue: retry ? null : queue,
  };
  switch (job.status) {
    case "pending":
      return { kind: job.kind, ...wait, phase: "resolving" };
    case "listing":
      return {
        kind: job.kind,
        ...wait,
        phase: "listing",
        listedIds: job.listedIds,
      };
    case "fetching":
      return {
        kind: job.kind,
        ...wait,
        phase: "fetching",
        fetched: job.fetched,
        total: job.totalIds,
      };
  }
}

/**
 * ¿Falló la última actualización? Mira el último job terminado del perfil (`done`/`error`, por
 * `id`: solo hay un job activo por perfil, así que el orden de ids es el de finalización). Un
 * `done` posterior borra el aviso. Solo devuelve el instante: `lastError` no sale de la BD.
 */
async function loadLastJobError(
  db: Db,
  profileId: number,
): Promise<{ at: Date } | null> {
  const [last] = await db
    .select({
      status: syncJobs.status,
      finishedAt: syncJobs.finishedAt,
      updatedAt: syncJobs.updatedAt,
    })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.profileId, profileId),
        inArray(syncJobs.status, ["done", "error"]),
      ),
    )
    .orderBy(desc(syncJobs.id))
    .limit(1);
  if (last?.status !== "error") return null;
  return { at: last.finishedAt ?? last.updatedAt };
}

/** Estado de la sincronización de un perfil (lo común a la página y a la petición de estado). */
export interface ProfileSyncState {
  lastSyncedAt: Date | null;
  /** Job en curso (`null` si no hay ninguno). */
  sync: SyncProgress | null;
  /** El último job terminado acabó en `error` (cuándo); sin el texto de `lastError`. */
  lastJobError: { at: Date } | null;
  /** La key de Riot está caducada (`keyStatus = 'invalid'`): no se actualiza hasta rotarla. */
  paused: boolean;
}

/** Estado de la sincronización del perfil, con su `lastSyncedAt` ya leído (no se relee). */
export async function loadProfileSyncState(
  db: Db,
  profile: { id: number; lastSyncedAt: Date | null },
  now: Date,
): Promise<ProfileSyncState> {
  const [sync, lastJobError, key] = await Promise.all([
    loadSyncProgress(db, profile.id, now),
    loadLastJobError(db, profile.id),
    getKeyStatus(db),
  ]);
  return {
    lastSyncedAt: profile.lastSyncedAt,
    sync,
    lastJobError,
    paused: key.status === "invalid",
  };
}

/** Estado de la sincronización del grupo (vista del grupo). */
export interface GroupSyncState {
  members: number;
  /** Miembros con un job activo ahora. */
  active: number;
  /** El miembro con la sincronización menos reciente (`GroupView.oldestSync`); `null` sin miembros. */
  oldestSync: OldestSync | null;
}

/** Miembros, jobs activos de miembros y sincronización más antigua: dos consultas, sin `GroupView`. */
export async function loadGroupSyncState(db: Db): Promise<GroupSyncState> {
  const [members, active] = await Promise.all([
    listGroupMembers(db),
    countActiveGroupSyncs(db),
  ]);
  return {
    members: members.length,
    active,
    oldestSync: oldestSyncOf(members),
  };
}
