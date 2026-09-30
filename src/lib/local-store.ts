import { z } from "zod";
import { normalizeRiotId, type RiotId, toRiotId } from "@/lib/riot-id";

// Datos personales del usuario en su navegador (think.md F5 y F6): "mi perfil", favoritos,
// recientes, y objetivos y marcas manuales por perfil. Viven solo en `localStorage`; el servidor
// nunca los ve. Módulo puro (sin React ni `window`): el estado, los reductores, el export/import
// y el almacén. El hook cliente está en `use-local-store.ts`.
//
// Todo funciona igual sin storage (modo privado, storage bloqueado o cuota llena): el estado
// vive en memoria y, si guardar falla, se pierde al cerrar la pestaña, sin romper nada.

/** Clave de `localStorage`. La versión del formato va también dentro del valor (`v`). */
export const STORAGE_KEY = "hylistats:v1";
/** Máximo de perfiles en "recientes". */
export const MAX_RECENTS = 10;

export interface FavoriteProfile extends RiotId {
  /** ms desde epoch. */
  addedAt: number;
}

export interface RecentProfile extends RiotId {
  /** ms desde epoch. */
  visitedAt: number;
}

// Los arrays son `readonly`: el estado se comparte tal cual con los componentes y hay que
// copiarlo antes de ordenarlo o modificarlo (`[...favorites].sort(...)`).

/** Datos locales de un perfil; ambos son `championId` (el de Match-V5, no el de Data Dragon). */
export interface ProfileLocalData {
  /** Objetivos: los campeones que el usuario quiere ganar. */
  readonly targets: readonly number[];
  /** Marcas manuales: ganados que el historial no recoge (capa 3 de F7). */
  readonly manual: readonly number[];
}

export interface LocalState {
  readonly v: 1;
  readonly myProfile: RiotId | null;
  /** En orden de alta (el más antiguo primero). */
  readonly favorites: readonly FavoriteProfile[];
  /** El más reciente primero, sin duplicados, hasta `MAX_RECENTS`. */
  readonly recents: readonly RecentProfile[];
  /** Por `riotIdNorm` (`normalizeRiotId`). Solo hay entrada si tiene algún objetivo o marca. */
  readonly profiles: Readonly<Record<string, ProfileLocalData>>;
}

// Congelados: los reductores nunca mutan, y así un intento de mutar falla en vez de corromper
// el estado vacío, que se comparte.
/** Datos locales vacíos y estables (la misma referencia siempre). */
export const EMPTY_PROFILE_DATA: ProfileLocalData = Object.freeze({
  targets: Object.freeze([]),
  manual: Object.freeze([]),
});

/** Estado vacío (también el snapshot de servidor del hook). Compartido e inmutable. */
export const EMPTY_STATE: LocalState = Object.freeze({
  v: 1,
  myProfile: null,
  favorites: Object.freeze([]),
  recents: Object.freeze([]),
  profiles: Object.freeze({}),
});

// --- Reductores -------------------------------------------------------------------------
// Puros e inmutables: devuelven el mismo `state` si no hay cambio (el almacén no notifica).
// Copian solo `gameName` y `tagLine` del Riot ID: un objeto con más campos (p. ej. una fila de
// BD con `puuid`) nunca llega al storage.

const pick = ({ gameName, tagLine }: RiotId): RiotId => ({ gameName, tagLine });
const keyOf = ({ gameName, tagLine }: RiotId) =>
  normalizeRiotId(gameName, tagLine);
const isChampionId = (id: number) => Number.isInteger(id) && id > 0;

export function setMyProfile(state: LocalState, riotId: RiotId): LocalState {
  return { ...state, myProfile: pick(riotId) };
}

export function clearMyProfile(state: LocalState): LocalState {
  return state.myProfile === null ? state : { ...state, myProfile: null };
}

/** Añade el perfil a favoritos, o lo quita si ya estaba (comparado por Riot ID normalizado). */
export function toggleFavorite(
  state: LocalState,
  riotId: RiotId,
  now: number,
): LocalState {
  const norm = keyOf(riotId);
  const favorites = state.favorites.some((f) => keyOf(f) === norm)
    ? state.favorites.filter((f) => keyOf(f) !== norm)
    : [...state.favorites, { ...pick(riotId), addedAt: now }];
  return { ...state, favorites };
}

/** Pone el perfil el primero de recientes (sin duplicados por Riot ID normalizado, máx. 10). */
export function addRecent(
  state: LocalState,
  riotId: RiotId,
  now: number,
): LocalState {
  const norm = keyOf(riotId);
  const recents = [
    { ...pick(riotId), visitedAt: now },
    ...state.recents.filter((r) => keyOf(r) !== norm),
  ].slice(0, MAX_RECENTS);
  return { ...state, recents };
}

export function removeRecent(state: LocalState, riotId: RiotId): LocalState {
  const norm = keyOf(riotId);
  const recents = state.recents.filter((r) => keyOf(r) !== norm);
  return recents.length === state.recents.length
    ? state
    : { ...state, recents };
}

/** Sustituye los datos de un perfil; si se quedan vacíos, quita su entrada. */
function withProfile(
  state: LocalState,
  norm: string,
  data: ProfileLocalData,
): LocalState {
  const profiles: Record<string, ProfileLocalData> = { ...state.profiles };
  if (data.targets.length === 0 && data.manual.length === 0) {
    delete profiles[norm];
  } else {
    profiles[norm] = data;
  }
  return { ...state, profiles };
}

/** Datos locales de un perfil; un objeto vacío estable (`EMPTY_PROFILE_DATA`) si no hay. */
export function profileData(state: LocalState, norm: string): ProfileLocalData {
  return state.profiles[norm] ?? EMPTY_PROFILE_DATA;
}

/** Marca o desmarca un objetivo. `norm` es el `riotIdNorm` del perfil. */
export function toggleTarget(
  state: LocalState,
  norm: string,
  championId: number,
): LocalState {
  if (!isChampionId(championId)) return state;
  const data = profileData(state, norm);
  const targets = data.targets.includes(championId)
    ? data.targets.filter((id) => id !== championId)
    : [...data.targets, championId];
  return withProfile(state, norm, { ...data, targets });
}

/** Pone o quita la marca manual de un campeón ganado. Idempotente. */
export function setManual(
  state: LocalState,
  norm: string,
  championId: number,
  on: boolean,
): LocalState {
  if (!isChampionId(championId)) return state;
  const data = profileData(state, norm);
  if (data.manual.includes(championId) === on) return state;
  const manual = on
    ? [...data.manual, championId]
    : data.manual.filter((id) => id !== championId);
  return withProfile(state, norm, { ...data, manual });
}

/** Borra los objetivos y las marcas de un perfil. */
export function clearProfileData(state: LocalState, norm: string): LocalState {
  return state.profiles[norm]
    ? withProfile(state, norm, EMPTY_PROFILE_DATA)
    : state;
}

/** ¿Es este Riot ID "mi perfil"? Sin distinguir mayúsculas ni espacios en los extremos. */
export function isMyProfile(state: LocalState, riotId: RiotId): boolean {
  return state.myProfile !== null && keyOf(state.myProfile) === keyOf(riotId);
}

// --- Export / import --------------------------------------------------------------------

/** Lo que se descarga en "Exportar": el estado completo, con `v`, en JSON legible. */
export function exportState(state: LocalState): string {
  return JSON.stringify(state, null, 2);
}

export type ImportResult =
  | { ok: true; state: LocalState }
  | { ok: false; error: string };

// Se valida con Zod, pero de forma indulgente: una entrada suelta inválida (un Riot ID roto, un
// `championId` que no es un entero positivo) se descarta sin rechazar el fichero entero; un
// campo con la forma equivocada vuelve a su valor vacío. Solo se rechaza el JSON que no se puede
// leer o que no es de esta versión.

const timestamp = z.number().finite();

const riotIdShape = { gameName: z.string(), tagLine: z.string() };

/** Valida el Riot ID (misma regla que la URL y el buscador: nombre 3–16, tag 2–5) y lo recorta. */
function cleanRiotId<V extends RiotId>(value: V, ctx: z.RefinementCtx): V {
  const riotId = toRiotId(value.gameName, value.tagLine);
  if (!riotId) {
    ctx.addIssue({ code: "custom", message: "Riot ID no válido" });
    return z.NEVER;
  }
  return { ...value, ...riotId };
}

const riotIdSchema = z.object(riotIdShape).transform(cleanRiotId);
const favoriteSchema = z
  .object({ ...riotIdShape, addedAt: timestamp })
  .transform(cleanRiotId);
const recentSchema = z
  .object({ ...riotIdShape, visitedAt: timestamp })
  .transform(cleanRiotId);
const championIdSchema = z.number().int().positive();

/** Array que conserva solo los elementos que cumplen `schema`; si no es un array, `[]`. */
function lenientArray<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    )
    .catch([]);
}

/** Sin repetidos, conservando el primero de cada uno. */
function uniqueBy<T>(items: T[], key: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const profileDataSchema = z
  .object({
    targets: lenientArray(championIdSchema),
    manual: lenientArray(championIdSchema),
  })
  .transform(
    (value): ProfileLocalData => ({
      targets: [...new Set(value.targets)],
      manual: [...new Set(value.manual)],
    }),
  );

// Clave de `profiles`: un `riotIdNorm` (`nombre#tag` en minúsculas y recortado).
const isProfileKey = (key: string) =>
  key === key.trim().toLowerCase() &&
  /^.+#[^#]+$/.test(key) &&
  key.length <= 64;

const profilesSchema = z
  .record(z.string(), z.unknown())
  .transform((entries) => {
    const profiles: Record<string, ProfileLocalData> = {};
    for (const [key, value] of Object.entries(entries)) {
      if (!isProfileKey(key)) continue;
      const data = profileDataSchema.safeParse(value);
      if (!data.success) continue;
      if (data.data.targets.length === 0 && data.data.manual.length === 0) {
        continue;
      }
      profiles[key] = data.data;
    }
    return profiles;
  })
  .catch({});

const stateSchema = z.object({
  myProfile: riotIdSchema.nullable().catch(null),
  favorites: lenientArray(favoriteSchema),
  recents: lenientArray(recentSchema),
  profiles: profilesSchema,
});

/**
 * Texto (un export, o lo guardado en `localStorage`) -> estado. Rechaza lo que no es JSON, lo que
 * no es un objeto con `v` y las versiones que esta app no entiende; el resto se sanea (ver arriba).
 */
export function importState(text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "El fichero no es un JSON válido." };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, error: "El fichero no es un export de hylistats." };
  }
  const version = (json as { v?: unknown }).v;
  if (version === undefined) {
    return {
      ok: false,
      error: "El fichero no es un export de hylistats: falta la versión (`v`).",
    };
  }
  if (version !== 1) {
    return {
      ok: false,
      error: `Versión ${JSON.stringify(version)} no soportada: esta app solo entiende la versión 1.`,
    };
  }
  // Los campos tienen `catch`, así que no debería fallar; por si acaso, se rechaza sin lanzar.
  const parsed = stateSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "No se pudo leer el contenido del fichero." };
  }
  const { myProfile, favorites, recents, profiles } = parsed.data;
  return {
    ok: true,
    state: {
      v: 1,
      myProfile,
      favorites: uniqueBy(favorites, keyOf),
      recents: uniqueBy(recents, keyOf).slice(0, MAX_RECENTS),
      profiles,
    },
  };
}

// --- Almacén ----------------------------------------------------------------------------

/** Lo mínimo que se usa de `Storage`: acepta `localStorage` y un fake en los tests. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type Reducer = (state: LocalState) => LocalState;

export interface LocalStore {
  /** La misma referencia hasta que el estado cambie (requisito de `useSyncExternalStore`). */
  getState(): LocalState;
  /** Devuelve la función que cancela la suscripción. */
  subscribe(listener: () => void): () => void;
  /** Aplica el reductor, guarda y notifica. Sin cambio (`===`) no guarda ni notifica. */
  dispatch(reducer: Reducer): void;
  /** Vuelve a leer el storage (otra pestaña lo cambió) y notifica si difiere. */
  reload(): void;
}

/**
 * Almacén sobre `storage` (`localStorage`, o `null` si no hay). Todo acceso al storage va en
 * `try/catch`: acceder puede lanzar (modo privado, cuota, storage bloqueado). Si falla, o si lo
 * guardado está corrupto, sigue en memoria: un valor corrupto no rompe la carga, arranca vacío
 * y se sobrescribe en la siguiente escritura.
 */
export function createLocalStore(storage: StorageLike | null): LocalStore {
  const listeners = new Set<() => void>();

  /** Lo guardado (`null` si no hay nada o el storage falla). */
  function readRaw(): string | null {
    try {
      return storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function parse(raw: string | null): LocalState {
    if (raw === null) return EMPTY_STATE;
    const result = importState(raw);
    return result.ok ? result.state : EMPTY_STATE;
  }

  // Último texto leído o escrito: `reload` no notifica si el storage no ha cambiado.
  let lastRaw = readRaw();
  let state = parse(lastRaw);

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(reducer) {
      const next = reducer(state);
      if (next === state) return;
      state = next;
      try {
        const raw = JSON.stringify(state);
        storage?.setItem(STORAGE_KEY, raw);
        lastRaw = raw;
      } catch {
        // Sin storage o cuota llena: el estado sigue en memoria.
      }
      notify();
    },
    reload() {
      const raw = readRaw();
      if (raw === lastRaw) return;
      lastRaw = raw;
      state = parse(raw);
      notify();
    },
  };
}
