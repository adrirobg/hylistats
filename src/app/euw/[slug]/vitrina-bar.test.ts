import { describe, expect, it } from "vitest";
import { barCompact, barRootMargin } from "./vitrina-bar";

describe("barRootMargin", () => {
  it("recorta por arriba la altura de la barra, redondeada hacia arriba", () => {
    expect(barRootMargin(56)).toBe("-56px 0px 0px 0px");
    expect(barRootMargin(55.2)).toBe("-56px 0px 0px 0px");
  });

  it("sin barra medida: sin recorte", () => {
    expect(barRootMargin(0)).toBe("0px 0px 0px 0px");
    expect(barRootMargin(-4)).toBe("0px 0px 0px 0px");
  });
});

describe("barCompact", () => {
  it("identidad entera a la vista: transparente", () => {
    expect(barCompact({ ratio: 1, top: 120, rootTop: 56 })).toBe(false);
  });

  it("identidad empezando a pasar bajo la barra: compacta", () => {
    expect(barCompact({ ratio: 0.8, top: 40, rootTop: 56 })).toBe(true);
  });

  it("identidad ya fuera por arriba: compacta", () => {
    expect(barCompact({ ratio: 0, top: -40, rootTop: 56 })).toBe(true);
  });

  it("cortada o fuera por abajo: transparente", () => {
    expect(barCompact({ ratio: 0.5, top: 780, rootTop: 56 })).toBe(false);
    expect(barCompact({ ratio: 0, top: 900, rootTop: 56 })).toBe(false);
  });

  it("sin rootBounds: el borde superior de la ventana", () => {
    expect(barCompact({ ratio: 0, top: -1, rootTop: null })).toBe(true);
    expect(barCompact({ ratio: 0.5, top: 5, rootTop: null })).toBe(false);
  });
});
