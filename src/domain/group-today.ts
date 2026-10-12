// «El grupo hoy» (iter-11, T05): lo que jugó cada miembro en el día de juego actual, para la fila
// de trofeos de la cabecera. Funciones puras (sin BD, sin red y sin React) sobre las partidas de
// los miembros que ya carga la vista del grupo.
//
// "Hoy" es **estricto**: el día de juego de `now` (`periodKey("day", now)`), sin caer al último día
// con partidas como hace `displayedPeriod` en el bloque Hoy de la pestaña Grupo. Quien no ha
// jugado hoy sale con ceros y `null`; si no ha jugado nadie, todo el grupo sale así. Como en el
// resto del dominio, solo cuentan los puestos 1..6.
//
// Los `puuid` de las filas son CLAVES DE MIEMBRO (ver la cabecera de `group-view.ts`).

import { isPlacement, periodKey } from "./group-titles";

/** Cuántos campeones recientes de hoy se guardan por miembro. */
export const TODAY_LAST_GAMES = 5;

/** Lo que se lee de una fila de temporada de un miembro (`SeasonMatchRow` lo cumple). */
export interface TodayRow {
  /** Clave de miembro. Interno: no exponer en UI ni URLs. */
  puuid: string;
  matchId: string;
  /** Epoch en ms del inicio de la partida (decide el día de juego). */
  gameStartTimestamp: number;
  championId: number;
  championName: string;
  placement: number;
}

/** Una partida reciente de hoy de un miembro. */
export interface TodayGame {
  matchId: string;
  championId: number;
  /** `championName` de Match-V5; el nombre de visualización lo pone la vista-modelo. */
  championName: string;
  placement: number;
}

export interface MemberToday {
  games: number;
  firsts: number;
  /** `null` sin partidas hoy. */
  avgPlacement: number | null;
  /** Hasta `TODAY_LAST_GAMES` partidas de hoy, la más reciente primero. */
  last: TodayGame[];
}

export interface GroupToday {
  /** Día de juego de `now` (`YYYY-MM-DD`). */
  dayKey: string;
  /** Partidas distintas del día (por `matchId`): dos miembros en la misma partida cuentan una. */
  games: number;
  /** Por clave de miembro; todos los de `memberKeys`, jueguen o no. Sin `Map`: serializable. */
  members: Record<string, MemberToday>;
}

const IDLE: MemberToday = { games: 0, firsts: 0, avgPlacement: null, last: [] };

/**
 * Actividad de hoy de cada miembro en `memberKeys` a partir de `rows` (cualquier orden). Las filas
 * de quien no está en `memberKeys` se ignoran.
 */
export function computeGroupToday(
  rows: readonly TodayRow[],
  memberKeys: readonly string[],
  now: number,
): GroupToday {
  const dayKey = periodKey("day", now);
  const byMember = new Map<string, TodayRow[]>(memberKeys.map((k) => [k, []]));
  const matches = new Set<string>();
  for (const row of rows) {
    if (!isPlacement(row.placement)) continue;
    if (periodKey("day", row.gameStartTimestamp) !== dayKey) continue;
    const mine = byMember.get(row.puuid);
    if (!mine) continue;
    mine.push(row);
    matches.add(row.matchId);
  }

  const members: Record<string, MemberToday> = {};
  for (const [key, mine] of byMember) {
    if (mine.length === 0) {
      members[key] = { ...IDLE, last: [] };
      continue;
    }
    const recent = [...mine].sort(
      (a, b) =>
        b.gameStartTimestamp - a.gameStartTimestamp ||
        b.matchId.localeCompare(a.matchId),
    );
    members[key] = {
      games: mine.length,
      firsts: mine.filter((r) => r.placement === 1).length,
      avgPlacement: mine.reduce((sum, r) => sum + r.placement, 0) / mine.length,
      last: recent
        .slice(0, TODAY_LAST_GAMES)
        .map(({ matchId, championId, championName, placement }) => ({
          matchId,
          championId,
          championName,
          placement,
        })),
    };
  }
  return { dayKey, games: matches.size, members };
}
