import { EventEmitter } from "node:events";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  ACTIVE_SYNC_JOB_STATUSES,
  type Profile,
  profiles,
  syncJobs,
} from "@/db/schema";
import { normalizeRiotId } from "@/lib/riot-id";

// Cola persistente de sincronización (sync-strategy.md §2 y §3): lo que la web encola para el
// worker. Aquí no se llama nunca a Riot; todas las llamadas las hace el worker (spec,
// "Decisiones técnicas").

/** Cooldown del botón "Actualizar": no se encola otro refresco hasta 60 s después del último. */
export const REFRESH_COOLDOWN_MS = 60_000;
/**
 * Disparos automáticos (la frescura de la petición de estado): como mucho uno cada 2 min por
 * perfil (F26; antes 5 min, AC3 de #3). Es también el cooldown por defecto de `ensureFreshOnView`.
 */
export const STALE_AFTER_MS = 2 * 60_000;

export type RefreshResult = "queued" | "active" | "cooldown";
/** `fresh`: no hace falta refrescar (sincronizado hace poco, o el Riot ID no existe). */
export type EnsureFreshResult = RefreshResult | "fresh";

// `normalizeRiotId` vive en `@/lib/riot-id` (módulo puro, también para el cliente); se re-exporta
// aquí para no tocar a los consumidores del lado servidor (worker, página, scripts y tests).
export { normalizeRiotId };

// --- Señal de despertar -----------------------------------------------------------------
// En `globalThis`: las rutas de Next e `instrumentation.ts` pueden cargar copias distintas de
// este módulo y la señal tiene que llegar al worker igualmente. `seq` permite al worker saber
// si llegó una señal mientras ejecutaba un paso (y no dormirse con trabajo pendiente).

interface WakeSignal {
  emitter: EventEmitter;
  seq: number;
}

const globalForSignal = globalThis as typeof globalThis & {
  __hylistatsWorkerSignal?: WakeSignal;
};

function getSignal(): WakeSignal {
  globalForSignal.__hylistatsWorkerSignal ??= {
    emitter: new EventEmitter(),
    seq: 0,
  };
  return globalForSignal.__hylistatsWorkerSignal;
}

/** Despierta al worker (hay trabajo nuevo o cambió la key). Es idempotente y barato. */
export function wakeWorker(): void {
  const signal = getSignal();
  signal.seq += 1;
  signal.emitter.emit("wake");
}

/** Número de señales emitidas hasta ahora (lo usa el worker para no perder una señal). */
export function wakeSeq(): number {
  return getSignal().seq;
}

/** Suscribe `listener` a la señal; devuelve la función que cancela la suscripción. */
export function onWake(listener: () => void): () => void {
  const { emitter } = getSignal();
  emitter.on("wake", listener);
  return () => {
    emitter.off("wake", listener);
  };
}

// --- Encolado ---------------------------------------------------------------------------

/**
 * Registra un perfil por Riot ID (upsert por `riotIdNorm`). Si es nuevo, crea en la misma
 * transacción su job `backfill` interactivo en `pending` y despierta al worker. Devuelve el
 * perfil (el existente si ya estaba registrado; no se crea otro job).
 *
 * El `puuid` del perfil es interno: quien lo muestre en UI, URLs o logs incumple stack §7.1.
 */
export async function registerProfile(
  db: Db,
  gameName: string,
  tagLine: string,
): Promise<Profile> {
  const name = gameName.trim();
  const tag = tagLine.trim();
  if (!name || !tag) throw new RangeError("Riot ID incompleto");
  const riotIdNorm = normalizeRiotId(name, tag);

  const created = await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(profiles)
      .values({ gameName: name, tagLine: tag, riotIdNorm })
      .onConflictDoNothing({ target: profiles.riotIdNorm })
      .returning();
    if (!profile) return undefined;
    await tx.insert(syncJobs).values({
      profileId: profile.id,
      kind: "backfill",
      interactive: true,
    });
    return profile;
  });
  if (created) {
    wakeWorker();
    return created;
  }

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.riotIdNorm, riotIdNorm))
    .limit(1);
  if (!existing) throw new Error("No se pudo registrar el perfil");
  return existing;
}

async function hasActiveJob(db: Db, profileId: number): Promise<boolean> {
  const [active] = await db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.profileId, profileId),
        inArray(syncJobs.status, [...ACTIVE_SYNC_JOB_STATUSES]),
      ),
    )
    .limit(1);
  return active !== undefined;
}

export interface RefreshOptions {
  /** Lo pide una persona (botón "Actualizar"): el worker lo atiende antes que el resto. */
  interactive: boolean;
  /** Hora actual (inyectable en tests). */
  now?: Date;
  cooldownMs?: number;
}

/**
 * Pide un refresco incremental del perfil:
 * - `active` si ya tiene un job en curso (no se hace nada);
 * - `cooldown` si su último job terminó hace menos de `cooldownMs`;
 * - `queued` si se ha encolado un job `incremental` (y se despierta al worker).
 */
export async function requestRefresh(
  db: Db,
  profileId: number,
  {
    interactive,
    now = new Date(),
    cooldownMs = REFRESH_COOLDOWN_MS,
  }: RefreshOptions,
): Promise<RefreshResult> {
  if (await hasActiveJob(db, profileId)) return "active";

  const [last] = await db
    .select({ finishedAt: syncJobs.finishedAt })
    .from(syncJobs)
    .where(
      and(eq(syncJobs.profileId, profileId), isNotNull(syncJobs.finishedAt)),
    )
    .orderBy(desc(syncJobs.finishedAt))
    .limit(1);
  if (
    last?.finishedAt &&
    now.getTime() - last.finishedAt.getTime() < cooldownMs
  ) {
    return "cooldown";
  }

  // El índice único parcial (un job activo por perfil) resuelve la carrera entre dos
  // peticiones simultáneas: la segunda no inserta nada y ve el job de la primera.
  const inserted = await db
    .insert(syncJobs)
    .values({ profileId, kind: "incremental", interactive })
    .onConflictDoNothing()
    .returning({ id: syncJobs.id });
  if (inserted.length === 0) return "active";
  wakeWorker();
  return "queued";
}

export type SeasonBackfillResult =
  | { outcome: "queued"; jobId: number }
  /** No hay ningún perfil con ese `riotIdNorm`. */
  | { outcome: "unknown" }
  /** El perfil existe pero no está `active` (aún se resuelve, o no existe en Riot). */
  | { outcome: "inactive"; status: Profile["status"] }
  /** Ya tiene un job en curso: no se encola otro. */
  | { outcome: "active" };

/**
 * Re-backfill de la temporada de un perfil ya sincronizado (p. ej. tras añadir una cola nueva a
 * `ARENA_QUEUE_IDS`): encola un job `backfill` NO interactivo (es mantenimiento, no lo pide una
 * persona) y despierta al worker. Las partidas que ya están en `matches` se resuelven sin
 * petición al listar, así que solo se descargan las que faltan.
 *
 * El job entra en `pending` como el del registro: al ser un perfil con `puuid`, el worker lo pasa
 * a `listing` en ese paso sin pedir nada a Riot (`resolveAccount`). `wakeWorker` solo llega a un
 * worker del mismo proceso; si se llama desde `sync:season`, el worker lo recoge por sondeo.
 */
export async function enqueueSeasonBackfill(
  db: Db,
  riotIdNorm: string,
): Promise<SeasonBackfillResult> {
  const [profile] = await db
    .select({ id: profiles.id, status: profiles.status })
    .from(profiles)
    .where(eq(profiles.riotIdNorm, riotIdNorm))
    .limit(1);
  if (!profile) return { outcome: "unknown" };
  if (profile.status !== "active") {
    return { outcome: "inactive", status: profile.status };
  }
  if (await hasActiveJob(db, profile.id)) return { outcome: "active" };

  // El índice único parcial (un job activo por perfil) resuelve la carrera con otro encolado.
  const [job] = await db
    .insert(syncJobs)
    .values({ profileId: profile.id, kind: "backfill", interactive: false })
    .onConflictDoNothing()
    .returning({ id: syncJobs.id });
  if (!job) return { outcome: "active" };
  wakeWorker();
  return { outcome: "queued", jobId: job.id };
}

export interface EnsureFreshOptions {
  now?: Date;
  staleAfterMs?: number;
  cooldownMs?: number;
}

/**
 * Guardia de los disparos automáticos de la página de un perfil (la petición de estado, que hace
 * de latido: `src/domain/status.ts`): encola un refresco NO interactivo si la última sincronización tiene
 * más de `staleAfterMs` (o no la hay) y no hay job activo. El cooldown por defecto es el mismo
 * umbral (no los 60 s del botón), así un incremental que acaba en `error` sin tocar
 * `lastSyncedAt` tampoco se repite antes de 2 min. Al vivir aquí, vale para varias pestañas y
 * visitantes. Un perfil `not_found` no se refresca solo (cada intento gastaría una petición de
 * Account-V1): para reintentarlo está `requestRefresh`.
 */
export async function ensureFreshOnView(
  db: Db,
  profileId: number,
  {
    now = new Date(),
    staleAfterMs = STALE_AFTER_MS,
    cooldownMs = STALE_AFTER_MS,
  }: EnsureFreshOptions = {},
): Promise<EnsureFreshResult> {
  const [profile] = await db
    .select({ status: profiles.status, lastSyncedAt: profiles.lastSyncedAt })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile || profile.status === "not_found") return "fresh";
  if (await hasActiveJob(db, profileId)) return "active";
  if (
    profile.lastSyncedAt &&
    now.getTime() - profile.lastSyncedAt.getTime() < staleAfterMs
  ) {
    return "fresh";
  }
  return requestRefresh(db, profileId, { interactive: false, now, cooldownMs });
}
