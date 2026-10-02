import { describe, expect, it } from "vitest";
import type { StatusPayload } from "@/lib/status-payload";
import {
  currentStatus,
  isSyncing,
  nextPollDelay,
  type PageVersions,
  POLL_IDLE_MS,
  POLL_SYNCING_MS,
  sameVersions,
  shouldRefresh,
  versionsOf,
} from "./status-policy";

function status(overrides: Partial<StatusPayload> = {}): StatusPayload {
  return {
    now: 1_000,
    kind: "profile",
    version: "boot.1",
    groupVersion: null,
    profile: {
      lastSyncedAt: 500,
      sync: null,
      lastJobErrorAt: null,
      paused: false,
    },
    group: null,
    ...overrides,
  };
}

const FETCHING = {
  kind: "incremental",
  phase: "fetching",
  fetched: 1,
  total: 3,
  retryAt: null,
  reason: null,
  queue: null,
} as const;

describe("nextPollDelay", () => {
  it("cada 10 s sin sincronización y cada 5 s con ella", () => {
    expect(POLL_IDLE_MS).toBe(10_000);
    expect(POLL_SYNCING_MS).toBe(5_000);
    const base = { visible: true, lastPollAt: 0, now: 0 };
    expect(nextPollDelay({ ...base, syncing: false })).toBe(10_000);
    expect(nextPollDelay({ ...base, syncing: true })).toBe(5_000);
  });

  it("cuenta desde la última consulta; si ya tocaba, ya", () => {
    expect(
      nextPollDelay({
        visible: true,
        syncing: false,
        lastPollAt: 1_000,
        now: 4_000,
      }),
    ).toBe(7_000);
    // Empieza una sincronización 7 s después de consultar: la de 5 s ya vencía.
    expect(
      nextPollDelay({
        visible: true,
        syncing: true,
        lastPollAt: 1_000,
        now: 8_000,
      }),
    ).toBe(0);
  });

  it("sin consulta previa (al montar o al volver a la pestaña): ya", () => {
    for (const syncing of [true, false]) {
      expect(
        nextPollDelay({ visible: true, syncing, lastPollAt: null, now: 9 }),
      ).toBe(0);
    }
  });

  it("con la pestaña oculta no se consulta, haya o no sincronización", () => {
    for (const syncing of [true, false]) {
      for (const lastPollAt of [null, 0]) {
        expect(
          nextPollDelay({ visible: false, syncing, lastPollAt, now: 60_000 }),
        ).toBeNull();
      }
    }
  });
});

describe("isSyncing", () => {
  it("el perfil con un job en curso", () => {
    expect(isSyncing(status())).toBe(false);
    expect(
      isSyncing(
        status({
          profile: {
            lastSyncedAt: 500,
            sync: FETCHING,
            lastJobErrorAt: null,
            paused: false,
          },
        }),
      ),
    ).toBe(true);
  });

  it("en la vista del grupo, cualquier miembro con un job en curso", () => {
    const group = { members: 6, active: 0, oldest: null };
    expect(isSyncing(status({ group }))).toBe(false);
    expect(isSyncing(status({ group: { ...group, active: 2 } }))).toBe(true);
  });

  it("perfil sin registrar: nada", () => {
    expect(
      isSyncing(status({ kind: "unregistered", version: null, profile: null })),
    ).toBe(false);
  });
});

describe("shouldRefresh", () => {
  const rendered: PageVersions = {
    kind: "profile",
    version: "boot.1",
    groupVersion: "boot.4",
  };

  it("misma versión: no repinta (aunque cambie el progreso o la hora)", () => {
    expect(
      shouldRefresh({ rendered, status: { ...rendered }, refreshing: false }),
    ).toBe(false);
  });

  it("repinta si cambia la versión del perfil, la del grupo o el tipo de página", () => {
    const changes: PageVersions[] = [
      { ...rendered, version: "boot.2" },
      { ...rendered, groupVersion: "boot.5" },
      { ...rendered, groupVersion: null },
      { ...rendered, kind: "not_found" },
      // Reinicio del servidor: otro id de arranque con los contadores a 0.
      { ...rendered, version: "otro.0", groupVersion: "otro.0" },
    ];
    for (const status of changes) {
      expect(shouldRefresh({ rendered, status, refreshing: false })).toBe(true);
    }
  });

  it("con un repintado en curso no pide otro: lo decide la siguiente consulta", () => {
    expect(
      shouldRefresh({
        rendered,
        status: { ...rendered, version: "boot.2" },
        refreshing: true,
      }),
    ).toBe(false);
  });
});

describe("versionsOf / sameVersions", () => {
  it("del estado solo cuentan el tipo y las versiones", () => {
    const a = status({ now: 1, groupVersion: "g.1" });
    const b = status({
      now: 2,
      groupVersion: "g.1",
      profile: {
        lastSyncedAt: 9,
        sync: FETCHING,
        lastJobErrorAt: 3,
        paused: true,
      },
    });
    expect(versionsOf(a)).toEqual({
      kind: "profile",
      version: "boot.1",
      groupVersion: "g.1",
    });
    expect(sameVersions(versionsOf(a), versionsOf(b))).toBe(true);
  });
});

describe("currentStatus", () => {
  it("antes de la primera consulta, el de la página", () => {
    const initial = status();
    expect(currentStatus(initial, null)).toBe(initial);
  });

  it("el más reciente por la hora del servidor", () => {
    const initial = status({ now: 1_000 });
    const polled = status({ now: 2_000 });
    expect(currentStatus(initial, polled)).toBe(polled);
    // Un repintado posterior a la consulta trae un estado más nuevo: manda el suyo.
    const repainted = status({ now: 3_000 });
    expect(currentStatus(repainted, polled)).toBe(repainted);
  });
});
