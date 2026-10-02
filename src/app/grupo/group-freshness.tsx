"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect } from "react";
import { Btn } from "@/components/hy/btn";
import { ToastRegion, useToast } from "@/components/hy/toast";
import { cn } from "@/lib/utils";
import { usePageStatus } from "../euw/[slug]/status-provider";
import { refreshGroupAction } from "./actions";
import {
  activeLabel,
  freshnessNotice,
  refreshMessage,
} from "./freshness-model";

/**
 * Frescura de la vista del grupo (P9), en la pestaña Grupo: aviso de la sincronización más
 * antigua y botón «Actualizar grupo».
 *
 * Se pinta desde el estado del grupo que consulta `StatusProvider` (`?grupo=1`), sin relecturas
 * propias: esa misma consulta hace de latido y aplica la frescura de los miembros en el servidor
 * (`ensureGroupFresh`), y la página se repinta cuando cambia la versión del grupo. Sin miembros no
 * pinta nada.
 */
export function GroupFreshness() {
  const { status } = usePageStatus();
  const group = status.group;

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

  if (!group || group.members === 0) return null;
  const busy = submitting || group.active > 0;
  const label = activeLabel(group.active, group.members);
  // La hora del servidor del estado: el primer render coincide con el HTML.
  const notice = freshnessNotice(group.oldest, status.now);

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
          {label}
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
