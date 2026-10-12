import { describe, expect, it } from "vitest";
import type { SyncProgress } from "./data";
import {
  floatingNotices,
  pickNotice,
  type SyncNoticeInput,
  type SyncNoticeKind,
  type SyncNoticeModel,
  syncNotices,
} from "./floating-notices";

const NOW = Date.UTC(2026, 9, 12, 12);
const MINUTE = 60_000;

const fetching = (
  kind: SyncProgress["kind"],
  wait: Partial<Pick<SyncProgress, "retryAt" | "reason" | "queue">> = {},
  fetched = 40,
): SyncProgress => ({
  kind,
  retryAt: null,
  reason: null,
  queue: null,
  phase: "fetching",
  fetched,
  total: 100,
  ...wait,
});
const rateLimited = {
  retryAt: new Date(NOW + 3 * MINUTE),
  reason: "rate_limit",
} as const;

const input = (rest: Partial<SyncNoticeInput> = {}): SyncNoticeInput => ({
  sync: null,
  paused: false,
  errorAt: null,
  now: NOW,
  ...rest,
});
const NONE: readonly SyncNoticeKind[] = [];

describe("syncNotices", () => {
  it("sin nada que contar, ningún aviso", () => {
    expect(syncNotices(input())).toEqual([]);
    // Un incremental normal va en el botón Actualizar.
    expect(syncNotices(input({ sync: fetching("incremental") }))).toEqual([]);
  });

  it("el error, solo sin job en marcha y sin la key caducada", () => {
    expect(syncNotices(input({ errorAt: NOW - MINUTE }))).toEqual([
      { kind: "error" },
    ]);
    expect(
      syncNotices(
        input({ errorAt: NOW - MINUTE, sync: fetching("incremental") }),
      ),
    ).toEqual([]);
    expect(syncNotices(input({ errorAt: NOW - MINUTE, paused: true }))).toEqual(
      [{ kind: "paused", progress: null }],
    );
  });

  it("el límite de peticiones dice de qué job es", () => {
    expect(
      syncNotices(input({ sync: fetching("backfill", rateLimited) })),
    ).toEqual([
      {
        kind: "rate_limit",
        minutes: 3,
        progress: { fetched: 40, total: 100 },
        job: "backfill",
      },
    ]);
    expect(
      syncNotices(input({ sync: fetching("incremental", rateLimited) })),
    ).toEqual([
      { kind: "rate_limit", minutes: 3, progress: null, job: "incremental" },
    ]);
  });

  it("el progreso del backfill, con su barra", () => {
    expect(syncNotices(input({ sync: fetching("backfill") }))).toEqual([
      { kind: "fetching", fetched: 40, total: 100, etaMinutes: 2, sharing: 0 },
    ]);
  });
});

describe("pickNotice", () => {
  const error: SyncNoticeModel = { kind: "error" };
  const paused: SyncNoticeModel = { kind: "paused", progress: null };
  const limit: SyncNoticeModel = {
    kind: "rate_limit",
    minutes: 2,
    progress: null,
    job: "incremental",
  };
  const queued: SyncNoticeModel = {
    kind: "queued",
    position: 2,
    startMinutes: 1,
  };

  it("con varios activos enseña el de mayor prioridad: error, pausa, límite, progreso", () => {
    expect(pickNotice([queued, limit, paused, error], NONE)).toMatchObject({
      notice: error,
      closed: null,
    });
    expect(pickNotice([queued, limit, paused], NONE).notice).toBe(paused);
    expect(pickNotice([queued, limit], NONE).notice).toBe(limit);
    expect(pickNotice([queued], NONE).notice).toBe(queued);
  });

  it("cerrar el primero deja ver el siguiente y lo marca como cerrado activo", () => {
    expect(pickNotice([limit, error], ["error"])).toEqual({
      notice: limit,
      closed: "error",
      dismissed: ["error"],
    });
    expect(pickNotice([limit, error], ["error", "rate_limit"])).toMatchObject({
      notice: null,
      closed: "error",
    });
  });

  it("sin nada activo no hay aviso ni cerrados (y los cerrados se olvidan)", () => {
    expect(pickNotice([], NONE)).toEqual({
      notice: null,
      closed: null,
      dismissed: NONE,
    });
    expect(pickNotice([], ["paused"])).toEqual({
      notice: null,
      closed: null,
      dismissed: [],
    });
  });

  it("si no cambia nada devuelve el mismo array de cerrados", () => {
    const dismissed: readonly SyncNoticeKind[] = ["paused"];
    expect(pickNotice([paused], dismissed).dismissed).toBe(dismissed);
  });
});

describe("floatingNotices: cerrar a lo largo del tiempo", () => {
  /** Aplica una secuencia de estados guardando los cerrados como haría la vitrina. */
  function run(
    steps: { input: SyncNoticeInput; close?: boolean }[],
  ): { notice: SyncNoticeKind | null; closed: SyncNoticeKind | null }[] {
    let dismissed: readonly SyncNoticeKind[] = [];
    return steps.map((step) => {
      let result = floatingNotices(step.input, dismissed);
      dismissed = result.dismissed;
      if (step.close && result.notice) {
        dismissed = [...dismissed, result.notice.kind];
        result = floatingNotices(step.input, dismissed);
      }
      return { notice: result.notice?.kind ?? null, closed: result.closed };
    });
  }

  it("cerrado no vuelve mientras siga el mismo kind y vuelve cuando cambia", () => {
    const paused = input({ paused: true });
    expect(
      run([
        { input: paused, close: true },
        { input: paused },
        { input: input() },
        { input: paused },
      ]),
    ).toEqual([
      { notice: null, closed: "paused" },
      { notice: null, closed: "paused" },
      { notice: null, closed: null },
      { notice: "paused", closed: null },
    ]);
  });

  it("el progreso cerrado no vuelve aunque avance, pero sí al cambiar de fase", () => {
    const listing = input({
      sync: {
        kind: "backfill",
        retryAt: null,
        reason: null,
        queue: null,
        phase: "listing",
        listedIds: 120,
      },
    });
    expect(
      run([
        { input: input({ sync: fetching("backfill") }), close: true },
        {
          input: input({
            sync: fetching("backfill", {}, 60),
          }),
        },
        { input: listing },
      ]),
    ).toEqual([
      { notice: null, closed: "fetching" },
      { notice: null, closed: "fetching" },
      { notice: "listing", closed: null },
    ]);
  });

  it("de progreso a pausa: la pausa sale aunque el progreso estuviera cerrado", () => {
    expect(
      run([
        { input: input({ sync: fetching("backfill") }), close: true },
        { input: input({ sync: fetching("backfill"), paused: true }) },
      ]),
    ).toEqual([
      { notice: null, closed: "fetching" },
      { notice: "paused", closed: null },
    ]);
  });
});
