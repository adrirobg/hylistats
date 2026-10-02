import type { GroupSyncState } from "@/domain/sync-status";
import {
  groupSyncToJson,
  profileSyncToJson,
  type StatusPayload,
} from "@/lib/status-payload";
import type { ProfileView } from "./data";

/**
 * Estado con el que se pinta la página de un perfil (`initial` de `StatusProvider`), con lo que
 * `loadProfilePage` ya cargó: el mismo JSON que devolvería `GET /api/estado`, sin otra consulta, y
 * las versiones leídas antes de cargar. Así el primer render del cliente coincide con el HTML.
 * `now`: hora del servidor al empezar a cargar. `group`: solo en la vista del grupo de un miembro
 * (como `?grupo=1`); si no, `null`.
 */
export function profilePageStatus(
  data: ProfileView,
  now: number,
  group: GroupSyncState | null,
): StatusPayload {
  return {
    now,
    kind: "profile",
    version: data.versions.version,
    groupVersion: data.versions.groupVersion,
    profile: profileSyncToJson(data),
    group: group && groupSyncToJson(group),
  };
}
