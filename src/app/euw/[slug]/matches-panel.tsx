"use client";

import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Btn } from "@/components/hy/btn";
import { Notice } from "@/components/hy/notice";
import { SegButton, Segmented } from "@/components/hy/segmented";
import { ToastRegion, useToast } from "@/components/hy/toast";
import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { championHref } from "./champion-panel-view";
import type { MatchesData } from "./data";
import { MatchDetail } from "./match-detail";
import { ChampionThumb, PlaceChip } from "./match-parts";
import {
  BLOCK_SIZE,
  companionOptions,
  type FilterPatch,
  formatDuration,
  hasFilters,
  MAX_BLOCKS,
  type MatchDetailView,
  type MatchParams,
  type MatchRowData,
  matchCountText,
  matchListLimit,
  matchRowLabel,
  matchSearch,
  matchShareUrl,
  parseCompanero,
  parseMatchParams,
  selectedCompanionValue,
  toggleMatchHref,
  trioText,
  trioTitle,
  withFilter,
  withMoreBlocks,
  withoutFilters,
} from "./matches-view";

// Pestaña Partidas (brief §3.5, `.match` y `.mrow` de la maqueta): las partidas de la temporada en
// filas compactas (campeón, puesto, compañeros de trío, duración y hace cuánto), con «★ nuevo 1º»
// en la que verifica al campeón. Todo el estado vive en la URL (`?q`, `?puesto`, `?companero`,
// `?n` y `?partida`; lógica en `matches-view.ts`); lo único local es el texto del buscador mientras
// dura el debounce. Cada fila es un enlace que abre o cierra su partida (`?partida`) sin saltar; el
// detalle 6×3 llega del servidor solo para la abierta. El nombre y el retrato del campeón de la fila
// abren su panel (`?campeon=`, `champion-panel.tsx`) sin abrir ni cerrar la partida.
//
// Rangos (container queries sobre `.app`, como la cabina): por debajo de 640 px la duración y el
// «hace cuánto» bajan bajo el nombre y la fila cabe en 375 px; nada hace scroll horizontal.

export interface MatchesPanelProps {
  matches: MatchesData;
  /** La partida abierta (`?partida`), si existe; ya viene con los iconos resueltos. */
  detail: MatchDetailView | null;
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
}

/** Espera tras la última pulsación antes de escribir la búsqueda en la URL (como el álbum). */
const DEBOUNCE_MS = 200;

const PUESTO_LABEL = { todos: "Todos", "1": "1º", top3: "Top 3" } as const;

export function MatchesPanel({ matches, detail, nowMs }: MatchesPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow(nowMs);
  const { toast, show } = useToast();

  const search = searchParams.toString();
  const params = useMemo(() => parseMatchParams(searchParams), [searchParams]);

  // --- Buscador de campeón ---
  // El texto vive aquí mientras se teclea; la URL lo recibe con un debounce. Si la URL cambia por
  // otro lado (atrás/adelante, «Quitar filtros») y no se está tecleando, el texto la sigue.
  const [draft, setDraft] = useState(params.q);
  const [typing, setTyping] = useState(false);
  const [seenUrlQ, setSeenUrlQ] = useState(params.q);
  if (seenUrlQ !== params.q) {
    setSeenUrlQ(params.q);
    if (!typing) setDraft(params.q);
  }

  function navigate(next: MatchParams) {
    const query = matchSearch(next, searchParams);
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  }

  // El temporizador del debounce lee siempre lo último renderizado.
  const latest = useRef({ navigate, params });
  useEffect(() => {
    latest.current = { navigate, params };
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onQueryChange(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { navigate, params } = latest.current;
      navigate(withFilter(params, { q: value.trim() }));
    }, DEBOUNCE_MS);
  }

  /** Cambia un filtro que no es el texto; el texto pendiente del buscador se aplica con él. */
  function update(patch: FilterPatch) {
    clearTimeout(timer.current);
    navigate(withFilter(params, { q: draft.trim(), ...patch }));
  }

  // --- Partida abierta ---
  // La fila abierta se trae a la vista al montar el panel (URL directa, forma o cromo del álbum),
  // no al abrir otra desde dentro: el clic ya la tiene delante.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current
      ?.querySelector("[data-scroll-target]")
      ?.scrollIntoView({ block: "start" });
  }, []);

  async function copyLink(matchId: string) {
    const url = matchShareUrl(window.location.origin, pathname, matchId);
    try {
      await navigator.clipboard.writeText(url);
      show("Enlace copiado");
    } catch {
      // Sin permiso o sin contexto seguro: se avisa en lugar de no hacer nada.
      show("No se pudo copiar el enlace");
    }
  }

  const { rows } = matches;
  const openId = detail?.row.matchId ?? null;
  // La partida pedida puede no estar entre las que se ven (otro filtro, o más allá del bloque):
  // entonces se pinta arriba, aparte, en lugar de perderse.
  const pinned =
    detail && !rows.some((row) => row.matchId === detail.row.matchId)
      ? detail
      : null;
  const filtered = hasFilters(params);

  const options = useMemo(
    () => companionOptions(matches.companions, params.companero),
    [matches.companions, params.companero],
  );

  const item = (row: MatchRowData, inList: boolean) => (
    <MatchItem
      key={row.matchId}
      row={row}
      inList={inList}
      open={row.matchId === openId}
      detail={row.matchId === openId ? detail : null}
      href={toggleMatchHref(
        pathname,
        search,
        row.matchId,
        row.matchId === openId,
      )}
      championUrl={championHref(pathname, search, row.championSlug)}
      now={now}
      onCopyLink={() => copyLink(row.matchId)}
    />
  );

  return (
    // `min-w-0`: el detalle ancho no debe ensanchar la columna del panel (que es una rejilla).
    <div ref={rootRef} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <label className="relative max-w-[320px] min-w-0 flex-[1_1_220px]">
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute top-1/2 left-[11px] -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={draft}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Buscar campeón…"
            aria-label="Buscar campeón"
            autoComplete="off"
            className="w-full rounded-md border border-line bg-surface-1 py-[9px] pr-3 pl-[34px] [&::-webkit-search-cancel-button]:appearance-none"
          />
        </label>

        <Segmented label="Puesto">
          {(["todos", "1", "top3"] as const).map((puesto) => (
            <SegButton
              key={puesto}
              pressed={(params.puesto ?? "todos") === puesto}
              onClick={() =>
                update({ puesto: puesto === "todos" ? null : puesto })
              }
            >
              {PUESTO_LABEL[puesto]}
            </SegButton>
          ))}
        </Segmented>

        {options.length > 0 && (
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            Compañero
            <select
              value={selectedCompanionValue(options, params.companero)}
              onChange={(event) =>
                update({ companero: parseCompanero(event.target.value) })
              }
              className="min-w-0 cursor-pointer rounded-md border border-line bg-surface-1 py-2 pr-2 pl-3 text-sm text-foreground"
            >
              <option value="">Todos</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Sin partidas, el aviso de «Ninguna partida…» ya lo dice: no se repite con un «0 partidas». */}
      {matches.total > 0 && (
        <p className="mb-3 text-[13px] text-muted-foreground">
          {matchCountText(matches.total, rows.length, filtered)}
        </p>
      )}

      {params.partida !== null && detail === null && (
        <Notice role="status" icon="!" className="mb-3">
          No se encontró esa partida: no es de este perfil o queda fuera de la
          temporada.
        </Notice>
      )}

      {pinned && (
        // El aviso también debe quedar a la vista al traerla: el scroll apunta al bloque entero.
        <div data-scroll-target className="mb-3 scroll-mt-24">
          <p className="mb-1.5 text-[13px] text-muted-foreground">
            Partida abierta · no está en la lista de abajo (filtros o más
            antigua).
          </p>
          <ul className="grid gap-2">{item(pinned.row, false)}</ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
          {filtered ? "Ninguna partida con estos filtros." : "Ninguna partida."}
          {filtered && (
            <>
              {" "}
              <Btn
                size="small"
                variant="trust"
                onClick={() => {
                  clearTimeout(timer.current);
                  setDraft("");
                  navigate(withoutFilters(params));
                }}
              >
                Quitar filtros
              </Btn>
            </>
          )}
        </p>
      ) : (
        <ul aria-label="Partidas de la temporada" className="grid gap-2">
          {rows.map((row) => item(row, true))}
        </ul>
      )}

      {rows.length < matches.total && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {matches.limit < matchListLimit(MAX_BLOCKS) ? (
            <Btn onClick={() => navigate(withMoreBlocks(params))}>
              Mostrar {Math.min(BLOCK_SIZE, matches.total - rows.length)} más
            </Btn>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              Se muestran las {rows.length} más recientes: usa los filtros para
              acotar.
            </span>
          )}
        </div>
      )}

      <ToastRegion>{toast}</ToastRegion>
    </div>
  );
}

// --- Fila --------------------------------------------------------------------------------

/** «★ nuevo 1º»: la partida que verifica al campeón. Texto además del color. */
function NewFirst() {
  return (
    <span className="flex-none rounded-full border border-won-deep px-[7px] py-px font-mono text-[11px] whitespace-nowrap text-place-1">
      ★ nuevo 1º
    </span>
  );
}

function MatchItem({
  row,
  open,
  detail,
  href,
  championUrl,
  now,
  inList,
  onCopyLink,
}: {
  row: MatchRowData;
  open: boolean;
  /** Solo la partida abierta trae detalle. */
  detail: MatchDetailView | null;
  /** Abre esta partida, o la cierra si ya está abierta. */
  href: string;
  /** Abre el panel del campeón de la fila (`?campeon=`), sin tocar la partida abierta. */
  championUrl: string;
  now: number;
  /** Está en la lista (no en el bloque aparte de arriba): si además está abierta, el scroll la trae a la vista. */
  inList: boolean;
  onCopyLink: () => void;
}) {
  const detailId = useId();
  const when = formatRelative(row.gameCreation, now);
  return (
    <li
      data-scroll-target={open && inList ? "" : undefined}
      // `scroll-mt`: al traerla a la vista, la fila no debe quedar bajo el header pegajoso.
      className="scroll-mt-24 rounded-lg border border-line bg-surface-1"
    >
      {/* Un enlace dentro de otro no vale: la fila es un enlace estirado sobre todo su contenido
          (`absolute inset-0`, con el nombre accesible entero) y el retrato y el nombre del campeón
          son enlaces aparte, por encima (`z-10`), que abren su panel. El del retrato queda fuera del
          orden del teclado: el nombre ya lleva al mismo sitio. */}
      <div className="relative grid grid-cols-[40px_30px_minmax(0,1fr)_auto_16px] items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2 @max-[640px]:grid-cols-[36px_28px_minmax(0,1fr)_16px] @max-[640px]:gap-2.5 @max-[640px]:px-2.5">
        <Link
          // Sin prefetch: cada vista de la partida es dinámica y consulta la BD, y la lista trae 50.
          prefetch={false}
          scroll={false}
          href={href}
          aria-expanded={open}
          aria-controls={open && detail ? detailId : undefined}
          aria-label={matchRowLabel(row, now)}
          // El tooltip del trío (con los tags) va aquí: el enlace estirado tapa el texto de debajo.
          title={row.trio.length > 0 ? trioTitle(row.trio) : undefined}
          className="absolute inset-0 rounded-lg"
        />
        <Link
          prefetch={false}
          scroll={false}
          href={championUrl}
          tabIndex={-1}
          aria-hidden="true"
          className="relative z-10 rounded-md"
        >
          <ChampionThumb
            championId={row.championId}
            name={row.championName}
            portraitUrl={row.portraitUrl}
            size="row"
          />
        </Link>
        <PlaceChip
          placement={row.placement}
          className="size-[30px] text-[15px] @max-[640px]:size-7"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <b className="min-w-0 truncate font-medium">
              <Link
                prefetch={false}
                scroll={false}
                href={championUrl}
                className="relative z-10 hover:underline"
              >
                {row.championName}
              </Link>
            </b>
            {row.newFirst && <NewFirst />}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {trioText(row.trio)}
          </span>
          {/* Sin sitio a la derecha, la duración y el «hace cuánto» bajan bajo el nombre. */}
          <span className="hidden text-xs text-muted-foreground @max-[640px]:block">
            {formatDuration(row.gameDuration)} · {when}
          </span>
        </span>
        <span className="text-right text-[13px] whitespace-nowrap text-muted-foreground @max-[640px]:hidden">
          {formatDuration(row.gameDuration)}
          <br />
          {when}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className={open ? "rotate-180 text-foreground" : "text-faint"}
        />
      </div>
      {open && detail && (
        <MatchDetail id={detailId} detail={detail} onCopyLink={onCopyLink} />
      )}
    </li>
  );
}
