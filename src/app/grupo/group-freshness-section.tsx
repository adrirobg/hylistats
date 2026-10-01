import { getDb } from "@/db";
import { countActiveGroupSyncs } from "@/domain/group-sync";
import type { GroupView } from "@/domain/group-view";
import { GroupFreshness } from "./group-freshness";

/**
 * Hueco `freshness` de `GroupViewPanel` en `/grupo` y en la pestaña Grupo: lee cuántos miembros
 * tienen un job activo (decide el ritmo de la relectura) y pasa al cliente solo datos
 * serializables, sin `puuid`.
 */
export async function GroupFreshnessSection({ view }: { view: GroupView }) {
  if (view.members.length === 0) return null;
  const active = await countActiveGroupSyncs(getDb());
  const { oldestSync } = view;
  return (
    <GroupFreshness
      oldest={
        oldestSync && {
          gameName: oldestSync.gameName,
          tagLine: oldestSync.tagLine,
          lastSyncedAt: oldestSync.lastSyncedAt?.getTime() ?? null,
        }
      }
      active={active}
      members={view.members.length}
      nowMs={Date.now()}
    />
  );
}
