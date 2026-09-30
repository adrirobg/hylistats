"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  addRecent,
  clearMyProfile,
  clearProfileData,
  createLocalStore,
  EMPTY_STATE,
  exportState,
  type ImportResult,
  importState,
  type LocalState,
  type LocalStore,
  removeRecent,
  STORAGE_KEY,
  setManual,
  setMyProfile,
  toggleFavorite,
  toggleTarget,
} from "@/lib/local-store";
import type { RiotId } from "@/lib/riot-id";

// Hook cliente sobre el almacén de `local-store.ts` (F5 y F6). El servidor y la hidratación ven
// SIEMPRE el estado vacío (`getServerSnapshot`): así el HTML del servidor y el primer render del
// cliente coinciden aunque haya datos guardados, y React repinta con el estado real justo después
// de hidratar. Un componente que dependa de esos datos (p. ej. la redirección de la landing a
// "mi perfil") debe esperar a `useLocalReady()`: hasta entonces "sin datos" no es fiable.

/** Instancia única y perezosa: se crea en el primer uso en el navegador. */
let store: LocalStore | null = null;

/** `window.localStorage`, o `null` si no existe o acceder a la propiedad lanza (storage bloqueado). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStore(): LocalStore {
  if (typeof window === "undefined") {
    // Un almacén en el servidor sería estado compartido entre peticiones de usuarios distintos.
    throw new Error(
      "El almacén local solo existe en el navegador: usa las acciones en efectos o manejadores de eventos.",
    );
  }
  if (store) return store;
  const storage = browserStorage();
  const created = createLocalStore(storage);
  if (storage) {
    // Otra pestaña escribió (o borró el storage): se vuelve a leer. `key === null` es `clear()`.
    window.addEventListener("storage", (event) => {
      if (
        event.storageArea === storage &&
        (event.key === null || event.key === STORAGE_KEY)
      ) {
        created.reload();
      }
    });
  }
  store = created;
  return created;
}

const subscribe = (listener: () => void) => getStore().subscribe(listener);
const readState = () => getStore().getState();

/**
 * Envuelve `selector` para que devuelva la misma referencia mientras el estado no cambie.
 * `useSyncExternalStore` compara snapshots con `Object.is`: un selector que crea un objeto o un
 * array en cada llamada (`(s) => s.favorites.map(...)`) haría que React lo viera "cambiado" en
 * cada comprobación y entrara en bucle. Así cualquier selector es seguro.
 */
function memoizeSelector<T>(
  selector: (state: LocalState) => T,
  read: () => LocalState,
): () => T {
  let last: { state: LocalState; value: T } | undefined;
  return () => {
    const state = read();
    if (last && last.state === state) return last.value;
    const value = selector(state);
    last = { state, value };
    return value;
  };
}

/**
 * Lee una parte del estado local y repinta cuando cambia (también por cambios de otra pestaña).
 * En el servidor y durante la hidratación evalúa `selector` sobre el estado vacío.
 *
 *   const me = useLocalStore((s) => s.myProfile);
 *   const { targets } = useLocalStore((s) => profileData(s, norm));
 *
 * El estado es inmutable (arrays `readonly`): para ordenar, copia antes.
 */
export function useLocalStore<T>(selector: (state: LocalState) => T): T {
  const getSnapshot = useMemo(
    () => memoizeSelector(selector, readState),
    [selector],
  );
  const getServerSnapshot = useMemo(
    () => memoizeSelector(selector, () => EMPTY_STATE),
    [selector],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const noopSubscribe = () => () => {};

/**
 * `false` en el servidor y durante la hidratación; `true` desde que el cliente ya pinta con los
 * datos reales de `localStorage`. Sirve para no decidir nada (redirigir, mostrar "sin favoritos")
 * con el estado vacío del primer render.
 */
export function useLocalReady(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Acciones sobre el estado local. Objeto estable (no hace falta `useCallback`). Solo en el
 * navegador: llamarlas durante el render en el servidor lanza.
 */
export const localActions = {
  /** Fija "mi perfil" (la landing directa). */
  setMyProfile: (riotId: RiotId) =>
    getStore().dispatch((s) => setMyProfile(s, riotId)),
  /** Olvida "mi perfil". */
  clearMyProfile: () => getStore().dispatch(clearMyProfile),
  /** Añade a favoritos, o quita si ya estaba. */
  toggleFavorite: (riotId: RiotId) =>
    getStore().dispatch((s) => toggleFavorite(s, riotId, Date.now())),
  /** Registra la visita: el perfil pasa el primero de recientes. */
  addRecent: (riotId: RiotId) =>
    getStore().dispatch((s) => addRecent(s, riotId, Date.now())),
  removeRecent: (riotId: RiotId) =>
    getStore().dispatch((s) => removeRecent(s, riotId)),
  /** `norm` es el `riotIdNorm` del perfil (`normalizeRiotId`). */
  toggleTarget: (norm: string, championId: number) =>
    getStore().dispatch((s) => toggleTarget(s, norm, championId)),
  setManual: (norm: string, championId: number, on: boolean) =>
    getStore().dispatch((s) => setManual(s, norm, championId, on)),
  /** Borra los objetivos y las marcas manuales de un perfil. */
  clearProfileData: (norm: string) =>
    getStore().dispatch((s) => clearProfileData(s, norm)),
  /** Texto del export (JSON) del estado actual. */
  exportText: () => exportState(getStore().getState()),
  /** Sustituye el estado por el de un export. Si no es válido, no cambia nada y devuelve el error. */
  importText: (text: string): ImportResult => {
    const result = importState(text);
    if (result.ok) getStore().dispatch(() => result.state);
    return result;
  },
};
