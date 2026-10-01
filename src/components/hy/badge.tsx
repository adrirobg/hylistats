"use client";

import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// Badge genérico: emblema + título, con la condición para conseguirlo en un tooltip accesible.
// No sabe nada de Arena: quien lo usa pone el texto y decide cuándo mostrarlo. Es la primera pieza
// del sistema de badges (iter-05).
//
// El tooltip es un popover de Base UI (el mismo que el menú ⋯ del cromo) y no `title`: se abre
// al pasar el ratón, al enfocar con el teclado y al pulsar (también en táctil, donde no hay
// hover), y se cierra con Esc. La descripción además está siempre en el DOM, oculta a la vista
// (`sr-only`) y enlazada con `aria-describedby`, así que el lector de pantalla la anuncia con el
// badge sin tener que abrir nada.
//
// Foco: el `Popover.Trigger` de Base UI no se abre al recibirlo (solo hover y clic/Enter), así que
// el estado `open` es controlado y `onFocus` lo abre cuando el foco llega por teclado
// (`:focus-visible`; el foco que deja un clic de ratón no cuenta, porque el propio clic ya
// alterna). Abierto así, el foco se queda en el badge (`initialFocus={false}`): Tab sigue hacia el
// enlace del popup, si lo hay, y al salir del badge y del popup se cierra solo.

export interface BadgeProps {
  /** Nombre del badge, visible en el propio badge. */
  title: string;
  /** Cómo se consigue o qué significa; sale en el tooltip y lo lee el lector de pantalla. */
  description: string;
  /** Emblema decorativo a la izquierda del título (un icono de 14 px, por ejemplo). Opcional. */
  emblem?: ReactNode;
  /** Enlace opcional al pie del tooltip (p. ej. a la explicación general); no entra en la descripción. */
  link?: { href: string; label: string };
  className?: string;
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** El siguiente elemento enfocable tras `from` en el orden del documento, fuera de `popup`. */
function tabbableAfter(from: HTMLElement, popup: HTMLElement | null) {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.getClientRects().length > 0 && !popup?.contains(el),
  );
  return all[all.indexOf(from) + 1] ?? null;
}

/** Badge `.chip` dorado con tooltip accesible. */
export function Badge({
  title,
  description,
  emblem,
  link,
  className,
}: BadgeProps) {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // `true` si el popup se cierra porque el foco se va a otro sitio: entonces no se le devuelve el
  // foco al badge (volvería a abrirse por `onFocus` y el foco no pasaría nunca al elemento siguiente).
  const focusLeftRef = useRef(false);

  function change(next: boolean, reason: string) {
    focusLeftRef.current = !next && reason === "focus-out";
    setOpen(next);
  }

  // El foco que sale del badge hacia fuera del popup lo cierra; hacia el popup (su enlace), no.
  function onTriggerBlur(event: FocusEvent<HTMLButtonElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && popupRef.current?.contains(next)) return;
    change(false, "focus-out");
  }

  // El popup va en un portal al final del `<body>`: el Tab natural desde su enlace saltaría al
  // principio de la página. Se encauza a mano: Tab sigue con el elemento que viene tras el badge y
  // Shift+Tab vuelve al badge.
  function onPopupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const trigger = triggerRef.current;
    if (event.key !== "Tab" || !trigger) return;
    event.preventDefault();
    if (event.shiftKey) {
      trigger.focus();
      return;
    }
    focusLeftRef.current = true;
    tabbableAfter(trigger, popupRef.current)?.focus();
  }

  return (
    <>
      <Popover.Root
        open={open}
        onOpenChange={(next, details) => change(next, details.reason)}
      >
        <Popover.Trigger
          ref={triggerRef}
          openOnHover
          delay={150}
          closeDelay={100}
          aria-describedby={descriptionId}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) {
              change(true, "trigger-focus");
            }
          }}
          onBlur={onTriggerBlur}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-full border border-won-deep bg-[color-mix(in_srgb,var(--place-1)_10%,transparent)] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-place-1 hover:border-place-1 data-popup-open:border-place-1",
            className,
          )}
        >
          {emblem != null && (
            <span
              aria-hidden="true"
              className="grid flex-none place-items-center"
            >
              {emblem}
            </span>
          )}
          {title}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            collisionAvoidance={{ side: "flip", align: "shift" }}
            className="isolate z-50"
          >
            <Popover.Popup
              ref={popupRef}
              onKeyDown={onPopupKeyDown}
              initialFocus={false}
              finalFocus={() => !focusLeftRef.current}
              aria-label={title}
              className="max-w-[calc(100vw-1rem)] w-64 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] outline-none"
            >
              <p className="font-display text-[13px] font-bold tracking-[0.1em] text-place-1 uppercase">
                {title}
              </p>
              <p className="mt-1 text-muted-foreground">{description}</p>
              {link && (
                <Link
                  href={link.href}
                  className="mt-2 inline-block text-xs text-foreground underline decoration-line underline-offset-2 hover:decoration-foreground"
                >
                  {link.label}
                </Link>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
    </>
  );
}
