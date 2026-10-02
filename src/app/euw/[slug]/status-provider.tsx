"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { StatusPayload } from "@/lib/status-payload";
import {
  currentStatus,
  isSyncing,
  nextPollDelay,
  sameVersions,
  shouldRefresh,
  versionsOf,
} from "./status-policy";

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isVisible = () => document.visibilityState === "visible";
/** En el servidor no hay documento ni efectos: da igual. */
const visibleOnServer = () => true;

interface PageStatus {
  /** El estado que se pinta: el del render del servidor o la última consulta, el más reciente. */
  status: StatusPayload;
  /**
   * Los datos de la página (props del servidor) corresponden a la versión del estado. `false`
   * mientras falta un repintado: lo que se compare con esos datos (el toast de Actualizar) espera.
   */
  dataCurrent: boolean;
}

const PageStatusContext = createContext<PageStatus | null>(null);

/** Estado de la página (`StatusProvider`). */
export function usePageStatus(): PageStatus {
  const value = useContext(PageStatusContext);
  if (!value) throw new Error("usePageStatus fuera de <StatusProvider>");
  return value;
}

/**
 * El único mecanismo de relectura de la página (perfil, pestaña Grupo y «no encontrado»). Consulta
 * `GET /api/estado` al montar, al volver a la pestaña y cada 10 s (5 s con sincronización en
 * marcha), solo con la pestaña visible, y llama a `router.refresh()` solo si cambió la versión de
 * lo que pinta la página. Expone el estado a los componentes por contexto. Qué hacer y cuándo lo
 * decide `status-policy.ts` (puro y probado).
 *
 * `initial` es el estado con el que se pintó la página en el servidor, con las versiones leídas
 * ANTES de cargar los datos: el primer render coincide con el HTML (sin parpadeo ni desajuste de
 * hidratación), montar no repinta y un cambio que llegue entre el render y la primera consulta no
 * se pierde. Cada repintado trae un `initial` nuevo.
 */
export function StatusProvider({
  slug,
  group,
  initial,
  children,
}: {
  /** Segmento de la URL del perfil (`profileSlug`), tal cual. */
  slug: string;
  /** La página muestra la vista del grupo (`?grupo=1`: frescura y estado de los miembros). */
  group: boolean;
  initial: StatusPayload;
  children: ReactNode;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    visibleOnServer,
  );
  const [polled, setPolled] = useState<StatusPayload | null>(null);
  // Cuándo volvió la última consulta (bien o mal); `null` = ninguna, o la pestaña se ocultó.
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);

  const status = currentStatus(initial, polled);
  const rendered = versionsOf(initial);
  const syncing = isSyncing(status);
  const query = new URLSearchParams(
    group ? { perfil: slug, grupo: "1" } : { perfil: slug },
  ).toString();

  // Lo que la consulta lee al volver, sin reprogramarla cuando cambia.
  const latest = useRef({ rendered, refreshing, query });
  useEffect(() => {
    latest.current = { rendered, refreshing, query };
  });
  const inFlight = useRef<AbortController | null>(null);

  // Al ocultar la pestaña se olvida la última consulta: al volver toca consultar ya.
  useEffect(
    () =>
      subscribeVisibility(() => {
        if (!isVisible()) setLastPollAt(null);
      }),
    [],
  );

  // Aborta la consulta en curso al desmontar (y no programa otra).
  useEffect(() => () => inFlight.current?.abort(), []);

  useEffect(() => {
    const delay = nextPollDelay({
      visible,
      syncing,
      lastPollAt,
      now: Date.now(),
    });
    if (delay === null) return;
    const timer = setTimeout(async () => {
      if (inFlight.current) return; // la que está en curso programa la siguiente al volver
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        const response = await fetch(`/api/estado?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const next = (await response.json()) as StatusPayload;
        // Respuesta de otra vista (cambió la pestaña mientras volvía): se descarta.
        if (latest.current.query !== query) return;
        setPolled(next);
        const { rendered, refreshing } = latest.current;
        if (shouldRefresh({ rendered, status: versionsOf(next), refreshing })) {
          startRefresh(() => router.refresh());
        }
      } catch {
        // Mejor esfuerzo: un fallo de red no rompe la página; la siguiente consulta lo reintenta.
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
        if (!controller.signal.aborted) setLastPollAt(Date.now());
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [visible, syncing, lastPollAt, query, router]);

  const value: PageStatus = {
    status,
    dataCurrent: sameVersions(rendered, versionsOf(status)),
  };
  return (
    <PageStatusContext.Provider value={value}>
      {children}
    </PageStatusContext.Provider>
  );
}
