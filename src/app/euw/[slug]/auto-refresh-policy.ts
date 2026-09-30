// Política de `AutoRefresh` como funciones puras (sin React ni DOM), para poder probarla: la UI de
// este repo no tiene jsdom. El componente solo aplica lo que decide este módulo.
//
// El guardia de "como mucho un incremental automático cada 5 min por perfil" (AC3 de #3) está en
// el servidor (`ensureFreshOnView`), así que aquí sobra prudencia: comprobar cada 60 s solo toca
// la BD propia y no gasta ninguna petición a Riot. Con la pestaña oculta no se hace nada.

/** Con un job activo el progreso se relee cada 3 s; sin él, cada 30 s (polling a la BD propia). */
export const POLL_ACTIVE_MS = 3_000;
export const POLL_IDLE_MS = 30_000;
/** Latido de la comprobación (`ensureFreshOnViewAction`) mientras la pestaña está visible. */
export const CHECK_EVERY_MS = 60_000;

/** Lo que ocurre en la página y puede pedir trabajo. */
export type AutoRefreshEvent =
  /** El componente se monta (una vez por visita). */
  | "mount"
  /** La pestaña pasa a `visible` (`visibilitychange`). */
  | "visible"
  /** Salta el latido de comprobación. */
  | "checkTick"
  /** Salta el polling de relectura. */
  | "pollTick";

export interface AutoRefreshActions {
  /** Llamar a `ensureFreshOnViewAction` (y refrescar si encola algo o ya hay un job). */
  check: boolean;
  /** Llamar a `router.refresh()` ya. */
  refresh: boolean;
}

const NONE: AutoRefreshActions = { check: false, refresh: false };

/**
 * Qué hacer ante un evento. Con la pestaña oculta, nada. Al volver a `visible` se comprueba y,
 * además, se relee la página ya: lo que pasó mientras estaba oculta no espera al siguiente tick.
 * Al montar solo se comprueba (la página acaba de renderizarse en el servidor).
 */
export function autoRefreshOnEvent(
  event: AutoRefreshEvent,
  visible: boolean,
): AutoRefreshActions {
  if (!visible) return NONE;
  switch (event) {
    case "mount":
    case "checkTick":
      return { check: true, refresh: false };
    case "visible":
      return { check: true, refresh: true };
    case "pollTick":
      return { check: false, refresh: true };
  }
}

export interface AutoRefreshIntervals {
  /** Periodo de `router.refresh()`; `null` = sin polling. */
  pollMs: number | null;
  /** Periodo de la comprobación; `null` = sin latido. */
  checkMs: number | null;
}

/** Intervalos que deben estar activos: ninguno con la pestaña oculta; el polling sigue a `active`. */
export function autoRefreshIntervals({
  visible,
  active,
}: {
  visible: boolean;
  active: boolean;
}): AutoRefreshIntervals {
  if (!visible) return { pollMs: null, checkMs: null };
  return {
    pollMs: active ? POLL_ACTIVE_MS : POLL_IDLE_MS,
    checkMs: CHECK_EVERY_MS,
  };
}
