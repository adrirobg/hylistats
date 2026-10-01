"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Btn } from "@/components/hy/btn";
import { ToastRegion, useToast } from "@/components/hy/toast";
import { cn } from "@/lib/utils";
import {
  type AutoRefreshEvent,
  autoRefreshIntervals,
  autoRefreshOnEvent,
} from "../euw/[slug]/auto-refresh-policy";
import { ensureGroupFreshAction, refreshGroupAction } from "./actions";
import {
  activeLabel,
  freshnessNotice,
  type OldestSyncRef,
  refreshMessage,
} from "./freshness-model";

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isVisible = () => document.visibilityState === "visible";
const visibleOnServer = () => true;

export interface GroupFreshnessProps {
  /** El miembro con la sincronización menos reciente (`GroupView.oldestSync`). */
  oldest: OldestSyncRef | null;
  /** Miembros con un job activo ahora: mientras haya alguno, la vista se relee cada 3 s. */
  active: number;
  /** Miembros del grupo. */
  members: number;
  /** Hora del servidor al renderizar (el aviso se recalcula con cada relectura). */
  nowMs: number;
}

/**
 * Frescura de la vista del grupo (P9), en `/grupo` y en la pestaña Grupo: aviso de la
 * sincronización más antigua, botón «Actualizar grupo» y el auto-refresco.
 *
 * El auto-refresco aplica a los miembros el mismo patrón que `AutoRefresh` del perfil, con la
 * misma política (`auto-refresh-policy.ts`): `ensureGroupFreshAction` al montar, al volver a la
 * pestaña y cada 60 s con ella visible, y `router.refresh()` cada 3 s (algún job activo) o 30 s;
 * con la pestaña oculta no hay intervalos ni disparos. El guardia de 5 min por perfil y el job
 * activo único están en el servidor (`ensureFreshOnView`), así que varias pestañas, visitantes o
 * el `AutoRefresh` del perfil del dueño no encolan nada de más.
 */
export function GroupFreshness({
  oldest,
  active,
  members,
  nowMs,
}: GroupFreshnessProps) {
  const router = useRouter();
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    visibleOnServer,
  );
  // En desarrollo (StrictMode) los efectos se ejecutan dos veces: una comprobación por montaje.
  const checked = useRef(false);

  const apply = useCallback(
    (event: AutoRefreshEvent) => {
      const { check, refresh } = autoRefreshOnEvent(event, isVisible());
      if (refresh) router.refresh();
      if (!check) return;
      startTransition(async () => {
        try {
          const summary = await ensureGroupFreshAction();
          // Si se encoló algo (o ya había jobs), la vista pasa a mostrar su progreso.
          if (summary.queued > 0 || summary.active > 0) router.refresh();
        } catch {
          // Mejor esfuerzo: si falla, la vista sigue mostrando los datos y el polling continúa.
        }
      });
    },
    [router],
  );

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    apply("mount");
  }, [apply]);

  useEffect(() => {
    const onChange = () => apply("visible");
    return subscribeVisibility(onChange);
  }, [apply]);

  const { pollMs, checkMs } = autoRefreshIntervals({
    visible,
    active: active > 0,
  });
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

  // Botón «Actualizar grupo»: la action (que revalida la página) y su resultado en un toast.
  const [state, formAction, submitting] = useActionState(
    refreshGroupAction,
    null,
  );
  const { toast, show } = useToast();
  useEffect(() => {
    if (!state) return;
    show(refreshMessage(state.summary));
  }, [state, show]);

  const busy = submitting || active > 0;
  const status = activeLabel(active, members);
  const notice = freshnessNotice(oldest, nowMs);

  return (
    <section
      aria-label="Frescura del grupo"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[8px] border border-line bg-surface-1 px-3.5 py-2.5"
    >
      <p className="min-w-0 text-[13px] text-muted-foreground">{notice}</p>
      <form action={formAction} className="flex items-center gap-2.5">
        {/* `<output>` es una región viva: el lector anuncia el cambio, no cada relectura. */}
        <output
          className={cn("text-[13px] text-faint empty:hidden")}
          aria-live="polite"
        >
          {status}
        </output>
        <Btn type="submit" disabled={busy} aria-busy={busy}>
          <RefreshCw aria-hidden="true" size={16} />
          <span>{submitting ? "Comprobando…" : "Actualizar grupo"}</span>
          {busy && (
            <i
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-0.5 w-full animate-pulse bg-place-1"
            />
          )}
        </Btn>
      </form>
      <ToastRegion>{toast}</ToastRegion>
    </section>
  );
}
