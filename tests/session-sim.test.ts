import { describe, expect, it } from "vitest";
import {
  buildReport,
  initialOffset,
  nextTab,
  parseOptions,
  percentile,
  readVersion,
  refreshPollers,
  type Sample,
  shouldRepaint,
  statusUrl,
  summarize,
  toSlug,
  UsageError,
} from "../scripts/session-sim-model";

describe("toSlug", () => {
  it("convierte Nombre#TAG en el slug del perfil", () => {
    expect(toSlug("BEJITO MAMBO#1991")).toBe("BEJITO%20MAMBO-1991");
    expect(toSlug("Hylimichi#EUW")).toBe("Hylimichi-EUW");
  });
  it("respeta un slug ya codificado y codifica uno con espacios", () => {
    expect(toSlug("BEJITO%20MAMBO-1991")).toBe("BEJITO%20MAMBO-1991");
    expect(toSlug("BEJITO MAMBO-1991")).toBe("BEJITO%20MAMBO-1991");
  });
});

describe("parseOptions", () => {
  it("aplica los valores por defecto", () => {
    const o = parseOptions({ slugs: "A#B" });
    expect(o).toMatchObject({
      baseUrl: "http://localhost:3000",
      clients: 5,
      durationMs: 15 * 60_000,
      mode: "antes",
      startTab: "grupo",
      switchEveryMs: 30_000,
      rsc: true,
    });
    expect(o.tabs).toHaveLength(6);
  });
  it("lee los argumentos", () => {
    const o = parseOptions({
      "base-url": "http://x:3108/",
      slugs: "A#B,C#D",
      clients: "3",
      duration: "0.5",
      "switch-every": "0",
      "no-rsc": true,
    });
    expect(o.baseUrl).toBe("http://x:3108");
    expect(o.slugs).toEqual(["A-B", "C-D"]);
    expect(o.clients).toBe(3);
    expect(o.durationMs).toBe(30_000);
    expect(o.switchEveryMs).toBe(0);
    expect(o.rsc).toBe(false);
  });
  it("rechaza lo inválido", () => {
    expect(() => parseOptions({})).toThrow(UsageError);
    expect(() => parseOptions({ slugs: "A#B", mode: "x" })).toThrow(UsageError);
    expect(() => parseOptions({ slugs: "A#B", clients: "0" })).toThrow(
      UsageError,
    );
    expect(() => parseOptions({ slugs: "A#B", "start-tab": "nada" })).toThrow(
      UsageError,
    );
  });
});

describe("planificación", () => {
  it("nextTab da la vuelta al ciclo", () => {
    const tabs = ["resumen", "grupo"] as const;
    expect(nextTab(tabs, "resumen")).toBe("grupo");
    expect(nextTab(tabs, "grupo")).toBe("resumen");
    expect(nextTab(tabs, "partidas")).toBe("resumen");
  });
  it("en `antes` la pestaña Grupo tiene dos pollers y el resto uno", () => {
    expect(refreshPollers("antes", "grupo")).toEqual([30_000, 30_000]);
    expect(refreshPollers("antes", "resumen")).toEqual([30_000]);
    expect(refreshPollers("despues", "grupo")).toEqual([]);
  });
  it("initialOffset queda dentro del periodo", () => {
    expect(initialOffset(30_000, () => 0)).toBe(0);
    expect(initialOffset(30_000, () => 0.999999)).toBeLessThan(30_000);
  });
});

describe("modo despues", () => {
  it("readVersion lee campos anidados", () => {
    expect(readVersion({ a: { b: 7 } }, "a.b")).toBe('["7"]');
    expect(readVersion({ a: { b: 7 } }, "a.c")).toBeNull();
    expect(readVersion({ a: "x" }, "a.b")).toBeNull();
    expect(readVersion({ v: { x: 1 } }, "v")).toBe('["{\\"x\\":1}"]');
  });

  it("readVersion combina varios campos: cambia si cambia cualquiera", () => {
    const fields = "kind,version,groupVersion";
    const base = { kind: "profile", version: "a.1", groupVersion: "a.4" };
    expect(readVersion(base, fields)).toBe('["profile","a.1","a.4"]');
    expect(readVersion({ ...base, groupVersion: "a.5" }, fields)).not.toBe(
      readVersion(base, fields),
    );
    expect(readVersion({ ...base, groupVersion: null }, fields)).toBe(
      '["profile","a.1",null]',
    );
  });

  it("statusUrl rellena el slug como valor de query y grupo solo en la pestaña Grupo", () => {
    const path = "/api/estado?perfil={slug}{grupo}";
    expect(statusUrl("http://x", path, "bejito%20mambo-1991", "grupo")).toBe(
      "http://x/api/estado?perfil=bejito%2520mambo-1991&grupo=1",
    );
    expect(statusUrl("http://x", path, "hylimichi-euw", "resumen")).toBe(
      "http://x/api/estado?perfil=hylimichi-euw",
    );
  });

  it("repinta solo si la versión cambia respecto a la línea base", () => {
    expect(shouldRepaint(null, "1")).toBe(false);
    expect(shouldRepaint("1", "1")).toBe(false);
    expect(shouldRepaint("1", "2")).toBe(true);
    expect(shouldRepaint("1", null)).toBe(false);
  });
});

describe("estadística", () => {
  it("percentile por rango más cercano", () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(100);
    expect(percentile([], 50)).toBeNaN();
  });
  it("summarize ordena y calcula", () => {
    expect(summarize([3, 1, 2])).toEqual({ n: 3, p50: 2, p95: 3, max: 3 });
  });
  it("buildReport agrega por tipo, pestaña y estado", () => {
    const s = (over: Partial<Sample>): Sample => ({
      kind: "refresco",
      tab: "grupo",
      status: 200,
      ms: 100,
      bytes: 1024,
      at: 0,
      ...over,
    });
    const report = buildReport(
      [
        s({ kind: "carga", ms: 300 }),
        s({ at: 30_000, ms: 100 }),
        s({ at: 70_000, ms: 200, tab: "resumen" }),
        s({ kind: "estado", tab: "grupo", ms: 5, at: 71_000 }),
        s({ status: 502, at: 80_000, ms: 900 }),
      ],
      120_000,
    );
    expect(report.total).toBe(5);
    expect(report.pageRenders).toBe(4);
    expect(report.rendersPerMinute).toBe(2);
    expect(report.rendersPerMinuteBuckets).toEqual([2, 2]);
    expect(report.failures).toBe(1);
    expect(report.byStatus).toEqual({ "200": 4, "502": 1 });
    expect(report.byKind.estado?.n).toBe(1);
    expect(report.byTab.grupo?.n).toBe(3);
    expect(report.byTab.resumen?.p50).toBe(200);
    expect(report.byKindTab["refresco/grupo"]?.max).toBe(900);
  });
});
