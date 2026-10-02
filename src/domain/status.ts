import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { profiles } from "@/db/schema";
import { groupVersion, profileVersion } from "@/lib/data-version";
import type { RiotId } from "@/lib/riot-id";
import {
  groupSyncToJson,
  profileSyncToJson,
  type StatusPayload,
} from "@/lib/status-payload";
import { ensureFreshOnView, normalizeRiotId } from "@/worker/queue";
import { safeErrorMessage } from "@/worker/steps";
import { isGroupMember } from "./group";
import { ensureGroupFresh } from "./group-sync";
import { loadGroupSyncState, loadProfileSyncState } from "./sync-status";

// Petición de estado (F26, `GET /api/estado`): versión de datos y estado de la sincronización de
// lo que mira la página (un perfil y, si es miembro, el grupo). Hace también de latido: aplica la
// frescura (`ensureFreshOnView` / `ensureGroupFresh`), como mucho una vez cada 30 s por perfil
// entre todos los visores. Solo consultas ligeras: nunca `GroupView` ni las stats.

/** Cada perfil se comprueba como mucho una vez en este intervalo, sumando todos los visores. */
export const FRESHNESS_CHECK_EVERY_MS = 30_000;

// Último instante (epoch ms) en que se comprobó la frescura de cada perfil. En `globalThis`, como
// la señal de despertar de `src/worker/queue.ts` (una sola instancia de la app). Crece con los
// perfiles que alguien mira, que son pocos: no se poda.
const globalForChecks = globalThis as typeof globalThis & {
  __hylistatsFreshnessChecks?: Map<number, number>;
};

function freshnessChecks(): Map<number, number> {
  globalForChecks.__hylistatsFreshnessChecks ??= new Map();
  return globalForChecks.__hylistatsFreshnessChecks;
}

/**
 * ¿Toca comprobar la frescura del perfil? Si sí, la apunta ya (antes de comprobar), así dos
 * visores simultáneos no la repiten. `false` si se comprobó hace menos de 30 s.
 */
export function claimFreshnessCheck(profileId: number, nowMs: number): boolean {
  const checks = freshnessChecks();
  const last = checks.get(profileId);
  if (last !== undefined && nowMs - last < FRESHNESS_CHECK_EVERY_MS) {
    return false;
  }
  checks.set(profileId, nowMs);
  return true;
}

export interface LoadStatusOptions {
  /** La página mira la vista del grupo: frescura de los miembros y estado del grupo. */
  group: boolean;
  now?: Date;
}

/**
 * Estado de un Riot ID (buscado por `riotIdNorm`, como la página). Primero la frescura, para que
 * lo que encole salga ya en esta respuesta; un Riot ID sin registrar o `not_found` no encola nada
 * (son las reglas de `ensureFreshOnView`). Un fallo de la frescura no tumba el estado: se loguea
 * saneado y se responde igual.
 */
export async function loadStatus(
  db: Db,
  riotId: RiotId,
  { group, now = new Date() }: LoadStatusOptions,
): Promise<StatusPayload> {
  const [profile] = await db
    .select({
      id: profiles.id,
      status: profiles.status,
      lastSyncedAt: profiles.lastSyncedAt,
    })
    .from(profiles)
    .where(
      eq(profiles.riotIdNorm, normalizeRiotId(riotId.gameName, riotId.tagLine)),
    )
    .limit(1);
  if (!profile) {
    return {
      now: now.getTime(),
      kind: "unregistered",
      version: null,
      groupVersion: null,
      profile: null,
      group: null,
    };
  }

  const isMember = await isGroupMember(db, profile.id);
  const nowMs = now.getTime();
  if (profile.status !== "not_found") {
    try {
      if (claimFreshnessCheck(profile.id, nowMs)) {
        await ensureFreshOnView(db, profile.id, { now });
      }
      if (group && isMember) {
        await ensureGroupFresh(db, now, {
          shouldCheck: (id) => claimFreshnessCheck(id, nowMs),
        });
      }
    } catch (error) {
      console.error(`[estado] frescura: ${safeErrorMessage(error)}`);
    }
  }

  const [syncState, groupState] = await Promise.all([
    loadProfileSyncState(db, profile, now),
    group && isMember ? loadGroupSyncState(db) : null,
  ]);
  return {
    now: nowMs,
    kind: profile.status === "not_found" ? "not_found" : "profile",
    version: profileVersion(profile.id),
    groupVersion: isMember ? groupVersion() : null,
    profile: profileSyncToJson(syncState),
    group: groupState && groupSyncToJson(groupState),
  };
}
