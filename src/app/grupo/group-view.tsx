import type { ReactNode } from "react";
import type { GroupView } from "@/domain/group-view";
import {
  memberMap,
  PERIODO_KIND,
  type Periodo,
  TITLES_ANCHOR,
} from "./group-view-model";
import { PeriodBlock } from "./period-block";
import { PeriodSelector } from "./period-selector";
import { TitlesSection } from "./titles-section";

// Vista del grupo (iter-05): un solo componente que muestra `/grupo` (`page.tsx`) y, con T07, la
// pestaña Grupo del perfil. Con los mismos datos pinta los mismos valores en los dos sitios. Es de
// servidor: no carga nada (recibe el `GroupView` de `loadGroupView`) y su único JS de cliente es el
// selector Hoy / Semana, que vive en la URL.
//
// Estructura, de arriba abajo; los huecos de las tasks siguientes están marcados:
//   1. `freshness`        hueco de T09: botón «Actualizar grupo» y aviso de antigüedad.
//   2. Hoy / Semana        (T05) ranking, «sin mínimo», títulos del periodo y equipos del periodo.
//   3. Equipos, Temporada  hueco de T06, sobre `view.seasonTeams` y `view.seasonTable`.
//   4. Títulos             (T05) apartado fijo, ancla `#titulos`.

export interface GroupViewProps {
  view: GroupView;
  /** Periodo del selector (`?periodo=`, ver `parsePeriodo`). */
  periodo: Periodo;
  /**
   * Clave del miembro (`GroupViewMember.key`) cuya fila se destaca: el dueño del perfil en la
   * pestaña Grupo (T07). Sin ella, ninguna fila se destaca.
   */
  highlightKey?: string;
  /**
   * Destino del enlace «Cómo funcionan los títulos» de cada explicación. Por defecto el apartado de
   * esta misma vista (`#titulos`).
   */
  titlesHref?: string;
  /** Hueco de T09, encima del bloque Hoy / Semana. */
  freshness?: ReactNode;
}

export function GroupViewPanel({
  view,
  periodo,
  highlightKey,
  titlesHref = `#${TITLES_ANCHOR}`,
  freshness,
}: GroupViewProps) {
  if (view.members.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
        El grupo todavía no tiene miembros. Se añaden desde /admin.
      </p>
    );
  }
  const members = memberMap(view.members);
  const period = view[PERIODO_KIND[periodo]];
  return (
    // `@container`: las tablas se acortan según el ancho de la vista, no el de la ventana (en la
    // pestaña del perfil la vista es más estrecha que la pantalla). `min-w-0`: las tablas anchas no
    // deben ensanchar la columna de quien contiene la vista.
    <div className="@container grid min-w-0 gap-4">
      {freshness}

      <section
        aria-labelledby="periodo-heading"
        className="grid min-w-0 gap-3 rounded-[8px] border border-line bg-surface-1 p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2
            id="periodo-heading"
            className="font-display text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
          >
            Hoy / Semana
          </h2>
          <PeriodSelector active={periodo} />
        </div>
        <PeriodBlock
          view={period}
          members={members}
          highlightKey={highlightKey}
          titlesHref={titlesHref}
        />
      </section>

      {/* T06: bloques Equipos (`view.seasonTeams`) y Temporada (`view.seasonTable`). */}

      <TitlesSection />
    </div>
  );
}
