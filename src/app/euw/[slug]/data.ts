import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ACTIVE_SYNC_JOB_STATUSES, profiles, syncJobs } from "@/db/schema";
import { getProfileStats, type ProfileChallenge } from "@/domain/queries";
import type { StatsSummary, VerifiedChampion } from "@/domain/stats";
import { getKeyStatus } from "@/lib/admin/key-service";
import { getSeasonStart } from "@/lib/config";
import { normalizeRiotId } from "@/worker/queue";

// Carga de datos de `/euw/{nombre}-{tag}`, separada de la página para poder probarla contra la
// BD. Devuelve una lista blanca explícita: ni el `puuid` (ni siquiera se lee del perfil) ni los
// compañeros (van en #3) llegan a la página.

/** Progreso del job activo. Fases: `pending` -> resolviendo, `listing` -> listando, `fetching` -> descargando. */
export type SyncProgress = { kind: "backfill" | "incremental" } & (
  | { phase: "resolving" }
  // Durante el listado `totalIds` vale 0 (se fija al acabar de listar): se cuentan los ids ya listados.
  | { phase: "listing"; listedIds: number }
  | { phase: "fetching"; fetched: number; total: number }
);

/** Perfil registrado y resuelto: lo que muestra la página completa. */
export interface ProfileView {
  kind: "profile";
  /** Forma canónica de Riot (puede diferir en mayúsculas del Riot ID de la URL). */
  gameName: string;
  tagLine: string;
  seasonStart: Date;
  lastSyncedAt: Date | null;
  /** Job en curso (`null` si no hay ninguno). */
  sync: SyncProgress | null;
  /** La key de Riot está caducada (`keyStatus = 'invalid'`): no se actualiza hasta rotarla. */
  paused: boolean;
  summary: StatsSummary;
  verifiedChampions: VerifiedChampion[];
  challenge: ProfileChallenge;
}

export type ProfilePageData =
  /** El Riot ID no está registrado: la página ofrece registrarlo. */
  | { kind: "unregistered"; gameName: string; tagLine: string }
  /** Riot (Account-V1) no conoce ese Riot ID. */
  | { kind: "not_found"; gameName: string; tagLine: string }
  | ProfileView;

/** Job activo del perfil (`pending`/`listing`/`fetching`) como progreso; `null` si no hay. */
async function loadSyncProgress(
  db: Db,
  profileId: number,
): Promise<SyncProgress | null> {
  const [job] = await db
    .select({
      kind: syncJobs.kind,
      status: syncJobs.status,
      totalIds: syncJobs.totalIds,
      fetched: syncJobs.fetched,
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
  if (!job) return null;
  switch (job.status) {
    case "pending":
      return { kind: job.kind, phase: "resolving" };
    case "listing":
      return { kind: job.kind, phase: "listing", listedIds: job.listedIds };
    case "fetching":
      return {
        kind: job.kind,
        phase: "fetching",
        fetched: job.fetched,
        total: job.totalIds,
      };
    default:
      return null; // `done`/`error` no son activos (el filtro ya los excluye)
  }
}

/**
 * Todo lo que pinta la página de un Riot ID. El perfil se busca por `riotIdNorm`
 * (`lower(nombre)#lower(tag)`), no por el nombre canónico. `seasonStart` sale de `SEASON_START`
 * salvo que se pase otro (tests).
 */
export async function loadProfilePage(
  db: Db,
  gameName: string,
  tagLine: string,
  seasonStart: Date = getSeasonStart(),
): Promise<ProfilePageData> {
  const [profile] = await db
    .select({
      id: profiles.id,
      gameName: profiles.gameName,
      tagLine: profiles.tagLine,
      status: profiles.status,
      lastSyncedAt: profiles.lastSyncedAt,
    })
    .from(profiles)
    .where(eq(profiles.riotIdNorm, normalizeRiotId(gameName, tagLine)))
    .limit(1);
  const unregistered = { kind: "unregistered", gameName, tagLine } as const;
  if (!profile) return unregistered;
  if (profile.status === "not_found") {
    return {
      kind: "not_found",
      gameName: profile.gameName,
      tagLine: profile.tagLine,
    };
  }

  const [stats, sync, key] = await Promise.all([
    getProfileStats(db, profile.id, seasonStart),
    loadSyncProgress(db, profile.id),
    getKeyStatus(db),
  ]);
  if (!stats) return unregistered; // borrado entre las dos consultas

  return {
    kind: "profile",
    gameName: profile.gameName,
    tagLine: profile.tagLine,
    seasonStart,
    lastSyncedAt: profile.lastSyncedAt,
    sync,
    paused: key.status === "invalid",
    summary: stats.summary,
    verifiedChampions: stats.verifiedChampions,
    challenge: stats.challenge,
  };
}
