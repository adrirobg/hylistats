import { describe, expect, it } from "vitest";
import { computeGroupToday, type TodayRow } from "./group-today";

// Martes 2026-10-06, 14:00 Madrid: día de juego 2026-10-06 (de las 06:00 a las 06:00 siguientes).
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const HOUR = 3_600_000;
// Hoy: tras las 06:00 de Madrid (04:00Z). Ayer: el día de juego anterior.
const TODAY = Date.UTC(2026, 9, 6, 5, 0, 0);
const YESTERDAY = Date.UTC(2026, 9, 5, 15, 0, 0);

let counter = 0;
const row = (
  puuid: string,
  placement: number,
  gameStartTimestamp: number,
  extra: Partial<TodayRow> = {},
): TodayRow => {
  counter += 1;
  return {
    puuid,
    matchId: `EUW1_${counter}`,
    gameStartTimestamp,
    championId: 100 + counter,
    championName: `Champ${counter}`,
    placement,
    ...extra,
  };
};

const IDLE = { games: 0, firsts: 0, avgPlacement: null, last: [] };

describe("computeGroupToday", () => {
  it("sin partidas: el día y todos los miembros a cero", () => {
    expect(computeGroupToday([], ["a", "b"], NOW)).toEqual({
      dayKey: "2026-10-06",
      games: 0,
      members: { a: IDLE, b: IDLE },
    });
  });

  it("hoy es estricto: con partidas solo de ayer, todo a cero (no cae al último día)", () => {
    const rows = [row("a", 1, YESTERDAY), row("b", 3, YESTERDAY + HOUR)];
    const today = computeGroupToday(rows, ["a", "b"], NOW);
    expect(today.games).toBe(0);
    expect(today.members).toEqual({ a: IDLE, b: IDLE });
  });

  it("con partidas de hoy y de ayer: solo cuentan las de hoy", () => {
    const rows = [
      row("a", 1, YESTERDAY),
      row("a", 1, TODAY),
      row("a", 4, TODAY + HOUR),
      row("b", 6, YESTERDAY),
    ];
    const today = computeGroupToday(rows, ["a", "b"], NOW);
    expect(today.games).toBe(2);
    expect(today.members.a).toMatchObject({
      games: 2,
      firsts: 1,
      avgPlacement: 2.5,
    });
    expect(today.members.b).toEqual(IDLE);
  });

  it("el día de juego acaba a las 06:00 de Madrid: la madrugada cuenta en el día anterior", () => {
    const earlyMorning = Date.UTC(2026, 9, 6, 2, 0, 0); // 04:00 Madrid del 6
    const today = computeGroupToday([row("a", 1, earlyMorning)], ["a"], NOW);
    expect(today.members.a).toEqual(IDLE);
  });

  it("last: hasta 5, la más reciente primero", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row("a", (i % 6) + 1, TODAY + (i * HOUR) / 2),
    );
    const { members } = computeGroupToday(
      // Desordenadas a propósito.
      [...rows].reverse().sort((x, y) => x.matchId.localeCompare(y.matchId)),
      ["a"],
      NOW,
    );
    expect(members.a.games).toBe(7);
    expect(members.a.last.map((g) => g.matchId)).toEqual(
      rows
        .slice(2)
        .reverse()
        .map((r) => r.matchId),
    );
    expect(members.a.last[0]).toEqual({
      matchId: rows[6].matchId,
      championId: rows[6].championId,
      championName: rows[6].championName,
      placement: rows[6].placement,
    });
  });

  it("total del día: dos miembros en la misma partida cuentan una", () => {
    const shared = "EUW1_shared";
    const rows = [
      row("a", 2, TODAY, { matchId: shared }),
      row("b", 2, TODAY, { matchId: shared }),
      row("b", 5, TODAY + HOUR),
    ];
    const today = computeGroupToday(rows, ["a", "b"], NOW);
    expect(today.games).toBe(2);
    expect(today.members.a.games).toBe(1);
    expect(today.members.b.games).toBe(2);
  });

  it("ignora puestos fuera de 1..6 y filas de quien no es miembro", () => {
    const rows = [
      row("a", 0, TODAY),
      row("a", 7, TODAY),
      row("x", 1, TODAY),
      row("a", 3, TODAY),
    ];
    const today = computeGroupToday(rows, ["a"], NOW);
    expect(today.games).toBe(1);
    expect(today.members).toEqual({
      a: {
        games: 1,
        firsts: 0,
        avgPlacement: 3,
        last: [expect.objectContaining({ placement: 3 })],
      },
    });
    expect(Object.keys(today.members)).toEqual(["a"]);
  });
});
