import { describe, expect, it } from "vitest";
import type { AlbumEntry } from "@/domain/album";
import {
  type CardBox,
  isNavKey,
  manualActionFor,
  manualCopy,
  type NavKey,
  navigateTo,
  newlyWon,
  wonIds,
} from "./album-interaction";

const entryOf = (
  championId: number,
  state: AlbumEntry["state"],
): AlbumEntry => ({
  championId,
  ddId: `Champ${championId}`,
  name: `Champ ${championId}`,
  portraitUrl: null,
  state,
  games: state === "none" ? 0 : 1,
  firsts: state === "won" ? 1 : 0,
  top3: 0,
  bestPlacement: null,
  avgPlacement: null,
  lastPlayedAt: null,
  firstWinAt: null,
  firstWinMatchId: null,
});

describe("manualActionFor", () => {
  it("ofrece marcar en jugado y sin jugar, y quitar en manual", () => {
    expect(manualActionFor("played")).toBe("mark");
    expect(manualActionFor("none")).toBe("mark");
    expect(manualActionFor("manual")).toBe("unmark");
  });

  it("no ofrece nada en un verificado: manda sobre la marca manual", () => {
    expect(manualActionFor("won")).toBe("none");
  });
});

describe("manualCopy", () => {
  it("la opción de marcar casa con lo que dice el toast de la barra Arena God", () => {
    const { item, question, confirm } = manualCopy("mark", "Ahri");
    expect(item).toBe("Marcar como ganado a mano…");
    expect(question).toBe(
      "Úsalo si ganaste con Ahri y el historial no lo muestra. Se guarda solo en este navegador.",
    );
    expect(confirm).toBe("Marcar");
  });

  it("quitar la marca también se confirma, con el nombre del campeón", () => {
    const { item, question, confirm } = manualCopy("unmark", "Kai'Sa");
    expect(item).toBe("Quitar marca manual…");
    expect(question).toContain("Kai'Sa");
    expect(question).toContain("solo en este navegador");
    expect(confirm).toBe("Quitar");
  });
});

describe("newlyWon", () => {
  const before = [entryOf(1, "won"), entryOf(2, "played"), entryOf(3, "none")];

  it("no sella nada en el primer render ni al cambiar de perfil (sin «antes»)", () => {
    expect(newlyWon(null, before)).toEqual([]);
  });

  it("devuelve los que pasan a verificados y ya no estaban", () => {
    const next = [entryOf(1, "won"), entryOf(2, "won"), entryOf(3, "none")];
    expect(newlyWon(wonIds(before), next)).toEqual([2]);
  });

  it("varios 1º nuevos en el mismo refresco", () => {
    const next = [entryOf(1, "won"), entryOf(2, "won"), entryOf(3, "won")];
    expect(newlyWon(wonIds(before), next)).toEqual([2, 3]);
  });

  it("no repite los que ya eran verificados ni sella los jugados", () => {
    expect(newlyWon(wonIds(before), before)).toEqual([]);
    const played = [
      entryOf(1, "won"),
      entryOf(2, "played"),
      entryOf(3, "played"),
    ];
    expect(newlyWon(wonIds(before), played)).toEqual([]);
  });

  it("un campeón nuevo en el catálogo que ya llega verificado también se sella", () => {
    const next = [...before, entryOf(4, "won")];
    expect(newlyWon(wonIds(before), next)).toEqual([4]);
  });

  it("con un conjunto vacío (perfil recién sincronizado) sella todos los verificados", () => {
    expect(newlyWon(new Set(), before)).toEqual([1]);
  });
});

describe("wonIds", () => {
  it("solo los del dominio en `won`", () => {
    expect(wonIds([entryOf(1, "won"), entryOf(2, "played")])).toEqual(
      new Set([1]),
    );
  });
});

describe("isNavKey", () => {
  it("reconoce las flechas, Home y End y nada más", () => {
    for (const key of [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ]) {
      expect(isNavKey(key)).toBe(true);
    }
    for (const key of ["o", "Enter", "Tab", "PageDown", "Escape"]) {
      expect(isNavKey(key)).toBe(false);
    }
  });
});

describe("navigateTo", () => {
  // Rejilla de 4 columnas de 100 px. Banda 0: 6 cromos (una fila completa y una de 2). Banda 1:
  // 3 cromos en su propia fila. Índices en el orden del DOM:
  //   banda 0   0 1 2 3      y=0
  //             4 5          y=120
  //   banda 1   6 7 8        y=300
  const at = (col: number, row: number, group: number, base = 0): CardBox => ({
    left: col * 100,
    top: base + row * 120,
    width: 88,
    group,
  });
  const boxes: CardBox[] = [
    at(0, 0, 0),
    at(1, 0, 0),
    at(2, 0, 0),
    at(3, 0, 0),
    at(0, 1, 0),
    at(1, 1, 0),
    at(0, 0, 1, 300),
    at(1, 0, 1, 300),
    at(2, 0, 1, 300),
  ];
  const go = (from: number, key: NavKey) => navigateTo(boxes, from, key);

  it("← y → siguen el orden del DOM, también entre bandas", () => {
    expect(go(1, "ArrowRight")).toBe(2);
    expect(go(3, "ArrowRight")).toBe(4);
    expect(go(5, "ArrowRight")).toBe(6);
    expect(go(6, "ArrowLeft")).toBe(5);
    expect(go(2, "ArrowLeft")).toBe(1);
  });

  it("← en el primero y → en el último se quedan donde están", () => {
    expect(go(0, "ArrowLeft")).toBe(0);
    expect(go(8, "ArrowRight")).toBe(8);
  });

  it("↑ y ↓ van a la fila vecina, en la misma columna", () => {
    expect(go(1, "ArrowDown")).toBe(5);
    expect(go(5, "ArrowUp")).toBe(1);
    expect(go(0, "ArrowDown")).toBe(4);
  });

  it("↓ desde una fila completa a una parcial elige el cromo más cercano", () => {
    expect(go(3, "ArrowDown")).toBe(5);
    expect(go(2, "ArrowDown")).toBe(5);
  });

  it("↓ y ↑ cruzan de una banda a la siguiente y a la anterior", () => {
    expect(go(4, "ArrowDown")).toBe(6);
    expect(go(5, "ArrowDown")).toBe(7);
    expect(go(8, "ArrowUp")).toBe(5);
    expect(go(6, "ArrowUp")).toBe(4);
  });

  it("↑ en la primera fila y ↓ en la última no se mueven", () => {
    expect(go(2, "ArrowUp")).toBe(2);
    expect(go(7, "ArrowDown")).toBe(7);
  });

  it("Home y End van al principio y al final de la banda", () => {
    expect(go(2, "Home")).toBe(0);
    expect(go(2, "End")).toBe(5);
    expect(go(8, "Home")).toBe(6);
    expect(go(7, "End")).toBe(8);
  });

  it("tolera diferencias de un píxel entre las cajas de una fila", () => {
    const wobbly: CardBox[] = [
      { left: 0, top: 0, width: 88, group: 0 },
      { left: 100, top: 0.4, width: 88, group: 0 },
      { left: 0, top: 120, width: 88, group: 0 },
      { left: 100, top: 120.6, width: 88, group: 0 },
    ];
    expect(navigateTo(wobbly, 0, "ArrowDown")).toBe(2);
    expect(navigateTo(wobbly, 1, "ArrowDown")).toBe(3);
    expect(navigateTo(wobbly, 3, "ArrowUp")).toBe(1);
  });

  it("un índice fuera de rango no mueve nada", () => {
    expect(navigateTo(boxes, -1, "ArrowRight")).toBe(-1);
    expect(navigateTo([], 0, "Home")).toBe(0);
  });
});
