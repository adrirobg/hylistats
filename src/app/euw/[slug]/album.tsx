"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Btn } from "@/components/hy/btn";
import { Notice } from "@/components/hy/notice";
import { SegButton, Segmented } from "@/components/hy/segmented";
import type { AlbumEntry } from "@/domain/album";
import { type LocalState, profileData } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { localActions, useLocalStore } from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { AlbumCard, AlbumTable, type CardActions } from "./album-card";
import {
  type CardBox,
  type CardPart,
  isNavKey,
  navigateTo,
} from "./album-interaction";
import {
  type AlbumParams,
  type AlbumSection,
  albumSearch,
  albumSections,
  effectiveState,
  FILTRO_LABEL,
  FILTROS,
  ORDEN_LABEL,
  ORDENES,
  parseAlbumParams,
  resolveFiltro,
  type Vista,
  withQuery,
} from "./album-view";
import { useStamped } from "./use-stamped";

// Álbum de campeones (brief §4.4 y §4.5, `.controls`, `.band` y `.grid` de la maqueta): buscador,
// filtro segmentado, orden, vista álbum/lista y las bandas de cromos. Todo el estado de la vista
// vive en la URL (`?vista`, `?filtro`, `?q`, `?orden`; lógica en `album-view.ts`); lo único local
// es el texto del buscador mientras dura el debounce. Es cliente porque objetivos y marcas
// manuales viven en el navegador y solo cuentan en «mi perfil» (D12).
//
// Rangos (container queries sobre `.app`, como la cabina): por debajo de 640 px la rejilla baja a
// celdas de 64 px como mínimo (4 columnas a 375 px) y la lista oculta Top 3 y Medio; nada hace
// scroll horizontal.
//
// Interacción (T09, brief §4.4 y §7): en «mi perfil» cada cromo lleva la diana y el menú ⋯ (las
// acciones de `actions`), y `o` conmuta el objetivo del cromo enfocado. Las flechas, `Home` y `End`
// recorren los cromos también en perfiles ajenos. Un 1º nuevo entre dos renders sella su cromo
// (`use-stamped.ts`).

export interface AlbumProps {
  /** Forma canónica de Riot: con ella se decide si el perfil es «mi perfil». */
  gameName: string;
  tagLine: string;
  /** Todos los campeones del catálogo y los jugados ausentes de él (`buildAlbum`). */
  album: AlbumEntry[];
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
}

/** Espera tras la última pulsación antes de escribir la búsqueda en la URL. */
const DEBOUNCE_MS = 200;

const selectMyProfile = (state: LocalState) => state.myProfile;
/** Sin marcas: el mismo conjunto siempre, para que los `useMemo` no se invaliden. */
const NO_IDS: ReadonlySet<number> = new Set();

export function Album({ gameName, tagLine, album, nowMs }: AlbumProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow(nowMs);

  // «Mi perfil» se decide igual que en el header. Antes de leer `localStorage` (y en el servidor)
  // el estado local es el vacío, así que ahí no hay ni objetivos ni marcas.
  const norm = normalizeRiotId(gameName, tagLine);
  const myProfile = useLocalStore(selectMyProfile);
  const mine =
    myProfile !== null &&
    normalizeRiotId(myProfile.gameName, myProfile.tagLine) === norm;
  const selectData = useCallback(
    (state: LocalState) => profileData(state, norm),
    [norm],
  );
  const localData = useLocalStore(selectData);
  const targets = useMemo(
    () => (mine ? new Set(localData.targets) : NO_IDS),
    [mine, localData.targets],
  );
  const manual = useMemo(
    () => (mine ? new Set(localData.manual) : NO_IDS),
    [mine, localData.manual],
  );

  // --- Acciones de los cromos (solo «mi perfil») ---
  // Conmutar un objetivo o marcar a mano puede mudar el cromo de banda, y entonces React lo
  // remonta: el elemento enfocado desaparece. Se anota qué parte de qué campeón debe recuperar el
  // foco y `useLayoutEffect` (tras cada render, antes de pintar) lo busca por `data-champion-id`.
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<{ championId: number; part: CardPart } | null>(
    null,
  );
  const actions = useMemo<CardActions | null>(() => {
    if (!mine) return null;
    return {
      toggleTarget: (championId, part) => {
        focusAfter.current = { championId, part };
        localActions.toggleTarget(norm, championId);
      },
      setManual: (championId, on) => {
        focusAfter.current = { championId, part: "menu" };
        localActions.setManual(norm, championId, on);
      },
    };
  }, [mine, norm]);

  useLayoutEffect(() => {
    const pending = focusAfter.current;
    if (!pending) return;
    focusAfter.current = null;
    const card = rootRef.current?.querySelector<HTMLElement>(
      `[data-champion-id="${pending.championId}"]`,
    );
    const element =
      pending.part === "card"
        ? card
        : card?.querySelector<HTMLElement>(
            `[data-card-part="${pending.part}"]`,
          );
    if (element && element !== document.activeElement) element.focus();
  });

  // Cromos que se sellan ahora: los verificados que llegan con el polling o un refresco.
  const stamped = useStamped(album, norm);

  // --- URL y buscador ---
  const urlParams = useMemo(
    () => parseAlbumParams(searchParams),
    [searchParams],
  );
  const urlFiltro = resolveFiltro(urlParams.filtro, {
    mine,
    hasTargets: targets.size > 0,
  });

  // El texto del buscador vive aquí mientras se teclea; la URL lo recibe con un debounce. Si la
  // URL cambia por otro lado (atrás/adelante, un enlace) y no se está tecleando, el texto la sigue.
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(urlParams.q);
  const [typing, setTyping] = useState(false);
  const [seenUrlQ, setSeenUrlQ] = useState(urlParams.q);
  if (seenUrlQ !== urlParams.q) {
    setSeenUrlQ(urlParams.q);
    if (!typing) setDraft(urlParams.q);
  }

  // Parámetros que se ven: la URL con el texto del buscador ya aplicado (buscar pasa a «Todos»).
  const live = useMemo(
    () => withQuery(urlParams, draft, urlFiltro),
    [urlParams, draft, urlFiltro],
  );
  const filtro = resolveFiltro(live.filtro, {
    mine,
    hasTargets: targets.size > 0,
  });

  function navigate(next: AlbumParams) {
    const query = albumSearch(next, searchParams);
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  }
  const update = (patch: Partial<AlbumParams>) =>
    navigate({ ...live, ...patch });

  // El temporizador del debounce lee siempre lo último renderizado.
  const latest = useRef({ navigate, urlParams, urlFiltro });
  useEffect(() => {
    latest.current = { navigate, urlParams, urlFiltro };
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onQueryChange(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { navigate, urlParams, urlFiltro } = latest.current;
      navigate(withQuery(urlParams, value, urlFiltro));
    }, DEBOUNCE_MS);
  }

  // `/` (fuera de los campos de texto) enfoca el buscador.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const { target } = event;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Con el foco en un cromo o en sus botones: `o` conmuta su objetivo (solo «mi perfil»); las
  // flechas, `Home` y `End` pasan a otro cromo. Fuera de los cromos no hace nada (campos de
  // texto, controles, el menú ⋯: su popover vive en un portal) y sin trampas de foco: si no hay
  // a dónde ir se deja al navegador (scroll con ↑ y ↓).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      const card = target.closest<HTMLElement>("[data-champion-id]");
      if (!card) return;

      if (event.key === "o" || event.key === "O") {
        if (!actions || event.repeat) return;
        event.preventDefault();
        actions.toggleTarget(Number(card.dataset.championId), "card");
        return;
      }
      if (!isNavKey(event.key)) return;

      const cards = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(
          "li[data-champion-id]",
        ) ?? [],
      );
      const groups = new Map<Element | null, number>();
      const boxes: CardBox[] = cards.map((element) => {
        const { left, top, width } = element.getBoundingClientRect();
        const group = groups.get(element.parentElement) ?? groups.size;
        groups.set(element.parentElement, group);
        return { left, top, width, group };
      });
      const from = cards.indexOf(card);
      const to = navigateTo(boxes, from, event.key);
      if (from === -1 || to === from) return;
      event.preventDefault();
      cards[to].focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actions]);

  const sections = useMemo(
    () => albumSections(album, { targets, manual }, { ...live, filtro }),
    [album, targets, manual, live, filtro],
  );

  // Sin catálogo (Data Dragon caído) solo salen los campeones jugados y sin retrato.
  const catalogMissing =
    album.length > 0 && album.every((e) => e.ddId === null);
  // Objetivos y marcas solo existen en «mi perfil»: en el resto no se ofrece ese filtro.
  const filtros = FILTROS.filter((f) => mine || f !== "objetivos");

  return (
    // `min-w-0`: la tabla ancha no debe ensanchar la columna del panel (que es una rejilla).
    <div ref={rootRef} className="min-w-0">
      {catalogMissing && (
        <Notice role="status" icon="!" className="mb-4">
          No se pudo cargar el catálogo de campeones (Data Dragon): solo se
          muestran los que has jugado, sin retratos. Se reintenta solo.
        </Notice>
      )}

      <div className="mb-[18px] flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <label className="relative max-w-[320px] min-w-0 flex-[1_1_220px]">
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute top-1/2 left-[11px] -translate-y-1/2 text-faint"
          />
          <input
            ref={inputRef}
            type="search"
            value={draft}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Buscar campeón…"
            aria-label="Buscar campeón"
            autoComplete="off"
            className="w-full rounded-md border border-line bg-surface-1 py-[9px] pr-10 pl-[34px] [&::-webkit-search-cancel-button]:appearance-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border border-line px-[5px] font-mono text-[11px] text-faint @max-[640px]:hidden">
            /
          </kbd>
        </label>

        <Segmented label="Filtro">
          {filtros.map((f) => (
            <SegButton
              key={f}
              pressed={f === filtro}
              tone={f === "objetivos" ? "target" : "gold"}
              onClick={() => update({ filtro: f })}
            >
              {FILTRO_LABEL[f]}
            </SegButton>
          ))}
        </Segmented>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Orden
          <select
            value={live.orden}
            onChange={(event) =>
              update({
                orden:
                  ORDENES.find((o) => o === event.target.value) ?? "estado",
              })
            }
            className="cursor-pointer rounded-md border border-line bg-surface-1 py-2 pr-2 pl-3 text-sm text-foreground"
          >
            {ORDENES.map((o) => (
              <option key={o} value={o}>
                {ORDEN_LABEL[o]}
              </option>
            ))}
          </select>
        </label>

        <Segmented label="Vista">
          <SegButton
            pressed={live.vista === "album"}
            onClick={() => update({ vista: "album" })}
          >
            <LayoutGrid aria-hidden="true" size={16} />
            <span className="@max-[640px]:sr-only">Álbum</span>
          </SegButton>
          <SegButton
            pressed={live.vista === "lista"}
            onClick={() => update({ vista: "lista" })}
          >
            <List aria-hidden="true" size={16} />
            <span className="@max-[640px]:sr-only">Lista</span>
          </SegButton>
        </Segmented>
      </div>

      {sections.map((section) => (
        <Band
          key={section.key}
          section={section}
          vista={live.vista}
          targets={targets}
          manual={manual}
          now={now}
          stamped={stamped}
          actions={actions}
          onShowAll={() => update({ filtro: "todos" })}
        />
      ))}
    </div>
  );
}

// --- Bandas ------------------------------------------------------------------------------

const TONE_CLASS: Record<AlbumSection["tone"], string> = {
  target: "text-target",
  won: "text-place-1",
  neutral: "",
};

function Band({
  section,
  vista,
  targets,
  manual,
  now,
  stamped,
  actions,
  onShowAll,
}: {
  section: AlbumSection;
  vista: Vista;
  targets: ReadonlySet<number>;
  manual: ReadonlySet<number>;
  now: number;
  stamped: ReadonlySet<number>;
  actions: CardActions | null;
  onShowAll: () => void;
}) {
  const titleId = useId();
  const rows = section.entries.map((entry) => ({
    entry,
    state: effectiveState(entry, manual),
    target: targets.has(entry.championId),
  }));

  return (
    <section
      aria-labelledby={section.title ? titleId : undefined}
      className="mb-[22px]"
    >
      {section.title && (
        <div className="mb-2.5 flex items-baseline gap-2.5 after:flex-1 after:-translate-y-1 after:border-b after:border-line after:content-['']">
          <h3
            id={titleId}
            className={cn(
              "font-display text-[17px] font-bold tracking-[0.12em] uppercase",
              TONE_CLASS[section.tone],
            )}
          >
            {section.title}
          </h3>
          <span className="num font-mono text-[13px] text-faint">
            {rows.length}
          </span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
          {section.empty}
          {section.key === "objetivos" && (
            <>
              {" "}
              <Btn size="small" variant="trust" onClick={onShowAll}>
                Ver todos
              </Btn>
            </>
          )}
        </p>
      ) : vista === "lista" ? (
        <AlbumTable rows={rows} now={now} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2.5 gap-y-3 @max-[640px]:grid-cols-[repeat(auto-fill,minmax(64px,1fr))]">
          {rows.map(({ entry, state, target }) => (
            <AlbumCard
              key={entry.championId}
              entry={entry}
              state={state}
              target={target}
              stamp={stamped.has(entry.championId)}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
