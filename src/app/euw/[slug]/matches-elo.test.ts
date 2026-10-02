import { describe, expect, it } from "vitest";
import type { EloMatch } from "@/domain/elo";
import { pickEloMatches, visibleMatchIds } from "./matches-elo";
import { eloBreakdown, eloRowChange } from "./matches-view";

const eloMatch = (matchId: string): EloMatch => ({
  matchId,
  gameStartTimestamp: 1_700_000_000_000,
  placement: 2,
  strangers: 1,
  base: 20,
  multiplier: 1.1,
  delta: 22,
  ratingBefore: 1000,
  ratingAfter: 1022,
});

const history = {
  EUW1_1: eloMatch("EUW1_1"),
  EUW1_2: eloMatch("EUW1_2"),
  EUW1_3: eloMatch("EUW1_3"),
};

describe("visibleMatchIds", () => {
  it("junta las filas y la partida abierta, sin duplicar", () => {
    const rows = [{ matchId: "EUW1_1" }, { matchId: "EUW1_2" }];
    expect([
      ...visibleMatchIds(rows, { row: { matchId: "EUW1_9" } } as never),
    ]).toEqual(["EUW1_1", "EUW1_2", "EUW1_9"]);
    expect(
      visibleMatchIds(rows, { row: { matchId: "EUW1_2" } } as never).size,
    ).toBe(2);
  });

  it("sin partida abierta, solo las filas", () => {
    expect([...visibleMatchIds([{ matchId: "EUW1_1" }], null)]).toEqual([
      "EUW1_1",
    ]);
    expect(visibleMatchIds([], undefined).size).toBe(0);
  });
});

describe("pickEloMatches", () => {
  it("deja solo las partidas pedidas", () => {
    const picked = pickEloMatches(history, new Set(["EUW1_1", "EUW1_3"]));
    expect(Object.keys(picked ?? {})).toEqual(["EUW1_1", "EUW1_3"]);
  });

  it("lo que ve el panel de una partida visible es idéntico al historial completo", () => {
    const picked = pickEloMatches(history, new Set(["EUW1_2"]));
    expect(eloRowChange(picked, "EUW1_2")).toEqual(
      eloRowChange(history, "EUW1_2"),
    );
    expect(eloBreakdown(picked, "EUW1_2")).toEqual(
      eloBreakdown(history, "EUW1_2"),
    );
  });

  it("una partida que no cuenta para el rating sigue sin desglose", () => {
    const picked = pickEloMatches(history, new Set(["EUW1_1", "EUW1_404"]));
    expect(eloRowChange(picked, "EUW1_404")).toBeNull();
    expect(Object.keys(picked ?? {})).toEqual(["EUW1_1"]);
  });

  it("las partidas fuera del bloque no viajan", () => {
    const picked = pickEloMatches(history, new Set(["EUW1_1"]));
    expect(Object.hasOwn(picked ?? {}, "EUW1_2")).toBe(false);
  });

  it("sin ELO (no miembro) se queda en null; sin ids, vacío", () => {
    expect(pickEloMatches(null, new Set(["EUW1_1"]))).toBeNull();
    expect(pickEloMatches(history, new Set())).toEqual({});
  });
});
