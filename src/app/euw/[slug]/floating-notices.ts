// Qué aviso de sincronización enseña la pila flotante del perfil (T08, revisión v4), sin React: los
// avisos que hablan del *sistema* (si los datos se están actualizando o se pueden actualizar) no van
// en el flujo, sino en una pila abajo a la derecha que enseña uno persistente a la vez, el de mayor
// prioridad, y encima el toast de Actualizar. Cerrar un aviso vale para su `kind`: no vuelve hasta
// que ese `kind` deja de estar activo (el progreso, hasta que cambia de fase). Lo pinta la vitrina
// (`vitrina.tsx`, con `sync-notice.tsx`); los avisos del contenido (Arena fuera de rotación,
// descuadre del trofeo, estados vacíos) se quedan en su sitio.

import type { SyncProgress } from "./data";
import {
  incrementalStatus,
  type SyncBandModel,
  syncBandModel,
} from "./view-model";

/** Un aviso de la pila. El límite de peticiones dice de qué job es: cambian los textos. */
export type SyncNoticeModel =
  /** La última actualización falló (Riot no responde): lleva [Reintentar]. */
  | { kind: "error" }
  | Exclude<SyncBandModel, { kind: "rate_limit" }>
  | (Extract<SyncBandModel, { kind: "rate_limit" }> & {
      job: "backfill" | "incremental";
    });

export type SyncNoticeKind = SyncNoticeModel["kind"];

/**
 * Prioridad (menor, antes): error de la actualización, pausa por key caducada, límite de
 * peticiones y, al final, el progreso del backfill y la cola.
 */
const PRIORITY: Record<SyncNoticeKind, number> = {
  error: 0,
  paused: 1,
  rate_limit: 2,
  resolving: 3,
  listing: 3,
  fetching: 3,
  queued: 3,
};

export interface SyncNoticeInput {
  sync: SyncProgress | null;
  /** Key de Riot caducada. */
  paused: boolean;
  /** Último job fallido (ms); `null` si el último fue bien. */
  errorAt: number | null;
  /** En ms. */
  now: number;
}

/**
 * Los avisos activos, en cualquier orden. Las reglas de hoy se mantienen: con la key caducada el
 * error no sale (la pausa ya explica por qué no se actualiza, y reintentar no serviría), ni con un
 * job en marcha (ese intento aún no ha terminado); la pausa manda sobre el resto del backfill
 * (`syncBandModel`) y el incremental solo avisa del límite de peticiones (`incrementalStatus`: la
 * cola va en el botón Actualizar).
 */
export function syncNotices({
  sync,
  paused,
  errorAt,
  now,
}: SyncNoticeInput): SyncNoticeModel[] {
  const notices: SyncNoticeModel[] = [];
  if (errorAt !== null && sync === null && !paused) {
    notices.push({ kind: "error" });
  }
  const band = syncBandModel(sync, paused, now);
  if (band) {
    notices.push(
      band.kind === "rate_limit" ? { ...band, job: "backfill" } : band,
    );
  }
  const incremental = incrementalStatus(sync, paused, now);
  if (incremental?.kind === "rate_limit") {
    notices.push({
      kind: "rate_limit",
      minutes: incremental.minutes,
      progress: null,
      job: "incremental",
    });
  }
  return notices;
}

export interface FloatingNotices {
  /** El aviso que se enseña: el de mayor prioridad sin cerrar; `null` si no hay ninguno. */
  notice: SyncNoticeModel | null;
  /** El aviso cerrado de mayor prioridad que sigue activo (el indicador lo reabre); si no, `null`. */
  closed: SyncNoticeKind | null;
  /**
   * Los cerrados que siguen activos: los que ya no lo están salen, así vuelven a salir la próxima
   * vez. Es el mismo array que entra si no cambia nada.
   */
  dismissed: readonly SyncNoticeKind[];
}

/** Elige de `active` según la prioridad y los `kind`s cerrados. */
export function pickNotice(
  active: readonly SyncNoticeModel[],
  dismissed: readonly SyncNoticeKind[],
): FloatingNotices {
  const activeKinds = new Set(active.map((notice) => notice.kind));
  const kept = dismissed.filter((kind) => activeKinds.has(kind));
  const stillDismissed = kept.length === dismissed.length ? dismissed : kept;
  const byPriority = [...active].sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind],
  );
  return {
    notice:
      byPriority.find((notice) => !stillDismissed.includes(notice.kind)) ??
      null,
    closed:
      byPriority.find((notice) => stillDismissed.includes(notice.kind))?.kind ??
      null,
    dismissed: stillDismissed,
  };
}

/** `pickNotice` sobre los avisos del estado de la página (`syncNotices`). */
export function floatingNotices(
  input: SyncNoticeInput,
  dismissed: readonly SyncNoticeKind[],
): FloatingNotices {
  return pickNotice(syncNotices(input), dismissed);
}
