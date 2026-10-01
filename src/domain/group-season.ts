// Dominio de los bloques Equipos y Temporada de la vista del grupo (iter-05): las tablas de Dúos y
// Tríos de toda la temporada y la tabla de Temporada por miembro (pestañas Resumen y Récords) con
// el líder de cada columna. Funciones puras (sin BD, sin red y sin React) sobre las partidas de los
// miembros, ya filtradas por temporada y cola.
//
// Nada se redefine aquí: los dúos y tríos salen de `computeTeams` (group-titles), el Resumen de
// `computeSummary`, los récords de `computeRecords` y los campeones ganados de `verifiedChampions`
// y la regla del badge «Deidad de Arena» (`wonChampionsCount`). Por eso cada valor de la tabla es
// idéntico al del perfil del miembro. Nada se guarda: se calcula al leer.
//
// Los `puuid` son identificadores internos: no se muestran en la UI ni van en URLs.

import { GROUP_TEAM_MIN_GAMES } from "@/lib/config";
import { wonChampionsCount } from "./arena-god";
import {
  computeTeams,
  type GroupMatchRow,
  type TeamStats,
} from "./group-titles";
import { computeRecords, type RecordEntry, type RecordRow } from "./records";
import { computeSummary, verifiedChampions } from "./stats";

// ---------------------------------------------------------------------------------------------
// Equipos de temporada (Dúos y Tríos)
// ---------------------------------------------------------------------------------------------

export interface SeasonTeams {
  duos: TeamStats[];
  trios: TeamStats[];
}

/**
 * Dúos y tríos de miembros de toda la temporada con `GROUP_TEAM_MIN_GAMES` o más partidas juntos
 * (la misma constante que los títulos). `rows` son las partidas de los **miembros** en la
 * temporada (cualquier orden), así que en Tríos solo hay tríos formados enteramente por miembros
 * y un dúo lo es sea el tercero del equipo miembro o no (`computeTeams`).
 *
 * Orden (el de `computeTeams`): más partidas juntos; desempate estable: más 1º, mejor puesto medio
 * y, por último, la clave del equipo. Cada `TeamStats` trae partidas, 1º, % de 1º (`firstRate`) y
 * puesto medio.
 */
export function computeSeasonTeams(
  rows: readonly GroupMatchRow[],
): SeasonTeams {
  const { duos, trios } = computeTeams(rows);
  const enough = (team: TeamStats) => team.games >= GROUP_TEAM_MIN_GAMES;
  return { duos: duos.filter(enough), trios: trios.filter(enough) };
}

// ---------------------------------------------------------------------------------------------
// Columnas de la tabla de Temporada
// ---------------------------------------------------------------------------------------------

/** Pestañas de la tabla: Resumen y Récords. */
export type SeasonTab = "summary" | "records";

/** Qué valor lidera una columna: el más alto (`high`) o el más bajo (`low`). */
export type LeaderDirection = "high" | "low";

export type SeasonColumnId =
  // Resumen
  | "games"
  | "firsts"
  | "firstRate"
  | "avgPlacement"
  | "wonChampions"
  | "firstTry"
  | "firstTryRate"
  | "topChampion"
  // Récords
  | "damage"
  | "damageTaken"
  | "kills"
  | "killingSpree"
  | "deaths"
  | "winStreak"
  | "drought";

export interface SeasonColumn {
  id: SeasonColumnId;
  tab: SeasonTab;
  /** Cabecera de la columna. */
  label: string;
  /** Sentido del líder: bajo en puesto medio y alto en todas las demás (F8/P8). */
  leader: LeaderDirection;
}

/**
 * Las columnas de la tabla, en el orden en que se muestran. Declaran su pestaña y el sentido del
 * líder: la UI ordena y destaca líderes leyendo esto, sin reimplementar reglas. Todas son
 * `high` salvo el puesto medio. En las rachas, «más alto» también lo es en la de partidas sin 1º
 * (la regla es uniforme, aunque esa racha sea un mal récord).
 */
export const SEASON_COLUMNS: readonly SeasonColumn[] = [
  { id: "games", tab: "summary", label: "Partidas", leader: "high" },
  { id: "firsts", tab: "summary", label: "1º", leader: "high" },
  { id: "firstRate", tab: "summary", label: "% de 1º", leader: "high" },
  { id: "avgPlacement", tab: "summary", label: "Puesto medio", leader: "low" },
  {
    id: "wonChampions",
    tab: "summary",
    label: "Campeones ganados",
    leader: "high",
  },
  {
    id: "firstTry",
    tab: "summary",
    label: "Victorias a la primera",
    leader: "high",
  },
  {
    id: "firstTryRate",
    tab: "summary",
    label: "% a la primera",
    leader: "high",
  },
  {
    id: "topChampion",
    tab: "summary",
    label: "Campeón con más 1º",
    leader: "high",
  },
  { id: "damage", tab: "records", label: "Máx. daño", leader: "high" },
  {
    id: "damageTaken",
    tab: "records",
    label: "Máx. daño recibido",
    leader: "high",
  },
  { id: "kills", tab: "records", label: "Máx. kills", leader: "high" },
  {
    id: "killingSpree",
    tab: "records",
    label: "Máx. racha de kills",
    leader: "high",
  },
  { id: "deaths", tab: "records", label: "Máx. muertes", leader: "high" },
  { id: "winStreak", tab: "records", label: "Racha de 1º", leader: "high" },
  {
    id: "drought",
    tab: "records",
    label: "Racha sin 1º",
    leader: "high",
  },
];

/** Las columnas de una pestaña, en orden. */
export const seasonColumnsOf = (tab: SeasonTab): SeasonColumn[] =>
  SEASON_COLUMNS.filter((column) => column.tab === tab);

export const SEASON_COLUMN_BY_ID: Readonly<
  Record<SeasonColumnId, SeasonColumn>
> = Object.fromEntries(
  SEASON_COLUMNS.map((column) => [column.id, column]),
) as Record<SeasonColumnId, SeasonColumn>;

// ---------------------------------------------------------------------------------------------
// Entrada y salida de la tabla
// ---------------------------------------------------------------------------------------------

/**
 * Una partida de un miembro en la temporada con todo lo que necesita la tabla: es a la vez una
 * `PlayerMatchRow` (`getPlayerRows`: Resumen y campeones verificados), una `RecordRow`
 * (`getRecordRows`: récords) y una `GroupMatchRow` (dúos y tríos). Una sola consulta sobre
 * `participants` + `matches` de los miembros, con `puuid`, alimenta todo el bloque.
 */
export interface SeasonMatchRow extends RecordRow {
  /** Miembro del grupo. Interno: no exponer en UI ni URLs. */
  puuid: string;
  /** Etiqueta del equipo en la partida (la usa `computeTeams`). */
  playerSubteamId: number;
}

/** Un miembro de la tabla. */
export interface SeasonMember {
  /** Interno: no exponer en UI ni URLs. */
  puuid: string;
  /**
   * Contador oficial del challenge 602002 del miembro (`profiles.challengeValue`, como en el
   * perfil); `null` si aún no se ha consultado.
   */
  official: number | null;
}

/** Valor de una celda y, si lo marca una partida, cómo enlazar a ella. */
export interface SeasonCell {
  /** `null` si no hay dato (el miembro no tiene partidas o el dato no existe). */
  value: number | null;
  /**
   * Partida que marca el récord (enlace a `/euw/<slug>?tab=partidas&partida=<matchId>`). En las
   * rachas es la **última** partida de la racha (`toMatchId`). `null` en las columnas que no son
   * un récord de una partida.
   */
  matchId: string | null;
  /** Solo en las rachas: la primera partida de la racha (en una racha de 1, igual que `matchId`). */
  fromMatchId: string | null;
  /** Campeón de la partida del récord o, en `topChampion`, el campeón con más 1º. */
  championName: string | null;
  /**
   * `championId` de ese campeón (clave del catálogo): permite resolver su nombre de visualización
   * como el perfil, en vez de mostrar el `championName` de Match-V5 (`MonkeyKing`).
   */
  championId: number | null;
}

export interface SeasonRow {
  /** Interno: no exponer en UI ni URLs. */
  puuid: string;
  cells: Record<SeasonColumnId, SeasonCell>;
}

export interface SeasonTable {
  /** Una fila por miembro, en el orden de `members`. */
  rows: SeasonRow[];
  /**
   * `puuid` de los líderes de cada columna (vacío si no hay líder). En empate, todos los
   * empatados. Ver `columnLeaders`.
   */
  leaders: Record<SeasonColumnId, string[]>;
}

const cell = (
  value: number | null,
  extra: Partial<Omit<SeasonCell, "value">> = {},
): SeasonCell => ({
  value,
  matchId: null,
  fromMatchId: null,
  championName: null,
  championId: null,
  ...extra,
});

const recordCell = (entry: RecordEntry | null): SeasonCell =>
  entry
    ? cell(entry.value, {
        matchId: entry.matchId,
        championName: entry.championName,
        championId: entry.championId,
      })
    : cell(null);

/**
 * La fila de un miembro a partir de sus partidas (las de la temporada en las colas del grupo).
 * Con las mismas filas que el perfil, cada valor es el de `computeSummary`, `computeRecords` y
 * `max(verificados, oficial ?? 0)` (`wonChampionsCount`, el valor que decide «Deidad de Arena»).
 *
 * Sin partidas: `games` y `firsts` valen 0 y el resto de cifras de partidas no tienen dato
 * (`null`); los campeones ganados salen igualmente del contador oficial, si lo hay.
 */
export function computeSeasonRow(
  member: SeasonMember,
  rows: readonly SeasonMatchRow[],
): SeasonRow {
  const summary = computeSummary(rows);
  const records = computeRecords(rows);
  const won = wonChampionsCount(
    verifiedChampions(rows).length,
    member.official,
  );
  const played = summary.games > 0;
  const { firstTry, topChampion } = records;

  return {
    puuid: member.puuid,
    cells: {
      games: cell(summary.games),
      firsts: cell(summary.firsts),
      firstRate: cell(played ? summary.firstRate : null),
      avgPlacement: cell(summary.avgPlacement),
      wonChampions: cell(won),
      firstTry: cell(played ? firstTry.count : null),
      // Sin campeones ganados no hay tasa que calcular (el perfil pinta su estado vacío).
      firstTryRate: cell(firstTry.wonChampions === 0 ? null : firstTry.rate),
      topChampion: topChampion
        ? cell(topChampion.firsts, {
            championName: topChampion.championName,
            championId: topChampion.championId,
          })
        : cell(null),
      damage: recordCell(records.records.damage),
      damageTaken: recordCell(records.records.damageTaken),
      kills: recordCell(records.records.kills),
      killingSpree: recordCell(records.records.killingSpree),
      deaths: recordCell(records.records.deaths),
      winStreak: records.longestWinStreak
        ? cell(records.longestWinStreak.length, {
            matchId: records.longestWinStreak.toMatchId,
            fromMatchId: records.longestWinStreak.fromMatchId,
          })
        : cell(null),
      drought: records.longestDrought
        ? cell(records.longestDrought.length, {
            matchId: records.longestDrought.toMatchId,
            fromMatchId: records.longestDrought.fromMatchId,
          })
        : cell(null),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Líderes y orden
// ---------------------------------------------------------------------------------------------

/**
 * Los líderes de una columna: el valor más bajo si `direction` es `low` y el más alto si es
 * `high`; en empate, todos los empatados. Una columna sin datos no tiene líder: se ignoran los
 * valores `null` y, en las columnas `high`, los 0 (nadie lidera con 0 partidas, 0 1º o 0 campeones
 * ganados). Devuelve las claves en el orden de entrada.
 */
export function columnLeaders<K>(
  entries: readonly { key: K; value: number | null }[],
  direction: LeaderDirection,
): K[] {
  const eligible = entries.filter(
    (entry): entry is { key: K; value: number } =>
      entry.value !== null && (direction === "low" || entry.value > 0),
  );
  if (eligible.length === 0) return [];
  const best = eligible.reduce(
    (acc, entry) =>
      direction === "high"
        ? Math.max(acc, entry.value)
        : Math.min(acc, entry.value),
    eligible[0].value,
  );
  // `===` es exacto: el mismo racional da el mismo double (la división IEEE redondea bien).
  return eligible.filter((entry) => entry.value === best).map((e) => e.key);
}

/**
 * La tabla de Temporada: una fila por miembro (en el orden de `members`) y los líderes de cada
 * columna. `rows` son las partidas de los miembros en la temporada (cualquier orden); las de quien
 * no está en `members` se ignoran.
 */
export function computeSeasonTable(
  members: readonly SeasonMember[],
  rows: readonly SeasonMatchRow[],
): SeasonTable {
  const byPuuid = new Map<string, SeasonMatchRow[]>();
  for (const row of rows) {
    const list = byPuuid.get(row.puuid);
    if (list) list.push(row);
    else byPuuid.set(row.puuid, [row]);
  }
  const tableRows = members.map((member) =>
    computeSeasonRow(member, byPuuid.get(member.puuid) ?? []),
  );
  const leaders = {} as Record<SeasonColumnId, string[]>;
  for (const column of SEASON_COLUMNS) {
    leaders[column.id] = columnLeaders(
      tableRows.map((row) => ({
        key: row.puuid,
        value: row.cells[column.id].value,
      })),
      column.leader,
    );
  }
  return { rows: tableRows, leaders };
}

export type SortDirection = "asc" | "desc";

/** Sentido por defecto al ordenar por una columna: el del líder primero (`desc` si es `high`). */
export const defaultSortDirection = (column: SeasonColumn): SortDirection =>
  column.leader === "high" ? "desc" : "asc";

/**
 * Las filas ordenadas por una columna (sin mutar la entrada). Las filas sin dato en la columna van
 * siempre al final, sea cual sea el sentido; el resto de empates conserva el orden de entrada
 * (orden estable).
 */
export function sortSeasonRows(
  rows: readonly SeasonRow[],
  columnId: SeasonColumnId,
  direction: SortDirection = defaultSortDirection(
    SEASON_COLUMN_BY_ID[columnId],
  ),
): SeasonRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a.cells[columnId].value;
    const bv = b.cells[columnId].value;
    if (av === null || bv === null) {
      return av === bv ? 0 : av === null ? 1 : -1;
    }
    return sign * (av - bv);
  });
}

/** `true` si `puuid` lidera la columna en la tabla. */
export const isSeasonLeader = (
  table: SeasonTable,
  columnId: SeasonColumnId,
  puuid: string,
): boolean => table.leaders[columnId].includes(puuid);
