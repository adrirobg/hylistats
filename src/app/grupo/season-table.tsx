"use client";

import { Tabs } from "@base-ui/react/tabs";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SeasonTab, SeasonTable } from "@/domain/group-season";
import { cn } from "@/lib/utils";
import { type MemberRef, memberMap } from "./group-view-model";
import { MemberName } from "./member-name";
import {
  nextSort,
  SEASON_TABS,
  type SeasonCellModel,
  type SeasonSort,
  seasonTableModel,
} from "./season-view-model";
import { HIGHLIGHT, TD, TH } from "./table-parts";

// Tabla de Temporada (F8, P8): una fila por miembro con dos pestañas, Resumen y Récords. Es de
// cliente solo por el orden y la pestaña activa, que son estado de la vista (no se comparten ni
// se guardan; la URL queda libre para `?tab` y `?periodo`). Recibe los datos ya calculados en el
// servidor (`view.seasonTable`) y los ordena con `sortSeasonRows`; el formato, los enlaces y los
// líderes salen de `season-view-model.ts`.
//
// Accesibilidad: las pestañas son un `tablist` de Base UI (flechas, Inicio y Fin); cada cabecera es
// un botón con `aria-sort` en su `<th>`. El líder de cada columna va en negrita y dorado, y además
// lo dice el texto oculto «(líder)» (el color solo no basta).
//
// 375 px: la tabla tiene scroll horizontal propio (`overflow-x-auto` con `min-w-0`) y la columna
// del jugador queda fija a la izquierda (`sticky`), así que la página nunca se desplaza.

interface SeasonTableViewProps {
  table: SeasonTable;
  members: readonly MemberRef[];
  /** Clave del miembro cuya fila se destaca (el dueño del perfil en la pestaña Grupo). */
  highlightKey?: string;
}

export function SeasonTableView({
  table,
  members,
  highlightKey,
}: SeasonTableViewProps) {
  const [tab, setTab] = useState<SeasonTab>("summary");
  const [sort, setSort] = useState<SeasonSort | null>(null);
  const memberRefs = useMemo(() => memberMap(members), [members]);

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => {
        setTab(value as SeasonTab);
        // Cada pestaña tiene sus columnas: el orden de la otra no se arrastra.
        setSort(null);
      }}
      className="grid min-w-0 gap-3"
    >
      <Tabs.List
        aria-label="Columnas de la temporada"
        className="inline-flex w-fit min-w-0 gap-px overflow-hidden rounded-md border border-line bg-line"
      >
        {SEASON_TABS.map(({ id, label }) => (
          <Tabs.Tab
            key={id}
            value={id}
            className={cn(
              "inline-flex min-w-24 cursor-pointer items-center justify-center bg-surface-1 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              "data-active:bg-surface-2 data-active:text-foreground data-active:shadow-[inset_0_-2px_0_var(--place-1)]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-place-1",
            )}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {SEASON_TABS.map(({ id, label }) => (
        <Tabs.Panel key={id} value={id} className="min-w-0 outline-none">
          <SeasonPanel
            label={label}
            model={seasonTableModel(table, memberRefs, id, sort)}
            highlightKey={highlightKey}
            onSort={(columnId) =>
              setSort((current) => nextSort(current, columnId))
            }
          />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

function SeasonPanel({
  label,
  model,
  highlightKey,
  onSort,
}: {
  label: string;
  model: ReturnType<typeof seasonTableModel>;
  highlightKey?: string;
  onSort: (columnId: (typeof model.columns)[number]["id"]) => void;
}) {
  return (
    // `relative`: los textos `sr-only` son `absolute` y, sin un ancestro posicionado dentro del
    // contenedor, escapan de su `overflow` y alargan el scroll de la página.
    <div className="relative overflow-x-auto rounded-lg border border-line">
      <table
        aria-label={`Temporada: ${label}`}
        className="w-full border-collapse text-sm"
      >
        <thead>
          <tr>
            <th scope="col" className={cn(TH, "sticky left-0 z-10 text-left")}>
              Jugador
            </th>
            {model.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                aria-sort={column.ariaSort}
                className={cn(TH, "p-0")}
              >
                <button
                  type="button"
                  onClick={() => onSort(column.id)}
                  className="inline-flex w-full cursor-pointer items-center justify-end gap-1 px-2 py-2 text-xs font-medium tracking-[0.06em] whitespace-nowrap uppercase hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-place-1"
                >
                  {column.label}
                  <span
                    aria-hidden="true"
                    className="w-2 text-[10px] text-place-1"
                  >
                    {column.ariaSort === "ascending"
                      ? "▲"
                      : column.ariaSort === "descending"
                        ? "▼"
                        : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => {
            const highlighted = row.key === highlightKey;
            return (
              <tr
                key={row.key}
                aria-current={highlighted ? "true" : undefined}
                className={cn(
                  "border-b border-line bg-surface-1 last:border-b-0",
                  highlighted && HIGHLIGHT,
                )}
              >
                <td
                  className={cn(
                    TD,
                    "sticky left-0 z-10 max-w-40 min-w-24 bg-inherit text-left",
                  )}
                >
                  <MemberName member={row.member} className="block" />
                </td>
                {model.columns.map((column) => (
                  <td key={column.id} className={cn(TD, "num align-top")}>
                    <Cell cell={row.cells[column.id]} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell }: { cell: SeasonCellModel }) {
  const value = (
    <span className={cn("block", cell.leader && "font-bold text-place-1")}>
      {cell.text}
      {cell.leader && <span className="sr-only"> (líder)</span>}
    </span>
  );
  const detail = cell.detail && (
    <span className="block text-[11px] text-muted-foreground">
      {cell.detail}
    </span>
  );
  if (!cell.href) {
    return (
      <>
        {value}
        {detail}
      </>
    );
  }
  return (
    <Link
      // Sin prefetch: Partidas es dinámica y la tabla puede llevar decenas de enlaces a partida.
      prefetch={false}
      href={cell.href}
      className="block underline decoration-line underline-offset-2 hover:decoration-current"
    >
      {value}
      {detail}
      <span className="sr-only"> · abrir partida</span>
    </Link>
  );
}
