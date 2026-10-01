// Textos de la frescura del grupo (P9) como funciones puras, sin React ni navegador, para poder
// probarlos: la UI de este repo no tiene jsdom. `group-freshness.tsx` solo los pinta.

import type { GroupSyncSummary } from "@/domain/group-sync";
import { formatRelative } from "@/lib/format";

/** El miembro con la sincronización menos reciente, tal como llega al cliente. */
export interface OldestSyncRef {
  gameName: string;
  tagLine: string;
  /** Epoch ms; `null`: nunca se ha sincronizado. */
  lastSyncedAt: number | null;
}

/** Aviso de antigüedad: la última sincronización del miembro menos reciente. */
export function freshnessNotice(
  oldest: OldestSyncRef | null,
  nowMs: number,
): string {
  if (oldest === null) return "";
  const name = `${oldest.gameName}#${oldest.tagLine}`;
  return oldest.lastSyncedAt === null
    ? `Sin sincronizar todavía: ${name}`
    : `Sincronización más antigua: ${formatRelative(oldest.lastSyncedAt, nowMs)} (${name})`;
}

/** Texto del estado junto al botón mientras hay miembros actualizándose; `null` si no hay ninguno. */
export function activeLabel(active: number, members: number): string | null {
  return active > 0 ? `Actualizando ${active} de ${members}` : null;
}

/** Texto del toast tras pulsar «Actualizar grupo». */
export function refreshMessage(summary: GroupSyncSummary): string {
  if (summary.members === 0) return "El grupo no tiene miembros";
  const { queued, active } = summary;
  if (queued > 0) {
    const base = `Actualizando ${queued} ${queued === 1 ? "miembro" : "miembros"}`;
    return active > 0 ? `${base} (${active} ya en curso)` : base;
  }
  if (active > 0) return "Ya se está actualizando";
  return "Espera un momento";
}
