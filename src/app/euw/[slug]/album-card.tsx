import { Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { AlbumEntry } from "@/domain/album";
import type { HeatState } from "@/domain/heat";
import { formatDecimal, formatPercent, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type CardPart,
  cardMenuContent,
  manualActionFor,
} from "./album-interaction";
import {
  type CardState,
  cardLabel,
  cardSub,
  cardTitle,
  effectiveHeat,
  HEAT_LABEL,
} from "./album-view";
import { CardMenu } from "./card-menu";
import { initials } from "./view-model";

// Cromo del álbum (brief §4.4, `.card` de la maqueta) y su versión en fila para la vista lista.
// Las tres dimensiones se distinguen por forma además de por color: sello «1º» (verificado), lápiz
// (manual), diana (objetivo) y saturación del retrato (jugado / sin jugar). El estado que llega ya
// es el efectivo (`effectiveState`); aquí solo se pinta. Solo en «mi perfil» (`actions`) el cromo
// lleva la diana y la marca manual; el menú ⋯ sale en todos los cromos, también en un perfil ajeno,
// con los enlaces de builds (T08).
// El cromo verificado enlaza a la partida de su primer 1º (F7): el sello «1º» en la vista álbum y
// «ver partida» en la lista (`matchHref`). Un clic (o Enter) en el cromo, o en la fila de la lista,
// abre el panel del campeón (`?campeon=`, `opener`): los controles de dentro (diana, ⋯, sello y
// «ver partida») paran su clic para no abrirlo.

/** Retrato: borde y filtro por estado (`.s-won`, `.s-manual`, `.s-played` y `.s-none`). */
const PORTRAIT_STATE: Record<CardState, string> = {
  won: "border-place-1 shadow-[0_0_0_1px_var(--won-deep),0_6px_18px_-8px_rgba(232,182,76,.55)]",
  manual: "border-dashed border-trust",
  played: "border-transparent saturate-[.25] brightness-[.62]",
  none: "border-dashed border-line saturate-0 brightness-[.26]",
};

/** Tono estable por campeón para el degradado de las iniciales (`--h` de la maqueta). */
const hueOf = (championId: number) => (championId * 137) % 360;

/**
 * Retrato cuadrado de Data Dragon. Debajo lleva siempre las iniciales sobre un degradado: son el
 * marcador mientras carga la imagen y el retrato si no hay (catálogo caído o campeón ausente).
 * `size` es el de la fila de la lista; el cromo ocupa todo el ancho de su celda.
 */
export function Portrait({
  entry,
  state,
  target,
  size = "card",
}: {
  entry: AlbumEntry;
  state: CardState;
  target: boolean;
  size?: "card" | "row";
}) {
  const radius = size === "card" ? "rounded-md" : "rounded";
  return (
    // El anillo de objetivo va en el contenedor: el filtro de «jugado» y «sin jugar» (en la capa
    // de dentro) lo oscurecería hasta hacerlo invisible.
    <span
      className={cn(
        "relative block aspect-square",
        size === "card"
          ? "w-full transition-transform group-hover:-translate-y-0.5"
          : "size-8 flex-none",
        radius,
        target && "outline-2 outline-offset-2 outline-target",
      )}
    >
      <span
        style={{ "--h": hueOf(entry.championId) } as CSSProperties}
        className={cn(
          "absolute inset-0 overflow-hidden bg-[radial-gradient(120%_90%_at_30%_20%,hsl(var(--h)_45%_46%),hsl(calc(var(--h)_+_40)_40%_18%)_70%)] transition-[filter,border-color] duration-300",
          size === "card" ? "border-2" : "border",
          radius,
          PORTRAIT_STATE[state],
          // Sellado de un 1º nuevo: el retrato pasa de gris a color (`.stamp` lo pone el cromo).
          "group-[.stamp]:animate-stamp",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 grid place-items-center bg-[repeating-linear-gradient(115deg,rgba(255,255,255,.06)_0_2px,transparent_2px_9px)] font-display font-extrabold tracking-[0.02em] text-white/90 [text-shadow:0_2px_8px_rgba(0,0,0,.4)]",
            size === "card" ? "text-[30px]" : "text-xs",
          )}
        >
          {initials(entry.name)}
        </span>
        {entry.portraitUrl && (
          <Image
            src={entry.portraitUrl}
            alt={entry.name}
            width={120}
            height={120}
            loading="lazy"
            draggable={false}
            // Si la imagen no llega (red, versión retirada) quedan las iniciales de debajo.
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </span>
    </span>
  );
}

/** Diana (◎): anillo con punto, la de la maqueta. */
export function TargetGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  );
}

/**
 * Marca de frío/calor (F16) en la esquina inferior izquierda del retrato: la superior izquierda es
 * la diana, la superior derecha el sello o el lápiz y la inferior derecha el ⋯. El neutral no
 * pinta nada. El texto accesible es el nombre visible ("Modo diablo" / "Nevera").
 */
function HeatMark({ heat }: { heat: HeatState }) {
  const label = HEAT_LABEL[heat];
  if (label === null) return null;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="absolute bottom-1 left-1 grid size-[22px] place-items-center rounded-full bg-[rgba(15,16,19,.72)] text-[12px] leading-none"
    >
      {heat === "hot" ? "🔥" : "❄️"}
    </span>
  );
}

/** Lo que el cromo puede pedir a «mi perfil» (`album.tsx` lo cablea al almacén del navegador). */
export interface CardActions {
  /** `part`: qué parte del cromo recupera el foco si el cambio lo mueve de banda. */
  toggleTarget: (championId: number, part: CardPart) => void;
  setManual: (championId: number, on: boolean) => void;
}

/** Cómo se abre el panel de un campeón (`album.tsx` lo cablea a la URL). */
export interface ChampionOpener {
  /** URL del panel (`?campeon={slug}`), conservando el resto de la query. */
  href: (entry: AlbumEntry) => string;
  /** Abre el panel sin saltar de scroll. */
  open: (entry: AlbumEntry) => void;
}

export interface AlbumCardProps {
  entry: AlbumEntry;
  /** Estado efectivo: `manual` solo en «mi perfil»; un verificado es siempre `won`. */
  state: CardState;
  /** Objetivo (capa ortogonal al estado); solo en «mi perfil». */
  target: boolean;
  /** Es un 1º nuevo: durante unos instantes el cromo se «sella» (`.stamp`). */
  stamp?: boolean;
  /** `null` fuera de «mi perfil» (D12): ni diana, ni marca manual, ni atajo `o` (el ⋯ solo con builds). */
  actions: CardActions | null;
  /** Enlace a una partida (`matchHref`): con él, el sello del cromo verificado abre su primer 1º. */
  matchHref?: (matchId: string) => string;
  /** Abre el panel del campeón con un clic o Enter en el cromo. */
  opener?: ChampionOpener;
}

/** Diana de la esquina: visible en hover, foco o si ya es objetivo. Conmuta sin abrir nada. */
function TargetButton({
  name,
  target,
  onToggle,
}: {
  name: string;
  target: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-card-part="target"
      aria-pressed={target}
      aria-label={`${target ? "Quitar objetivo" : "Marcar como objetivo"}: ${name}`}
      onClick={(event) => {
        // El clic no debe llegar al cromo: abriría el panel del campeón.
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "absolute top-1 left-1 grid size-[26px] cursor-pointer place-items-center rounded-full transition-opacity",
        target
          ? "bg-target text-[#1a0d06]"
          : "bg-[rgba(15,16,19,.72)] text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100",
      )}
    >
      <TargetGlyph />
    </button>
  );
}

export function AlbumCard({
  entry,
  state,
  target,
  stamp = false,
  actions,
  matchHref,
  opener,
}: AlbumCardProps) {
  const menu = cardMenuContent(
    entry.ddId,
    entry.name,
    actions ? manualActionFor(state) : "none",
  );
  const sealClass =
    "absolute -top-1.5 -right-1.5 grid size-[30px] -rotate-12 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#F6D88A,var(--place-1)_55%,var(--won-deep))] font-display text-[13px] font-extrabold text-[#231906] shadow-[0_2px_6px_rgba(0,0,0,.5)] group-[.stamp]:animate-seal-in";
  return (
    // Focusable para el teclado y los lectores: Enter (con el foco en el propio cromo, no en sus
    // botones) o un clic abren el panel del campeón. `data-champion-id` permite reponer el foco y
    // recorrer los cromos con las flechas (`album.tsx`).
    <li
      // biome-ignore lint/a11y/noNoninteractiveTabindex: el cromo se recorre con Tab y lleva su descripción completa en aria-label.
      tabIndex={0}
      data-champion-id={entry.championId}
      aria-label={cardLabel(entry, state, target)}
      title={cardTitle(entry, state)}
      onClick={opener && (() => opener.open(entry))}
      onKeyDown={
        opener &&
        ((event) => {
          if (event.key !== "Enter" || event.target !== event.currentTarget) {
            return;
          }
          event.preventDefault();
          opener.open(entry);
        })
      }
      className={cn(
        // `scroll-mt`: al enfocar con las flechas o `o`, el cromo no debe quedar bajo el header pegajoso.
        "group relative grid min-w-0 scroll-mt-24 gap-[5px] rounded-lg",
        opener && "cursor-pointer",
        stamp && "stamp",
      )}
    >
      {/* Ancla de las esquinas: el sello, el lápiz, la diana y el ⋯ se colocan sobre el retrato. */}
      <span className="relative block">
        <Portrait entry={entry} state={state} target={target} />
        {state === "won" &&
          (matchHref && entry.firstWinMatchId ? (
            <Link
              // Sin prefetch: la pestaña Partidas es dinámica y hay un sello por campeón ganado.
              prefetch={false}
              scroll={false}
              href={matchHref(entry.firstWinMatchId)}
              aria-label={`Ver la partida del primer 1º con ${entry.name}`}
              title="Ver la partida del primer 1º"
              // El clic no debe llegar al cromo: abriría el panel del campeón.
              onClick={(event) => event.stopPropagation()}
              className={sealClass}
            >
              1º
            </Link>
          ) : (
            <span aria-hidden="true" className={sealClass}>
              1º
            </span>
          ))}
        {state === "manual" && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 grid size-[26px] place-items-center rounded-full border border-trust bg-trust-bg text-trust"
          >
            <Pencil size={13} strokeWidth={2.2} />
          </span>
        )}
        {actions ? (
          <TargetButton
            name={entry.name}
            target={target}
            onToggle={() => actions.toggleTarget(entry.championId, "target")}
          />
        ) : (
          target && (
            <span
              aria-hidden="true"
              className="absolute top-1 left-1 grid size-[26px] place-items-center rounded-full bg-target text-[#1a0d06]"
            >
              <TargetGlyph />
            </span>
          )
        )}
        <HeatMark heat={effectiveHeat(entry, state)} />
        {/* El ⋯ va en todos los cromos (builds); la marca manual solo en «mi perfil» y sin verificar. */}
        {menu && (
          <CardMenu
            name={entry.name}
            content={menu}
            onConfirm={() =>
              actions?.setManual(entry.championId, menu.manual === "mark")
            }
          />
        )}
      </span>
      <span
        className={cn(
          "text-[13px] leading-[1.2] font-medium [overflow-wrap:anywhere]",
          state === "none" && "text-faint",
        )}
      >
        {entry.name}
      </span>
      <span className="font-mono text-xs leading-[1.2] text-muted-foreground">
        {cardSub(entry, state)}
      </span>
    </li>
  );
}

// --- Vista lista -------------------------------------------------------------------------

const STATE_TEXT: Record<CardState, { label: string; className?: string }> = {
  won: { label: "Ganado", className: "text-place-1" },
  manual: { label: "Manual", className: "text-trust" },
  played: { label: "Jugado" },
  none: { label: "Sin jugar" },
};

/**
 * «Ganado ◎ · ver partida»: el estado en texto, la diana si es objetivo (la forma, además del
 * color) y, en un verificado, el enlace a la partida de su primer 1º.
 */
function StateLabel({
  state,
  target,
  matchUrl,
}: {
  state: CardState;
  target: boolean;
  /** Destino de «ver partida»; `null` si no hay (no verificado, o sin enlaces). */
  matchUrl: string | null;
}) {
  return (
    <>
      {STATE_TEXT[state].label}
      {target && (
        <span className="ml-1.5 inline-block align-middle text-target">
          <TargetGlyph size={12} />
        </span>
      )}
      {state === "won" && matchUrl && (
        <>
          {" · "}
          <Link
            prefetch={false}
            scroll={false}
            href={matchUrl}
            className="text-foreground underline underline-offset-2"
          >
            ver partida
          </Link>
        </>
      )}
    </>
  );
}

const TH =
  "border-b border-line bg-surface-1 px-3 py-2.5 text-right text-xs font-medium tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase first:text-left @max-[640px]:px-1.5";
const TD =
  "px-3 py-2.5 text-right whitespace-nowrap first:text-left @max-[640px]:px-1.5";
/** Top 3, Medio y la columna Estado se ocultan en pantallas estrechas (brief §7): la fila sigue cabiendo. */
const NARROW_HIDDEN = "@max-[640px]:hidden";

export interface AlbumRow {
  entry: AlbumEntry;
  state: CardState;
  target: boolean;
}

/** Tabla densa: campeón, estado, partidas, 1º, top 3, puesto medio y último jugado. */
export function AlbumTable({
  rows,
  now,
  matchHref,
  opener,
}: {
  rows: AlbumRow[];
  now: number;
  /** Enlace a una partida (`matchHref`): con él, «Ganado» lleva «ver partida». */
  matchHref?: (matchId: string) => string;
  /**
   * Abre el panel del campeón: el nombre es un enlace (el teclado y el clic medio) y un clic en
   * cualquier otra parte de la fila también lo abre.
   */
  opener?: ChampionOpener;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Campeón
            </th>
            <th scope="col" className={cn(TH, NARROW_HIDDEN)}>
              Estado
            </th>
            <th scope="col" className={TH}>
              <span className="@max-[640px]:hidden">Partidas</span>
              <span className="hidden @max-[640px]:inline">Part.</span>
            </th>
            <th scope="col" className={TH}>
              1º
            </th>
            <th scope="col" className={cn(TH, NARROW_HIDDEN)}>
              Top 3
            </th>
            <th scope="col" className={cn(TH, NARROW_HIDDEN)}>
              Medio
            </th>
            <th scope="col" className={TH}>
              Último
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, state, target }) => {
            const played = entry.games > 0;
            const matchUrl =
              matchHref && entry.firstWinMatchId
                ? matchHref(entry.firstWinMatchId)
                : null;
            return (
              <tr
                key={entry.championId}
                title={cardTitle(entry, state)}
                onClick={
                  opener &&
                  ((event) => {
                    // Los enlaces y botones de la fila (el nombre, «ver partida») hacen lo suyo.
                    if (
                      event.target instanceof Element &&
                      event.target.closest("a, button")
                    )
                      return;
                    opener.open(entry);
                  })
                }
                className={cn(
                  "border-b border-line last:border-b-0",
                  opener && "cursor-pointer hover:bg-surface-1",
                  state === "none" && "text-faint",
                )}
              >
                <td className={cn(TD, "whitespace-normal")}>
                  <span className="flex items-center gap-2.5">
                    <Portrait
                      entry={entry}
                      state={state}
                      target={target}
                      size="row"
                    />
                    <span className="min-w-0">
                      {opener ? (
                        <Link
                          // Sin prefetch: cada vista con el panel es dinámica y hay una fila por campeón.
                          prefetch={false}
                          scroll={false}
                          href={opener.href(entry)}
                          className="block [overflow-wrap:break-word] hover:underline"
                        >
                          {entry.name}
                        </Link>
                      ) : (
                        <span className="block [overflow-wrap:break-word]">
                          {entry.name}
                        </span>
                      )}
                      {/* En pantallas estrechas el estado baja bajo el nombre: la columna no cabe. */}
                      <span
                        className={cn(
                          "hidden text-xs @max-[640px]:block",
                          STATE_TEXT[state].className,
                        )}
                      >
                        <StateLabel
                          state={state}
                          target={target}
                          matchUrl={matchUrl}
                        />
                      </span>
                    </span>
                  </span>
                </td>
                <td
                  className={cn(
                    TD,
                    "text-xs",
                    NARROW_HIDDEN,
                    STATE_TEXT[state].className,
                  )}
                >
                  <StateLabel
                    state={state}
                    target={target}
                    matchUrl={matchUrl}
                  />
                </td>
                <td className={cn(TD, "num")}>{played ? entry.games : "-"}</td>
                <td className={cn(TD, "num")}>{played ? entry.firsts : "-"}</td>
                <td className={cn(TD, "num", NARROW_HIDDEN)}>
                  {played ? formatPercent(entry.top3 / entry.games, 0) : "-"}
                </td>
                <td className={cn(TD, "num", NARROW_HIDDEN)}>
                  {entry.avgPlacement === null
                    ? "-"
                    : formatDecimal(entry.avgPlacement)}
                </td>
                <td className={cn(TD, "num")}>
                  {entry.lastPlayedAt === null
                    ? "-"
                    : formatRelative(entry.lastPlayedAt, now)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
