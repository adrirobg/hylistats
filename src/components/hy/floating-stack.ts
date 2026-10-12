// Qué enseña la pila flotante global (revisión v5b, D9–D10), sin React: de los avisos registrados
// (`FloatingItem` de `floating.tsx`), cuáles van a la vista, cuáles se pliegan en el chip "+N avisos"
// y cuántos cerrados siguen activos (el indicador «!» de la barra del perfil los cuenta y los
// reabre). La pila (proveedor, registro y cierres) vive en `floating.tsx`.

/** Un aviso registrado en la pila. */
export interface FloatingEntry {
  /** Único en la pila; cerrar vale para este `id` mientras siga registrado. */
  id: string;
  /** Menor, antes: sincronización (0–3) > Dios de Arena > Arena fuera de rotación. */
  priority: number;
  /**
   * Familia del aviso (`sync`, `dios`, `arena`): a la vista va uno por familia, el de mayor
   * prioridad (los de sincronización hablan de lo mismo, como en T08); el resto se pliega.
   */
  group: string;
}

export interface FloatingLayoutInput {
  /** En el orden de registro: a igual prioridad, antes el primero. */
  entries: readonly FloatingEntry[];
  /** `id`s cerrados; los que no están registrados no cuentan. */
  closed: readonly string[];
  /** Viewport de móvil (≤ 640 px): un aviso a la vista en lugar de dos. */
  mobile: boolean;
}

export interface FloatingLayout {
  /** A la vista, por prioridad. */
  visible: string[];
  /** Plegados en el chip "+N avisos", por prioridad. */
  folded: string[];
  /** Cerrados que siguen registrados, por prioridad. */
  closed: string[];
}

/** Avisos a la vista: dos en escritorio, uno en móvil. */
export const visibleSlots = (mobile: boolean) => (mobile ? 1 : 2);

export function floatingLayout({
  entries,
  closed,
  mobile,
}: FloatingLayoutInput): FloatingLayout {
  const closedIds = new Set(closed);
  // `sort` es estable: a igual prioridad queda el orden de registro.
  const byPriority = [...entries].sort((a, b) => a.priority - b.priority);
  const slots = visibleSlots(mobile);
  const layout: FloatingLayout = { visible: [], folded: [], closed: [] };
  const groups = new Set<string>();
  for (const entry of byPriority) {
    if (closedIds.has(entry.id)) {
      layout.closed.push(entry.id);
    } else if (layout.visible.length < slots && !groups.has(entry.group)) {
      layout.visible.push(entry.id);
      groups.add(entry.group);
    } else {
      layout.folded.push(entry.id);
    }
  }
  return layout;
}

/** Texto del chip: "+1 aviso" / "+3 avisos". */
export const foldedLabel = (n: number) =>
  `+${n} ${n === 1 ? "aviso" : "avisos"}`;
