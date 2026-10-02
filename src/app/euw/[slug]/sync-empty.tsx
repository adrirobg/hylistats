"use client";

import type { ReactNode } from "react";
import { usePageStatus } from "./status-provider";
import { emptyState } from "./view-model";

/**
 * Pestaña sin partidas (§5): el esqueleto mientras hay un job, o el porqué si no lo hay. Lo decide
 * el estado de `StatusProvider`, no las props: un job que acaba sin guardar nada no cambia la
 * versión ni repinta, y el esqueleto debe dejar paso igual al aviso. Con partidas la página pinta
 * el contenido en el servidor y esto no se monta.
 */
export function SyncEmpty({
  skeleton,
  never,
  empty,
}: {
  skeleton: ReactNode;
  /** Nunca se ha sincronizado y no hay job. */
  never: ReactNode;
  /** Se sincronizó y no hay partidas de Arena en la temporada. */
  empty: ReactNode;
}) {
  const { status } = usePageStatus();
  const state = emptyState({
    games: 0,
    syncing: status.profile?.sync != null,
    lastSyncedAt: status.profile?.lastSyncedAt ?? null,
  });
  if (state === "syncing") return skeleton;
  return state === "never" ? never : empty;
}
