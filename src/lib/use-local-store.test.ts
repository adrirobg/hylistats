import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { profileData } from "./local-store";
import { localActions, useLocalReady, useLocalStore } from "./use-local-store";

// Sin jsdom no se puede montar el hook en un navegador; sí se puede renderizar en el servidor
// (`renderToString`, el mismo camino que el SSR de Next), que es donde el hook no debe romper.

describe("useLocalStore en el servidor (SSR)", () => {
  it("renderiza con el estado vacío, sin `window` ni `localStorage`", () => {
    expect(typeof window).toBe("undefined");
    function Probe() {
      const me = useLocalStore((s) => s.myProfile);
      const favorites = useLocalStore((s) => s.favorites.length);
      const recents = useLocalStore((s) => s.recents.length);
      const { targets } = useLocalStore((s) => profileData(s, "faker#kr1"));
      return createElement(
        "p",
        null,
        `${me === null}|${favorites}|${recents}|${targets.length}`,
      );
    }
    expect(renderToString(createElement(Probe))).toBe("<p>true|0|0|0</p>");
  });

  it("acepta selectores que crean un objeto o un array nuevos en cada llamada", () => {
    function Probe() {
      const derived = useLocalStore((s) => ({
        names: s.favorites.map((f) => f.gameName),
      }));
      const list = useLocalStore((s) => [...s.recents]);
      return createElement("p", null, `${derived.names.length}|${list.length}`);
    }
    expect(renderToString(createElement(Probe))).toBe("<p>0|0</p>");
  });

  it("`useLocalReady` es false en el servidor y en la hidratación", () => {
    function Probe() {
      return createElement("p", null, String(useLocalReady()));
    }
    expect(renderToString(createElement(Probe))).toBe("<p>false</p>");
  });

  it("las acciones lanzan en el servidor: no hay almacén compartido entre peticiones", () => {
    expect(() => localActions.clearMyProfile()).toThrow(/navegador/);
    expect(() => localActions.exportText()).toThrow(/navegador/);
  });
});
