"use client";

import { Popover } from "@base-ui/react/popover";
import { type ReactNode, useId } from "react";
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

export interface BadgeProps {
  /** Nombre del badge, visible en el propio badge. */
  title: string;
  /** Cómo se consigue o qué significa; sale en el tooltip y lo lee el lector de pantalla. */
  description: string;
  /** Emblema decorativo a la izquierda del título (un icono de 14 px, por ejemplo). Opcional. */
  emblem?: ReactNode;
  className?: string;
}

/** Badge `.chip` dorado con tooltip accesible. */
export function Badge({ title, description, emblem, className }: BadgeProps) {
  const descriptionId = useId();
  return (
    <>
      <Popover.Root>
        <Popover.Trigger
          openOnHover
          delay={150}
          closeDelay={100}
          aria-describedby={descriptionId}
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
              aria-label={title}
              className="max-w-[calc(100vw-1rem)] w-64 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] outline-none"
            >
              <p className="font-display text-[13px] font-bold tracking-[0.1em] text-place-1 uppercase">
                {title}
              </p>
              <p className="mt-1 text-muted-foreground">{description}</p>
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
