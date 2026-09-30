"use client";

import { Star } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Btn } from "@/components/hy/btn";
import { SegButton, Segmented } from "@/components/hy/segmented";
import type { TeammateSummary } from "@/domain/queries";
import type { LocalState } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { useLocalReady, useLocalStore } from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { SmallSampleBadge, TeammateName } from "./teammate-parts";
import {
  canShowAll,
  DEFAULT_ORDEN,
  emptyMessage,
  MIN_GAMES_OPTIONS,
  ORDEN_DIRECTION,
  ORDEN_LABEL,
  ORDEN_SELECT_LABEL,
  ORDENES,
  parseTeammateParams,
  SMALL_SAMPLE,
  type TeammateOrder,
  type TeammateParams,
  type TeammateRow,
  teammateRows,
  teammateSearch,
} from "./teammates-view";

// Pestaña Compañeros (brief §3.4, `#mates-tbl` de la maqueta): quién ha jugado contigo, cuánto y
// con qué resultados. Todo el estado de la vista vive en la URL (`?min`, `?orden`; lógica en
// `teammates-view.ts`). El servidor ya filtra por `?min` (no manda los cientos de compañeros de una
// sola partida); aquí se ordena, se formatea y se pinta. Es cliente por las cabeceras ordenables y
// porque los favoritos (★) viven en el navegador.
//
// Rangos (container queries sobre `.app`, como la cabina): por debajo de 640 px la tabla pasa a una
// lista de tarjetas, con el orden en un selector (sin cabeceras que pulsar); nada hace scroll
// horizontal. Cada fila se pinta en las dos formas y la que sobra queda en `display: none`.

export interface TeammatesPanelProps {
  /** Compañeros con al menos `?min` partidas juntos (`ProfileView.teammates`). */
  teammates: TeammateSummary[];
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
}

const selectFavorites = (state: LocalState) => state.favorites;
/** Sin favoritos: el mismo conjunto siempre, para que los `useMemo` no se invaliden. */
const NO_KEYS: ReadonlySet<string> = new Set();

export function TeammatesPanel({ teammates, nowMs }: TeammatesPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow(nowMs);

  const params = useMemo(
    () => parseTeammateParams(searchParams),
    [searchParams],
  );
  const rows = useMemo(
    () => teammateRows(teammates, params, now),
    [teammates, params, now],
  );

  // Los favoritos son del navegador: hasta `useLocalReady()` no se marca ninguno, igual que en el
  // HTML del servidor, y la hidratación coincide.
  const ready = useLocalReady();
  const favorites = useLocalStore(selectFavorites);
  const favoriteKeys = useMemo(
    () =>
      ready
        ? new Set(favorites.map((f) => normalizeRiotId(f.gameName, f.tagLine)))
        : NO_KEYS,
    [ready, favorites],
  );

  function update(patch: Partial<TeammateParams>) {
    const query = teammateSearch({ ...params, ...patch }, searchParams);
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  }

  return (
    // `min-w-0`: la tabla ancha no debe ensanchar la columna del panel (que es una rejilla).
    <div className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true">Mostrar</span>
          <Segmented label="Mostrar compañeros con al menos este mínimo de partidas juntos">
            {MIN_GAMES_OPTIONS.map((n) => (
              <SegButton
                key={n}
                pressed={n === params.min}
                onClick={() => update({ min: n })}
              >
                ≥ {n}
              </SegButton>
            ))}
          </Segmented>
          <span aria-hidden="true">partidas</span>
        </div>

        {/* Sin cabeceras que pulsar, el orden pasa a un selector. */}
        <label className="hidden items-center gap-2 text-sm text-muted-foreground @max-[640px]:flex">
          Orden
          <select
            value={params.orden}
            onChange={(event) =>
              update({
                orden:
                  ORDENES.find((o) => o === event.target.value) ??
                  DEFAULT_ORDEN,
              })
            }
            className="cursor-pointer rounded-md border border-line bg-surface-1 py-2 pr-2 pl-3 text-sm text-foreground"
          >
            {ORDENES.map((o) => (
              <option key={o} value={o}>
                {ORDEN_SELECT_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mb-3.5 text-[13px] text-muted-foreground">
        1º = victoria. Con menos de {SMALL_SAMPLE} partidas juntos (
        <span className="text-trust">⚠ pocas</span>) la muestra es pequeña y las
        cifras se atenúan.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
          {emptyMessage(params.min)}
          {canShowAll(params.min) && (
            <>
              {" "}
              <Btn
                size="small"
                variant="trust"
                onClick={() => update({ min: 1 })}
              >
                Ver todos (≥ 1)
              </Btn>
            </>
          )}
        </p>
      ) : (
        <>
          <TeammatesTable
            rows={rows}
            orden={params.orden}
            favoriteKeys={favoriteKeys}
            onSort={(orden) => update({ orden })}
          />
          <TeammateCards rows={rows} favoriteKeys={favoriteKeys} />
        </>
      )}
    </div>
  );
}

// --- Piezas ------------------------------------------------------------------------------

function FavoriteMark() {
  return (
    <span
      role="img"
      aria-label="En favoritos"
      title="En favoritos"
      className="shrink-0 self-center text-place-1"
    >
      <Star aria-hidden="true" size={13} fill="currentColor" />
    </span>
  );
}

/** Color de las cifras: por debajo de `SMALL_SAMPLE` partidas se atenúan (`text-faint`, AA). */
const dimmed = (row: TeammateRow) => row.small && "text-faint";

// --- Tabla (≥ 640 px) --------------------------------------------------------------------

const TH =
  "border-b border-line bg-surface-1 px-2.5 py-2.5 text-right text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-3 first:text-left last:pr-3";
const TD = "px-2.5 py-2.5 text-right whitespace-nowrap first:pl-3 last:pr-3";

/** Cabecera ordenable: un botón dentro del `th`, que lleva el `aria-sort` si es la columna activa. */
function SortHeader({
  orden,
  active,
  onSort,
}: {
  orden: TeammateOrder;
  active: boolean;
  onSort: (orden: TeammateOrder) => void;
}) {
  const asc = ORDEN_DIRECTION[orden] === "asc";
  return (
    <th
      scope="col"
      aria-sort={active ? (asc ? "ascending" : "descending") : undefined}
      className={TH}
    >
      <button
        type="button"
        onClick={() => onSort(orden)}
        title={`Ordenar por ${ORDEN_LABEL[orden]}, de ${asc ? "menor a mayor" : "mayor a menor"}`}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 tracking-[0.08em] uppercase hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {ORDEN_LABEL[orden]}
        {active && (
          <span aria-hidden="true" className="text-place-1">
            {asc ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}

function TeammatesTable({
  rows,
  orden,
  favoriteKeys,
  onSort,
}: {
  rows: TeammateRow[];
  orden: TeammateOrder;
  favoriteKeys: ReadonlySet<string>;
  onSort: (orden: TeammateOrder) => void;
}) {
  const header = (o: TeammateOrder) => (
    <SortHeader orden={o} active={o === orden} onSort={onSort} />
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-line @max-[640px]:hidden">
      <table
        aria-label="Compañeros de la temporada"
        className="w-full border-collapse text-sm"
      >
        <thead>
          <tr>
            <th scope="col" className={cn(TH, "uppercase tracking-[0.08em]")}>
              Compañero
            </th>
            {header("partidas")}
            {header("primeros")}
            {header("pct1")}
            {header("top3")}
            {header("medio")}
            {header("ultima")}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-b-0">
              {/* `w-full max-w-0`: la columna absorbe el ancho que sobra y el nombre se recorta. */}
              <td className={cn(TD, "w-full max-w-0 text-left")}>
                <span className="flex items-baseline gap-2">
                  <TeammateName
                    gameName={row.gameName}
                    tagLine={row.tagLine}
                    href={row.href}
                    className="min-w-0"
                  />
                  {favoriteKeys.has(row.norm) && <FavoriteMark />}
                  {row.small && <SmallSampleBadge className="shrink-0" />}
                </span>
              </td>
              <td className={cn(TD, "num", dimmed(row))}>{row.games}</td>
              <td className={cn(TD, "num", dimmed(row))}>{row.firsts}</td>
              <td className={cn(TD, "num", dimmed(row))}>{row.pct1}</td>
              <td className={cn(TD, "num", dimmed(row))}>{row.top3}</td>
              <td className={cn(TD, "num", dimmed(row))}>{row.medio}</td>
              <td className={cn(TD, dimmed(row))}>{row.ultima}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Tarjetas (< 640 px) -----------------------------------------------------------------

function Stat({
  label,
  value,
  row,
}: {
  label: string;
  value: string | number;
  row: TeammateRow;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("num", dimmed(row))}>{value}</dd>
    </div>
  );
}

function TeammateCards({
  rows,
  favoriteKeys,
}: {
  rows: TeammateRow[];
  favoriteKeys: ReadonlySet<string>;
}) {
  return (
    <ul
      aria-label="Compañeros de la temporada"
      className="hidden gap-2 @max-[640px]:grid"
    >
      {rows.map((row) => (
        <li
          key={row.key}
          className="rounded-lg border border-line bg-surface-1 p-3"
        >
          <div className="flex items-baseline gap-2">
            <TeammateName
              gameName={row.gameName}
              tagLine={row.tagLine}
              href={row.href}
              className="min-w-0 font-medium"
            />
            {favoriteKeys.has(row.norm) && <FavoriteMark />}
            {row.small && <SmallSampleBadge className="ml-auto shrink-0" />}
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            <Stat label={ORDEN_LABEL.partidas} value={row.games} row={row} />
            <Stat label={ORDEN_LABEL.primeros} value={row.firsts} row={row} />
            <Stat label={ORDEN_LABEL.pct1} value={row.pct1} row={row} />
            <Stat label={ORDEN_LABEL.top3} value={row.top3} row={row} />
            <Stat label={ORDEN_LABEL.medio} value={row.medio} row={row} />
            <Stat label={ORDEN_LABEL.ultima} value={row.ultima} row={row} />
          </dl>
        </li>
      ))}
    </ul>
  );
}
