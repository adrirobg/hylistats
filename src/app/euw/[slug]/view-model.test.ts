import { describe, expect, it } from "vitest";
import type { SyncProgress } from "./data";
import {
  dataAgePhrase,
  emptyState,
  initials,
  parseProfileTab,
  SECONDS_PER_MATCH,
  syncBandModel,
  syncEtaMinutes,
  whenPhrase,
} from "./view-model";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);

describe("initials", () => {
  it("dos palabras: la inicial de cada una", () => {
    expect(initials("BEJITO MAMBO")).toBe("BM");
    expect(initials("  poro   veloz  ")).toBe("PV");
  });

  it("una palabra: sus dos primeras letras", () => {
    expect(initials("Faker")).toBe("FA");
    expect(initials("Z")).toBe("Z");
  });

  it("más de dos palabras: solo las dos primeras; y respeta caracteres no ASCII", () => {
    expect(initials("Uno Dos Tres")).toBe("UD");
    expect(initials("ñandú")).toBe("ÑA");
    expect(initials("𝐀𝐛 Cd")).toBe("𝐀C");
  });

  it("sin nombre: un comodín", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("parseProfileTab", () => {
  it("por defecto y ante cualquier valor desconocido: campeones", () => {
    expect(parseProfileTab(undefined)).toBe("campeones");
    expect(parseProfileTab("")).toBe("campeones");
    expect(parseProfileTab("resumen")).toBe("campeones");
    expect(parseProfileTab(["companeros", "x"])).toBe("campeones");
  });

  it("acepta campeones, también repetido", () => {
    expect(parseProfileTab("campeones")).toBe("campeones");
    expect(parseProfileTab(["campeones", "resumen"])).toBe("campeones");
  });
});

describe("whenPhrase", () => {
  it("relativos tal cual", () => {
    expect(whenPhrase(NOW - 25 * MINUTE, NOW)).toBe("hace 25 min");
    expect(whenPhrase(NOW - 30 * 1000, NOW)).toBe("ahora");
    expect(whenPhrase(NOW - 30 * HOUR, NOW)).toBe("ayer");
  });

  it("una fecha lleva artículo", () => {
    expect(whenPhrase(NOW - 60 * DAY, NOW)).toMatch(/^el \d/);
  });
});

describe("dataAgePhrase", () => {
  it("frases para el aviso «Datos de hace X»", () => {
    expect(dataAgePhrase(NOW - 3 * HOUR, NOW)).toBe("Datos de hace 3 h.");
    expect(dataAgePhrase(NOW - 30 * HOUR, NOW)).toBe("Datos de ayer.");
    expect(dataAgePhrase(NOW - 10 * 1000, NOW)).toBe("Datos de ahora mismo.");
    expect(dataAgePhrase(NOW - 60 * DAY, NOW)).toMatch(/^Datos del \d/);
  });

  it("sin sincronizar nunca", () => {
    expect(dataAgePhrase(null, NOW)).toBe("Aún no hay datos sincronizados.");
  });
});

describe("syncEtaMinutes", () => {
  it("1,2 s por partida (100 peticiones cada 2 min), redondeado hacia arriba", () => {
    expect(SECONDS_PER_MATCH).toBeCloseTo(1.2);
    // Maqueta: 504 - 212 = 292 partidas -> 350 s -> ~6 min.
    expect(syncEtaMinutes(292)).toBe(6);
    expect(syncEtaMinutes(100)).toBe(2);
    expect(syncEtaMinutes(50)).toBe(1);
  });

  it("nunca baja de 1 minuto ni sale negativo", () => {
    expect(syncEtaMinutes(0)).toBe(1);
    expect(syncEtaMinutes(1)).toBe(1);
    expect(syncEtaMinutes(-5)).toBe(1);
  });
});

describe("syncBandModel", () => {
  type Phase =
    | { phase: "resolving" }
    | { phase: "listing"; listedIds: number }
    | { phase: "fetching"; fetched: number; total: number };
  const backfill = (rest: Phase): SyncProgress => ({
    kind: "backfill",
    ...rest,
  });

  it("sin job y sin pausa: no hay banda", () => {
    expect(syncBandModel(null, false)).toBeNull();
  });

  it("backfill: resolviendo, listando y descargando con f / t y ETA", () => {
    expect(syncBandModel(backfill({ phase: "resolving" }), false)).toEqual({
      kind: "resolving",
    });
    expect(
      syncBandModel(backfill({ phase: "listing", listedIds: 200 }), false),
    ).toEqual({ kind: "listing", listedIds: 200 });
    expect(
      syncBandModel(
        backfill({ phase: "fetching", fetched: 212, total: 504 }),
        false,
      ),
    ).toEqual({ kind: "fetching", fetched: 212, total: 504, etaMinutes: 6 });
  });

  it("el incremental no tiene banda (su progreso va en el botón)", () => {
    const incremental: SyncProgress = {
      kind: "incremental",
      phase: "fetching",
      fetched: 1,
      total: 4,
    };
    expect(syncBandModel(incremental, false)).toBeNull();
  });

  it("key caducada: banda de pausa, con el progreso si hay un backfill descargando", () => {
    expect(syncBandModel(null, true)).toEqual({
      kind: "paused",
      progress: null,
    });
    expect(
      syncBandModel(
        backfill({ phase: "fetching", fetched: 307, total: 504 }),
        true,
      ),
    ).toEqual({ kind: "paused", progress: { fetched: 307, total: 504 } });
    expect(syncBandModel(backfill({ phase: "resolving" }), true)).toEqual({
      kind: "paused",
      progress: null,
    });
  });

  it("la pausa manda también sobre un incremental", () => {
    const incremental: SyncProgress = {
      kind: "incremental",
      phase: "resolving",
    };
    expect(syncBandModel(incremental, true)).toEqual({
      kind: "paused",
      progress: null,
    });
  });
});

describe("emptyState", () => {
  it("con partidas no hay estado vacío", () => {
    expect(
      emptyState({ games: 3, syncing: true, lastSyncedAt: null }),
    ).toBeNull();
  });

  it("sin partidas: sincronizando, nunca sincronizado o temporada vacía", () => {
    expect(emptyState({ games: 0, syncing: true, lastSyncedAt: null })).toBe(
      "syncing",
    );
    expect(emptyState({ games: 0, syncing: false, lastSyncedAt: null })).toBe(
      "never",
    );
    expect(emptyState({ games: 0, syncing: false, lastSyncedAt: 1 })).toBe(
      "empty",
    );
  });
});
