import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { groupMembers, profiles } from "@/db/schema";
import { bumpProfileVersions } from "@/lib/data-version";

// A quién sube la versión de datos (`@/lib/data-version`) lo que guarda el worker. Las consultas
// van ANTES de subir (o dentro de la transacción que guarda): la subida en memoria va justo
// después del commit y no puede fallar, así que un error de BD no deja datos nuevos sin versión.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Perfiles registrados a los que afecta un cambio y si alguno es miembro del grupo. */
export interface VersionTargets {
  profileIds: number[];
  group: boolean;
}

const selectTargets = (q: Db | Tx) =>
  q
    .select({ id: profiles.id, member: groupMembers.profileId })
    .from(profiles)
    .leftJoin(groupMembers, eq(groupMembers.profileId, profiles.id));

function toTargets(
  rows: readonly { id: number; member: number | null }[],
): VersionTargets {
  return {
    profileIds: rows.map((r) => r.id),
    group: rows.some((r) => r.member !== null),
  };
}

/**
 * Perfiles registrados entre los participantes de una partida (por `puuid`), en una consulta: una
 * partida guardada sube la versión de CADA perfil registrado que juega en ella, la guarde el job
 * de quien la guarde. El `puuid` no sale de aquí.
 */
export async function targetsByPuuid(
  q: Db | Tx,
  puuids: readonly string[],
): Promise<VersionTargets> {
  if (puuids.length === 0) return { profileIds: [], group: false };
  return toTargets(
    await selectTargets(q).where(inArray(profiles.puuid, [...puuids])),
  );
}

/** El propio perfil (602002, icono, resolución) y si es miembro. */
export async function targetsOfProfile(
  q: Db | Tx,
  profileId: number,
): Promise<VersionTargets> {
  return toTargets(await selectTargets(q).where(eq(profiles.id, profileId)));
}

/** Sube la versión de los perfiles afectados y, si alguno es miembro, la del grupo. */
export function bumpVersions(targets: VersionTargets | null): void {
  if (!targets || targets.profileIds.length === 0) return;
  bumpProfileVersions(targets.profileIds, { group: targets.group });
}
