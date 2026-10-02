import { describe, expect, it } from "vitest";
import { cleanName, shuffle, splitTeams, validateName } from "./team-draw";

/** Generador que devuelve los valores dados en orden. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++];
}

describe("splitTeams", () => {
  it.each([
    [2, [[2, 1]]],
    [3, [[3, 0]]],
    [
      4,
      [
        [3, 0],
        [1, 2],
      ],
    ],
    [
      5,
      [
        [3, 0],
        [2, 1],
      ],
    ],
    [
      6,
      [
        [3, 0],
        [3, 0],
      ],
    ],
    [
      7,
      [
        [3, 0],
        [3, 0],
        [1, 2],
      ],
    ],
  ])("con %i jugadores reparte de 3 en 3", (count, expected) => {
    const order = Array.from({ length: count }, (_, i) => `J${i + 1}`);
    const teams = splitTeams(order);
    expect(teams.map((t) => [t.players.length, t.unknowns])).toEqual(expected);
  });

  it("los 3 primeros que salen forman el primer equipo y el resto va después", () => {
    expect(splitTeams(["A", "B", "C", "D", "E"])).toEqual([
      { players: ["A", "B", "C"], unknowns: 0 },
      { players: ["D", "E"], unknowns: 1 },
    ]);
  });

  it("sin jugadores no hay equipos", () => {
    expect(splitTeams([])).toEqual([]);
  });
});

describe("shuffle", () => {
  it("es Fisher–Yates: cada paso elige entre los que quedan", () => {
    // i=3 → j=floor(0·4)=0; i=2 → j=floor(0,99·3)=2; i=1 → j=floor(0,5·2)=1.
    expect(shuffle(["A", "B", "C", "D"], sequence(0, 0.99, 0.5))).toEqual([
      "D",
      "B",
      "C",
      "A",
    ]);
  });

  it("no modifica la entrada y conserva todos los elementos", () => {
    const input = ["A", "B", "C", "D", "E"];
    const result = shuffle(input);
    expect(input).toEqual(["A", "B", "C", "D", "E"]);
    expect([...result].sort()).toEqual(input);
  });

  it("es uniforme: cada jugador sale primero con la misma frecuencia", () => {
    // Generador determinista (LCG) para que el test no dependa del azar.
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };
    const firsts = new Map<string, number>();
    const runs = 50_000;
    for (let run = 0; run < runs; run++) {
      const [first] = shuffle(["A", "B", "C", "D", "E"], random);
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }
    for (const count of firsts.values()) {
      expect(count / runs).toBeGreaterThan(0.19);
      expect(count / runs).toBeLessThan(0.21);
    }
  });
});

describe("validateName", () => {
  it("limpia espacios", () => {
    expect(cleanName("  Bejito   Mambo ")).toBe("Bejito Mambo");
    expect(validateName("  Pepe ", [])).toEqual({ ok: true, name: "Pepe" });
  });

  it("rechaza vacíos", () => {
    expect(validateName("   ", [])).toMatchObject({ ok: false });
  });

  it("rechaza repetidos sin distinguir mayúsculas", () => {
    expect(validateName("hylimichi", ["Hylimichi"])).toEqual({
      ok: false,
      message: "hylimichi ya está en la lista",
    });
  });
});
