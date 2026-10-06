"use client";

import { X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** Lo que dura el toast en pantalla (maqueta: 4,2 s). */
const TOAST_MS = 4_200;

/** Estado de un toast efímero: `show(contenido)` lo muestra y lo retira solo a los 4,2 s. */
export function useToast() {
  const [toast, setToast] = useState<ReactNode>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((content: ReactNode) => {
    clearTimeout(timer.current);
    setToast(content);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show };
}

/**
 * `<body>` tras montar (`null` en el servidor y en el primer render): destino de los portales de
 * los avisos fijos. Los contenedores con `container-type` (como `.app` del perfil) son el bloque
 * contenedor de los `fixed` que llevan dentro, así que estos avisos no pueden quedarse en el flujo.
 */
function useBody(): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.body);
  }, []);
  return target;
}

/**
 * Región `role="status"` del toast (`.toast` de la maqueta), fija abajo al centro, en un portal
 * sobre `<body>` (`useBody`). La región existe siempre (vacía) para que los lectores de pantalla
 * anuncien el texto cuando aparece.
 */
export function ToastRegion({ children }: { children: ReactNode }) {
  const target = useBody();
  if (!target) return null;
  return createPortal(
    <output className="pointer-events-none fixed inset-x-0 bottom-[calc(24px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-4">
      {children != null && children !== false && (
        <div className="pointer-events-auto max-w-full rounded-lg border border-won-deep bg-surface-2 px-4 py-2.5 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          {children}
        </div>
      )}
    </output>,
    target,
  );
}

/**
 * Aviso flotante que se puede cerrar (revisión v4 de la cabecera, `.toast` de
 * `propuestas-v4.html`): fijo abajo a la derecha, de 340 px; en pantallas estrechas, de lado a lado
 * con 12 px. Azul acero, como los avisos sobre la fiabilidad del dato. No empuja el contenido: va en
 * un portal sobre `<body>` (`useBody`). La región existe siempre (vacía si `children` es `null`)
 * para que los lectores de pantalla anuncien el aviso cuando aparece. Quien lo usa decide cuándo
 * vuelve tras cerrarlo (`onClose`).
 */
export function FloatingNotice({
  icon = "!",
  onClose,
  children,
}: {
  icon?: ReactNode;
  onClose: () => void;
  /** Contenido del aviso; `null` lo oculta. */
  children: ReactNode;
}) {
  const target = useBody();
  if (!target) return null;
  const open = children != null && children !== false;
  return createPortal(
    <output className="pointer-events-none fixed right-5 bottom-[calc(20px+env(safe-area-inset-bottom,0px))] z-30 w-[340px] max-[640px]:inset-x-3 max-[640px]:bottom-[calc(12px+env(safe-area-inset-bottom,0px))] max-[640px]:w-auto">
      {open && (
        <div className="pointer-events-auto grid grid-cols-[22px_minmax(0,1fr)_22px] gap-2.5 rounded-[10px] border border-trust/35 bg-trust-bg py-3 pr-2.5 pl-3 text-[13px] shadow-[0_12px_34px_rgba(0,0,0,.55)]">
          <span
            aria-hidden="true"
            className="grid size-[22px] place-items-center rounded-full bg-trust font-mono text-[13px] font-bold text-background"
          >
            {icon}
          </span>
          <div className="grid min-w-0 gap-1.5">{children}</div>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={onClose}
            className="grid size-[22px] cursor-pointer place-items-center rounded text-faint hover:bg-white/10 hover:text-foreground"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}
    </output>,
    target,
  );
}
