// Interacción del álbum (brief §4.4 y §7) como funciones puras, sin React ni navegador: qué ofrece
// el menú ⋯ de un cromo, los textos de su confirmación, a qué cromo salta cada flecha y qué
// campeones acaban de pasar a «ganado». Los componentes (`album.tsx`, `album-card.tsx`,
// `card-menu.tsx`) solo las cablean.

import type { AlbumEntry } from "@/domain/album";
import { type ChampionLink, championLinks } from "@/lib/champion-links";
import type { CardState } from "./album-view";

/** Qué parte del cromo recibe el foco tras un cambio que puede mudarlo de banda (y remontarlo). */
export type CardPart = "card" | "target" | "menu";

// --- Marcado manual -----------------------------------------------------------------------

export type ManualAction = "mark" | "unmark" | "none";

/**
 * Lo que ofrece el menú ⋯ según el estado efectivo (brief §3.6). Un verificado manda sobre la
 * marca manual (`effectiveState`): no se marca ni se desmarca nada. `played` y `none` se marcan.
 */
export function manualActionFor(state: CardState): ManualAction {
  switch (state) {
    case "won":
      return "none";
    case "manual":
      return "unmark";
    case "played":
    case "none":
      return "mark";
  }
}

export interface ManualCopy {
  /** Opción del menú; los puntos suspensivos avisan de que pide confirmar. */
  item: string;
  /** Texto de la confirmación. */
  question: string;
  /** Botón que confirma. */
  confirm: string;
}

/**
 * Textos del menú y de la confirmación (maqueta l. 670 y 677: «se guardan solo en este
 * navegador»). «Marcar como ganado a mano» es el nombre con el que la barra Arena God (T07)
 * manda al usuario a este menú.
 */
export function manualCopy(
  action: Exclude<ManualAction, "none">,
  name: string,
): ManualCopy {
  return action === "mark"
    ? {
        item: "Marcar como ganado a mano…",
        question: `Úsalo si ganaste con ${name} y el historial no lo muestra. Se guarda solo en este navegador.`,
        confirm: "Marcar",
      }
    : {
        item: "Quitar marca manual…",
        question: `${name} dejará de contar como ganado a mano. Se guarda solo en este navegador.`,
        confirm: "Quitar",
      };
}

// --- Contenido del menú ⋯ -------------------------------------------------------------------

export interface CardMenuContent {
  /** Enlaces «Builds»: los mismos, en el mismo orden y con las mismas etiquetas que el panel. */
  links: ChampionLink[];
  /** Marcado manual (`mark`/`unmark`) o `null` si este cromo no lo ofrece. */
  manual: Exclude<ManualAction, "none"> | null;
}

/**
 * Qué lleva el menú ⋯ de un cromo. `manual` es lo que ofrecería el marcado manual (`manualActionFor`
 * en «mi perfil», `"none"` en un perfil ajeno o en un verificado). Los enlaces salen de
 * `championLinks`, igual que en el panel del campeón. Devuelve `null` si no hay nada que ofrecer
 * (sin `ddId` y sin marcado manual): entonces no se pinta el ⋯.
 */
export function cardMenuContent(
  ddId: string | null,
  name: string,
  manual: ManualAction,
): CardMenuContent | null {
  const links = championLinks(ddId, name);
  const action = manual === "none" ? null : manual;
  if (links.length === 0 && action === null) return null;
  return { links, manual: action };
}

// --- Sellado -------------------------------------------------------------------------------

/** `championId` de los campeones verificados (los `won` del dominio). */
export function wonIds(entries: readonly AlbumEntry[]): ReadonlySet<number> {
  return new Set(
    entries.filter((e) => e.state === "won").map((e) => e.championId),
  );
}

/**
 * Campeones que han pasado a verificados desde el render anterior (el 1º nuevo que llega con el
 * polling o un refresco). `prevIds = null` es el primer render, o un perfil distinto del anterior:
 * no hay «antes», así que no se sella nada.
 */
export function newlyWon(
  prevIds: ReadonlySet<number> | null,
  nextEntries: readonly AlbumEntry[],
): number[] {
  if (prevIds === null) return [];
  return nextEntries
    .filter((e) => e.state === "won" && !prevIds.has(e.championId))
    .map((e) => e.championId);
}

// --- Flechas -------------------------------------------------------------------------------

export const NAV_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export const isNavKey = (key: string): key is NavKey =>
  (NAV_KEYS as readonly string[]).includes(key);

/** Caja de un cromo en pantalla, en el orden del DOM; `group` = índice de su banda. */
export interface CardBox {
  left: number;
  top: number;
  width: number;
  group: number;
}

/** Los cromos de una fila comparten `top`; por debajo de esta diferencia (px) son la misma fila. */
const ROW_TOLERANCE = 2;

/**
 * Índice del cromo al que salta `key` desde `from`. Devuelve `from` si no hay a dónde ir (así el
 * navegador puede hacer su scroll normal). ← y → siguen el orden del DOM, también entre bandas;
 * ↑ y ↓ van a la fila vecina (aunque sea de otra banda) y eligen el cromo más cercano a la misma
 * columna, sin conocer el número de columnas; `Home` y `End` van al primero y al último de la
 * banda.
 */
export function navigateTo(
  boxes: readonly CardBox[],
  from: number,
  key: NavKey,
): number {
  const current = boxes[from];
  if (!current) return from;
  switch (key) {
    case "ArrowLeft":
      return Math.max(from - 1, 0);
    case "ArrowRight":
      return Math.min(from + 1, boxes.length - 1);
    case "Home":
      return boxes.findIndex((box) => box.group === current.group);
    case "End":
      return boxes.findLastIndex((box) => box.group === current.group);
    case "ArrowUp":
      return verticalTarget(boxes, from, -1);
    case "ArrowDown":
      return verticalTarget(boxes, from, 1);
  }
}

function verticalTarget(
  boxes: readonly CardBox[],
  from: number,
  direction: 1 | -1,
): number {
  const current = boxes[from];
  // La fila vecina es la más cercana en esa dirección.
  let rowTop: number | null = null;
  for (const box of boxes) {
    const distance = (box.top - current.top) * direction;
    if (
      distance > ROW_TOLERANCE &&
      (rowTop === null || distance < (rowTop - current.top) * direction)
    ) {
      rowTop = box.top;
    }
  }
  if (rowTop === null) return from;

  const centre = current.left + current.width / 2;
  let best = from;
  let bestGap = Number.POSITIVE_INFINITY;
  boxes.forEach((box, index) => {
    if (Math.abs(box.top - rowTop) > ROW_TOLERANCE) return;
    const gap = Math.abs(box.left + box.width / 2 - centre);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}
