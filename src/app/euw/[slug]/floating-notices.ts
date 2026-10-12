// Los avisos del perfil en la pila flotante global (`@/components/hy/floating`; T08 y revisión v5b),
// sin React: cuáles de sincronización están activos y con qué prioridad, la prioridad de los avisos
// del contenido (Dios de Arena y Arena fuera de rotación), sus firmas y claves de cierre, y el rastro
// del aviso de Dios de Arena en la tarjeta. Prioridad (menor, antes): sincronización (0–3) > Dios de
// Arena > Arena fuera de rotación.
//
// Cerrar un aviso vale para su `id`. Los de sincronización llevan su `kind` (`syncNoticeId`) y se
// cierran en memoria: no vuelven hasta que ese `kind` deja de estar activo (el progreso, hasta que
// cambia de fase). Los del contenido llevan la firma de su estado y el cierre se guarda en
// `localStorage` por perfil (`closedNoticeKey`): no vuelven en cada visita mientras no cambie el
// estado. Los pintan la vitrina (`vitrina.tsx`, con `sync-notice.tsx`) y el trofeo (`god-trophy.tsx`).

import type { ArenaGodState } from "@/domain/arena-god";
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
export const SYNC_PRIORITY: Record<SyncNoticeKind, number> = {
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

/** `id` en la pila de un aviso de sincronización: cerrar vale para su `kind`. */
export const syncNoticeId = (kind: SyncNoticeKind) => `sync:${kind}`;

/** Prioridad del aviso de Dios de Arena: tras los de sincronización. */
export const GOD_PRIORITY = 10;
/** Prioridad del aviso de Arena fuera de rotación: el último. */
export const ARENA_QUIET_PRIORITY = 20;

/** Clave de `localStorage` del cierre de un aviso del contenido de un perfil (`normalizeRiotId`). */
export const closedNoticeKey = (profile: string, notice: "dios" | "arena") =>
  `hylistats:aviso-cerrado:${notice}:${profile}`;

/**
 * Firma (y `id` en la pila) del aviso de Dios de Arena: el caso y las cifras que dice. Con
 * cualquier cambio (un verificado más, una marca, otro oficial) es otro aviso y vuelve a salir.
 */
export const godNoticeSignature = (state: ArenaGodState) =>
  `dios:${state.status}:${state.verified}:${state.manual}:${state.official ?? "-"}`;

/** Firma del aviso de Arena fuera de rotación: vuelve a salir si llega otra partida de Arena. */
export const arenaQuietSignature = (lastArenaGameAt: number) =>
  `arena:${lastArenaGameAt}`;

/**
 * Rastro del aviso de Dios de Arena en la línea de datos de la tarjeta, donde va el «✓ oficial N»
 * cuando cuadra (D11): un texto corto que abre el aviso. `alert`: lleva la marca «!». Con una
 * sincronización en marcha el descuadre puede estar resolviéndose: lo dice. `null` si cuadra.
 */
export function godTrace(
  state: ArenaGodState,
  syncing: boolean,
): { text: string; alert: boolean } | null {
  if (state.status === "match") return null;
  if (syncing) return { text: "sincronizando…", alert: false };
  switch (state.status) {
    case "unknown":
      return { text: "sin contador oficial", alert: true };
    case "ahead":
      if (state.excess === "manual") {
        return { text: "revisa las marcas manuales", alert: true };
      }
      return {
        text: `no cuadra con el oficial (${state.official})`,
        alert: true,
      };
    case "missing":
      return {
        text: `no cuadra con el oficial (${state.official})`,
        alert: true,
      };
  }
}
