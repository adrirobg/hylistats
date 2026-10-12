"use client";

import { X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  type FloatingEntry,
  floatingLayout,
  foldedLabel,
} from "./floating-stack";

// Pila flotante global (revisión v5b, D8–D12): una sola para toda la app, abajo a la derecha (de
// lado a lado por debajo de 640 px), con los toasts efímeros encima de los avisos. Nada de lo que
// aparece solo ocupa sitio en la página: los avisos se registran desde cualquier componente con
// `FloatingItem` (que no pinta nada en su sitio) y los toasts salen con `useFloatingToast`. Qué se
// ve, qué se pliega en "+N avisos" y cuántos cerrados siguen activos lo decide `floating-stack.ts`.
//
// El proveedor va en el layout raíz y pinta la pila fuera de `.app`: los contenedores con
// `container-type` (como `.app` del perfil) son el bloque contenedor de los `fixed` que llevan
// dentro. Cada aviso a la vista tiene un hueco en la pila y su `FloatingItem` pinta en él por un
// portal: el contenido sigue en el árbol de quien lo registra (sus contextos, su estado). La pila es
// una sola región viva (`<output>`, `role="status"`) que existe siempre, vacía si no hay nada, para
// que los lectores de pantalla anuncien lo que aparece; el foco no se mueve a ella salvo al pedirlo
// (`reveal`).
//
// Cerrar un aviso vale para su `id` mientras siga registrado: si deja de estarlo (cambia el estado,
// se desmonta) se olvida y vuelve a salir la próxima vez. Con `remember` (una clave de
// `localStorage`) el cierre dura entre visitas: se guarda el `id`, que lleva la firma del estado, así
// que vuelve a salir cuando el estado cambia. Sin `localStorage` funciona igual, solo no recuerda.

/** Lo que dura el toast en pantalla (maqueta: 4,2 s). */
const TOAST_MS = 4_200;
/** Por debajo, móvil: un aviso a la vista y la pila de lado a lado. */
const MOBILE_QUERY = "(max-width: 640px)";

interface Registration extends FloatingEntry {
  /** Clave de `localStorage` del cierre; `null`: en memoria. */
  remember: string | null;
}

interface StackState {
  /** En el orden de registro. */
  entries: readonly Registration[];
  closed: readonly string[];
  mobile: boolean;
  /** El chip "+N avisos" desplegado. */
  expanded: boolean;
  /** `key`: un toast nuevo con el mismo texto se vuelve a anunciar. */
  toast: { content: ReactNode; key: number } | null;
  /** Hueco de cada aviso a la vista (el `div` donde pinta su `FloatingItem`). */
  slots: Readonly<Record<string, HTMLElement>>;
  /** Aviso al que llevar el foco cuando tenga hueco (`reveal`). */
  focus: string | null;
}

function readClosed(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeClosed(key: string, id: string | null) {
  try {
    if (id === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, id);
  } catch {
    // Sin `localStorage` (bloqueado, lleno): el cierre dura lo que la página.
  }
}

/** Estado de la pila fuera de React (`useSyncExternalStore`): uno por proveedor. */
function createStore() {
  let state: StackState = {
    entries: [],
    closed: [],
    mobile: false,
    expanded: false,
    toast: null,
    slots: {},
    focus: null,
  };
  const listeners = new Set<() => void>();
  const slotRefs = new Map<string, (element: HTMLElement | null) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let toastKey = 0;

  const set = (next: Partial<StackState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const layout = () =>
    floatingLayout({
      entries: state.entries,
      closed: state.closed,
      mobile: state.mobile,
    });
  const reopen = (ids: readonly string[]) => {
    for (const entry of state.entries) {
      if (entry.remember !== null && ids.includes(entry.id)) {
        writeClosed(entry.remember, null);
      }
    }
    set({ closed: state.closed.filter((id) => !ids.includes(id)) });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => state,
    register(entry: Registration) {
      const remembered =
        entry.remember !== null && readClosed(entry.remember) === entry.id;
      set({
        entries: [...state.entries.filter((e) => e.id !== entry.id), entry],
        closed:
          remembered && !state.closed.includes(entry.id)
            ? [...state.closed, entry.id]
            : state.closed,
      });
    },
    unregister(id: string) {
      set({
        entries: state.entries.filter((entry) => entry.id !== id),
        closed: state.closed.filter((closed) => closed !== id),
      });
    },
    close(id: string) {
      const entry = state.entries.find((e) => e.id === id);
      if (entry?.remember != null) writeClosed(entry.remember, id);
      if (!state.closed.includes(id)) set({ closed: [...state.closed, id] });
    },
    /** Reabre todos los cerrados que siguen registrados (indicador «!»). */
    reopenAll() {
      reopen(layout().closed);
    },
    /** Reabre el aviso si estaba cerrado, despliega el plegado si hace falta y le lleva el foco. */
    reveal(id: string) {
      if (!state.entries.some((entry) => entry.id === id)) return;
      reopen([id]);
      set({
        expanded: state.expanded || layout().folded.includes(id),
        focus: id,
      });
    },
    toggle() {
      set({ expanded: !state.expanded });
    },
    collapse() {
      if (state.expanded) set({ expanded: false });
    },
    focused() {
      set({ focus: null });
    },
    setMobile(mobile: boolean) {
      if (state.mobile !== mobile) set({ mobile });
    },
    show(content: ReactNode) {
      clearTimeout(timer);
      toastKey += 1;
      set({ toast: { content, key: toastKey } });
      timer = setTimeout(() => set({ toast: null }), TOAST_MS);
    },
    dispose() {
      clearTimeout(timer);
    },
    /**
     * `ref` del hueco de cada aviso. Estable por `id` (también tras soltarse: React suelta y vuelve a
     * enganchar los `ref` al montar en modo estricto, y uno nuevo en cada render no pararía nunca).
     */
    slotRef(id: string) {
      let ref = slotRefs.get(id);
      if (!ref) {
        ref = (element) => {
          if ((state.slots[id] ?? null) === element) return;
          const { [id]: _old, ...rest } = state.slots;
          set({ slots: element ? { ...rest, [id]: element } : rest });
        };
        slotRefs.set(id, ref);
      }
      return ref;
    },
  };
}

type FloatingStore = ReturnType<typeof createStore>;

const FloatingContext = createContext<FloatingStore | null>(null);

function useStore(): FloatingStore {
  const store = useContext(FloatingContext);
  if (!store) throw new Error("Pila flotante fuera de <FloatingProvider>");
  return store;
}

/** La pila: va en el layout raíz, alrededor de toda la página. */
export function FloatingProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const layout = floatingLayout({
    entries: state.entries,
    closed: state.closed,
    mobile: state.mobile,
  });
  const folded = layout.folded.length;
  const shown = state.expanded
    ? [...layout.visible, ...layout.folded]
    : layout.visible;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => store.setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      store.dispose();
    };
  }, [store]);

  // Sin nada plegado no hay chip que desplegar: el próximo plegado sale plegado.
  useEffect(() => {
    if (folded === 0) store.collapse();
  }, [folded, store]);

  // `reveal`: el foco va al hueco del aviso en cuanto existe.
  const target = state.focus === null ? null : state.slots[state.focus];
  useEffect(() => {
    if (!target) return;
    target.focus();
    store.focused();
  }, [target, store]);

  return (
    <FloatingContext.Provider value={store}>
      {children}
      <output className="pointer-events-none fixed right-5 bottom-[calc(20px+env(safe-area-inset-bottom,0px))] z-30 flex w-[340px] flex-col items-end gap-2 max-[640px]:inset-x-3 max-[640px]:bottom-[calc(12px+env(safe-area-inset-bottom,0px))] max-[640px]:w-auto max-[640px]:items-stretch">
        {state.toast && (
          <div
            key={state.toast.key}
            className="pointer-events-auto max-w-full rounded-lg border border-won-deep bg-surface-2 px-4 py-2.5 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          >
            {state.toast.content}
          </div>
        )}
        {shown.map((id) => (
          <div
            key={id}
            ref={store.slotRef(id)}
            tabIndex={-1}
            className="w-full rounded-[10px] outline-none focus-visible:outline-2 focus-visible:outline-trust"
          />
        ))}
        {folded > 0 && (
          <button
            type="button"
            aria-expanded={state.expanded}
            onClick={store.toggle}
            className="pointer-events-auto cursor-pointer rounded-full border border-trust/35 bg-trust-bg px-3 py-1 text-xs font-medium text-trust shadow-[0_8px_24px_rgba(0,0,0,.45)] hover:border-trust/60 max-[640px]:self-end"
          >
            {state.expanded ? "Plegar avisos" : foldedLabel(folded)}
          </button>
        )}
      </output>
    </FloatingContext.Provider>
  );
}

/** Toasts efímeros: `show(contenido)` lo pone encima de la pila y lo retira solo a los 4,2 s. */
export function useFloatingToast(): { show: (content: ReactNode) => void } {
  return { show: useStore().show };
}

/**
 * Para el indicador «!» y los rastros en el contenido: cuántos avisos cerrados siguen activos,
 * reabrirlos todos y llevar a uno (`reveal`: lo reabre o lo despliega, y le da el foco).
 */
export function useFloatingStack(): {
  closed: number;
  reopenAll: () => void;
  reveal: (id: string) => void;
} {
  const store = useStore();
  const closed = useSyncExternalStore(
    store.subscribe,
    () => {
      const { entries, closed } = store.get();
      return entries.filter((entry) => closed.includes(entry.id)).length;
    },
    () => 0,
  );
  return { closed, reopenAll: store.reopenAll, reveal: store.reveal };
}

/** Contenido que pinta algo (`null`, `undefined` y `false` no). */
const present = (node: ReactNode) =>
  node != null && node !== false && node !== "";

export interface FloatingItemProps {
  /** Único en la pila; si cambia, es otro aviso (y el cierre del anterior no le vale). */
  id: string;
  /** Menor, antes (`floating-stack.ts`). */
  priority: number;
  /** Familia: a la vista va uno por familia. */
  group: string;
  /** Clave de `localStorage` para que el cierre dure entre visitas; sin ella, en memoria. */
  remember?: string | null;
  tone?: "trust" | "neutral";
  icon?: ReactNode;
  /** Título de contexto ("Dios de Arena", "Arena") para los avisos que hablan del contenido. */
  title?: string;
  /** Además de cerrarlo en la pila. */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * Aviso de la pila: se registra mientras está montado y no pinta nada en su sitio; cuando le toca
 * estar a la vista, pinta su `FloatingNotice` en su hueco de la pila.
 */
export function FloatingItem({
  id,
  priority,
  group,
  remember = null,
  tone,
  icon,
  title,
  onClose,
  children,
}: FloatingItemProps) {
  const store = useStore();
  useEffect(() => {
    store.register({ id, priority, group, remember });
    return () => store.unregister(id);
  }, [store, id, priority, group, remember]);
  const slot = useSyncExternalStore(
    store.subscribe,
    () => store.get().slots[id] ?? null,
    () => null,
  );
  if (!slot) return null;
  return createPortal(
    <FloatingNotice
      tone={tone}
      icon={icon}
      title={title}
      onClose={() => {
        store.close(id);
        onClose?.();
      }}
    >
      {children}
    </FloatingNotice>,
    slot,
  );
}

/**
 * Caja de un aviso de la pila, que se cierra con su ✕. Azul acero (`trust`), como los avisos sobre
 * la fiabilidad del dato, o neutro (`neutral`) para el progreso, que no avisa de nada. Sin `icon` no
 * hay marca a la izquierda.
 */
function FloatingNotice({
  tone = "trust",
  icon = null,
  title,
  onClose,
  children,
}: {
  tone?: "trust" | "neutral";
  icon?: ReactNode;
  title?: string;
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
      <div className="grid min-w-0 gap-1.5">
        {title && (
          <p className="font-display text-xs font-semibold tracking-[0.14em] text-trust uppercase">
            {title}
          </p>
        )}
        {children}
      </div>
      <button
        type="button"
        aria-label={title ? `Cerrar aviso: ${title}` : "Cerrar aviso"}
        onClick={onClose}
        className="grid size-[22px] cursor-pointer place-items-center rounded text-faint hover:bg-white/10 hover:text-foreground"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
