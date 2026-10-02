import type {
  GroupSyncState,
  ProfileSyncState,
  SyncProgress,
} from "@/domain/sync-status";

// Contrato del JSON de `GET /api/estado` (F26): lo que el poller del cliente lee cada 10 s (5 s
// con sincronización en marcha). Módulo puro, sin BD: lo importan la ruta y el cliente. Fechas en
// epoch ms (el JSON no lleva `Date`); sin `puuid` ni textos de error.

/** `retryAt` en epoch ms, fase a fase (distributivo: conserva la unión por `phase`). */
type WithEpochRetry<T> = T extends unknown
  ? Omit<T, "retryAt"> & { retryAt: number | null }
  : never;

/** `SyncProgress` con `retryAt` en epoch ms. */
export type SyncProgressJson = WithEpochRetry<SyncProgress>;

/** Estado de la sincronización de un perfil registrado (`ProfileView` hace lo mismo con `Date`). */
export interface ProfileSyncJson {
  /** Epoch ms; `null`: nunca se ha sincronizado. */
  lastSyncedAt: number | null;
  /** Job en curso (`null` si no hay ninguno). */
  sync: SyncProgressJson | null;
  /** Epoch ms del último job terminado si acabó en `error`; `null` si no falló. */
  lastJobErrorAt: number | null;
  /** La key de Riot está caducada: no se actualiza hasta rotarla. */
  paused: boolean;
}

/** Estado de la sincronización del grupo (solo en la vista del grupo, `?grupo=1`). */
export interface GroupSyncJson {
  members: number;
  /** Miembros con un job activo ahora. */
  active: number;
  /** El miembro con la sincronización menos reciente; `null` sin miembros. */
  oldest: {
    gameName: string;
    tagLine: string;
    /** Epoch ms; `null`: nunca se ha sincronizado. */
    lastSyncedAt: number | null;
  } | null;
}

export interface StatusPayload {
  /** Hora del servidor (epoch ms), para los textos relativos ("hace 3 min"). */
  now: number;
  /**
   * `unregistered`: el Riot ID no está registrado; `not_found`: Riot no lo conoce; `profile`:
   * registrado (resuelto o resolviéndose). Coincide con `ProfilePageData["kind"]`.
   */
  kind: "unregistered" | "not_found" | "profile";
  /**
   * Versión de datos del perfil (cadena opaca: solo se compara por igualdad); `null` si no está
   * registrado. Cambia al guardar algo que se ve del perfil y tras un reinicio del servidor.
   */
  version: string | null;
  /** Versión de datos del grupo si el perfil es miembro; `null` si no lo es. */
  groupVersion: string | null;
  /** `null` solo con `kind = "unregistered"`. */
  profile: ProfileSyncJson | null;
  /** Solo con `?grupo=1` y el perfil miembro; si no, `null`. */
  group: GroupSyncJson | null;
}

/** `SyncProgress` -> JSON (servidor). */
export function syncProgressToJson(sync: SyncProgress): SyncProgressJson {
  return {
    ...sync,
    retryAt: sync.retryAt?.getTime() ?? null,
  } as SyncProgressJson;
}

/** JSON -> `SyncProgress` (cliente), para reutilizar lo que hoy pinta `ProfileView.sync`. */
export function syncProgressFromJson(sync: SyncProgressJson): SyncProgress {
  return {
    ...sync,
    retryAt: sync.retryAt === null ? null : new Date(sync.retryAt),
  } as SyncProgress;
}

/** Estado de la sincronización del perfil -> JSON (servidor: la ruta y el render de la página). */
export function profileSyncToJson(state: ProfileSyncState): ProfileSyncJson {
  return {
    lastSyncedAt: state.lastSyncedAt?.getTime() ?? null,
    sync: state.sync && syncProgressToJson(state.sync),
    lastJobErrorAt: state.lastJobError?.at.getTime() ?? null,
    paused: state.paused,
  };
}

/** Estado de la sincronización del grupo -> JSON (servidor: la ruta y el render de la página). */
export function groupSyncToJson(state: GroupSyncState): GroupSyncJson {
  return {
    members: state.members,
    active: state.active,
    oldest: state.oldestSync && {
      gameName: state.oldestSync.gameName,
      tagLine: state.oldestSync.tagLine,
      lastSyncedAt: state.oldestSync.lastSyncedAt?.getTime() ?? null,
    },
  };
}
