import { countDistinct, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { ACTIVE_SYNC_JOB_STATUSES, groupMembers, syncJobs } from "@/db/schema";
import { ensureFreshOnView, requestRefresh } from "@/worker/queue";
import { listGroupMembers } from "./group";

// Frescura del grupo (P9): pedir el incremental de los miembros. No hay reglas nuevas: cada
// miembro pasa por `ensureFreshOnView` (disparos automáticos) o `requestRefresh` (botón), con su
// límite de 2 min o de 60 s y su job activo propio, así que un doble disparo (dos visores de la
// vista del grupo, o la frescura del propio perfil) no encola dos veces. Aquí nunca se llama a Riot: todo
// va a `sync_jobs` y lo atiende el worker con su limitador.

/** Resultado de pedir el incremental de todos los miembros, contado por desenlace. */
export interface GroupSyncSummary {
  /** Miembros del grupo (de ellos y solo de ellos se encola). */
  members: number;
  /** Incrementales encolados ahora. */
  queued: number;
  /** Miembros que ya tenían un job en curso. */
  active: number;
  /** Miembros dentro del límite de su último job (el de 2 min o el de 60 s del botón). */
  cooldown: number;
  /**
   * Miembros que no hacían falta (sincronizados hace poco, perfil `not_found` o, con `shouldCheck`,
   * comprobados hace poco por otro visor). Solo en automático.
   */
  fresh: number;
}

function emptySummary(members: number): GroupSyncSummary {
  return { members, queued: 0, active: 0, cooldown: 0, fresh: 0 };
}

export interface EnsureGroupFreshOptions {
  /**
   * Si devuelve `false`, el miembro no se comprueba (cuenta como `fresh`): la petición de estado
   * lo usa para comprobar cada perfil como mucho una vez cada 30 s entre todos los visores.
   */
  shouldCheck?: (profileId: number) => boolean;
}

/**
 * Disparo automático (al abrir la vista, al volver a la pestaña, latido): `ensureFreshOnView` por
 * cada miembro. Los miembros se leen del servidor; nadie puede pedir el de un perfil que no lo es.
 */
export async function ensureGroupFresh(
  db: Db,
  now: Date = new Date(),
  { shouldCheck }: EnsureGroupFreshOptions = {},
): Promise<GroupSyncSummary> {
  const members = await listGroupMembers(db);
  const summary = emptySummary(members.length);
  for (const { profileId } of members) {
    if (shouldCheck && !shouldCheck(profileId)) {
      summary.fresh += 1;
      continue;
    }
    const result = await ensureFreshOnView(db, profileId, { now });
    summary[result] += 1;
  }
  return summary;
}

/** Botón «Actualizar grupo»: `requestRefresh` interactivo por cada miembro (cooldown de 60 s). */
export async function refreshGroup(
  db: Db,
  now: Date = new Date(),
): Promise<GroupSyncSummary> {
  const members = await listGroupMembers(db);
  const summary = emptySummary(members.length);
  for (const { profileId } of members) {
    const result = await requestRefresh(db, profileId, {
      interactive: true,
      now,
    });
    summary[result] += 1;
  }
  return summary;
}

/** Cuántos miembros tienen ahora un job activo (la vista se relee mientras haya alguno). */
export async function countActiveGroupSyncs(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: countDistinct(syncJobs.profileId) })
    .from(syncJobs)
    .innerJoin(groupMembers, eq(groupMembers.profileId, syncJobs.profileId))
    .where(inArray(syncJobs.status, [...ACTIVE_SYNC_JOB_STATUSES]));
  return row?.count ?? 0;
}
