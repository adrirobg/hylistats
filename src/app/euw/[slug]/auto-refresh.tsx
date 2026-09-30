"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { ensureFreshOnViewAction } from "./actions";
import {
  type AutoRefreshEvent,
  autoRefreshIntervals,
  autoRefreshOnEvent,
} from "./auto-refresh-policy";

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isVisible = () => document.visibilityState === "visible";
/** En el servidor no hay documento: el componente no pinta nada, así que da igual. */
const visibleOnServer = () => true;

/**
 * No pinta nada: mantiene la página al día mientras la pestaña está visible. Pide refrescar el
 * perfil (`ensureFreshOnViewAction`) al montarse, al volver a la pestaña y cada 60 s, y relee la
 * página cada 3 s (job activo) o 30 s. Con la pestaña oculta no hay intervalos ni disparos.
 *
 * El guardia de "un incremental automático cada 5 min como mucho" está en el servidor
 * (`ensureFreshOnView`), así que vale para varias pestañas y visitantes; el latido de 60 s solo
 * toca la BD propia. Qué hacer y cuándo lo decide `auto-refresh-policy.ts` (puro y probado).
 */
export function AutoRefresh({
  slug,
  active,
}: {
  slug: string;
  active: boolean;
}) {
  const router = useRouter();
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    visibleOnServer,
  );
  // Guarda por slug: en desarrollo (StrictMode) los efectos se ejecutan dos veces.
  const checkedSlug = useRef<string | null>(null);

  /** Aplica la política a un evento: relee la página y/o comprueba si el perfil está al día. */
  const apply = useCallback(
    (event: AutoRefreshEvent) => {
      const { check, refresh } = autoRefreshOnEvent(event, isVisible());
      if (refresh) router.refresh();
      if (!check) return;
      startTransition(async () => {
        try {
          const result = await ensureFreshOnViewAction(slug);
          // Si se encoló un job (o ya había uno), la página pasa a mostrar su progreso.
          if (result === "queued" || result === "active") router.refresh();
        } catch {
          // Mejor esfuerzo: si falla, la página sigue mostrando los datos y el polling continúa.
        }
      });
    },
    [slug, router],
  );

  // Una comprobación por montaje (si la pestaña arranca oculta, la hará al volver a verse).
  useEffect(() => {
    if (checkedSlug.current === slug) return;
    checkedSlug.current = slug;
    apply("mount");
  }, [slug, apply]);

  // Volver a la pestaña: comprueba y relee al momento, sin esperar al siguiente tick.
  useEffect(() => {
    const onChange = () => apply("visible");
    return subscribeVisibility(onChange);
  }, [apply]);

  // Intervalos por separado: que `active` cambie no reinicia el latido de comprobación.
  const { pollMs, checkMs } = autoRefreshIntervals({ visible, active });
  useEffect(() => {
    if (pollMs === null) return;
    const timer = setInterval(() => apply("pollTick"), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, apply]);
  useEffect(() => {
    if (checkMs === null) return;
    const timer = setInterval(() => apply("checkTick"), checkMs);
    return () => clearInterval(timer);
  }, [checkMs, apply]);

  return null;
}
