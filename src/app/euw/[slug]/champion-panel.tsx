"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Box } from "@/components/hy/box";
import { Btn } from "@/components/hy/btn";
import type { AlbumEntry } from "@/domain/album";
import {
  CHIP_TEXT,
  formChipLabel,
  placeTone,
  TONE_BG,
} from "@/domain/scoreboard";
import { championLinks } from "@/lib/champion-links";
import { localActions } from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { Portrait, TargetGlyph } from "./album-card";
import {
  type ManualAction,
  manualActionFor,
  manualCopy,
} from "./album-interaction";
import { effectiveState } from "./album-view";
import {
  type ChampionPanelData,
  championFigures,
  championStatus,
  closeChampionHref,
  panelMatchHref,
} from "./champion-panel-view";
import { DistributionBar } from "./distribution-bar";
import { useProfileLocal } from "./use-profile-local";

// Panel de campeón (brief §3.6 y D9), `?campeon={slug}` sobre cualquier pestaña: estado, objetivo y
// marcado manual, cifras de la temporada, distribución 1º–6º, últimas partidas y enlaces «Builds y
// meta». Los datos llegan del servidor solo con `?campeon` (`ProfileView.champion`); las cifras y el
// estado salen del álbum.
//
// Es un `Dialog` de Base UI en portal sobre `<body>` (mismo motivo que `card-menu.tsx` y el toast:
// los `fixed` dentro de `.app` quedan contenidos por su `container-type`). Hoja lateral de 420 px
// a la derecha y, por debajo de 640 px de ventana, hoja inferior de hasta el 85 % de la altura. Base
// UI gestiona el foco (queda atrapado dentro), el fondo inerte y `Esc`. Al cerrar (Esc, ✕ o clic en
// el fondo) se cierra al momento y se quita `?campeon` con `router.replace`, sin saltar de scroll; el
// servidor deja de mandar `champion` y el panel se desmonta. El foco vuelve a lo que estaba enfocado
// al abrir (el cromo, el nombre de la fila…) o, si se abrió por URL, al `main`.
//
// Objetivo y marcado manual solo en «mi perfil» (D12): en uno ajeno no se ofrecen. No se anima la
// entrada de la hoja (prefers-reduced-motion).

export interface ChampionPanelProps {
  /** Forma canónica de Riot: con ella se decide si el perfil es «mi perfil». */
  gameName: string;
  tagLine: string;
  /** El campeón del álbum (cifras, retrato y estado de dominio). */
  entry: AlbumEntry;
  /** Distribución y últimas partidas (`ProfileView.champion`). */
  data: ChampionPanelData;
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
}

export function ChampionPanel({
  gameName,
  tagLine,
  entry,
  data,
  nowMs,
}: ChampionPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const now = useNow(nowMs);
  const { norm, mine, targets, manual } = useProfileLocal(gameName, tagLine);

  const [open, setOpen] = useState(true);
  // Lo que tenía el foco cuando se montó el panel (el cromo o el enlace que lo abrió; el `body` si
  // se abrió por URL). El servidor no tiene `document`: ahí no hay nadie a quien devolver el foco.
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );

  const state = effectiveState(entry, manual);
  const target = targets.has(entry.championId);
  const status = championStatus(entry, state, now);
  const figures = championFigures(entry);
  const links = championLinks(entry.ddId, entry.name);
  const manualAction = manualActionFor(state);

  function close() {
    setOpen(false);
    router.replace(closeChampionHref(pathname, search), { scroll: false });
  }

  /**
   * A dónde vuelve el foco al cerrar: el elemento que abrió el panel. `null` si no hay (se abrió
   * por URL, o el cromo ya no está): entonces va al `main`.
   */
  function returnTarget(): HTMLElement | null {
    if (!(opener instanceof HTMLElement) || opener === document.body) {
      return null;
    }
    if (opener.isConnected) return opener;
    // El cromo pudo remontarse al cambiar de banda (marcar a mano): se busca por su campeón.
    return document.querySelector<HTMLElement>(
      `li[data-champion-id="${entry.championId}"]`,
    );
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      // Base UI devuelve el foco al primer elemento *tabbable* del destino, y el `main` no lo es
      // (`tabIndex={-1}`): sin origen se le da el foco aquí, con la hoja ya fuera.
      onOpenChangeComplete={(next) => {
        if (!next && returnTarget() === null) {
          document.querySelector<HTMLElement>("main")?.focus({
            preventScroll: true,
          });
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45" />
        <Dialog.Popup
          finalFocus={() => returnTarget() ?? false}
          className={cn(
            // Hoja lateral: pegada a la derecha, de arriba abajo.
            "fixed top-0 right-0 bottom-0 z-50 grid w-[min(420px,100%)] content-start gap-4 overflow-x-hidden overflow-y-auto overscroll-contain border-l border-line bg-surface-1 p-5 pt-[calc(20px+env(safe-area-inset-top,0px))] pb-[calc(20px+env(safe-area-inset-bottom,0px))] outline-none",
            // Hoja inferior por debajo de 640 px de ventana (el portal está fuera de `.app`).
            "max-[640px]:top-auto max-[640px]:max-h-[85dvh] max-[640px]:w-full max-[640px]:rounded-t-[14px] max-[640px]:border-t max-[640px]:border-l-0",
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-[84px] flex-none">
              <Portrait entry={entry} state={state} target={target} />
            </div>
            <Dialog.Title className="min-w-0 font-display text-[34px] leading-none font-extrabold tracking-[0.02em] uppercase [overflow-wrap:anywhere]">
              {entry.name}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar panel"
              className="ml-auto grid size-[34px] flex-none cursor-pointer place-items-center self-start rounded-md border border-line hover:border-faint"
            >
              <X aria-hidden="true" size={18} />
            </Dialog.Close>
          </div>

          <p className="text-sm">
            <b
              className={cn(
                "font-semibold",
                status.tone === "won" && "text-place-1",
                status.tone === "manual" && "text-trust",
              )}
            >
              {status.label}
            </b>
            {status.detail !== null && ` · ${status.detail}`}
            {status.matchId !== null && (
              <>
                {" · "}
                <Link
                  // Sin prefetch: Partidas es dinámica. Sin `?campeon`: el panel taparía la partida.
                  prefetch={false}
                  scroll={false}
                  href={panelMatchHref(pathname, search, status.matchId)}
                  className="text-foreground underline underline-offset-2"
                >
                  ver partida
                </Link>
              </>
            )}
          </p>

          {mine && (
            <div className="flex flex-wrap gap-1.5">
              <Btn
                size="small"
                onClick={() =>
                  localActions.toggleTarget(norm, entry.championId)
                }
                className={target ? "border-target text-target" : undefined}
              >
                <TargetGlyph />
                {target ? "Objetivo · quitar" : "Marcar como objetivo"}
              </Btn>
              {manualAction !== "none" && (
                <ManualMark
                  name={entry.name}
                  action={manualAction}
                  onConfirm={() =>
                    localActions.setManual(
                      norm,
                      entry.championId,
                      manualAction === "mark",
                    )
                  }
                />
              )}
            </div>
          )}

          <Box title="Esta temporada" titleAs="h3">
            <dl className="grid grid-cols-4 gap-2">
              {figures.map((figure) => (
                <div key={figure.key} className="flex flex-col-reverse">
                  <dt className="mt-1 text-[11px] text-muted-foreground">
                    {figure.label}
                  </dt>
                  <dd
                    className={cn(
                      "font-display text-[28px] leading-none font-extrabold whitespace-nowrap",
                      figure.gold && "text-place-1",
                    )}
                  >
                    {figure.value.replace(/\s%$/, "%")}
                  </dd>
                </div>
              ))}
            </dl>
            {entry.games > 0 ? (
              <DistributionBar
                summary={{ distribution: data.distribution }}
                className="mt-3.5"
              />
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Aún no has jugado a {entry.name} esta temporada.
              </p>
            )}
          </Box>

          {data.recent.length > 0 && (
            <Box title="Últimas partidas" titleAs="h3">
              <ol
                aria-label={`Últimas partidas con ${entry.name}, la más reciente primero`}
                className="flex flex-wrap gap-[7px]"
              >
                {data.recent.map((game) => {
                  const label = formChipLabel(game, now);
                  const tone = placeTone(game.placement);
                  return (
                    <li key={game.matchId}>
                      <Link
                        // Sin prefetch: Partidas es dinámica y son hasta 10 enlaces.
                        prefetch={false}
                        scroll={false}
                        href={panelMatchHref(pathname, search, game.matchId)}
                        title={label}
                        aria-label={`${label} · abrir partida`}
                        className={cn(
                          "grid size-7 place-items-center rounded-full font-display text-[15px] leading-none font-extrabold",
                          TONE_BG[tone],
                          CHIP_TEXT[tone],
                        )}
                      >
                        {game.placement}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </Box>
          )}

          {links.length > 0 && (
            <Box title="Builds y meta" titleAs="h3">
              <ul className="flex flex-wrap gap-1.5">
                {links.map((link) => (
                  <li key={link.site}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.ariaLabel}
                      className="block rounded-full border border-line px-2.5 py-[5px] text-[13px] hover:border-faint"
                    >
                      {link.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </Box>
          )}

          {mine && (
            <p className="text-xs text-faint">
              Objetivos y marcas manuales se guardan solo en este navegador.
            </p>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// --- Marcado manual ----------------------------------------------------------------------

/**
 * «Marcar como ganado a mano…» / «Quitar marca manual…» con la misma confirmación en dos pasos que
 * el menú ⋯ del cromo (`card-menu.tsx`, textos de `manualCopy`). Aquí hay sitio, así que la
 * confirmación sale en el propio panel en lugar de en un popover.
 */
function ManualMark({
  name,
  action,
  onConfirm,
}: {
  name: string;
  action: Exclude<ManualAction, "none">;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Al confirmar o cancelar, el foco vuelve a la opción (la de la confirmación ya no existe).
  const restoreFocus = useRef(false);
  const copy = manualCopy(action, name);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      itemRef.current?.focus();
    }
  }, [confirming]);

  function finish() {
    restoreFocus.current = true;
    setConfirming(false);
  }

  if (!confirming) {
    return (
      <Btn
        ref={itemRef}
        size="small"
        variant="trust"
        onClick={() => setConfirming(true)}
      >
        {copy.item}
      </Btn>
    );
  }
  return (
    <div className="grid basis-full gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
      <p className="text-sm text-muted-foreground">{copy.question}</p>
      <div className="flex gap-1.5">
        <Btn
          ref={confirmRef}
          size="small"
          variant="trust"
          onClick={() => {
            finish();
            onConfirm();
          }}
        >
          {copy.confirm}
        </Btn>
        <Btn size="small" onClick={finish}>
          Cancelar
        </Btn>
      </div>
    </div>
  );
}
