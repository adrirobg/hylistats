import { describe, expect, it } from "vitest";
import type { TeammateSummary } from "@/domain/queries";
import {
  canShowAll,
  DEFAULT_MIN_GAMES,
  DEFAULT_ORDEN,
  DEFAULT_TEAMMATE_PARAMS,
  emptyMessage,
  MIN_GAMES_OPTIONS,
  ORDEN_DIRECTION,
  ORDEN_LABEL,
  ORDEN_SELECT_LABEL,
  ORDENES,
  parseTeammateParams,
  RAIL_TEAMMATES,
  railTeammates,
  SMALL_SAMPLE,
  SMALL_SAMPLE_LABEL,
  sortTeammates,
  type TeammateOrder,
  teammateRows,
  teammateSearch,
  teammatesAtLeast,
} from "./teammates-view";

const DAY = 24 * 60 * 60_000;
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const NBSP = " ";

/** Un compañero; `ago` = días desde su última partida juntos. */
function mate(
  gameName: string,
  games: number,
  firsts: number,
  top3: number,
  avgPlacement: number,
  ago: number,
  tagLine = "EUW",
): TeammateSummary {
  return {
    gameName,
    tagLine,
    games,
    firsts,
    top3,
    avgPlacement,
    lastPlayedAt: NOW - ago * DAY,
  };
}

//                 partidas  1º  top3  medio  hace
const ANA = mate("Ana", 10, 2, 6, 3.5, 2); //  20 % 1º · 60 % top 3
const BETO = mate("Beto", 10, 3, 5, 3.0, 5); //  30 % · 50 %
const CIRA = mate("Cira", 4, 2, 3, 2.5, 0.5); //  50 % · 75 %
const DANI = mate("Dani", 20, 2, 12, 3.5, 10); //  10 % · 60 %
const ELI = mate("Eli", 3, 1, 2, 3.5, 3); //  33 % · 67 %
const ALL = [ANA, BETO, CIRA, DANI, ELI];

const names = (list: readonly { gameName: string }[]) =>
  list.map((t) => t.gameName);

describe("parseTeammateParams", () => {
  const parse = (query: string) =>
    parseTeammateParams(new URLSearchParams(query));

  it("sin parámetros: ≥ 3 partidas, ordenado por partidas", () => {
    expect(parse("")).toEqual({ min: 3, orden: "partidas" });
    expect(DEFAULT_TEAMMATE_PARAMS).toEqual({
      min: DEFAULT_MIN_GAMES,
      orden: DEFAULT_ORDEN,
    });
  });

  it("acepta los cuatro mínimos y las seis columnas", () => {
    for (const min of MIN_GAMES_OPTIONS) {
      expect(parse(`min=${min}`).min).toBe(min);
    }
    for (const orden of ORDENES) {
      expect(parse(`orden=${orden}`).orden).toBe(orden);
    }
  });

  it("lo desconocido cae en su valor por defecto, cada parámetro por separado", () => {
    for (const bad of [
      "0",
      "2",
      "4",
      "11",
      "-1",
      "5.0",
      "0x5",
      " 5",
      "",
      "x",
    ]) {
      expect(parse(`min=${encodeURIComponent(bad)}`).min).toBe(3);
    }
    expect(parse("orden=nombre").orden).toBe("partidas");
    expect(parse("orden=Medio").orden).toBe("partidas");
    expect(parse("min=5&orden=nombre")).toEqual({ min: 5, orden: "partidas" });
    expect(parse("min=x&orden=medio")).toEqual({ min: 3, orden: "medio" });
  });

  it("si se repite, manda el primero (como `URLSearchParams.get`)", () => {
    expect(parse("min=10&min=1").min).toBe(10);
  });
});

describe("teammateSearch", () => {
  it("omite los valores por defecto", () => {
    expect(teammateSearch({ min: 3, orden: "partidas" })).toBe("");
    expect(teammateSearch({ min: 5, orden: "partidas" })).toBe("min=5");
    expect(teammateSearch({ min: 3, orden: "medio" })).toBe("orden=medio");
    expect(teammateSearch({ min: 1, orden: "pct1" })).toBe("min=1&orden=pct1");
  });

  it("conserva lo que no es de Compañeros y sustituye lo que sí", () => {
    expect(
      teammateSearch(
        { min: 10, orden: "partidas" },
        "tab=companeros&min=5&orden=medio&campeon=53",
      ),
    ).toBe("tab=companeros&campeon=53&min=10");
    expect(
      teammateSearch(
        { min: 3, orden: "partidas" },
        new URLSearchParams("tab=companeros&min=5"),
      ),
    ).toBe("tab=companeros");
  });

  it("es la inversa de parseTeammateParams", () => {
    for (const min of MIN_GAMES_OPTIONS) {
      for (const orden of ORDENES) {
        const query = teammateSearch({ min, orden });
        expect(parseTeammateParams(new URLSearchParams(query))).toEqual({
          min,
          orden,
        });
      }
    }
  });
});

describe("etiquetas", () => {
  it("cada columna tiene cabecera y opción de selector; solo el puesto medio va de menor a mayor", () => {
    for (const orden of ORDENES) {
      expect(ORDEN_LABEL[orden]).not.toBe("");
      expect(ORDEN_SELECT_LABEL[orden]).not.toBe("");
    }
    expect(ORDENES.filter((o) => ORDEN_DIRECTION[o] === "asc")).toEqual([
      "medio",
    ]);
  });

  it("la muestra pequeña son menos de 5 partidas", () => {
    expect(SMALL_SAMPLE).toBe(5);
    expect(SMALL_SAMPLE_LABEL).toBe("Muestra pequeña: menos de 5 partidas");
  });
});

describe("teammatesAtLeast", () => {
  it("deja los que llegan al mínimo (inclusive) sin tocar el orden ni la lista", () => {
    const list = [ELI, DANI, CIRA, ANA];
    expect(names(teammatesAtLeast(list, 4))).toEqual(["Dani", "Cira", "Ana"]);
    expect(names(teammatesAtLeast(list, 1))).toEqual(names(list));
    expect(teammatesAtLeast(list, 21)).toEqual([]);
    expect(names(list)).toEqual(["Eli", "Dani", "Cira", "Ana"]);
  });
});

describe("sortTeammates", () => {
  // Cada orden con sus empates resueltos: más partidas, más 1º y nombre.
  const EXPECTED: Record<TeammateOrder, string[]> = {
    // Ana y Beto empatan a 10 partidas: Beto tiene más 1º.
    partidas: ["Dani", "Beto", "Ana", "Cira", "Eli"],
    // Beto 3; Dani, Ana y Cira empatan a 2 y salen por partidas (20, 10, 4).
    primeros: ["Beto", "Dani", "Ana", "Cira", "Eli"],
    // 50 %, 33 %, 30 %, 20 %, 10 %.
    pct1: ["Cira", "Eli", "Beto", "Ana", "Dani"],
    // 75 %, 67 %, 60 % (Dani antes que Ana: más partidas), 50 %.
    top3: ["Cira", "Eli", "Dani", "Ana", "Beto"],
    // Ascendente: 2,5, 3,0 y tres de 3,5 (por partidas: 20, 10, 3).
    medio: ["Cira", "Beto", "Dani", "Ana", "Eli"],
    // Más reciente primero: 0,5 d, 2, 3, 5 y 10.
    ultima: ["Cira", "Ana", "Eli", "Beto", "Dani"],
  };

  for (const orden of ORDENES) {
    it(`orden «${orden}»`, () => {
      expect(names(sortTeammates(ALL, orden))).toEqual(EXPECTED[orden]);
    });
  }

  it("el resultado no depende del orden de entrada, en ninguna columna", () => {
    const reversed = [...ALL].reverse();
    const rotated = [...ALL.slice(2), ...ALL.slice(0, 2)];
    for (const orden of ORDENES) {
      const expected = names(sortTeammates(ALL, orden));
      expect(names(sortTeammates(reversed, orden))).toEqual(expected);
      expect(names(sortTeammates(rotated, orden))).toEqual(expected);
    }
  });

  it("no muta la lista de entrada", () => {
    const list = [ELI, ANA];
    sortTeammates(list, "partidas");
    expect(names(list)).toEqual(["Eli", "Ana"]);
  });

  it("compara los porcentajes sin redondear: 1/3 frente a 33,3 %", () => {
    // 1/3 (0,3333…) supera a 333/1000 (0,333): un redondeo a un decimal los empataría.
    const third = mate("Tercio", 3, 1, 1, 4, 1);
    const near = mate("Cercano", 1000, 333, 500, 4, 1);
    expect(names(sortTeammates([near, third], "pct1"))).toEqual([
      "Tercio",
      "Cercano",
    ]);
  });

  it("si todo empata, decide el nombre sin distinguir mayúsculas; después la cadena y el tag", () => {
    const same = (name: string, tag: string) => mate(name, 5, 1, 3, 3, 1, tag);
    const list = [
      same("zeta", "EUW"),
      same("Alfa", "B"),
      same("alfa", "B"),
      same("Alfa", "A"),
      same("beta", "EUW"),
    ];
    for (const orden of ORDENES) {
      expect(
        sortTeammates(list, orden).map((t) => `${t.gameName}#${t.tagLine}`),
      ).toEqual(["Alfa#A", "Alfa#B", "alfa#B", "beta#EUW", "zeta#EUW"]);
    }
  });
});

describe("teammateRows", () => {
  const rows = (min: 1 | 3 | 5 | 10, orden: TeammateOrder = "partidas") =>
    teammateRows(ALL, { min, orden }, NOW);

  it("filtra por el mínimo (inclusive) y ordena", () => {
    expect(names(rows(3))).toEqual(["Dani", "Beto", "Ana", "Cira", "Eli"]);
    expect(names(rows(5))).toEqual(["Dani", "Beto", "Ana"]);
    expect(names(rows(10))).toEqual(["Dani", "Beto", "Ana"]);
    expect(names(rows(3, "medio"))).toEqual([
      "Cira",
      "Beto",
      "Dani",
      "Ana",
      "Eli",
    ]);
    expect(rows(10)).toHaveLength(3);
    expect(teammateRows([ELI], { min: 5, orden: "partidas" }, NOW)).toEqual([]);
  });

  it("da las cifras en es-ES", () => {
    const [first] = teammateRows(
      [mate("Hylimichi", 38, 7, 22, 3.1, 2)],
      DEFAULT_TEAMMATE_PARAMS,
      NOW,
    );
    expect(first).toMatchObject({
      gameName: "Hylimichi",
      tagLine: "EUW",
      games: 38,
      firsts: 7,
      pct1: `18,4${NBSP}%`, // 7/38
      top3: `57,9${NBSP}%`, // 22/38
      medio: "3,10",
      ultima: "hace 2 d",
    });
    // Un compañero que jugó hoy, otro ayer.
    const [today, yesterday] = teammateRows(
      [mate("Hoy", 4, 0, 0, 5, 0.01), mate("Ayer", 3, 0, 0, 5, 1.5)],
      DEFAULT_TEAMMATE_PARAMS,
      NOW,
    );
    expect(today.ultima).toBe("hace 14 min");
    expect(yesterday.ultima).toBe("ayer");
  });

  it("marca la muestra pequeña por debajo de 5 partidas, no en 5", () => {
    const small = Object.fromEntries(
      teammateRows(
        [mate("Cuatro", 4, 0, 0, 4, 1), mate("Cinco", 5, 0, 0, 4, 1)],
        { min: 1, orden: "partidas" },
        NOW,
      ).map((r) => [r.gameName, r.small]),
    );
    expect(small).toEqual({ Cuatro: true, Cinco: false });
  });

  it("enlaza a /euw/{Nombre-TAG} con el slug codificado, sin puuid", () => {
    const [a, b] = teammateRows(
      [
        mate("Poro Veloz", 9, 1, 3, 3, 1, "EUW"),
        mate("Ñu/Ñu", 8, 1, 3, 3, 1, "1ab"),
      ],
      DEFAULT_TEAMMATE_PARAMS,
      NOW,
    );
    expect(a.href).toBe("/euw/Poro%20Veloz-EUW");
    expect(b.href).toBe("/euw/%C3%91u%2F%C3%91u-1ab");
    expect(JSON.stringify([a, b])).not.toContain("puuid");
  });

  it("sin enlace si el Riot ID no puede ser un perfil", () => {
    const [row] = teammateRows(
      [mate("", 9, 1, 3, 3, 1, "EUW")],
      DEFAULT_TEAMMATE_PARAMS,
      NOW,
    );
    expect(row.href).toBeNull();
  });

  it("norm es el Riot ID normalizado y key es único aunque dos compañeros compartan Riot ID", () => {
    const twins = [
      mate("Poro Veloz", 9, 1, 3, 3, 1),
      mate("PORO VELOZ", 8, 1, 3, 3, 2),
      mate("Otro", 7, 1, 3, 3, 3),
    ];
    const out = teammateRows(twins, DEFAULT_TEAMMATE_PARAMS, NOW);
    expect(out.map((r) => r.norm)).toEqual([
      "poro veloz#euw",
      "poro veloz#euw",
      "otro#euw",
    ]);
    expect(new Set(out.map((r) => r.key)).size).toBe(3);
  });

  it("una lista vacía da filas vacías", () => {
    expect(teammateRows([], DEFAULT_TEAMMATE_PARAMS, NOW)).toEqual([]);
  });
});

describe("railTeammates", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    mate(`Jugador${i}`, 20 - i, i % 3, 10, 3.25, i),
  );

  it("los 5 con más partidas juntos, sin filtrar por mínimo", () => {
    expect(RAIL_TEAMMATES).toBe(5);
    expect(names(railTeammates(many, 5))).toEqual([
      "Jugador0",
      "Jugador1",
      "Jugador2",
      "Jugador3",
      "Jugador4",
    ]);
    expect(names(railTeammates([...many].reverse()))).toEqual(
      names(railTeammates(many, 5)),
    );
    // Todos por debajo del mínimo de la tabla (3) siguen saliendo.
    const few = [mate("Uno", 1, 0, 0, 5, 1), mate("Dos", 2, 1, 1, 3, 1)];
    expect(names(railTeammates(few, 5))).toEqual(["Dos", "Uno"]);
    expect(railTeammates([], 5)).toEqual([]);
  });

  it("cifras compactas y muestra pequeña", () => {
    const [big, small] = railTeammates(
      [mate("Hylimichi", 38, 7, 22, 3.1, 1), mate("zapas14", 4, 0, 1, 4, 1)],
      5,
    );
    expect(big).toMatchObject({
      gameName: "Hylimichi",
      tagLine: "EUW",
      href: "/euw/Hylimichi-EUW",
      games: 38,
      pct1: `18${NBSP}%`,
      medio: "3,1",
      small: false,
    });
    expect(small).toMatchObject({ games: 4, small: true, medio: "4,0" });
    expect(new Set([big.key, small.key]).size).toBe(2);
  });

  it("solo lleva lo que se pinta: nada de puuid ni de fechas", () => {
    const [row] = railTeammates([ANA], 5);
    expect(Object.keys(row).sort()).toEqual([
      "gameName",
      "games",
      "href",
      "key",
      "medio",
      "pct1",
      "small",
      "tagLine",
    ]);
  });
});

describe("vacío", () => {
  it("dice el umbral y ofrece bajarlo", () => {
    expect(emptyMessage(3)).toBe("Ningún compañero con ≥ 3 partidas juntos.");
    expect(emptyMessage(10)).toBe("Ningún compañero con ≥ 10 partidas juntos.");
    for (const min of [3, 5, 10] as const) expect(canShowAll(min)).toBe(true);
  });

  it("con ≥ 1 no hay nada más que bajar", () => {
    expect(canShowAll(1)).toBe(false);
    expect(emptyMessage(1)).not.toContain("≥");
  });
});
