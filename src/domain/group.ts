import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { groupMembers, profiles } from "@/db/schema";
import {
  normalizeRiotId,
  parseRiotIdInput,
  riotIdInputError,
} from "@/lib/riot-id";

// Grupo fijo (F19): lista de perfiles guardada en `group_members`. Este módulo solo gestiona la
// lista; lo que se calcula sobre los miembros vive en otros módulos.

export interface GroupMember {
  profileId: number;
  gameName: string;
  tagLine: string;
  /** Interno (caché re-resoluble): `null` mientras el perfil no se ha resuelto. No se expone al cliente. */
  puuid: string | null;
  lastSyncedAt: Date | null;
}

export type AddGroupMemberResult =
  | { ok: true; added: boolean; profileId: number }
  | { ok: false; reason: "invalid" | "not_registered"; message: string };

export const NOT_REGISTERED_MESSAGE =
  "Ese Riot ID no está registrado: búscalo primero en la app";

/** Miembros del grupo, ordenados por Riot ID normalizado (orden estable). */
export async function listGroupMembers(db: Db): Promise<GroupMember[]> {
  return db
    .select({
      profileId: profiles.id,
      gameName: profiles.gameName,
      tagLine: profiles.tagLine,
      puuid: profiles.puuid,
      lastSyncedAt: profiles.lastSyncedAt,
    })
    .from(groupMembers)
    .innerJoin(profiles, eq(profiles.id, groupMembers.profileId))
    .orderBy(asc(profiles.riotIdNorm));
}

/** ¿El perfil es miembro del grupo? */
export async function isGroupMember(
  db: Db,
  profileId: number,
): Promise<boolean> {
  const rows = await db
    .select({ profileId: groupMembers.profileId })
    .from(groupMembers)
    .where(eq(groupMembers.profileId, profileId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Añade al grupo un perfil ya registrado, por Riot ID (`Nombre#TAG`, `Nombre-TAG` u op.gg).
 * Si el Riot ID no existe en `profiles` no crea nada. Añadir quien ya es miembro no hace nada
 * (`added: false`).
 */
export async function addGroupMemberByRiotId(
  db: Db,
  input: string,
): Promise<AddGroupMemberResult> {
  const parsed = parseRiotIdInput(input);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: "invalid",
      message: riotIdInputError(parsed.reason),
    };
  }
  const { gameName, tagLine } = parsed.riotId;
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.riotIdNorm, normalizeRiotId(gameName, tagLine)));
  if (!profile) {
    return {
      ok: false,
      reason: "not_registered",
      message: NOT_REGISTERED_MESSAGE,
    };
  }
  const inserted = await db
    .insert(groupMembers)
    .values({ profileId: profile.id })
    .onConflictDoNothing()
    .returning({ profileId: groupMembers.profileId });
  return { ok: true, added: inserted.length > 0, profileId: profile.id };
}

/** Quita un perfil del grupo. Devuelve `true` si era miembro. */
export async function removeGroupMember(
  db: Db,
  profileId: number,
): Promise<boolean> {
  const removed = await db
    .delete(groupMembers)
    .where(eq(groupMembers.profileId, profileId))
    .returning({ profileId: groupMembers.profileId });
  return removed.length > 0;
}
