// Cuándo se compacta la barra fija de la vitrina (I6), sin React ni navegador: la barra va
// transparente sobre el banner mientras la identidad grande se ve entera y gana fondo e identidad
// compacta en cuanto esa fila empieza a pasar por debajo de ella (así los botones no quedan
// encima del nombre). Lo observa un `IntersectionObserver` con umbral 1 (en `vitrina.tsx`) y el
// margen superior recortado por la altura de la barra.

/**
 * `rootMargin` del observador: el viewport menos la franja que tapa la barra, así la identidad
 * "sale" al quedar bajo ella y no al llegar al borde de la ventana.
 */
export function barRootMargin(barHeight: number): string {
  return `${-Math.max(0, Math.ceil(barHeight))}px 0px 0px 0px`;
}

/** Lo que importa de una `IntersectionObserverEntry`. */
export interface BarEntry {
  /** `intersectionRatio`: 1 si la identidad se ve entera bajo la barra. */
  ratio: number;
  /** `boundingClientRect.top` de la fila de identidad. */
  top: number;
  /** `rootBounds.top` (ya con el margen); `null` si el navegador no lo da (se toma 0). */
  rootTop: number | null;
}

/**
 * ¿Barra compacta? Si la identidad no se ve entera porque ha empezado a salir por arriba. Cortada
 * por abajo (una ventana muy baja o un salto a un ancla) no hay nada que resumir en la barra.
 */
export function barCompact({ ratio, top, rootTop }: BarEntry): boolean {
  return ratio < 1 && top < (rootTop ?? 0);
}
