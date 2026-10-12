import { describe, expect, it } from "vitest";
import {
  type FloatingEntry,
  floatingLayout,
} from "@/components/hy/floating-stack";
import { arenaGodState } from "@/domain/arena-god";
import type { SyncProgress } from "./data";
import {
  ARENA_QUIET_PRIORITY,
  arenaQuietSignature,
  closedNoticeKey,
  GOD_PRIORITY,
  godNoticeSignature,
  godTrace,
  SYNC_PRIORITY,
  type SyncNoticeInput,
  type SyncNoticeModel,
  syncNoticeId,
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

/** Entradas de la pila (`FloatingItem`) para unos avisos de sincronización, como la vitrina. */
const syncEntries = (notices: readonly SyncNoticeModel[]): FloatingEntry[] =>
  notices.map((notice) => ({
    id: syncNoticeId(notice.kind),
    priority: SYNC_PRIORITY[notice.kind],
    group: "sync",
  }));
const GOD: FloatingEntry = {
  id: "dios",
  priority: GOD_PRIORITY,
  group: "dios",
};
const ARENA: FloatingEntry = {
  id: "arena",
  priority: ARENA_QUIET_PRIORITY,
  group: "arena",
};

describe("prioridad en la pila", () => {
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
  const first = (notices: SyncNoticeModel[]) =>
    floatingLayout({ entries: syncEntries(notices), closed: [], mobile: true })
      .visible[0];

  it("de sincronización, el de mayor prioridad: error, pausa, límite, progreso", () => {
    expect(first([queued, limit, paused, error])).toBe("sync:error");
    expect(first([queued, limit, paused])).toBe("sync:paused");
    expect(first([queued, limit])).toBe("sync:rate_limit");
    expect(first([queued])).toBe("sync:queued");
  });

  it("sincronización > Dios de Arena > Arena fuera de rotación", () => {
    const entries = [ARENA, GOD, ...syncEntries([paused])];
    expect(floatingLayout({ entries, closed: [], mobile: false })).toEqual({
      visible: ["sync:paused", "dios"],
      folded: ["arena"],
      closed: [],
    });
  });
});

describe("cerrar a lo largo del tiempo", () => {
  /**
   * Aplica una secuencia de estados como la pila: cerrar vale para el `id` a la vista, y el cierre
   * se olvida en cuanto el aviso deja de estar registrado.
   */
  function run(
    steps: { input: SyncNoticeInput; close?: boolean }[],
  ): { notice: string | null; closed: string | null }[] {
    let closed: string[] = [];
    return steps.map((step) => {
      const entries = syncEntries(syncNotices(step.input));
      closed = closed.filter((id) => entries.some((e) => e.id === id));
      let layout = floatingLayout({ entries, closed, mobile: false });
      const shown = layout.visible[0];
      if (step.close && shown) {
        closed = [...closed, shown];
        layout = floatingLayout({ entries, closed, mobile: false });
      }
      return {
        notice: layout.visible[0] ?? null,
        closed: layout.closed[0] ?? null,
      };
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
      { notice: null, closed: "sync:paused" },
      { notice: null, closed: "sync:paused" },
      { notice: null, closed: null },
      { notice: "sync:paused", closed: null },
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
        { input: input({ sync: fetching("backfill", {}, 60) }) },
        { input: listing },
      ]),
    ).toEqual([
      { notice: null, closed: "sync:fetching" },
      { notice: null, closed: "sync:fetching" },
      { notice: "sync:listing", closed: null },
    ]);
  });

  it("de progreso a pausa: la pausa sale aunque el progreso estuviera cerrado", () => {
    expect(
      run([
        { input: input({ sync: fetching("backfill") }), close: true },
        { input: input({ sync: fetching("backfill"), paused: true }) },
      ]),
    ).toEqual([
      { notice: null, closed: "sync:fetching" },
      { notice: "sync:paused", closed: null },
    ]);
  });
});

const god = (
  verifiedIds: number[],
  official: number | null,
  manualIds: number[] = [],
) => arenaGodState({ verifiedIds, manualIds, official, goal: 60 });
const ids = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => from + i);

describe("firmas de cierre", () => {
  it("Dios de Arena: mismo estado, misma firma; cualquier cifra que cambie, otra", () => {
    const base = godNoticeSignature(god(ids(75), 79));
    expect(godNoticeSignature(god(ids(75), 79))).toBe(base);
    expect(godNoticeSignature(god(ids(76), 79))).not.toBe(base);
    expect(godNoticeSignature(god(ids(75), 80))).not.toBe(base);
    expect(godNoticeSignature(god(ids(75), 79, [200]))).not.toBe(base);
  });

  it("Dios de Arena: el caso entra en la firma (sin oficial no se confunde con un 0)", () => {
    expect(godNoticeSignature(god(ids(3), null))).toBe("dios:unknown:3:0:-");
    expect(godNoticeSignature(god(ids(3), 5))).toBe("dios:missing:3:0:5");
  });

  it("Arena fuera de rotación: cambia con la última partida de Arena", () => {
    expect(arenaQuietSignature(1000)).toBe("arena:1000");
    expect(arenaQuietSignature(2000)).not.toBe(arenaQuietSignature(1000));
  });

  it("la clave va por perfil y por aviso", () => {
    expect(closedNoticeKey("hylimichi#euw", "arena")).toBe(
      "hylistats:aviso-cerrado:arena:hylimichi#euw",
    );
    expect(closedNoticeKey("hylimichi#euw", "dios")).not.toBe(
      closedNoticeKey("elruffles#6485", "dios"),
    );
  });
});

describe("godTrace", () => {
  it("cuando cuadra no hay rastro (va el ✓ oficial N)", () => {
    expect(godTrace(god(ids(5), 5), false)).toBeNull();
    expect(godTrace(god(ids(5), 5), true)).toBeNull();
  });

  it("un texto corto por caso", () => {
    expect(godTrace(god(ids(75), 79), false)).toEqual({
      text: "no cuadra con el oficial (79)",
      alert: true,
    });
    expect(godTrace(god(ids(5), null), false)).toEqual({
      text: "sin contador oficial",
      alert: true,
    });
    expect(godTrace(god(ids(10), 8), false)?.text).toBe(
      "no cuadra con el oficial (8)",
    );
    expect(godTrace(god(ids(5), 6, [100, 101]), false)?.text).toBe(
      "revisa las marcas manuales",
    );
  });

  it("con una sincronización en marcha, sincronizando…", () => {
    expect(godTrace(god(ids(75), 79), true)).toEqual({
      text: "sincronizando…",
      alert: false,
    });
  });
});
