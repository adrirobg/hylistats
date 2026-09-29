import { describe, expect, it } from "vitest";
import {
  advanceWatch,
  outcomeMessage,
  type RefreshSnapshot,
  refreshOutcome,
  startWatch,
} from "./refresh-outcome";

const champion = (championId: number, championName: string) => ({
  championId,
  championName,
});

function snapshot(overrides: Partial<RefreshSnapshot> = {}): RefreshSnapshot {
  return {
    games: 10,
    champions: [champion(1, "Annie"), champion(2, "Olaf")],
    lastSyncedAt: 1_000,
    errorAt: null,
    active: false,
    ...overrides,
  };
}

describe("refreshOutcome", () => {
  it("cuenta las partidas nuevas y los campeones que pasan a verificados", () => {
    const prev = snapshot();
    const next = snapshot({
      games: 13,
      champions: [
        champion(4, "Ahri"),
        champion(1, "Annie"),
        champion(2, "Olaf"),
      ],
    });
    expect(refreshOutcome(prev, next)).toEqual({
      newGames: 3,
      newChampions: ["Ahri"],
    });
  });

  it("sin cambios: cero partidas y ningún campeón", () => {
    expect(refreshOutcome(snapshot(), snapshot())).toEqual({
      newGames: 0,
      newChampions: [],
    });
  });

  it("nunca sale negativo si el recuento baja", () => {
    expect(
      refreshOutcome(snapshot({ games: 10 }), snapshot({ games: 8 })),
    ).toEqual({ newGames: 0, newChampions: [] });
  });

  it("compara por championId, no por nombre", () => {
    const next = snapshot({ champions: [champion(1, "Annie renombrada")] });
    expect(refreshOutcome(snapshot(), next).newChampions).toEqual([]);
  });
});

describe("outcomeMessage", () => {
  it("sin nada nuevo: «Sin partidas nuevas»", () => {
    expect(outcomeMessage({ newGames: 0, newChampions: [] })).toEqual({
      lead: "Sin partidas nuevas",
      highlight: null,
    });
  });

  it("partidas sin campeón nuevo: singular y plural, sin destacado", () => {
    expect(outcomeMessage({ newGames: 1, newChampions: [] })).toEqual({
      lead: "+1 partida",
      highlight: null,
    });
    expect(outcomeMessage({ newGames: 3, newChampions: [] })).toEqual({
      lead: "+3 partidas",
      highlight: null,
    });
  });

  it("con un campeón nuevo: «+N partidas · nuevo 1º con X»", () => {
    expect(outcomeMessage({ newGames: 1, newChampions: ["Jinx"] })).toEqual({
      lead: "+1 partida",
      highlight: "nuevo 1º con Jinx",
    });
  });

  it("con varios campeones nuevos: plural y lista con «y»", () => {
    expect(
      outcomeMessage({ newGames: 4, newChampions: ["Ahri", "Jinx"] }).highlight,
    ).toBe("nuevos 1º con Ahri y Jinx");
    expect(
      outcomeMessage({ newGames: 4, newChampions: ["Ahri", "Jinx", "Lux"] })
        .highlight,
    ).toBe("nuevos 1º con Ahri, Jinx y Lux");
  });
});

describe("advanceWatch", () => {
  it("empieza vigilando: si ya había un job activo al pulsar, cuenta como visto", () => {
    expect(startWatch(snapshot()).sawActive).toBe(false);
    expect(startWatch(snapshot({ active: true })).sawActive).toBe(true);
  });

  it("job activo: sigue, y marca que se vio (misma referencia si ya estaba marcado)", () => {
    const watch = startWatch(snapshot());
    const step = advanceWatch(watch, snapshot({ active: true }));
    expect(step.settled).toBeNull();
    expect(step.watch?.sawActive).toBe(true);

    const again = advanceWatch(
      step.watch as typeof watch,
      snapshot({ active: true }),
    );
    expect(again.watch).toBe(step.watch);
  });

  it("pasa de activo a ninguno: termina bien", () => {
    const seen = advanceWatch(
      startWatch(snapshot()),
      snapshot({ active: true }),
    );
    const done = advanceWatch(
      seen.watch as ReturnType<typeof startWatch>,
      snapshot({ games: 11, lastSyncedAt: 2_000 }),
    );
    expect(done).toEqual({ settled: "ok", watch: null });
  });

  it("sin job visible y sin cambios: sigue esperando (el job aún no ha empezado)", () => {
    const watch = startWatch(snapshot());
    expect(advanceWatch(watch, snapshot())).toEqual({ settled: null, watch });
  });

  it("si el job empezó y acabó entre dos refrescos, lo detecta por lastSyncedAt", () => {
    const watch = startWatch(snapshot());
    const step = advanceWatch(watch, snapshot({ lastSyncedAt: 5_000 }));
    expect(step.settled).toBe("ok");
  });

  it("un error de job nuevo termina en error (sin toast de resultado)", () => {
    const seen = advanceWatch(
      startWatch(snapshot()),
      snapshot({ active: true }),
    );
    const step = advanceWatch(
      seen.watch as ReturnType<typeof startWatch>,
      snapshot({ errorAt: 3_000 }),
    );
    expect(step).toEqual({ settled: "error", watch: null });
  });

  it("un error anterior que ya estaba antes de pulsar no cuenta como fallo nuevo", () => {
    const before = snapshot({ errorAt: 500 });
    const seen = advanceWatch(startWatch(before), snapshot({ active: true }));
    const step = advanceWatch(
      seen.watch as ReturnType<typeof startWatch>,
      snapshot({ errorAt: 500, lastSyncedAt: 2_000 }),
    );
    expect(step.settled).toBe("ok");
  });

  it("un done posterior a un error previo (errorAt pasa a null) es éxito, no fallo", () => {
    const before = snapshot({ errorAt: 500 });
    const seen = advanceWatch(startWatch(before), snapshot({ active: true }));
    const step = advanceWatch(
      seen.watch as ReturnType<typeof startWatch>,
      snapshot({ errorAt: null, lastSyncedAt: 2_000 }),
    );
    expect(step.settled).toBe("ok");
  });
});
