import { describe, expect, it } from "vitest";
import {
  activeLabel,
  freshnessNotice,
  type OldestSyncRef,
  refreshMessage,
} from "./freshness-model";

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const oldest = (lastSyncedAt: number | null): OldestSyncRef => ({
  gameName: "Azpekaa",
  tagLine: "EUW",
  lastSyncedAt,
});

describe("freshnessNotice", () => {
  it("dice cuándo se sincronizó el miembro menos reciente y cuál es", () => {
    expect(freshnessNotice(oldest(NOW - 7 * 60_000), NOW)).toBe(
      "Sincronización más antigua: hace 7 min (Azpekaa#EUW)",
    );
  });

  it("un miembro que nunca se sincronizó", () => {
    expect(freshnessNotice(oldest(null), NOW)).toBe(
      "Sin sincronizar todavía: Azpekaa#EUW",
    );
  });

  it("sin miembros no hay aviso", () => {
    expect(freshnessNotice(null, NOW)).toBe("");
  });
});

describe("activeLabel", () => {
  it("cuenta los miembros en curso; sin ninguno no hay etiqueta", () => {
    expect(activeLabel(2, 6)).toBe("Actualizando 2 de 6");
    expect(activeLabel(0, 6)).toBeNull();
  });
});

describe("refreshMessage", () => {
  const base = { members: 6, queued: 0, active: 0, cooldown: 0, fresh: 0 };

  it("encolados, con y sin los que ya estaban en curso", () => {
    expect(refreshMessage({ ...base, queued: 6 })).toBe(
      "Actualizando 6 miembros",
    );
    expect(refreshMessage({ ...base, queued: 1, active: 2, cooldown: 3 })).toBe(
      "Actualizando 1 miembro (2 ya en curso)",
    );
  });

  it("nada que encolar: ya en curso, o en cooldown", () => {
    expect(refreshMessage({ ...base, active: 6 })).toBe(
      "Ya se está actualizando",
    );
    expect(refreshMessage({ ...base, cooldown: 6 })).toBe("Espera un momento");
  });

  it("grupo vacío", () => {
    expect(refreshMessage({ ...base, members: 0 })).toBe(
      "El grupo no tiene miembros",
    );
  });
});
