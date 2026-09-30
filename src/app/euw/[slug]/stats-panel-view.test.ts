import { describe, expect, it } from "vitest";
import type { AlbumEntry } from "@/domain/album";
import type { RecordGame, Records, StreakRecord } from "@/domain/records";
import { RECORD_DAY_MIN_GAMES } from "@/lib/config";
import {
  championRef,
  DAYS_NOTE,
  DEATHLESS_VISIBLE,
  dayModel,
  deathlessEmpty,
  firstTryModel,
  foldedLabel,
  formatAvgPlacement,
  formatCount,
  formatDay,
  formatGameDate,
  gamesLabel,
  recordCards,
  STATS_EMPTY,
  splitDeathless,
  statsChampionHref,
  statsMatchHref,
  streakModel,
  topChampionDetail,
} from "./stats-panel-view";

const game = (n: number): RecordGame => ({
  matchId: `EUW1_${n}`,
  championId: 103,
  championName: "Ahri",
  gameCreation: Date.UTC(2026, 0, 10, 12) + n,
});

function album(overrides: Partial<AlbumEntry> = {}): AlbumEntry {
  return {
    championId: 103,
    ddId: "Ahri",
    name: "Ahri",
    portraitUrl: "https://cdn/ahri.png",
    state: "none",
    games: 0,
    firsts: 0,
    top3: 0,
    bestPlacement: null,
    avgPlacement: null,
    lastPlayedAt: null,
    firstWinAt: null,
    firstWinMatchId: null,
    heat: "neutral",
    heatAdjustedAvg: null,
    ...overrides,
  };
}

describe("formatGameDate", () => {
  it("la fecha con año", () => {
    expect(formatGameDate(Date.UTC(2026, 0, 15, 12))).toBe("15 ene 2026");
  });

  it("en UTC, como la fila de Partidas a la que enlaza (formatShortDate)", () => {
    // 2026-08-05T22:58Z = 6 ago 00:58 en Madrid; la lista de Partidas pinta "5 ago".
    expect(formatGameDate(Date.UTC(2026, 7, 5, 22, 58))).toBe("5 ago 2026");
  });
});

describe("formatDay", () => {
  it("formatea el día de juego YYYY-MM-DD sin moverlo de día", () => {
    expect(formatDay("2026-01-15")).toBe("15 ene 2026");
    expect(formatDay("2026-12-31")).toBe("31 dic 2026");
    expect(formatDay("2026-03-29")).toBe("29 mar 2026"); // cambio de hora
  });

  it("no depende de la zona horaria del proceso", () => {
    const tz = process.env.TZ;
    try {
      for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
        process.env.TZ = zone;
        expect(formatDay("2026-01-01")).toBe("1 ene 2026");
      }
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("un texto que no es una fecha se devuelve tal cual", () => {
    expect(formatDay("ayer")).toBe("ayer");
  });
});

describe("cifras", () => {
  it("formatCount separa los miles también en 4 cifras", () => {
    expect(formatCount(950)).toBe("950");
    expect(formatCount(1234)).toBe("1.234");
    expect(formatCount(123456)).toBe("123.456");
  });

  it("el puesto medio lleva 2 decimales y coma", () => {
    expect(formatAvgPlacement(2)).toBe("2,00");
    expect(formatAvgPlacement(7 / 3)).toBe("2,33");
    expect(formatAvgPlacement(3.456)).toBe("3,46");
  });

  it("gamesLabel concuerda en singular y plural", () => {
    expect(gamesLabel(1)).toBe("1 partida");
    expect(gamesLabel(3)).toBe("3 partidas");
  });
});

describe("recordCards", () => {
  const entry = (n: number, value: number) => ({ ...game(n), value });
  const records: Records["records"] = {
    damage: entry(1, 123456),
    damageTaken: null,
    kills: entry(2, 14),
    killingSpree: entry(3, 6),
    deaths: entry(4, 9),
  };

  it("cinco récords en el orden de la pestaña, con la cifra formateada", () => {
    const cards = recordCards(records);
    expect(cards.map((c) => c.key)).toEqual([
      "damage",
      "damageTaken",
      "kills",
      "killingSpree",
      "deaths",
    ]);
    expect(cards.map((c) => c.label)).toEqual([
      "Más daño",
      "Más daño recibido",
      "Más kills",
      "Mayor racha de kills",
      "Más muertes",
    ]);
    expect(cards[0]).toMatchObject({ value: "123.456", game: records.damage });
  });

  it("un récord sin dato no tiene cifra ni partida", () => {
    expect(recordCards(records)[1]).toMatchObject({ value: null, game: null });
  });
});

describe("splitDeathless", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => game(i));

  it("hasta 5 se ven todas y no hay nada plegado", () => {
    const { visible, folded } = splitDeathless(list(DEATHLESS_VISIBLE));
    expect(visible).toHaveLength(5);
    expect(folded).toEqual([]);
  });

  it("con más de 5 se pliegan las sobrantes, en orden", () => {
    const matches = list(8);
    const { visible, folded } = splitDeathless(matches);
    expect(visible).toEqual(matches.slice(0, 5));
    expect(folded).toEqual(matches.slice(5));
  });

  it("sin victorias, la lista es vacía", () => {
    expect(splitDeathless([])).toEqual({ visible: [], folded: [] });
  });

  it("textos: el desplegable cuenta las plegadas y el vacío dice el porqué", () => {
    expect(foldedLabel(3)).toBe("Ver 3 más");
    expect(deathlessEmpty(false)).toBe(STATS_EMPTY.noFirsts);
    expect(deathlessEmpty(true)).toBe(STATS_EMPTY.noDeathless);
    expect(STATS_EMPTY.noDeathless).not.toBe(STATS_EMPTY.noFirsts);
  });
});

describe("streakModel", () => {
  const streak = (overrides: Partial<StreakRecord> = {}): StreakRecord => ({
    length: 4,
    fromMatchId: "EUW1_A",
    toMatchId: "EUW1_B",
    from: Date.UTC(2026, 0, 10, 12),
    to: Date.UTC(2026, 0, 12, 12),
    ongoing: false,
    ...overrides,
  });

  it("nº de partidas con su unidad y el rango con sus fechas", () => {
    expect(streakModel(streak())).toEqual({
      length: 4,
      unit: "partidas",
      from: { matchId: "EUW1_A", date: "10 ene 2026" },
      to: { matchId: "EUW1_B", date: "12 ene 2026" },
      single: false,
      sameDay: false,
      ongoing: false,
    });
  });

  it("una sola partida: singular y un único extremo", () => {
    const model = streakModel(
      streak({ length: 1, toMatchId: "EUW1_A", to: Date.UTC(2026, 0, 10, 12) }),
    );
    expect(model).toMatchObject({
      unit: "partida",
      single: true,
      sameDay: true,
    });
  });

  it("varias partidas el mismo día: sameDay sin ser single", () => {
    const model = streakModel(streak({ to: Date.UTC(2026, 0, 10, 18) }));
    expect(model).toMatchObject({ single: false, sameDay: true });
  });

  it("«en curso» viaja tal cual", () => {
    expect(streakModel(streak({ ongoing: true })).ongoing).toBe(true);
  });
});

describe("dayModel", () => {
  it("fecha legible, puesto medio con 2 decimales y partidas", () => {
    expect(
      dayModel({ day: "2026-09-29", avgPlacement: 7 / 3, games: 3 }),
    ).toEqual({ date: "29 sept 2026", avg: "2,33", games: "3 partidas" });
  });

  it("la nota de los días cita el corte y el mínimo de la config", () => {
    expect(DAYS_NOTE).toContain("06:00 a 06:00");
    expect(DAYS_NOTE).toContain(`mínimo ${RECORD_DAY_MIN_GAMES} partidas`);
    expect(STATS_EMPTY.days).toContain(String(RECORD_DAY_MIN_GAMES));
  });
});

describe("firstTryModel", () => {
  it("cuenta, % y de cuántos campeones ganados", () => {
    expect(firstTryModel({ count: 3, wonChampions: 8, rate: 3 / 8 })).toEqual({
      count: "3",
      rate: "37,5 %".replace(" ", " "),
      of: "de 8 campeones ganados",
    });
  });

  it("singular con un solo campeón ganado", () => {
    expect(firstTryModel({ count: 1, wonChampions: 1, rate: 1 })?.of).toBe(
      "de 1 campeón ganado",
    );
  });

  it("sin campeones ganados no hay modelo: se pinta el texto vacío", () => {
    expect(firstTryModel({ count: 0, wonChampions: 0, rate: 0 })).toBeNull();
  });

  it("topChampionDetail", () => {
    expect(topChampionDetail(4, 9)).toBe("4 × 1º en 9 partidas");
    expect(topChampionDetail(1, 1)).toBe("1 × 1º en 1 partida");
  });
});

describe("championRef y enlaces", () => {
  it("resuelve nombre, retrato y slug contra el álbum", () => {
    expect(championRef([album()], 103, "AHRI_RAW")).toEqual({
      championId: 103,
      name: "Ahri",
      portraitUrl: "https://cdn/ahri.png",
      slug: "ahri",
    });
  });

  it("un campeón fuera del álbum queda con el nombre guardado, sin retrato ni panel", () => {
    expect(championRef([], 999, "Nuevo")).toEqual({
      championId: 999,
      name: "Nuevo",
      portraitUrl: null,
      slug: null,
    });
  });

  it("enlace a partida: Partidas con esa partida, sin filtros", () => {
    expect(statsMatchHref("Foo-EUW", "EUW1_1")).toBe(
      "/euw/Foo-EUW?tab=partidas&partida=EUW1_1",
    );
  });

  it("enlace a campeón: abre el panel sin salir de Estadísticas", () => {
    expect(statsChampionHref("Foo-EUW", "ahri")).toBe(
      "/euw/Foo-EUW?tab=estadisticas&campeon=ahri",
    );
  });
});
