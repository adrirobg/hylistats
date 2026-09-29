import { describe, expect, it, vi } from "vitest";
import {
  addRecent,
  clearMyProfile,
  clearProfileData,
  createLocalStore,
  EMPTY_PROFILE_DATA,
  EMPTY_STATE,
  exportState,
  importState,
  isMyProfile,
  type LocalState,
  MAX_RECENTS,
  profileData,
  removeRecent,
  STORAGE_KEY,
  type StorageLike,
  setManual,
  setMyProfile,
  toggleFavorite,
  toggleTarget,
} from "./local-store";
import { normalizeRiotId, type RiotId } from "./riot-id";

const hyli: RiotId = { gameName: "Hylimichi", tagLine: "EUW" };
const clutch: RiotId = { gameName: "TheCIutch", tagLine: "EUW" };
const bejito: RiotId = { gameName: "BEJITO MAMBO", tagLine: "1991" };
const bejitoNorm = normalizeRiotId(bejito.gameName, bejito.tagLine);
const hyliNorm = normalizeRiotId(hyli.gameName, hyli.tagLine);

/** Storage falso con la interfaz de `Storage` que usa el almacén: un `Map` que se puede inspeccionar. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return { storage, data };
}

/** Storage que lanza al leer y al escribir (modo privado, storage bloqueado). */
const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

/** Un estado con datos en todos los campos, hecho solo con reductores. */
function richState(): LocalState {
  let state = setMyProfile(EMPTY_STATE, hyli);
  state = toggleFavorite(state, clutch, 1_000);
  state = toggleFavorite(state, bejito, 2_000);
  state = addRecent(state, clutch, 3_000);
  state = addRecent(state, bejito, 4_000);
  state = toggleTarget(state, bejitoNorm, 266);
  state = toggleTarget(state, bejitoNorm, 103);
  state = setManual(state, bejitoNorm, 12, true);
  state = toggleTarget(state, hyliNorm, 1);
  return state;
}

describe("createLocalStore: sin storage o con storage roto", () => {
  it("con `null` empieza vacío y funciona en memoria", () => {
    const store = createLocalStore(null);
    expect(store.getState()).toEqual(EMPTY_STATE);
    store.dispatch((s) => setMyProfile(s, hyli));
    expect(store.getState().myProfile).toEqual(hyli);
    store.dispatch((s) => toggleTarget(s, bejitoNorm, 266));
    expect(profileData(store.getState(), bejitoNorm).targets).toEqual([266]);
  });

  it("con `null`, `reload` no rompe ni notifica", () => {
    const store = createLocalStore(null);
    const listener = vi.fn();
    store.subscribe(listener);
    store.reload();
    expect(listener).not.toHaveBeenCalled();
  });

  it("si `getItem` y `setItem` lanzan, sigue en memoria y notifica", () => {
    const store = createLocalStore(throwingStorage);
    expect(store.getState()).toEqual(EMPTY_STATE);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.dispatch((s) => setMyProfile(s, hyli))).not.toThrow();
    expect(store.getState().myProfile).toEqual(hyli);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.reload()).not.toThrow();
    expect(store.getState().myProfile).toEqual(hyli);
  });

  it("si solo `setItem` lanza (cuota llena), lee lo guardado y sigue en memoria", () => {
    const { storage, data } = fakeStorage({
      [STORAGE_KEY]: exportState(setMyProfile(EMPTY_STATE, hyli)),
    });
    const full: StorageLike = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createLocalStore(full);
    expect(store.getState().myProfile).toEqual(hyli);
    store.dispatch((s) => toggleFavorite(s, clutch, 1));
    expect(store.getState().favorites).toHaveLength(1);
    expect(data.get(STORAGE_KEY)).not.toContain("TheCIutch");
  });
});

describe("createLocalStore: valor guardado", () => {
  it("un JSON corrupto no rompe la carga: arranca vacío y se sobrescribe al escribir", () => {
    const { storage, data } = fakeStorage({ [STORAGE_KEY]: "{no es json" });
    const store = createLocalStore(storage);
    expect(store.getState()).toEqual(EMPTY_STATE);
    // No se reescribe al cargar...
    expect(data.get(STORAGE_KEY)).toBe("{no es json");
    // ...sino en la siguiente escritura.
    store.dispatch((s) => setMyProfile(s, hyli));
    expect(JSON.parse(data.get(STORAGE_KEY) ?? "").myProfile).toEqual(hyli);
  });

  it.each([
    ["un valor que no es un objeto", "42"],
    ["un array", "[]"],
    ["null", "null"],
    ["una versión distinta", JSON.stringify({ v: 2, myProfile: hyli })],
    ["sin versión", JSON.stringify({ myProfile: hyli })],
    ["una cadena vacía", ""],
  ])("arranca vacío con %s guardado", (_name, raw) => {
    const store = createLocalStore(fakeStorage({ [STORAGE_KEY]: raw }).storage);
    expect(store.getState()).toEqual(EMPTY_STATE);
  });

  it("guarda con la clave `hylistats:v1` y otro almacén lo recupera", () => {
    const { storage, data } = fakeStorage();
    createLocalStore(storage).dispatch(() => richState());
    expect(STORAGE_KEY).toBe("hylistats:v1");
    expect(JSON.parse(data.get(STORAGE_KEY) ?? "").v).toBe(1);
    expect(createLocalStore(storage).getState()).toEqual(richState());
  });

  it("recupera lo válido de un valor parcialmente inválido", () => {
    const raw = JSON.stringify({
      v: 1,
      myProfile: hyli,
      favorites: [{ gameName: "x", tagLine: "y", addedAt: 1 }],
    });
    const store = createLocalStore(fakeStorage({ [STORAGE_KEY]: raw }).storage);
    expect(store.getState().myProfile).toEqual(hyli);
    expect(store.getState().favorites).toEqual([]);
  });
});

describe("createLocalStore: estado y suscripción", () => {
  it("`getState` devuelve la misma referencia mientras no haya cambios", () => {
    const store = createLocalStore(null);
    const before = store.getState();
    expect(store.getState()).toBe(before);
    store.dispatch((s) => setMyProfile(s, hyli));
    const after = store.getState();
    expect(after).not.toBe(before);
    expect(store.getState()).toBe(after);
  });

  it("la suscripción notifica en cada cambio y deja de hacerlo al cancelarla", () => {
    const store = createLocalStore(null);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch((s) => setMyProfile(s, hyli));
    store.dispatch((s) => toggleFavorite(s, clutch, 1));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.dispatch(clearMyProfile);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("notifica con el estado ya actualizado", () => {
    const store = createLocalStore(null);
    let seen: LocalState | null = null;
    store.subscribe(() => {
      seen = store.getState();
    });
    store.dispatch((s) => setMyProfile(s, hyli));
    expect(seen).toBe(store.getState());
  });

  it("un reductor que no cambia nada no guarda ni notifica", () => {
    const { storage, data } = fakeStorage();
    const store = createLocalStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch((s) => s);
    store.dispatch(clearMyProfile); // ya estaba vacío
    expect(listener).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it("varios suscriptores reciben la notificación", () => {
    const store = createLocalStore(null);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.dispatch((s) => setMyProfile(s, hyli));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("createLocalStore: sincronía entre pestañas (reload)", () => {
  it("recoge lo que escribió otra pestaña y notifica", () => {
    const { storage } = fakeStorage();
    const tabA = createLocalStore(storage);
    const tabB = createLocalStore(storage);
    const listener = vi.fn();
    tabB.subscribe(listener);
    tabA.dispatch((s) => setMyProfile(s, hyli));
    expect(tabB.getState().myProfile).toBeNull();
    tabB.reload();
    expect(tabB.getState().myProfile).toEqual(hyli);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("no notifica si el storage no cambió (ni tras escribir la propia pestaña)", () => {
    const { storage } = fakeStorage();
    const store = createLocalStore(storage);
    store.dispatch((s) => setMyProfile(s, hyli));
    const listener = vi.fn();
    store.subscribe(listener);
    store.reload();
    expect(listener).not.toHaveBeenCalled();
  });

  it("si otra pestaña borra el storage, vuelve al estado vacío", () => {
    const { storage, data } = fakeStorage();
    const store = createLocalStore(storage);
    store.dispatch((s) => setMyProfile(s, hyli));
    data.clear();
    store.reload();
    expect(store.getState()).toEqual(EMPTY_STATE);
  });
});

describe("reductores", () => {
  it("setMyProfile y clearMyProfile", () => {
    const state = setMyProfile(EMPTY_STATE, hyli);
    expect(state.myProfile).toEqual(hyli);
    expect(clearMyProfile(state).myProfile).toBeNull();
    expect(clearMyProfile(EMPTY_STATE)).toBe(EMPTY_STATE);
  });

  it("solo guardan `gameName` y `tagLine`: nunca otros campos (p. ej. un `puuid`)", () => {
    const withExtras = { ...hyli, puuid: "secreto" };
    expect(setMyProfile(EMPTY_STATE, withExtras).myProfile).toEqual(hyli);
    expect(toggleFavorite(EMPTY_STATE, withExtras, 1).favorites[0]).toEqual({
      ...hyli,
      addedAt: 1,
    });
    expect(addRecent(EMPTY_STATE, withExtras, 1).recents[0]).toEqual({
      ...hyli,
      visitedAt: 1,
    });
    expect(exportState(addRecent(EMPTY_STATE, withExtras, 1))).not.toContain(
      "secreto",
    );
  });

  it("toggleFavorite añade (con `addedAt`) y quita, sin distinguir mayúsculas", () => {
    let state = toggleFavorite(EMPTY_STATE, hyli, 10);
    state = toggleFavorite(state, clutch, 20);
    expect(state.favorites).toEqual([
      { ...hyli, addedAt: 10 },
      { ...clutch, addedAt: 20 },
    ]);
    state = toggleFavorite(
      state,
      { gameName: "HYLIMICHI", tagLine: "euw" },
      30,
    );
    expect(state.favorites).toEqual([{ ...clutch, addedAt: 20 }]);
  });

  describe("addRecent", () => {
    it("pone el último el primero", () => {
      let state = addRecent(EMPTY_STATE, hyli, 1);
      state = addRecent(state, clutch, 2);
      expect(state.recents.map((r) => r.gameName)).toEqual([
        "TheCIutch",
        "Hylimichi",
      ]);
      expect(state.recents[0].visitedAt).toBe(2);
    });

    it("deduplica por Riot ID normalizado: sube al primero con la fecha y grafía nuevas", () => {
      let state = addRecent(EMPTY_STATE, hyli, 1);
      state = addRecent(state, clutch, 2);
      state = addRecent(state, { gameName: "hylimichi", tagLine: "euw" }, 3);
      expect(state.recents).toEqual([
        { gameName: "hylimichi", tagLine: "euw", visitedAt: 3 },
        { ...clutch, visitedAt: 2 },
      ]);
    });

    it(`limita a ${MAX_RECENTS} y descarta el más antiguo`, () => {
      let state: LocalState = EMPTY_STATE;
      for (let i = 0; i < 15; i++) {
        state = addRecent(
          state,
          { gameName: `Jugador${i}`, tagLine: "EUW" },
          i,
        );
      }
      expect(MAX_RECENTS).toBe(10);
      expect(state.recents).toHaveLength(10);
      expect(state.recents[0].gameName).toBe("Jugador14");
      expect(state.recents[9].gameName).toBe("Jugador5");
    });

    it("visitar un perfil ya presente no aumenta la lista", () => {
      let state: LocalState = EMPTY_STATE;
      for (let i = 0; i < 10; i++) {
        state = addRecent(
          state,
          { gameName: `Jugador${i}`, tagLine: "EUW" },
          i,
        );
      }
      state = addRecent(state, { gameName: "Jugador0", tagLine: "EUW" }, 99);
      expect(state.recents).toHaveLength(10);
      expect(state.recents[0].gameName).toBe("Jugador0");
    });
  });

  it("removeRecent quita por Riot ID normalizado", () => {
    let state = addRecent(EMPTY_STATE, hyli, 1);
    state = addRecent(state, clutch, 2);
    const removed = removeRecent(state, {
      gameName: "HYLIMICHI",
      tagLine: "EUW",
    });
    expect(removed.recents.map((r) => r.gameName)).toEqual(["TheCIutch"]);
    expect(removeRecent(removed, hyli)).toBe(removed); // ya no está: sin cambio
  });

  describe("objetivos y marcas por perfil", () => {
    it("toggleTarget marca y desmarca", () => {
      let state = toggleTarget(EMPTY_STATE, bejitoNorm, 266);
      state = toggleTarget(state, bejitoNorm, 103);
      expect(profileData(state, bejitoNorm).targets).toEqual([266, 103]);
      state = toggleTarget(state, bejitoNorm, 266);
      expect(profileData(state, bejitoNorm).targets).toEqual([103]);
    });

    it("setManual pone y quita la marca, y es idempotente", () => {
      let state = setManual(EMPTY_STATE, bejitoNorm, 12, true);
      expect(profileData(state, bejitoNorm).manual).toEqual([12]);
      expect(setManual(state, bejitoNorm, 12, true)).toBe(state);
      state = setManual(state, bejitoNorm, 12, false);
      expect(profileData(state, bejitoNorm).manual).toEqual([]);
      expect(setManual(state, bejitoNorm, 12, false)).toBe(state);
    });

    it("objetivos y marcas son independientes y van por perfil", () => {
      let state = toggleTarget(EMPTY_STATE, bejitoNorm, 266);
      state = setManual(state, bejitoNorm, 266, true);
      state = toggleTarget(state, hyliNorm, 1);
      expect(profileData(state, bejitoNorm)).toEqual({
        targets: [266],
        manual: [266],
      });
      expect(profileData(state, hyliNorm)).toEqual({
        targets: [1],
        manual: [],
      });
      // Desmarcar el objetivo no quita la marca manual.
      state = toggleTarget(state, bejitoNorm, 266);
      expect(profileData(state, bejitoNorm)).toEqual({
        targets: [],
        manual: [266],
      });
    });

    it("un perfil sin objetivos ni marcas no deja entrada", () => {
      let state = toggleTarget(EMPTY_STATE, bejitoNorm, 266);
      expect(Object.keys(state.profiles)).toEqual([bejitoNorm]);
      state = toggleTarget(state, bejitoNorm, 266);
      expect(state.profiles).toEqual({});
    });

    it("profileData devuelve un objeto vacío estable si no hay datos", () => {
      expect(profileData(EMPTY_STATE, bejitoNorm)).toBe(EMPTY_PROFILE_DATA);
      expect(profileData(EMPTY_STATE, bejitoNorm)).toEqual({
        targets: [],
        manual: [],
      });
    });

    it("clearProfileData borra solo los datos de ese perfil", () => {
      const state = richState();
      const cleared = clearProfileData(state, bejitoNorm);
      expect(cleared.profiles[bejitoNorm]).toBeUndefined();
      expect(cleared.profiles[hyliNorm]).toEqual(state.profiles[hyliNorm]);
      // No toca lo demás.
      expect(cleared.myProfile).toEqual(state.myProfile);
      expect(cleared.favorites).toBe(state.favorites);
      expect(clearProfileData(cleared, bejitoNorm)).toBe(cleared);
    });

    it("ignora championId que no sea un entero positivo", () => {
      for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(toggleTarget(EMPTY_STATE, bejitoNorm, id)).toBe(EMPTY_STATE);
        expect(setManual(EMPTY_STATE, bejitoNorm, id, true)).toBe(EMPTY_STATE);
      }
    });
  });

  it("isMyProfile compara el Riot ID normalizado, sin distinguir mayúsculas", () => {
    const state = setMyProfile(EMPTY_STATE, hyli);
    expect(isMyProfile(state, hyli)).toBe(true);
    expect(isMyProfile(state, { gameName: "hylimichi", tagLine: "euw" })).toBe(
      true,
    );
    expect(
      isMyProfile(state, { gameName: " HYLIMICHI ", tagLine: "Euw" }),
    ).toBe(true);
    expect(isMyProfile(state, clutch)).toBe(false);
    expect(isMyProfile(EMPTY_STATE, hyli)).toBe(false);
  });

  it("son inmutables: no modifican el estado de entrada", () => {
    const state = richState();
    const snapshot = structuredClone(state);
    toggleFavorite(state, hyli, 5);
    toggleFavorite(state, clutch, 5);
    addRecent(state, hyli, 5);
    removeRecent(state, clutch);
    toggleTarget(state, bejitoNorm, 266);
    toggleTarget(state, bejitoNorm, 999);
    setManual(state, bejitoNorm, 12, false);
    clearProfileData(state, bejitoNorm);
    setMyProfile(state, clutch);
    clearMyProfile(state);
    expect(state).toEqual(snapshot);
  });

  it("el estado vacío compartido está congelado", () => {
    expect(() => (EMPTY_STATE.favorites as unknown[]).push(1)).toThrow();
    expect(() => (EMPTY_PROFILE_DATA.targets as number[]).push(1)).toThrow();
  });
});

describe("exportState / importState", () => {
  it("exporta JSON con indentación y la versión", () => {
    const text = exportState(richState());
    expect(text).toContain("\n  ");
    expect(JSON.parse(text).v).toBe(1);
    expect(exportState(EMPTY_STATE)).toBe(
      JSON.stringify(
        { v: 1, myProfile: null, favorites: [], recents: [], profiles: {} },
        null,
        2,
      ),
    );
  });

  it("ida y vuelta: export -> import devuelve el mismo estado", () => {
    const state = richState();
    expect(importState(exportState(state))).toEqual({ ok: true, state });
    expect(importState(exportState(EMPTY_STATE))).toEqual({
      ok: true,
      state: EMPTY_STATE,
    });
  });

  it("ida y vuelta pasando por un almacén y su storage", () => {
    const { storage, data } = fakeStorage();
    const first = createLocalStore(storage);
    first.dispatch(() => richState());
    const exported = exportState(first.getState());
    const second = createLocalStore(fakeStorage().storage);
    const result = importState(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    second.dispatch(() => result.state);
    expect(second.getState()).toEqual(first.getState());
    expect(data.get(STORAGE_KEY)).toBeDefined();
  });

  describe("rechaza", () => {
    it("lo que no es JSON", () => {
      const result = importState("esto no es json");
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error).toMatch(/JSON/);
      expect(importState("")).toMatchObject({ ok: false });
      expect(importState("{")).toMatchObject({ ok: false });
    });

    it("JSON que no es un objeto", () => {
      for (const text of ["42", '"hola"', "true", "null", "[]", "[1,2]"]) {
        const result = importState(text);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/export de hylistats/);
      }
    });

    it("un objeto sin versión", () => {
      const result = importState(JSON.stringify({ favorites: [] }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/versión/);
    });

    it("otra versión, con un mensaje que la nombra", () => {
      for (const v of [2, 0, "1", null, {}]) {
        const result = importState(JSON.stringify({ v, favorites: [] }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/no soportada/);
      }
      const v2 = importState(JSON.stringify({ v: 2 }));
      expect(v2.ok === false && v2.error).toContain("2");
    });
  });

  describe("entradas parcialmente inválidas: descarta solo lo roto", () => {
    it("Riot IDs inválidos en favoritos y recientes", () => {
      const result = importState(
        JSON.stringify({
          v: 1,
          favorites: [
            { ...hyli, addedAt: 1 },
            { gameName: "ab", tagLine: "EUW", addedAt: 2 }, // nombre corto
            { gameName: "Faker", tagLine: "K", addedAt: 3 }, // tag corto
            { gameName: 5, tagLine: "EUW", addedAt: 4 }, // tipo erróneo
            { ...clutch, addedAt: "ayer" }, // fecha inválida
            null,
            "texto",
            { ...clutch, addedAt: 5 },
          ],
          recents: [
            { gameName: "", tagLine: "", visitedAt: 1 },
            { ...bejito, visitedAt: 2 },
          ],
        }),
      );
      expect(result).toEqual({
        ok: true,
        state: {
          ...EMPTY_STATE,
          favorites: [
            { ...hyli, addedAt: 1 },
            { ...clutch, addedAt: 5 },
          ],
          recents: [{ ...bejito, visitedAt: 2 }],
        },
      });
    });

    it("`myProfile` inválido queda en null sin rechazar el resto", () => {
      const result = importState(
        JSON.stringify({
          v: 1,
          myProfile: { gameName: "ab", tagLine: "x" },
          favorites: [{ ...hyli, addedAt: 1 }],
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.myProfile).toBeNull();
      expect(result.state.favorites).toHaveLength(1);
    });

    it("championId no válidos en objetivos y marcas", () => {
      const result = importState(
        JSON.stringify({
          v: 1,
          profiles: {
            [bejitoNorm]: {
              targets: [266, "103", -4, 1.5, null, 12, 266],
              manual: ["x", 7],
            },
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.profiles).toEqual({
        [bejitoNorm]: { targets: [266, 12], manual: [7] },
      });
    });

    it("perfiles con clave no válida, forma errónea o sin datos", () => {
      const result = importState(
        JSON.stringify({
          v: 1,
          profiles: {
            "sin-almohadilla": { targets: [1], manual: [] },
            "Mayusculas#EUW": { targets: [1], manual: [] }, // no es un `riotIdNorm`
            [bejitoNorm]: { targets: [1] }, // falta `manual`
            "vacio#euw": { targets: [], manual: [] },
            "roto#euw": "no soy un objeto",
            "nulo#euw": null,
            [hyliNorm]: { targets: [2], manual: [3] },
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.profiles).toEqual({
        [bejitoNorm]: { targets: [1], manual: [] },
        [hyliNorm]: { targets: [2], manual: [3] },
      });
    });

    it("campos con la forma equivocada vuelven a vacío y faltantes se rellenan", () => {
      const result = importState(
        JSON.stringify({
          v: 1,
          myProfile: "yo",
          favorites: "no soy un array",
          recents: { 0: hyli },
          profiles: [1, 2],
        }),
      );
      expect(result).toEqual({ ok: true, state: EMPTY_STATE });
      expect(importState('{"v":1}')).toEqual({ ok: true, state: EMPTY_STATE });
    });

    it("deduplica favoritos y recientes y limita los recientes a 10", () => {
      const recents = Array.from({ length: 14 }, (_, i) => ({
        gameName: `Jugador${i}`,
        tagLine: "EUW",
        visitedAt: 100 - i,
      }));
      const result = importState(
        JSON.stringify({
          v: 1,
          favorites: [
            { ...hyli, addedAt: 1 },
            { gameName: "HYLIMICHI", tagLine: "euw", addedAt: 2 },
          ],
          recents: [{ ...recents[0], visitedAt: 200 }, ...recents],
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.favorites).toEqual([{ ...hyli, addedAt: 1 }]);
      expect(result.state.recents).toHaveLength(10);
      expect(result.state.recents[0]).toEqual({
        ...recents[0],
        visitedAt: 200,
      });
    });

    it("recorta espacios en los Riot IDs y descarta campos desconocidos", () => {
      const result = importState(
        JSON.stringify({
          v: 1,
          extra: "ignorado",
          myProfile: { gameName: "  Hylimichi ", tagLine: " EUW", puuid: "x" },
        }),
      );
      expect(result).toEqual({
        ok: true,
        state: { ...EMPTY_STATE, myProfile: hyli },
      });
    });
  });
});
