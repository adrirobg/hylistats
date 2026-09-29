import { Pencil } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { AlbumEntry } from "@/domain/album";
import { formatDecimal, formatPercent, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type CardState, cardLabel, cardSub, cardTitle } from "./album-view";
import { initials } from "./view-model";

// Cromo del álbum (brief §4.4, `.card` de la maqueta) y su versión en fila para la vista lista.
// Las tres dimensiones se distinguen por forma además de por color: sello «1º» (verificado), lápiz
// (manual), diana (objetivo) y saturación del retrato (jugado / sin jugar). El estado que llega ya
// es el efectivo (`effectiveState`); aquí solo se pinta.

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

/** Diana (◎): anillo con punto, la de la maqueta. También la usará el botón de T09. */
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

export interface AlbumCardProps {
  entry: AlbumEntry;
  /** Estado efectivo: `manual` solo en «mi perfil»; un verificado es siempre `won`. */
  state: CardState;
  /** Objetivo (capa ortogonal al estado); solo en «mi perfil». */
  target: boolean;
}

export function AlbumCard({ entry, state, target }: AlbumCardProps) {
  return (
    // Focusable para el teclado y los lectores aunque aún no abra nada (el panel de campeón es #3);
    // T09 pone dentro los botones de diana y ⋯, que son controles propios.
    <li
      // biome-ignore lint/a11y/noNoninteractiveTabindex: el cromo se recorre con Tab y lleva su descripción completa en aria-label.
      tabIndex={0}
      aria-label={cardLabel(entry, state, target)}
      title={cardTitle(entry, state)}
      className="group relative grid min-w-0 gap-[5px] rounded-lg"
    >
      <Portrait entry={entry} state={state} target={target} />
      {state === "won" && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 grid size-[30px] -rotate-12 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#F6D88A,var(--place-1)_55%,var(--won-deep))] font-display text-[13px] font-extrabold text-[#231906] shadow-[0_2px_6px_rgba(0,0,0,.5)]"
        >
          1º
        </span>
      )}
      {state === "manual" && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 grid size-[26px] place-items-center rounded-full border border-trust bg-trust-bg text-trust"
        >
          <Pencil size={13} strokeWidth={2.2} />
        </span>
      )}
      {/* T09: aquí el botón de diana (atajo `o`, marca/quita el objetivo) y el menú ⋯ con
          «Marcar como ganado a mano». Hoy la diana solo se pinta si es objetivo. */}
      {target && (
        <span
          aria-hidden="true"
          className="absolute top-1 left-1 grid size-[26px] place-items-center rounded-full bg-target text-[#1a0d06]"
        >
          <TargetGlyph />
        </span>
      )}
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

/** «Ganado ◎»: el estado en texto y, si es objetivo, la diana (la forma, además del color). */
function StateLabel({ state, target }: { state: CardState; target: boolean }) {
  return (
    <>
      {STATE_TEXT[state].label}
      {target && (
        <span className="ml-1.5 inline-block align-middle text-target">
          <TargetGlyph size={12} />
        </span>
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
export function AlbumTable({ rows, now }: { rows: AlbumRow[]; now: number }) {
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
            return (
              <tr
                key={entry.championId}
                title={cardTitle(entry, state)}
                className={cn(
                  "border-b border-line last:border-b-0",
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
                      <span className="block [overflow-wrap:break-word]">
                        {entry.name}
                      </span>
                      {/* En pantallas estrechas el estado baja bajo el nombre: la columna no cabe. */}
                      <span
                        className={cn(
                          "hidden text-xs @max-[640px]:block",
                          STATE_TEXT[state].className,
                        )}
                      >
                        <StateLabel state={state} target={target} />
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
                  <StateLabel state={state} target={target} />
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
