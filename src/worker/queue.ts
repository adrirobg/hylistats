import { EventEmitter } from "node:events";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  ACTIVE_SYNC_JOB_STATUSES,
  type Profile,
  profiles,
  syncJobs,
} from "@/db/schema";

// Cola persistente de sincronización (sync-strategy.md §2 y §3): lo que la web encola para el
// worker. Aquí no se llama nunca a Riot; todas las llamadas las hace el worker (spec,
// "Decisiones técnicas").

/** Cooldown del botón "Actualizar": no se encola otro refresco hasta 60 s después del último. */
export const REFRESH_COOLDOWN_MS = 60_000;
/** Al abrir un perfil se refresca si la última sincronización tiene más de 2 min. */
export const STALE_AFTER_MS = 2 * 60_000;

export type RefreshResult = "queued" | "active" | "cooldown";
/** `fresh`: no hace falta refrescar (sincronizado hace poco, o el Riot ID no existe). */
export type EnsureFreshResult = RefreshResult | "fresh";

/** Identidad primaria del perfil: `lower(gameName)#lower(tagLine)`, sin espacios en los extremos. */
export function normalizeRiotId(gameName: string, tagLine: string): string {
  return `${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}`;
}

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

export interface EnsureFreshOptions {
  now?: Date;
  staleAfterMs?: number;
  cooldownMs?: number;
}

/**
 * Al abrir la página de un perfil: encola un refresco NO interactivo si la última
 * sincronización tiene más de `staleAfterMs` (o no la hay) y no hay job activo. Un perfil
 * `not_found` no se refresca solo (cada intento gastaría una petición de Account-V1): para
 * reintentarlo está `requestRefresh`.
 */
export async function ensureFreshOnView(
  db: Db,
  profileId: number,
  {
    now = new Date(),
    staleAfterMs = STALE_AFTER_MS,
    cooldownMs,
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
