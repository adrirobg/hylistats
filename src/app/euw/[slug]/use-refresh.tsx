"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/hy/toast";
import { refreshAction } from "./actions";
import {
  advanceWatch,
  outcomeMessage,
  type RefreshSnapshot,
  type RefreshWatch,
  refreshOutcome,
  startWatch,
} from "./refresh-outcome";

/**
 * `id` del botón Actualizar del header. La barra Arena God lo pulsa (`.click()`) desde
 * [Sincronizar] y [Reintentar]: así comparte la barra de progreso, el toast y la vigilancia.
 */
export const REFRESH_BUTTON_ID = "refresh-profile";

/** Tope de la vigilancia: si en 90 s no pasa nada, se deja de esperar el resultado. */
const WATCH_MAX_MS = 90_000;

/**
 * Botón "Actualizar" (§4.1 y §4.10): la action, su estado y el toast de resultado.
 *
 * - `cooldown` -> toast "Espera un momento"; `active` -> "Ya se está actualizando".
 * - Tras `queued` o `active` vigila la foto del perfil (`snapshot`: el job, `lastSyncedAt` y el
 *   error salen del estado de `StatusProvider`; las partidas y los campeones, de los datos de la
 *   página). Cuando el estado dice que el job terminó, compara con la foto de antes de pulsar y
 *   muestra "+N partidas · nuevo 1º con X" o "Sin partidas nuevas". Si hubo partidas, la versión
 *   cambió y el resultado espera al repintado (`dataCurrent`); si no, sale sin repintar. Sin
 *   relecturas propias: el ritmo es el del poller. Solo ocurre en la pestaña donde se pulsó.
 */
export function useRefresh(snapshot: RefreshSnapshot, dataCurrent: boolean) {
  const [state, formAction, submitting] = useActionState(refreshAction, null);
  const { toast, show } = useToast();
  const [watch, setWatch] = useState<RefreshWatch | null>(null);
  // La foto se toma al pulsar: cuando vuelve la action, la página ya viene refrescada.
  const before = useRef<RefreshSnapshot | null>(null);
  // Última foto vista, para leerla desde efectos que no deben depender de ella.
  const latest = useRef(snapshot);
  useEffect(() => {
    latest.current = snapshot;
  });

  const markPress = () => {
    before.current = snapshot;
  };

  useEffect(() => {
    if (!state) return;
    switch (state.result) {
      case "cooldown":
        show("Espera un momento");
        break;
      case "not_found":
        show("Perfil no encontrado");
        break;
      case "active":
        show("Ya se está actualizando");
        setWatch(startWatch(before.current ?? latest.current));
        break;
      case "queued":
        setWatch(startWatch(before.current ?? latest.current));
        break;
    }
  }, [state, show]);

  useEffect(() => {
    if (!watch) return;
    const step = advanceWatch(watch, snapshot, dataCurrent);
    if (step.watch === watch) return;
    setWatch(step.watch);
    if (step.settled === "ok") {
      const { lead, highlight } = outcomeMessage(
        refreshOutcome(watch.before, snapshot),
      );
      show(
        <>
          {lead}
          {highlight && (
            <>
              {" · "}
              <b className="font-bold text-place-1">{highlight}</b>
            </>
          )}
        </>,
      );
    }
  }, [watch, snapshot, dataCurrent, show]);

  const watching = watch !== null;
  useEffect(() => {
    if (!watching) return;
    const timer = setTimeout(() => setWatch(null), WATCH_MAX_MS);
    return () => clearTimeout(timer);
  }, [watching]);

  return {
    formAction,
    markPress,
    submitting,
    /** Hay un envío en curso o un job activo: el botón muestra progreso y no admite otro clic. */
    busy: submitting || snapshot.active,
    toast,
  };
}
