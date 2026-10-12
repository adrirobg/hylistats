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
import { cn } from "@/lib/utils";

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
 * anuncien el texto cuando aparece. El toast de Actualizar del perfil no va aquí, sino encima de los
 * avisos de sincronización (`FloatingStack`).
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

/** Contenido que pinta algo (`null`, `undefined` y `false` no). */
const present = (node: ReactNode) =>
  node != null && node !== false && node !== "";

/**
 * Pila flotante de avisos (revisión v4 de la cabecera, `.toast` de `propuestas-v4.html`): fija abajo
 * a la derecha, de 340 px; por debajo de 640 px de viewport, de lado a lado con 12 px. Lleva el toast
 * efímero (`toast`) encima de un aviso persistente (`children`, un `FloatingNotice`). No empuja el
 * contenido: va en un portal sobre `<body>` (`useBody`). Es una sola región viva (`role="status"`)
 * que existe siempre (vacía si no hay nada) para que los lectores de pantalla anuncien lo que
 * aparece; el foco no se mueve a ella.
 */
export function FloatingStack({
  toast,
  children,
}: {
  /** Toast efímero (`useToast`); `null`: ninguno. */
  toast: ReactNode;
  /** Aviso persistente; `null`: ninguno. */
  children: ReactNode;
}) {
  const target = useBody();
  if (!target) return null;
  return createPortal(
    <output className="pointer-events-none fixed right-5 bottom-[calc(20px+env(safe-area-inset-bottom,0px))] z-30 flex w-[340px] flex-col items-end gap-2 max-[640px]:inset-x-3 max-[640px]:bottom-[calc(12px+env(safe-area-inset-bottom,0px))] max-[640px]:w-auto max-[640px]:items-stretch">
      {present(toast) && (
        <div className="pointer-events-auto max-w-full rounded-lg border border-won-deep bg-surface-2 px-4 py-2.5 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          {toast}
        </div>
      )}
      {children}
    </output>,
    target,
  );
}

/**
 * Aviso persistente de la pila (`FloatingStack`), que se puede cerrar con su ✕. Azul acero
 * (`trust`), como los avisos sobre la fiabilidad del dato, o neutro (`neutral`) para el progreso, que
 * no avisa de nada. Sin `icon` no hay marca a la izquierda. Quien lo usa decide cuándo vuelve tras
 * cerrarlo (`onClose`).
 */
export function FloatingNotice({
  tone = "trust",
  icon = null,
  onClose,
  children,
}: {
  tone?: "trust" | "neutral";
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const marked = present(icon);
  return (
    <div
      className={cn(
        "pointer-events-auto grid w-full gap-2.5 rounded-[10px] border py-3 pr-2.5 text-[13px] shadow-[0_12px_34px_rgba(0,0,0,.55)]",
        marked
          ? "grid-cols-[22px_minmax(0,1fr)_22px] pl-3"
          : "grid-cols-[minmax(0,1fr)_22px] pl-3.5",
        tone === "trust"
          ? "border-trust/35 bg-trust-bg"
          : "border-line bg-surface-1",
      )}
    >
      {marked && (
        <span
          aria-hidden="true"
          className="grid size-[22px] place-items-center rounded-full bg-trust font-mono text-[13px] font-bold text-background"
        >
          {icon}
        </span>
      )}
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
  );
}
