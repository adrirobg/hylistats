import { describe, expect, it } from "vitest";
import { RECORD_DAY_MIN_GAMES } from "@/lib/config";
import type { Champion, ChampionCatalog } from "@/lib/ddragon";
import { buildAlbum } from "./album";
import { computeRecords, gameDay, type RecordRow } from "./records";
import type { PlayerMatchRow } from "./stats";
import { highlights } from "./summary";

// Filas sintéticas (sin BD ni red). `t(n)` = n minutos desde una base fija: el orden cronológico se
// lee en los tests. Las fechas de los tests de día de juego se construyen con instantes UTC
// explícitos (`Date.UTC`), sin depender de la zona horaria de la máquina.

const BASE = 1_790_000_000_000;
const t = (minutes: number) => BASE + minutes * 60_000;

let counter = 0;
function rec(
  championId: number,
  placement: number,
  minutes: number,
  overrides: Partial<RecordRow> = {},
): RecordRow {
  counter += 1;
  return {
    matchId: `EUW1_${minutes}_${counter}`,
    gameCreation: t(minutes),
    gameStartTimestamp: t(minutes),
    championId,
    championName: `Champ${championId}`,
    placement,
    kills: 0,
    deaths: 0,
    totalDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    largestKillingSpree: 0,
    ...overrides,
  };
}

/** Partida que empieza en el instante UTC indicado (mes en 1..12). */
const at = (
  month: number,
  day: number,
  hour: number,
  minute: number,
  overrides: Partial<RecordRow> = {},
  placement = 4,
): RecordRow => {
  const start = Date.UTC(2026, month - 1, day, hour, minute);
  return rec(1, placement, 0, {
    gameCreation: start,
    gameStartTimestamp: start,
    ...overrides,
  });
};

describe("computeRecords: lista vacía", () => {
  it("todo a null / 0", () => {
    expect(computeRecords([])).toEqual({
      records: {
        damage: null,
        damageTaken: null,
        kills: null,
        killingSpree: null,
        deaths: null,
      },
      deathlessWins: { count: 0, matches: [] },
      mostDeathsWin: null,
      longestWinStreak: null,
      longestDrought: null,
      bestDay: null,
      worstDay: null,
      firstTry: { count: 0, wonChampions: 0, rate: 0 },
      topChampion: null,
    });
  });
});

describe("computeRecords: récords de una partida", () => {
  it("cada récord lleva valor, partida, campeón y fecha", () => {
    const rows = [
      rec(1, 4, 10, {
        championName: "Ahri",
        totalDamageDealtToChampions: 30_000,
        totalDamageTaken: 10_000,
        kills: 5,
        largestKillingSpree: 3,
        deaths: 2,
      }),
      rec(2, 2, 20, {
        championName: "Zed",
        totalDamageDealtToChampions: 45_000,
        totalDamageTaken: 8_000,
        kills: 11,
        largestKillingSpree: 7,
        deaths: 6,
      }),
    ];
    const { records } = computeRecords(rows);
    expect(records.damage).toEqual({
      value: 45_000,
      matchId: rows[1].matchId,
      championId: 2,
      championName: "Zed",
      gameCreation: t(20),
    });
    expect(records.damageTaken).toMatchObject({
      value: 10_000,
      matchId: rows[0].matchId,
      championName: "Ahri",
    });
    expect(records.kills).toMatchObject({
      value: 11,
      matchId: rows[1].matchId,
    });
    expect(records.killingSpree).toMatchObject({
      value: 7,
      matchId: rows[1].matchId,
    });
    expect(records.deaths).toMatchObject({
      value: 6,
      matchId: rows[1].matchId,
    });
  });

  it("empate en un récord: gana la partida más antigua (aunque las filas lleguen desordenadas)", () => {
    const old = rec(1, 3, 10, { kills: 9, totalDamageDealtToChampions: 500 });
    const mid = rec(2, 3, 20, { kills: 9, totalDamageDealtToChampions: 500 });
    const recent = rec(3, 3, 30, {
      kills: 9,
      totalDamageDealtToChampions: 500,
    });
    const { records } = computeRecords([recent, old, mid]);
    expect(records.kills?.matchId).toBe(old.matchId);
    expect(records.damage?.matchId).toBe(old.matchId);
  });

  it("empate en la misma fecha: desempata el matchId (orden cronológico total)", () => {
    const b = rec(1, 3, 10, { kills: 4, matchId: "EUW1_B" });
    const a = rec(2, 3, 10, { kills: 4, matchId: "EUW1_A" });
    expect(computeRecords([b, a]).records.kills?.matchId).toBe("EUW1_A");
  });

  it("los campos null se excluyen solo de su récord", () => {
    const rows = [
      rec(1, 3, 10, {
        totalDamageTaken: null,
        largestKillingSpree: null,
        kills: 12,
        totalDamageDealtToChampions: 40_000,
      }),
      rec(2, 3, 20, {
        totalDamageTaken: 7_000,
        largestKillingSpree: 2,
        kills: 3,
      }),
    ];
    const { records } = computeRecords(rows);
    expect(records.damageTaken).toMatchObject({
      value: 7_000,
      matchId: rows[1].matchId,
    });
    expect(records.killingSpree).toMatchObject({
      value: 2,
      matchId: rows[1].matchId,
    });
    // La partida con nulls sigue contando en los demás récords.
    expect(records.kills).toMatchObject({
      value: 12,
      matchId: rows[0].matchId,
    });
    expect(records.damage).toMatchObject({ value: 40_000 });
  });

  it("si todos los valores son null, ese récord es null y un 0 sí es un valor", () => {
    const { records } = computeRecords([
      rec(1, 3, 10, { totalDamageTaken: null, largestKillingSpree: null }),
    ]);
    expect(records.damageTaken).toBeNull();
    expect(records.killingSpree).toBeNull();
    expect(records.kills).toMatchObject({ value: 0 });
  });

  it("una fila con puesto fuera de 1..6 se ignora en todo", () => {
    const { records, longestDrought } = computeRecords([
      rec(1, 0, 10, { kills: 99 }),
      rec(2, 3, 20, { kills: 2 }),
    ]);
    expect(records.kills).toMatchObject({ value: 2 });
    expect(longestDrought?.length).toBe(1);
  });
});

describe("computeRecords: victorias especiales", () => {
  it("victorias sin morir: solo 1º con 0 muertes, la más reciente primero", () => {
    const rows = [
      rec(1, 1, 10, { deaths: 0 }),
      rec(2, 1, 20, { deaths: 3 }), // 1º pero con muertes
      rec(3, 4, 30, { deaths: 0 }), // sin muertes pero no es 1º
      rec(4, 1, 40, { deaths: 0 }),
    ];
    const { deathlessWins } = computeRecords(rows);
    expect(deathlessWins.count).toBe(2);
    expect(deathlessWins.matches.map((m) => m.matchId)).toEqual([
      rows[3].matchId,
      rows[0].matchId,
    ]);
    expect(deathlessWins.matches[0]).toEqual({
      matchId: rows[3].matchId,
      championId: 4,
      championName: "Champ4",
      gameCreation: t(40),
    });
  });

  it("victoria con más muertes: solo entre 1º; empate, la más antigua", () => {
    const rows = [
      rec(1, 1, 10, { deaths: 5 }),
      rec(2, 1, 20, { deaths: 5 }),
      rec(3, 6, 30, { deaths: 12 }), // más muertes, pero no ganó
      rec(4, 1, 40, { deaths: 1 }),
    ];
    const { mostDeathsWin, records } = computeRecords(rows);
    expect(mostDeathsWin).toMatchObject({
      value: 5,
      matchId: rows[0].matchId,
      championId: 1,
    });
    // El récord de muertes (de cualquier partida) es otra cosa.
    expect(records.deaths).toMatchObject({
      value: 12,
      matchId: rows[2].matchId,
    });
  });
});

describe("computeRecords: rachas", () => {
  it("racha de 1º en curso hasta la última partida", () => {
    const rows = [rec(1, 3, 10), rec(1, 1, 20), rec(1, 1, 30), rec(1, 1, 40)];
    const { longestWinStreak } = computeRecords(rows);
    expect(longestWinStreak).toEqual({
      length: 3,
      fromMatchId: rows[1].matchId,
      toMatchId: rows[3].matchId,
      from: t(20),
      to: t(40),
      ongoing: true,
    });
  });

  it("racha cerrada: no está en curso si la última partida la rompe", () => {
    const rows = [rec(1, 1, 10), rec(1, 1, 20), rec(1, 5, 30)];
    const { longestWinStreak, longestDrought } = computeRecords(rows);
    expect(longestWinStreak).toMatchObject({ length: 2, ongoing: false });
    // La de sin 1º es de una partida y sí incluye la última.
    expect(longestDrought).toMatchObject({
      length: 1,
      fromMatchId: rows[2].matchId,
      toMatchId: rows[2].matchId,
      ongoing: true,
    });
  });

  it("empate de longitud: gana la racha más reciente (también en la de sin 1º)", () => {
    const rows = [
      rec(1, 1, 10),
      rec(1, 1, 20),
      rec(1, 4, 30),
      rec(1, 5, 40),
      rec(1, 1, 50),
      rec(1, 1, 60),
      rec(1, 2, 70),
      rec(1, 3, 80),
    ];
    const { longestWinStreak, longestDrought } = computeRecords(rows);
    expect(longestWinStreak).toMatchObject({
      length: 2,
      fromMatchId: rows[4].matchId,
      toMatchId: rows[5].matchId,
      ongoing: false,
    });
    expect(longestDrought).toMatchObject({
      length: 2,
      fromMatchId: rows[6].matchId,
      toMatchId: rows[7].matchId,
      ongoing: true,
    });
  });

  it("orden cronológico por gameCreation con independencia del orden de entrada", () => {
    const rows = [rec(1, 1, 30), rec(1, 5, 10), rec(1, 1, 20), rec(1, 1, 40)];
    const { longestWinStreak, longestDrought } = computeRecords(rows);
    expect(longestWinStreak).toMatchObject({ length: 3, ongoing: true });
    expect(longestDrought).toMatchObject({ length: 1, ongoing: false });
  });

  it("sin ningún 1º: no hay racha de victorias y toda la temporada es la sequía", () => {
    const rows = [rec(1, 2, 10), rec(2, 3, 20), rec(3, 6, 30)];
    const result = computeRecords(rows);
    expect(result.longestWinStreak).toBeNull();
    expect(result.longestDrought).toMatchObject({ length: 3, ongoing: true });
  });

  it("solo 1º: no hay sequía", () => {
    const result = computeRecords([rec(1, 1, 10), rec(2, 1, 20)]);
    expect(result.longestDrought).toBeNull();
    expect(result.longestWinStreak).toMatchObject({ length: 2, ongoing: true });
  });
});

describe("computeRecords: jugador sin ningún 1º", () => {
  it("rachas, a la primera, campeón con más 1º y victorias especiales vacíos", () => {
    const rows = [rec(1, 2, 10, { deaths: 4 }), rec(2, 5, 20)];
    const result = computeRecords(rows);
    expect(result.longestWinStreak).toBeNull();
    expect(result.firstTry).toEqual({ count: 0, wonChampions: 0, rate: 0 });
    expect(result.topChampion).toBeNull();
    expect(result.mostDeathsWin).toBeNull();
    expect(result.deathlessWins).toEqual({ count: 0, matches: [] });
    // Los récords de partida sí existen.
    expect(result.records.deaths).toMatchObject({ value: 4 });
  });
});

describe("gameDay (F17): día de juego 06:00–06:00 en Europe/Madrid", () => {
  it("una partida a las 01:30 de Madrid cuenta en el día anterior", () => {
    // 2026-06-10 01:30 CEST (UTC+2) = 2026-06-09 23:30 UTC.
    expect(gameDay(Date.UTC(2026, 5, 9, 23, 30))).toBe("2026-06-09");
    // En invierno: 2026-01-15 01:30 CET (UTC+1) = 00:30 UTC.
    expect(gameDay(Date.UTC(2026, 0, 15, 0, 30))).toBe("2026-01-14");
  });

  it("el corte es a las 06:00 locales: 05:59 es el día anterior y 06:00 el mismo", () => {
    // Verano, 2026-06-10: 05:59 CEST = 03:59 UTC; 06:00 CEST = 04:00 UTC.
    expect(gameDay(Date.UTC(2026, 5, 10, 3, 59))).toBe("2026-06-09");
    expect(gameDay(Date.UTC(2026, 5, 10, 4, 0))).toBe("2026-06-10");
    // Invierno, 2026-01-15: 05:59 CET = 04:59 UTC; 06:00 CET = 05:00 UTC.
    expect(gameDay(Date.UTC(2026, 0, 15, 4, 59))).toBe("2026-01-14");
    expect(gameDay(Date.UTC(2026, 0, 15, 5, 0))).toBe("2026-01-15");
  });

  it("la medianoche de Madrid cuenta en el día anterior y la tarde en el mismo día", () => {
    // 2026-06-10 00:00 CEST = 2026-06-09 22:00 UTC; 2026-06-10 23:30 CEST = 21:30 UTC.
    expect(gameDay(Date.UTC(2026, 5, 9, 22, 0))).toBe("2026-06-09");
    expect(gameDay(Date.UTC(2026, 5, 10, 21, 30))).toBe("2026-06-10");
  });

  it("cambio a horario de verano (2026-03-29, 02:00 → 03:00): 05:30 → día 28, 06:30 → día 29", () => {
    // 05:30 CEST (UTC+2) = 03:30 UTC; 06:30 CEST = 04:30 UTC. El día local mide 23 h.
    expect(gameDay(Date.UTC(2026, 2, 29, 3, 30))).toBe("2026-03-28");
    expect(gameDay(Date.UTC(2026, 2, 29, 4, 30))).toBe("2026-03-29");
  });

  it("cambio a horario de invierno (2026-10-25, 03:00 → 02:00): 05:30 → día 24, 06:30 → día 25", () => {
    // 05:30 CET (UTC+1) = 04:30 UTC; 06:30 CET = 05:30 UTC. El día local mide 25 h.
    expect(gameDay(Date.UTC(2026, 9, 25, 4, 30))).toBe("2026-10-24");
    expect(gameDay(Date.UTC(2026, 9, 25, 5, 30))).toBe("2026-10-25");
  });
});

describe("computeRecords: mejor y peor día", () => {
  it("media por día de juego, con el puesto medio y el nº de partidas", () => {
    const rows = [
      // Día 2026-06-09 (todas después de las 06:00 locales): 1, 2, 3 -> media 2.
      at(6, 9, 10, 0, {}, 1),
      at(6, 9, 11, 0, {}, 2),
      at(6, 9, 12, 0, {}, 3),
      // Día 2026-06-10: 5, 6, 6, 5 -> media 5,5.
      at(6, 10, 10, 0, {}, 5),
      at(6, 10, 11, 0, {}, 6),
      at(6, 10, 12, 0, {}, 6),
      at(6, 10, 13, 0, {}, 5),
    ];
    const { bestDay, worstDay } = computeRecords(rows);
    expect(bestDay).toEqual({ day: "2026-06-09", avgPlacement: 2, games: 3 });
    expect(worstDay).toEqual({
      day: "2026-06-10",
      avgPlacement: 5.5,
      games: 4,
    });
  });

  it("una partida a las 01:30 de Madrid cuenta en el día anterior y suma a su media", () => {
    // Día 2026-06-09: tres partidas por la tarde (1º) y una a las 01:30 del 10 (6º) -> 4 partidas.
    const rows = [
      at(6, 9, 14, 0, {}, 1),
      at(6, 9, 15, 0, {}, 1),
      at(6, 9, 16, 0, {}, 1),
      at(6, 9, 23, 30, {}, 6), // 2026-06-10 01:30 CEST
    ];
    const { bestDay } = computeRecords(rows);
    expect(bestDay).toEqual({
      day: "2026-06-09",
      avgPlacement: 2.25,
      games: 4,
    });
  });

  it("un día con 2 partidas queda excluido de mejor y de peor día", () => {
    expect(RECORD_DAY_MIN_GAMES).toBe(3);
    const rows = [
      // 2 partidas espectaculares (1º, 1º) y 2 desastrosas (6º, 6º) en días distintos: fuera.
      at(6, 8, 10, 0, {}, 1),
      at(6, 8, 11, 0, {}, 1),
      at(6, 9, 10, 0, {}, 6),
      at(6, 9, 11, 0, {}, 6),
      // El único día que llega a 3: media 3.
      at(6, 10, 10, 0, {}, 2),
      at(6, 10, 11, 0, {}, 3),
      at(6, 10, 12, 0, {}, 4),
    ];
    const { bestDay, worstDay } = computeRecords(rows);
    expect(bestDay).toEqual({ day: "2026-06-10", avgPlacement: 3, games: 3 });
    expect(worstDay).toEqual(bestDay);
  });

  it("ningún día con 3 partidas: mejor y peor día son null", () => {
    const rows = [at(6, 9, 10, 0), at(6, 9, 11, 0), at(6, 10, 10, 0)];
    const { bestDay, worstDay } = computeRecords(rows);
    expect(bestDay).toBeNull();
    expect(worstDay).toBeNull();
  });

  it("empate de media: gana el día más reciente (en mejor y en peor)", () => {
    const day = (d: number, placement: number) =>
      [10, 11, 12].map((h) => at(6, d, h, 0, {}, placement));
    // 9 y 11 empatan en 2; 10 y 12 empatan en 5.
    const rows = [...day(9, 2), ...day(10, 5), ...day(11, 2), ...day(12, 5)];
    const { bestDay, worstDay } = computeRecords(rows);
    expect(bestDay?.day).toBe("2026-06-11");
    expect(worstDay?.day).toBe("2026-06-12");
  });

  it("el día se toma de gameStartTimestamp, no de gameCreation", () => {
    // `gameCreation` cae a las 10:00 del 10, pero la partida empezó a las 01:30 del 10 (día 9).
    const start = Date.UTC(2026, 5, 9, 23, 30);
    const rows = [0, 1, 2].map((i) =>
      rec(1, 3, 0, {
        gameStartTimestamp: start + i * 60_000,
        gameCreation: Date.UTC(2026, 5, 10, 8, 0) + i * 60_000,
      }),
    );
    expect(computeRecords(rows).bestDay?.day).toBe("2026-06-09");
  });

  it("cambio de hora: las partidas de 05:30 y 06:30 caen en días distintos (2026-03-29 y 2026-10-25)", () => {
    // Cada día de juego con 3 partidas; los días esperados están documentados en `gameDay`.
    const rows = [
      // Verano: 05:30 CEST (03:30 UTC) -> 2026-03-28; 06:30 CEST (04:30 UTC) -> 2026-03-29.
      at(3, 29, 3, 30, {}, 1),
      at(3, 29, 3, 31, {}, 1),
      at(3, 29, 3, 32, {}, 1),
      at(3, 29, 4, 30, {}, 6),
      at(3, 29, 4, 31, {}, 6),
      at(3, 29, 4, 32, {}, 6),
      // Invierno: 05:30 CET (04:30 UTC) -> 2026-10-24; 06:30 CET (05:30 UTC) -> 2026-10-25.
      at(10, 25, 4, 30, {}, 2),
      at(10, 25, 4, 31, {}, 2),
      at(10, 25, 4, 32, {}, 2),
      at(10, 25, 5, 30, {}, 5),
      at(10, 25, 5, 31, {}, 5),
      at(10, 25, 5, 32, {}, 5),
    ];
    const { bestDay, worstDay } = computeRecords(rows);
    // Las de 05:30 y 06:30 no se mezclan: 28-mar (1º) frente a 29-mar (6º).
    expect(bestDay).toEqual({ day: "2026-03-28", avgPlacement: 1, games: 3 });
    expect(worstDay).toEqual({ day: "2026-03-29", avgPlacement: 6, games: 3 });

    const october = computeRecords(rows.slice(6));
    expect(october.bestDay).toEqual({
      day: "2026-10-24",
      avgPlacement: 2,
      games: 3,
    });
    expect(october.worstDay).toEqual({
      day: "2026-10-25",
      avgPlacement: 5,
      games: 3,
    });
  });
});

describe("computeRecords: victorias a la primera y campeón con más 1º", () => {
  it("firstTry: campeones cuya primera partida fue un 1º, sobre los campeones ganados", () => {
    const rows = [
      rec(1, 1, 10), // 1: a la primera
      rec(2, 3, 20), // 2: primero un 3º y luego el 1º: no
      rec(2, 1, 30),
      rec(3, 1, 40), // 3: a la primera
      rec(3, 5, 50),
      rec(4, 6, 60), // 4: sin 1º: no cuenta en wonChampions
    ];
    const { firstTry } = computeRecords(rows);
    expect(firstTry.count).toBe(2);
    expect(firstTry.wonChampions).toBe(3);
    expect(firstTry.rate).toBeCloseTo(2 / 3, 10);
  });

  it("topChampion: más 1º; empate por más partidas y después por nombre", () => {
    const rows = [
      rec(1, 1, 10, { championName: "Zed" }),
      rec(1, 1, 20, { championName: "Zed" }),
      rec(2, 1, 30, { championName: "Ahri" }),
      rec(2, 1, 40, { championName: "Ahri" }),
      rec(2, 4, 50, { championName: "Ahri" }), // Ahri: 2 1º en 3 partidas
      rec(3, 1, 60, { championName: "Brand" }),
      rec(3, 1, 70, { championName: "Brand" }),
      rec(3, 4, 80, { championName: "Brand" }), // Brand: 2 1º en 3 partidas
    ];
    expect(computeRecords(rows).topChampion).toEqual({
      championId: 2,
      championName: "Ahri",
      firsts: 2,
      games: 3,
    });
    // Con 2 partidas más, Zed también llega a 2 1º y además tiene más partidas (4): desempata.
    const more = [
      ...rows,
      rec(1, 5, 90, { championName: "Zed" }),
      rec(1, 5, 91, { championName: "Zed" }),
    ];
    expect(computeRecords(more).topChampion).toMatchObject({
      championId: 1,
      firsts: 2,
      games: 4,
    });
  });

  it("topChampion: un campeón con más 1º gana aunque tenga menos partidas", () => {
    const rows = [
      rec(1, 1, 10),
      rec(1, 1, 20),
      rec(1, 1, 30),
      rec(2, 1, 40),
      rec(2, 4, 50),
      rec(2, 4, 60),
      rec(2, 4, 70),
    ];
    expect(computeRecords(rows).topChampion).toEqual({
      championId: 1,
      championName: "Champ1",
      firsts: 3,
      games: 3,
    });
  });

  it("firstTry coincide con highlights().firstTry sobre los mismos datos", () => {
    const champions: Champion[] = Array.from({ length: 8 }, (_, i) => ({
      championId: i + 1,
      ddId: `C${i + 1}`,
      name: `C${i + 1}`,
      portraitUrl: null,
    }));
    const catalog: ChampionCatalog = { version: "16.19.1", champions };
    const recordRows = [
      rec(1, 1, 10),
      rec(2, 3, 20),
      rec(2, 1, 30),
      rec(3, 1, 40),
      rec(3, 5, 50),
      rec(4, 6, 60),
      rec(5, 1, 70),
      rec(5, 1, 71),
      rec(6, 2, 80),
      rec(6, 1, 90),
      rec(7, 0, 95), // puesto fuera de rango: se ignora en los dos
      rec(8, 1, 100),
    ];
    const playerRows: PlayerMatchRow[] = recordRows.map((r) => ({
      matchId: r.matchId,
      gameCreation: r.gameCreation,
      championId: r.championId,
      championName: r.championName,
      placement: r.placement,
      playerSubteamId: 1,
    }));
    const chips = highlights(
      buildAlbum(catalog, playerRows),
      playerRows,
    ).firstTry;
    const { firstTry } = computeRecords(recordRows);
    expect(firstTry.count).toBe(chips.length);
    expect(chips.map((c) => c.championId).sort((a, b) => a - b)).toEqual([
      1, 3, 5, 8,
    ]);
    expect(firstTry.wonChampions).toBe(6); // 1, 2, 3, 5, 6 y 8 tienen algún 1º
  });
});
