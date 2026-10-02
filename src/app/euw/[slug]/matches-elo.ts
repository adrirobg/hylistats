// Desglose ELO que viaja a `MatchesPanel` (iter-10, T06): solo el de las partidas que el panel
// puede pintar. `ProfileElo.matches` trae el de toda la temporada (cientos de entradas) y el
// payload de la pestaña se reserializa en cada `router.refresh()`; el panel solo consulta el de
// las filas del bloque visible y el de la partida abierta (`?partida`, que puede quedar fuera del
// bloque por los filtros). Sin React ni navegador.

import type { EloMatches, MatchDetailView, MatchRowData } from "./matches-view";

/**
 * Los `matchId` cuyo desglose puede consultar el panel: las filas de la lista y la partida abierta.
 * Un `Set`: la partida abierta suele estar también entre las filas.
 */
export function visibleMatchIds(
  rows: readonly Pick<MatchRowData, "matchId">[],
  detail: Pick<MatchDetailView, "row"> | null | undefined,
): Set<string> {
  const ids = new Set(rows.map((row) => row.matchId));
  if (detail) ids.add(detail.row.matchId);
  return ids;
}

/**
 * El desglose restringido a `matchIds`. `null` (perfil sin ELO) se queda en `null`: la UI distingue
 * "sin historial" de "esta partida no cuenta". Un `matchId` sin entrada (no cuenta para el rating)
 * simplemente no aparece, igual que antes.
 */
export function pickEloMatches(
  elo: EloMatches | null,
  matchIds: ReadonlySet<string>,
): EloMatches | null {
  if (elo === null) return null;
  const picked: Record<string, EloMatches[string]> = {};
  for (const id of matchIds) {
    if (Object.hasOwn(elo, id)) picked[id] = elo[id];
  }
  return picked;
}
