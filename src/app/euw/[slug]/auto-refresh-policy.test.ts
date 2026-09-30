import { describe, expect, it } from "vitest";
import {
  type AutoRefreshEvent,
  autoRefreshIntervals,
  autoRefreshOnEvent,
  CHECK_EVERY_MS,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
} from "./auto-refresh-policy";

describe("autoRefreshOnEvent", () => {
  it("montaje con la pestaña visible: comprueba, sin releer (la página acaba de renderizarse)", () => {
    expect(autoRefreshOnEvent("mount", true)).toEqual({
      check: true,
      refresh: false,
    });
  });

  it("volver a la pestaña: comprueba y relee al momento", () => {
    expect(autoRefreshOnEvent("visible", true)).toEqual({
      check: true,
      refresh: true,
    });
  });

  it("el latido comprueba; el polling relee", () => {
    expect(autoRefreshOnEvent("checkTick", true)).toEqual({
      check: true,
      refresh: false,
    });
    expect(autoRefreshOnEvent("pollTick", true)).toEqual({
      check: false,
      refresh: true,
    });
  });

  it("con la pestaña oculta ningún evento pide trabajo (ni al montar)", () => {
    const events: AutoRefreshEvent[] = [
      "mount",
      "visible",
      "checkTick",
      "pollTick",
    ];
    for (const event of events) {
      expect(autoRefreshOnEvent(event, false)).toEqual({
        check: false,
        refresh: false,
      });
    }
  });
});

describe("autoRefreshIntervals", () => {
  it("visible sin job: polling cada 30 s y latido cada 60 s", () => {
    expect(autoRefreshIntervals({ visible: true, active: false })).toEqual({
      pollMs: POLL_IDLE_MS,
      checkMs: CHECK_EVERY_MS,
    });
    expect(POLL_IDLE_MS).toBe(30_000);
    expect(CHECK_EVERY_MS).toBe(60_000);
  });

  it("visible con job activo: polling cada 3 s; el latido no cambia", () => {
    expect(autoRefreshIntervals({ visible: true, active: true })).toEqual({
      pollMs: POLL_ACTIVE_MS,
      checkMs: CHECK_EVERY_MS,
    });
    expect(POLL_ACTIVE_MS).toBe(3_000);
  });

  it("oculta: sin intervalos, haya o no job activo", () => {
    for (const active of [true, false]) {
      expect(autoRefreshIntervals({ visible: false, active })).toEqual({
        pollMs: null,
        checkMs: null,
      });
    }
  });
});
