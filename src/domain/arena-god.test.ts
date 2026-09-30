import { describe, expect, it } from "vitest";
import {
  ARENA_GOD_EXPLANATION,
  type ArenaGodInput,
  arenaGodActions,
  arenaGodLabel,
  arenaGodMessage,
  arenaGodState,
  manualPhrase,
  messageText,
  missingPhrase,
  officialPhrase,
  verifiedPhrase,
} from "./arena-god";

const GOAL = 60;
/** `n` ids de campeón consecutivos a partir de `from` (1 por defecto). */
const ids = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => from + i);

function state(input: Partial<ArenaGodInput> = {}) {
  return arenaGodState({
    verifiedIds: [],
    manualIds: [],
    official: null,
    goal: GOAL,
    ...input,
  });
}

describe("arenaGodState: los casos de brief §4.3", () => {
  it("cuadra: el oficial es verificados + manuales", () => {
    const s = state({
      verifiedIds: ids(23),
      manualIds: ids(2, 100),
      official: 25,
    });
    expect(s).toMatchObject({
      verified: 23,
      manual: 2,
      total: 25,
      official: 25,
      status: "match",
      diff: 0,
      excess: null,
    });
  });

  it("faltan: el oficial supera al total; diff es lo que falta", () => {
    const s = state({ verifiedIds: ids(25), official: 27 });
    expect(s).toMatchObject({
      total: 25,
      status: "missing",
      diff: 2,
      excess: null,
    });
  });

  it("faltan cuenta las marcas manuales: se resta al oficial verificados + manuales", () => {
    const s = state({ verifiedIds: ids(25), manualIds: [200], official: 27 });
    expect(s).toMatchObject({ total: 26, status: "missing", diff: 1 });
  });

  it("sobran, con más verificados que el oficial (Riot puede ir atrasado)", () => {
    const s = state({ verifiedIds: ids(27), official: 25 });
    expect(s).toMatchObject({ status: "ahead", diff: -2, excess: "verified" });
  });

  it("sobran solo al sumar las marcas manuales: hay que revisarlas", () => {
    // 25 verificados = oficial, pero 2 marcas a mano lo superan.
    const s = state({
      verifiedIds: ids(25),
      manualIds: [200, 201],
      official: 25,
    });
    expect(s).toMatchObject({ status: "ahead", diff: -2, excess: "manual" });
    // Con el oficial entre verificados y total sigue siendo la variante de las marcas.
    const between = state({
      verifiedIds: ids(25),
      manualIds: [200, 201],
      official: 26,
    });
    expect(between).toMatchObject({
      status: "ahead",
      diff: -1,
      excess: "manual",
    });
  });

  it("los verificados ya por encima del oficial mandan aunque haya marcas", () => {
    const s = state({ verifiedIds: ids(27), manualIds: [200], official: 25 });
    expect(s).toMatchObject({ status: "ahead", diff: -3, excess: "verified" });
  });

  it("sin contador oficial: unknown, sin diferencia", () => {
    const s = state({ verifiedIds: ids(12), official: null });
    expect(s).toMatchObject({
      total: 12,
      official: null,
      status: "unknown",
      diff: null,
      excess: null,
    });
  });

  it("AC7: 75 verificados, 0 manuales y oficial 75 cuadran", () => {
    const s = state({ verifiedIds: ids(75), official: 75 });
    expect(s).toMatchObject({ total: 75, status: "match", diff: 0 });
  });

  it("sin nada y con oficial 0 también cuadra", () => {
    expect(state({ official: 0 })).toMatchObject({ total: 0, status: "match" });
  });
});

describe("arenaGodState: manuales", () => {
  it("una marca sobre un campeón ya verificado no cuenta", () => {
    const s = state({
      verifiedIds: [1, 2, 3],
      manualIds: [2, 3, 9],
      official: 4,
    });
    expect(s).toMatchObject({
      verified: 3,
      manual: 1,
      total: 4,
      status: "match",
    });
  });

  it("todas las marcas ya verificadas: manual es 0", () => {
    const s = state({ verifiedIds: [1, 2], manualIds: [1, 2], official: 2 });
    expect(s).toMatchObject({ manual: 0, total: 2, status: "match" });
  });

  it("ids repetidos cuentan una vez", () => {
    const s = state({ verifiedIds: [1, 1, 2], manualIds: [9, 9], official: 3 });
    expect(s).toMatchObject({ verified: 2, manual: 1, total: 3 });
  });
});

describe("arenaGodState: escala", () => {
  it("todo por debajo de la meta: la escala llega a la meta", () => {
    const s = state({ verifiedIds: ids(23), official: 27 });
    expect(s.scaleMax).toBe(60);
    expect(s.ticks).toEqual([0, 20, 40, 60]);
  });

  it("sin datos: escala de 0 a la meta", () => {
    expect(state()).toMatchObject({ scaleMax: 60, ticks: [0, 20, 40, 60] });
  });

  it("oficial por encima de la meta (75 frente a 60): sube a 80 y la meta sigue en la escala", () => {
    const s = state({ verifiedIds: ids(75), official: 75 });
    expect(s.scaleMax).toBe(80);
    expect(s.ticks).toEqual([0, 20, 40, 60, 80]);
    expect(s.ticks).toContain(GOAL);
  });

  it("el total puede fijar la escala aunque el oficial sea menor o falte", () => {
    expect(state({ verifiedIds: ids(72), official: 60 }).scaleMax).toBe(80);
    expect(state({ verifiedIds: ids(72), official: null }).scaleMax).toBe(80);
  });

  it("redondea al múltiplo de 10 superior y no añade ticks sueltos", () => {
    const s = state({ verifiedIds: ids(61), official: 61 });
    expect(s.scaleMax).toBe(70);
    expect(s.ticks).toEqual([0, 20, 40, 60]);
    // Justo en un múltiplo de 10 no sube.
    expect(state({ official: 70 }).scaleMax).toBe(70);
  });

  it("una meta que no cae en la rejilla de 20 aparece como tick propio", () => {
    const s = state({ goal: 50 });
    expect(s.scaleMax).toBe(50);
    expect(s.ticks).toEqual([0, 20, 40, 50]);
  });
});

describe("textos", () => {
  it("singular y plural de campeones que faltan", () => {
    expect(missingPhrase(1)).toBe("Falta 1 campeón");
    expect(missingPhrase(2)).toBe("Faltan 2 campeones");
    expect(missingPhrase(12)).toBe("Faltan 12 campeones");
  });

  it("singular y plural de verificados y manuales", () => {
    expect(verifiedPhrase(0)).toBe("0 verificados");
    expect(verifiedPhrase(1)).toBe("1 verificado");
    expect(verifiedPhrase(75)).toBe("75 verificados");
    expect(manualPhrase(0)).toBe("0 manuales");
    expect(manualPhrase(1)).toBe("1 manual");
    expect(manualPhrase(2)).toBe("2 manuales");
  });

  it("contador oficial: la cifra o «oficial sin dato», nunca un 0 inventado (§4.3)", () => {
    expect(officialPhrase(27)).toBe("oficial 27");
    expect(officialPhrase(0)).toBe("oficial 0"); // 0 es un dato; solo null es «sin dato»
    expect(officialPhrase(null)).toBe("oficial sin dato");
    // Sin `challengeValue` el estado es unknown y su texto y su aria-label lo dicen igual.
    const unknown = state({ verifiedIds: ids(12), official: null });
    expect(unknown.status).toBe("unknown");
    expect(officialPhrase(unknown.official)).toBe("oficial sin dato");
    expect(arenaGodLabel(unknown)).toContain("contador oficial no disponible");
  });

  it("aria-label completo de la barra", () => {
    expect(arenaGodLabel(state({ verifiedIds: ids(75), official: 75 }))).toBe(
      "75 verificados, 0 manuales, contador oficial 75, objetivo 60",
    );
    expect(
      arenaGodLabel(state({ verifiedIds: [1], manualIds: [2], official: 2 })),
    ).toBe("1 verificado, 1 manual, contador oficial 2, objetivo 60");
    expect(arenaGodLabel(state({ verifiedIds: ids(3) }))).toBe(
      "3 verificados, 0 manuales, contador oficial no disponible, objetivo 60",
    );
  });

  it("cuadra: discreto, sin más", () => {
    const s = state({ verifiedIds: ids(75), official: 75 });
    expect(messageText(arenaGodMessage(s))).toBe(
      "Cuadra con el contador oficial.",
    );
  });

  it("faltan: dice las dos cifras, cuántos y por qué, en singular y plural", () => {
    const two = arenaGodMessage(state({ verifiedIds: ids(25), official: 27 }));
    expect(messageText(two)).toBe(
      "El contador oficial dice 27 y aquí hay 25. Faltan 2 campeones que el historial no muestra (partidas no devueltas por la API o no sincronizadas).",
    );
    // Las dos cifras van en negrita.
    expect(two.filter((p) => typeof p !== "string")).toEqual([
      { strong: "27" },
      { strong: "25" },
    ]);
    const one = arenaGodMessage(state({ verifiedIds: ids(26), official: 27 }));
    expect(messageText(one)).toContain(
      "aquí hay 26. Falta 1 campeón que el historial",
    );
  });

  it("sobran con verificados por encima: Riot puede no haberlo actualizado", () => {
    const text = messageText(
      arenaGodMessage(state({ verifiedIds: ids(27), official: 25 })),
    );
    expect(text).toBe(
      "Aquí hay más victorias verificadas (27) que en el contador oficial (25). Puede que el contador de Riot aún no se haya actualizado.",
    );
  });

  it("sobran por las marcas manuales: pide revisarlas", () => {
    const text = messageText(
      arenaGodMessage(
        state({ verifiedIds: ids(25), manualIds: [200, 201], official: 25 }),
      ),
    );
    expect(text).toBe(
      "Tus marcas manuales (2) hacen que aquí haya más victorias (27) que en el contador oficial (25). Revísalas.",
    );
  });

  it("sin dato oficial: dice cuándo se intentó, si se sabe", () => {
    const s = state({ verifiedIds: ids(5) });
    expect(messageText(arenaGodMessage(s))).toBe(
      "No se pudo leer el contador oficial.",
    );
    expect(messageText(arenaGodMessage(s, "hace 5 min"))).toBe(
      "No se pudo leer el contador oficial (hace 5 min).",
    );
  });

  it("la explicación de las tres capas son dos frases", () => {
    expect(ARENA_GOD_EXPLANATION.split(/(?<=\.)\s/)).toHaveLength(2);
  });
});

describe("arenaGodActions", () => {
  it("faltan: sincronizar, marcar a mano (solo en mi perfil) y qué significa", () => {
    expect(arenaGodActions("missing", true)).toEqual(["sync", "manual", "why"]);
    expect(arenaGodActions("missing", false)).toEqual(["sync", "why"]);
  });

  it("sobran: solo qué significa", () => {
    expect(arenaGodActions("ahead", true)).toEqual(["why"]);
    expect(arenaGodActions("ahead", false)).toEqual(["why"]);
  });

  it("sin dato oficial: reintentar", () => {
    expect(arenaGodActions("unknown", true)).toEqual(["retry"]);
    expect(arenaGodActions("unknown", false)).toEqual(["retry"]);
  });

  it("cuadra: sin acciones", () => {
    expect(arenaGodActions("match", true)).toEqual([]);
  });
});
