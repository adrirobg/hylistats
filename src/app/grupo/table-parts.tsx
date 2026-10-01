import type { MemberRef } from "./group-view-model";

// Piezas de tabla compartidas por los bloques de la vista del grupo (Hoy / Semana, Equipos y
// Temporada): clases de cabecera y celda, la marca de la fila destacada y la cabecera numérica que
// se acorta en contenedores estrechos. Las tablas viven en un `@container` (`group-view.tsx`):
// `@max-[480px]` mira el ancho de la vista, no el de la ventana.

export const TH =
  "border-b border-line bg-surface-1 px-2 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground uppercase tracking-[0.06em] first:pl-3 last:pr-3 @max-[480px]:px-1.5 @max-[480px]:first:pl-2.5 @max-[480px]:last:pr-2.5";
export const TD =
  "px-2 py-2 text-right whitespace-nowrap first:pl-3 last:pr-3 @max-[480px]:px-1.5 @max-[480px]:first:pl-2.5 @max-[480px]:last:pr-2.5";
/** Fila del miembro cuyo perfil se está viendo (pestaña Grupo del perfil): fondo y marca dorada. */
export const HIGHLIGHT = "bg-surface-2 shadow-[inset_3px_0_0_var(--place-1)]";

/**
 * Cabecera numérica: en un contenedor estrecho (< 480 px) se acorta (`short`) para que la tabla
 * quepa sin desplazarse; el texto completo sigue disponible para lectores de pantalla.
 */
export function Th({ label, short }: { label: string; short?: string }) {
  return (
    <th scope="col" className={TH}>
      {short ? (
        <>
          <span className="@max-[480px]:sr-only">{label}</span>
          <span aria-hidden="true" className="hidden @max-[480px]:inline">
            {short}
          </span>
        </>
      ) : (
        label
      )}
    </th>
  );
}

/** `true` si alguno de los miembros es el destacado. */
export const involves = (
  members: readonly (MemberRef | null)[],
  highlightKey: string | undefined,
) => highlightKey !== undefined && members.some((m) => m?.key === highlightKey);
