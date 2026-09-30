"use client";

import { Popover } from "@base-ui/react/popover";
import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/hy/btn";
import { type ManualAction, manualCopy } from "./album-interaction";

// Menú ⋯ del cromo (brief §3.6 y §4.4): marcar o quitar «ganado a mano», siempre confirmado. Es
// un popover de Base UI y no un `absolute` dentro del cromo por dos razones: la cabina recorta
// con `overflow-clip` (un menú en la última fila se cortaría) y los `fixed` dentro de `.app`
// quedan contenidos por su `container-type`. Base UI lo pinta en un portal sobre `<body>`, lo
// recoloca en los bordes de la ventana (cromos de la primera y la última columna), cierra con Esc,
// con un clic fuera o al sacar el foco, y devuelve el foco al ⋯.

/**
 * `action` viene de `manualActionFor`: para un verificado no se pinta el menú. `onConfirm` aplica
 * el cambio; el cromo que ve el usuario puede cambiar de banda (y remontarse), por eso quien lo
 * llama repone el foco por `championId`.
 */
export function CardMenu({
  name,
  action,
  onConfirm,
}: {
  name: string;
  action: Exclude<ManualAction, "none">;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Paso 1: la opción del menú. Paso 2: la confirmación ligera con el texto explicativo.
  const [confirming, setConfirming] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const copy = manualCopy(action, name);

  // Al pasar a la confirmación, el foco sigue al popover (la opción que lo tenía ya no existe).
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setConfirming(false);
      }}
    >
      <Popover.Trigger
        data-card-part="menu"
        aria-label={`Más acciones: ${name}`}
        // El clic no debe llegar al cromo: abriría el panel del campeón.
        onClick={(event) => event.stopPropagation()}
        className="absolute right-1 bottom-1 grid size-[26px] cursor-pointer place-items-center rounded-full bg-[rgba(15,16,19,.72)] text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100"
      >
        <Ellipsis aria-hidden="true" size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          collisionAvoidance={{ side: "flip", align: "shift" }}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={itemRef}
            aria-label={`Acciones de ${name}`}
            // Los clics del popup, que vive en un portal, burbujean por React hasta el cromo.
            onClick={(event) => event.stopPropagation()}
            className="w-60 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface-2 p-1.5 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] outline-none"
          >
            {confirming ? (
              <div className="grid gap-2.5 p-1.5">
                <Popover.Description className="text-muted-foreground">
                  {copy.question}
                </Popover.Description>
                <div className="flex gap-1.5">
                  <Btn
                    ref={confirmRef}
                    size="small"
                    variant="trust"
                    onClick={() => {
                      setOpen(false);
                      onConfirm();
                    }}
                  >
                    {copy.confirm}
                  </Btn>
                  <Btn size="small" onClick={() => setOpen(false)}>
                    Cancelar
                  </Btn>
                </div>
              </div>
            ) : (
              <button
                ref={itemRef}
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-surface-1"
              >
                {copy.item}
              </button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
