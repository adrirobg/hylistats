"use client";

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
 * Región `role="status"` del toast (`.toast` de la maqueta), fija abajo al centro. Va en un
 * portal sobre `<body>`: los contenedores con `container-type` (como `.app` del perfil) son el
 * bloque contenedor de los `fixed` que llevan dentro. La región existe siempre (vacía) para que
 * los lectores de pantalla anuncien el texto cuando aparece.
 */
export function ToastRegion({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.body);
  }, []);
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
