import { describe, expect, it } from "vitest";
import type { Champion, ChampionCatalog } from "@/lib/ddragon";
import { buildAlbum } from "./album";
import { type PlayerMatchRow, verifiedChampions } from "./stats";
import {
  BEST_RATE_MIN_GAMES,
  HIGHLIGHT_LIMIT,
  highlights,
  wonCurve,
  wonSummary,
} from "./summary";

// Filas y catálogo inline (sin BD, sin red, sin fixtures). Instantes: `t(n)` = n minutos desde
// una base fija, así el orden cronológico se lee en los tests.

const BASE = 1_790_000_000_000;
const t = (minutes: number) => BASE + minutes * 60_000;
// Espacio duro que pone `Intl` entre la cifra y el «%» en es-ES.
const NBSP = "\u00a0";

let counter = 0;
function row(
  championId: number,
  placement: number,
  minutes: number,
  overrides: Partial<PlayerMatchRow> = {},
): PlayerMatchRow {
  counter += 1;
  return {
    matchId: `EUW1_${minutes}_${counter}`,
    gameCreation: t(minutes),
    championId,
    championName: `Champ${championId}`,
    placement,
    playerSubteamId: 1,
    ...overrides,
  };
}

const champion = (championId: number, ddId: string, name = ddId): Champion => ({
  championId,
  ddId,
  name,
  portraitUrl: `https://cdn.test/${ddId}.png`,
});

const catalogOf = (...champions: Champion[]): ChampionCatalog => ({
  version: "16.19.1",
  champions,
});

const NO_CATALOG: ChampionCatalog = { version: null, champions: [] };

/** Los campeones de prueba: el id es el índice + 1, el nombre `C01`, `C02`… */
const NUMBERED = catalogOf(
  ...Array.from({ length: 12 }, (_, i) =>
    champion(i + 1, `C${String(i + 1).padStart(2, "0")}`),
  ),
);

describe("wonCurve", () => {
  const SEASON = t(-1000);

  it("sin campeones verificados no hay curva", () => {
    expect(wonCurve([], SEASON, t(500))).toEqual([]);
  });

  it("es escalonada: inicio de temporada a 0, un punto por primer 1º en orden y «ahora»", () => {
    // Desordenados a propósito: la curva los ordena por fecha.
    const verified = [
      { firstWinAt: t(300) },
      { firstWinAt: t(100) },
      { firstWinAt: t(200) },
    ];
    expect(wonCurve(verified, SEASON, t(500))).toEqual([
      { at: SEASON, count: 0 },
      { at: t(100), count: 1 },
      { at: t(200), count: 2 },
      { at: t(300), count: 3 },
      { at: t(500), count: 3 },
    ]);
  });

  it("dos primeros 1º en el mismo instante suben el recuento de dos en un único punto", () => {
    const verified = [
      { firstWinAt: t(100) },
      { firstWinAt: t(200) },
      { firstWinAt: t(200) },
      { firstWinAt: t(300) },
    ];
    expect(wonCurve(verified, SEASON, t(400))).toEqual([
      { at: SEASON, count: 0 },
      { at: t(100), count: 1 },
      { at: t(200), count: 3 },
      { at: t(300), count: 4 },
      { at: t(400), count: 4 },
    ]);
  });

  it("no repite el último punto si «ahora» coincide con él, ni retrocede si el reloj va por detrás", () => {
    const verified = [{ firstWinAt: t(100) }];
    expect(wonCurve(verified, SEASON, t(100))).toEqual([
      { at: SEASON, count: 0 },
      { at: t(100), count: 1 },
    ]);
    expect(wonCurve(verified, SEASON, t(50))).toEqual([
      { at: SEASON, count: 0 },
      { at: t(100), count: 1 },
    ]);
  });

  it("un 1º anterior al inicio de temporada adelanta el inicio de la curva, no la pone del revés", () => {
    const curve = wonCurve([{ firstWinAt: t(-2000) }], SEASON, t(0));
    expect(curve[0]).toEqual({ at: t(-2000), count: 0 });
    expect(curve.map((p) => p.at)).toEqual(
      [...curve.map((p) => p.at)].sort((a, b) => a - b),
    );
  });

  it("con los verificados de dominio: cada campeón cuenta una vez y acaba en su recuento", () => {
    const rows = [
      row(1, 1, 10),
      row(1, 1, 20), // segundo 1º del mismo campeón: no sube la curva
      row(2, 3, 30),
      row(2, 1, 40),
      row(3, 5, 50), // sin 1º: no cuenta
    ];
    const verified = verifiedChampions(rows);
    const curve = wonCurve(verified, SEASON, t(100));
    expect(curve.map((p) => p.count)).toEqual([0, 1, 2, 2]);
    expect(curve.at(-1)?.count).toBe(verified.length);
    expect(curve.map((p) => p.at)).toEqual([SEASON, t(10), t(40), t(100)]);
  });
});

describe("wonSummary", () => {
  const verified = [
    { championId: 1, championName: "Ahri (partida)", firstWinAt: t(100) },
    { championId: 2, championName: "Zed", firstWinAt: t(200) },
  ];
  // 25 días después de los 1º, para no depender de que el año coincida.
  const now = t(200) + 25 * 24 * 60 * 60_000;

  it("dice cuántos van, la meta y cuál fue el último, con el nombre del álbum", () => {
    const album = [{ championId: 2, name: "Zed el Maestro" }];
    expect(wonSummary(verified, album, 60, now)).toBe(
      `2 de 60 campeones ganados; el último, Zed el Maestro, el ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(t(200))}.`,
    );
  });

  it("sin el campeón en el álbum usa el nombre de la partida", () => {
    expect(wonSummary(verified, [], 60, now)).toContain("el último, Zed,");
  });

  it("si dos entran a la vez, el último es el de id mayor", () => {
    const tied = [
      { championId: 7, championName: "Siete", firstWinAt: t(100) },
      { championId: 9, championName: "Nueve", firstWinAt: t(100) },
    ];
    expect(wonSummary(tied, [], 60, now)).toContain("el último, Nueve,");
  });

  it("con el umbral alcanzado o superado lo dice", () => {
    expect(wonSummary(verified, [], 2, now)).toMatch(
      /^2 campeones ganados, umbral de 2 alcanzado; el último, Zed,/,
    );
    expect(wonSummary(verified, [], 1, now)).toMatch(
      /^2 campeones ganados, umbral de 1 alcanzado;/,
    );
  });

  it("sin verificados solo dice que aún no hay ninguno", () => {
    expect(wonSummary([], [], 60, now)).toBe(
      "Aún ningún campeón ganado (0 de 60).",
    );
  });
});

describe("highlights: ganados a la primera", () => {
  it("solo los que ganaron en su primera partida con el campeón", () => {
    const rows = [
      row(1, 1, 10), // C01: 1º a la primera
      row(2, 3, 20), // C02: primero un 3º y después el 1º: no
      row(2, 1, 30),
      row(3, 1, 40), // C03: 1º a la primera
      row(3, 5, 50),
      row(4, 6, 60), // C04: sin 1º
    ];
    const { firstTry } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(firstTry.map((c) => c.name)).toEqual(["C03", "C01"]); // el 1º más reciente primero
    expect(firstTry.every((c) => c.detail === "1º a la primera")).toBe(true);
  });

  it("cada chip lleva su campeón, slug, partidas y retrato", () => {
    const rows = [row(3, 1, 40), row(3, 5, 50)];
    const { firstTry } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(firstTry).toEqual([
      {
        championId: 3,
        name: "C03",
        slug: "c03",
        games: 2,
        detail: "1º a la primera",
        portraitUrl: "https://cdn.test/C03.png",
      },
    ]);
  });

  it("un campeón fuera del catálogo usa su nombre en minúsculas como slug y no tiene retrato", () => {
    const rows = [row(999, 1, 10, { championName: "Nuevo Campeón" })];
    const { firstTry } = highlights(buildAlbum(NO_CATALOG, rows), rows);
    expect(firstTry[0]).toMatchObject({
      name: "Nuevo Campeón",
      slug: "nuevo campeón",
      portraitUrl: null,
    });
  });

  it("dos partidas en el mismo instante: manda el orden estable de partidas, no la fecha", () => {
    // C01: el 1º y una derrota comparten `gameCreation`; `matchId` decide cuál fue la primera.
    const win = row(1, 1, 10, { matchId: "EUW1_A" });
    const loss = row(1, 4, 10, { matchId: "EUW1_B" });
    const wonFirst = [win, loss];
    expect(
      highlights(buildAlbum(NUMBERED, wonFirst), wonFirst).firstTry,
    ).toHaveLength(1);
    // Con los ids al revés la derrota fue la primera: el 1º ya no es «a la primera».
    const lostFirst = [
      { ...win, matchId: "EUW1_B" },
      { ...loss, matchId: "EUW1_A" },
    ];
    expect(
      highlights(buildAlbum(NUMBERED, lostFirst), lostFirst).firstTry,
    ).toEqual([]);
  });

  it("tope de HIGHLIGHT_LIMIT, con los más recientes", () => {
    const rows = Array.from({ length: HIGHLIGHT_LIMIT + 3 }, (_, i) =>
      row(i + 1, 1, 10 + i),
    );
    const { firstTry } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(firstTry).toHaveLength(HIGHLIGHT_LIMIT);
    expect(firstTry[0].championId).toBe(HIGHLIGHT_LIMIT + 3);
    expect(firstTry.at(-1)?.championId).toBe(4);
  });

  it("los puestos fuera de 1..6 no cuentan como primera partida", () => {
    const rows = [row(1, 0, 5), row(1, 1, 10)];
    expect(highlights(buildAlbum(NUMBERED, rows), rows).firstTry).toHaveLength(
      1,
    );
  });
});

describe("highlights: más intentados sin ganar", () => {
  it("solo campeones jugados sin ningún 1º, con más partidas primero", () => {
    const rows = [
      row(1, 2, 10), // C01: 3 partidas sin ganar
      row(1, 4, 20),
      row(1, 6, 30),
      row(2, 3, 40), // C02: 1 partida sin ganar
      row(3, 1, 50), // C03: ganado -> fuera
      row(3, 4, 60),
      row(3, 4, 70),
      row(3, 4, 80),
      row(3, 4, 90),
      row(4, 5, 100), // C04: 2 partidas sin ganar
      row(4, 5, 110),
    ];
    const { mostTriedUnwon } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(mostTriedUnwon.map((c) => [c.name, c.games, c.detail])).toEqual([
      ["C01", 3, "3 partidas"],
      ["C04", 2, "2 partidas"],
      ["C02", 1, "1 partida"],
    ]);
  });

  it("a igual número de partidas, por nombre; y con tope", () => {
    const rows = Array.from({ length: HIGHLIGHT_LIMIT + 2 }, (_, i) =>
      row(i + 1, 4, 10 + i),
    );
    const { mostTriedUnwon } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(mostTriedUnwon).toHaveLength(HIGHLIGHT_LIMIT);
    expect(mostTriedUnwon.map((c) => c.name)).toEqual(
      Array.from(
        { length: HIGHLIGHT_LIMIT },
        (_, i) => `C${String(i + 1).padStart(2, "0")}`,
      ),
    );
  });

  it("sin campeones jugados sin ganar el grupo está vacío", () => {
    const rows = [row(1, 1, 10)];
    expect(highlights(buildAlbum(NUMBERED, rows), rows).mostTriedUnwon).toEqual(
      [],
    );
  });
});

describe("highlights: mejor % de 1º", () => {
  it(`exige ${BEST_RATE_MIN_GAMES}+ partidas: un 1/1 o un 2/2 no entran`, () => {
    const rows = [
      row(1, 1, 10), // C01: 1/1 -> fuera
      row(2, 1, 20), // C02: 2/2 -> fuera
      row(2, 1, 30),
      row(3, 1, 40), // C03: 1/3 -> dentro
      row(3, 4, 50),
      row(3, 4, 60),
    ];
    const { bestFirstRate } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(bestFirstRate.map((c) => c.name)).toEqual(["C03"]);
  });

  it("justo en el umbral entra; una partida por debajo no", () => {
    const at = Array.from({ length: BEST_RATE_MIN_GAMES }, (_, i) =>
      row(1, i === 0 ? 1 : 4, 10 + i),
    );
    const below = Array.from({ length: BEST_RATE_MIN_GAMES - 1 }, (_, i) =>
      row(2, i === 0 ? 1 : 4, 30 + i),
    );
    const rows = [...at, ...below];
    expect(
      highlights(buildAlbum(NUMBERED, rows), rows).bestFirstRate.map(
        (c) => c.name,
      ),
    ).toEqual(["C01"]);
  });

  it("ordena por porcentaje y, a igualdad, por más partidas; el detalle lleva 1º/partidas y %", () => {
    const rows = [
      // C01: 3/5 = 60 %
      ...[1, 1, 1, 4, 5].map((p, i) => row(1, p, 10 + i)),
      // C02: 2/4 = 50 %
      ...[1, 1, 4, 5].map((p, i) => row(2, p, 30 + i)),
      // C03: 3/6 = 50 % (más partidas que C02: va antes)
      ...[1, 1, 1, 4, 5, 6].map((p, i) => row(3, p, 50 + i)),
      // C04: 1/3 = 33 %
      ...[1, 4, 5].map((p, i) => row(4, p, 70 + i)),
    ];
    const { bestFirstRate } = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(bestFirstRate.map((c) => [c.name, c.games, c.detail])).toEqual([
      ["C01", 5, `3/5 · 60${NBSP}%`],
      ["C03", 6, `3/6 · 50${NBSP}%`],
      ["C02", 4, `2/4 · 50${NBSP}%`],
      ["C04", 3, `1/3 · 33${NBSP}%`],
    ]);
  });

  it("un campeón con 3+ partidas y ningún 1º no aparece (su 0 % no es un destacado)", () => {
    const rows = [row(1, 4, 10), row(1, 5, 20), row(1, 6, 30)];
    const result = highlights(buildAlbum(NUMBERED, rows), rows);
    expect(result.bestFirstRate).toEqual([]);
    expect(result.mostTriedUnwon.map((c) => c.name)).toEqual(["C01"]);
  });

  it("con tope de HIGHLIGHT_LIMIT", () => {
    const rows = Array.from({ length: HIGHLIGHT_LIMIT + 2 }, (_, i) => [
      row(i + 1, 1, 10 + i * 10),
      row(i + 1, 4, 11 + i * 10),
      row(i + 1, 4, 12 + i * 10),
    ]).flat();
    expect(
      highlights(buildAlbum(NUMBERED, rows), rows).bestFirstRate,
    ).toHaveLength(HIGHLIGHT_LIMIT);
  });
});

describe("highlights: sin partidas", () => {
  it("los tres grupos salen vacíos", () => {
    expect(highlights(buildAlbum(NUMBERED, []), [])).toEqual({
      firstTry: [],
      mostTriedUnwon: [],
      bestFirstRate: [],
    });
  });
});
