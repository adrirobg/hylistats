import type { ReactNode } from "react";

// Esqueleto de la "cabina" del perfil (brief §3.2 y §7, `.app`/`.body`/`.main`/`.rail` de la
// maqueta). Lo comparten `page.tsx` y `loading.tsx`, así los esqueletos de carga tienen
// exactamente la forma final.
//
// Rangos: se miden sobre el ancho de `.app` (container queries), no sobre el de la ventana.
//   < 1100 px   una columna: la franja de cifras (`strip`) bajo la barra Arena God y el main; el
//               raíl cae debajo del main y ahí solo se deja lo que no esté ya en la franja (la
//               forma: el marcador del raíl se oculta con `@max-[1100px]:hidden`).
//   ≥ 1100 px   main + raíl de 340 px, con borde entre ambos.
//   ≥ 1500 px   raíl de 380 px. (El contenedor raíz mide como mucho 1448 px útiles, así que hoy
//               este último rango solo se alcanzaría si se ensancha el layout raíz.)
// Por debajo de 640 px el header se reduce (`header.tsx`).

interface CabinProps {
  /** `<ProfileHeader>` (pegajoso) y, si hay, su aviso. */
  header: ReactNode;
  /** Banda de sincronización (§4.10), bajo el header. */
  band?: ReactNode;
  /** Barra Arena God de tres capas y su aviso (T07). */
  god?: ReactNode;
  /**
   * Franja compacta de cifras (T10), bajo la barra Arena God. Solo se ve por debajo de 1100 px:
   * a partir de ahí el marcador vive en el raíl.
   */
  strip?: ReactNode;
  /** Barra de pestañas. */
  tabs: ReactNode;
  /** Contenido de la pestaña activa (T08: el álbum). */
  main: ReactNode;
  /**
   * Bloques del raíl (T10: marcador, forma; T04: compañeros). Por debajo de 1100 px el raíl cae bajo el main: lo
   * que ya salga en `strip` (el marcador) se oculta ahí con `@max-[1100px]:hidden`.
   */
  rail: ReactNode;
}

export function Cabin({
  header,
  band,
  god,
  strip,
  tabs,
  main,
  rail,
}: CabinProps) {
  return (
    <div className="@container overflow-clip rounded-[10px] border border-line bg-[color-mix(in_srgb,var(--bg)_92%,black)]">
      {header}
      {band}
      {/* Vacío = sin altura: la franja solo ocupa espacio cuando T07 le pone contenido. */}
      <div
        data-slot="arena-god"
        className="grid gap-2.5 border-b border-line px-5 pt-4 pb-3.5 empty:hidden @max-[640px]:px-3.5"
      >
        {/* T07: barra Arena God de tres capas y aviso de descuadre (llegan por `god`). */}
        {god}
      </div>
      {strip && (
        <div
          data-slot="strip"
          className="border-b border-line px-5 py-3 @min-[1100px]:hidden @max-[640px]:px-3.5"
        >
          {strip}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] @min-[1100px]:grid-cols-[minmax(0,1fr)_340px] @min-[1500px]:grid-cols-[minmax(0,1fr)_380px]">
        <div data-slot="main" className="min-w-0 px-5 pb-6 @max-[640px]:px-3.5">
          {tabs}
          {main}
        </div>
        <aside
          data-slot="rail"
          aria-label="Resumen de la temporada"
          className="grid content-start gap-4 border-t border-line px-5 pt-4 pb-6 @min-[1100px]:border-t-0 @min-[1100px]:border-l @max-[640px]:px-3.5"
        >
          {rail}
        </aside>
      </div>
    </div>
  );
}
