import { describe, expect, it } from "vitest";
import {
  type FloatingEntry,
  floatingLayout,
  foldedLabel,
} from "./floating-stack";

const sync = (id: string, priority = 1): FloatingEntry => ({
  id,
  priority,
  group: "sync",
});
const DIOS: FloatingEntry = { id: "dios", priority: 10, group: "dios" };
const ARENA: FloatingEntry = { id: "arena", priority: 20, group: "arena" };

describe("floatingLayout", () => {
  it("sin avisos, nada a la vista ni plegado", () => {
    expect(floatingLayout({ entries: [], closed: [], mobile: false })).toEqual({
      visible: [],
      folded: [],
      closed: [],
    });
  });

  it("ordena por prioridad, no por orden de registro", () => {
    const layout = floatingLayout({
      entries: [ARENA, DIOS, sync("paused")],
      closed: [],
      mobile: false,
    });
    expect(layout.visible).toEqual(["paused", "dios"]);
    expect(layout.folded).toEqual(["arena"]);
  });

  it("en escritorio, dos a la vista; en móvil, uno y el resto plegado", () => {
    const entries = [sync("paused"), ARENA];
    expect(floatingLayout({ entries, closed: [], mobile: false })).toEqual({
      visible: ["paused", "arena"],
      folded: [],
      closed: [],
    });
    expect(floatingLayout({ entries, closed: [], mobile: true })).toEqual({
      visible: ["paused"],
      folded: ["arena"],
      closed: [],
    });
  });

  it("uno por familia a la vista: el segundo de sincronización se pliega aunque quepa", () => {
    const layout = floatingLayout({
      entries: [sync("rate_limit", 2), sync("error", 0), ARENA],
      closed: [],
      mobile: false,
    });
    expect(layout.visible).toEqual(["error", "arena"]);
    expect(layout.folded).toEqual(["rate_limit"]);
  });

  it("los cerrados no van a la vista ni al plegado: dejan sitio al siguiente y se cuentan", () => {
    const layout = floatingLayout({
      entries: [sync("paused"), DIOS, ARENA],
      closed: ["paused"],
      mobile: false,
    });
    expect(layout.visible).toEqual(["dios", "arena"]);
    expect(layout.folded).toEqual([]);
    expect(layout.closed).toEqual(["paused"]);
  });

  it("al cerrar el de la familia, sale el siguiente de la misma familia", () => {
    const layout = floatingLayout({
      entries: [sync("error", 0), sync("rate_limit", 2)],
      closed: ["error"],
      mobile: false,
    });
    expect(layout.visible).toEqual(["rate_limit"]);
    expect(layout.closed).toEqual(["error"]);
  });

  it("un cerrado que ya no está registrado no cuenta", () => {
    const layout = floatingLayout({
      entries: [DIOS],
      closed: ["paused", "arena"],
      mobile: false,
    });
    expect(layout.visible).toEqual(["dios"]);
    expect(layout.closed).toEqual([]);
  });

  it("a igual prioridad, el orden de registro", () => {
    const a = { id: "a", priority: 5, group: "a" };
    const b = { id: "b", priority: 5, group: "b" };
    expect(
      floatingLayout({ entries: [b, a], closed: [], mobile: true }).visible,
    ).toEqual(["b"]);
  });
});

describe("foldedLabel", () => {
  it("singular y plural", () => {
    expect(foldedLabel(1)).toBe("+1 aviso");
    expect(foldedLabel(3)).toBe("+3 avisos");
  });
});
