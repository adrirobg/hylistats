import type { ReactNode } from "react";
import type { GroupView } from "@/domain/group-view";
import { GROUP_TEAM_MIN_GAMES } from "@/lib/config";
import {
  memberMap,
  PERIODO_KIND,
  type Periodo,
  TITLES_ANCHOR,
} from "./group-view-model";
import { PeriodBlock } from "./period-block";
import { PeriodSelector } from "./period-selector";
import { SeasonTableView } from "./season-table";
import { TeamsBlock } from "./teams-block";
import { TitlesSection } from "./titles-section";

// Vista del grupo (iter-05): un solo componente que muestra `/grupo` (`page.tsx`) y, con T07, la
// pestaña Grupo del perfil. Con los mismos datos pinta los mismos valores en los dos sitios. Es de
// servidor: no carga nada (recibe el `GroupView` de `loadGroupView`) y su único JS de cliente es el
// selector Hoy / Semana, que vive en la URL.
//
// Estructura, de arriba abajo; los huecos de las tasks siguientes están marcados:
//   1. `freshness`        hueco de T09: botón «Actualizar grupo» y aviso de antigüedad.
//   2. Hoy / Semana        (T05) ranking, «sin mínimo», títulos del periodo y equipos del periodo.
//   3. Equipos, Temporada  (T06) tablas de Dúos y Tríos de la temporada y tabla de Temporada
//                          (Resumen y Récords, ordenable); la tabla es el otro componente de cliente.
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

/** Título de bloque (Hoy / Semana, Equipos, Temporada). */
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="font-display text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
    >
      {children}
    </h2>
  );
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
          <SectionHeading id="periodo-heading">Hoy / Semana</SectionHeading>
          <PeriodSelector active={periodo} />
        </div>
        <PeriodBlock
          view={period}
          members={members}
          highlightKey={highlightKey}
          titlesHref={titlesHref}
        />
      </section>

      <section
        aria-labelledby="equipos-heading"
        className="grid min-w-0 gap-3 rounded-[8px] border border-line bg-surface-1 p-3.5"
      >
        <SectionHeading id="equipos-heading">Equipos</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Toda la temporada, con {GROUP_TEAM_MIN_GAMES} o más partidas juntos.
          Un dúo cuenta aunque el tercero del equipo no sea del grupo; los tríos
          son solo de miembros.
        </p>
        <TeamsBlock
          teams={view.seasonTeams}
          members={members}
          highlightKey={highlightKey}
        />
      </section>

      <section
        aria-labelledby="temporada-heading"
        className="grid min-w-0 gap-3 rounded-[8px] border border-line bg-surface-1 p-3.5"
      >
        <SectionHeading id="temporada-heading">Temporada</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Temporada actual, mismos valores que el perfil de cada miembro.
          Campeones ganados cuenta la lista verificada o el contador oficial si
          es mayor. Pulsa una cabecera para ordenar; en dorado, el líder de la
          columna.
        </p>
        <SeasonTableView
          table={view.seasonTable}
          members={view.members.map(({ key, gameName, tagLine, slug }) => ({
            key,
            gameName,
            tagLine,
            slug,
          }))}
          highlightKey={highlightKey}
        />
      </section>

      <TitlesSection />
    </div>
  );
}
