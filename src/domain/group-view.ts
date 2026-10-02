// Carga de datos de la vista del grupo (iter-05, T04): una sola función (`loadGroupView`) devuelve
// todo lo que pintan `/grupo`, la pestaña Grupo y los badges, y otra ligera (`loadProfileTitles`)
// los datos de grupo de un perfil (títulos vigentes y ELO). Va en su propio módulo para no hacer crecer
// `src/app/euw/[slug]/data.ts`.
//
// Las reglas viven en el dominio puro (`group-titles`, `group-season`, `elo`); aquí solo se cargan
// las partidas de los miembros (una consulta, `getGroupRows`) y se llama a esas funciones. Los
// títulos de `loadGroupView` y de `loadProfileGroupData` salen de la MISMA función (`groupPeriods`)
// y el ELO del perfil es la fila de la Clasificación de `computeGroupElo` (el mismo cálculo que
// `GroupView.elo`), así que coinciden por construcción. Nada se guarda: se calcula al leer (P9).
//
// Exposición de `puuid`: el `puuid` es interno (ver `GroupMember`) y NO sale de este módulo. Antes
// de calcular nada, cada `puuid` de miembro se sustituye por su clave de miembro
// (`memberKey(profileId)` = `String(profileId)`, estable y no sensible). Por eso, en toda la salida
// (ranking, equipos, títulos, tabla de Temporada), los campos que el dominio llama `puuid` o
// `puuids` contienen CLAVES DE MIEMBRO: se cruzan con `GroupViewMember.key`. Un componente cliente
// puede recibirlos tal cual.

import { inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { profiles } from "@/db/schema";
import { getSeasonStart } from "@/lib/config";
import { type ChampionCatalog, profileIconUrl } from "@/lib/ddragon";
import { profileSlug } from "@/lib/riot-id";
import {
  computeGroupElo,
  type EloMatch,
  type EloStanding,
  type GroupElo,
} from "./elo";
import { type GroupMember, listGroupMembers } from "./group";
import {
  computeSeasonTable,
  computeSeasonTeams,
  type SeasonCell,
  type SeasonMatchRow,
  type SeasonTable,
  type SeasonTeams,
} from "./group-season";
import {
  computeGroupPeriod,
  type DisplayedPeriod,
  type GroupPeriodView,
  type PlayerTitle,
  titlesOf,
} from "./group-titles";
import { getGroupRows } from "./queries";

/** Clave estable y no sensible de un miembro en la salida: `String(profileId)`. */
export const memberKey = (profileId: number): string => String(profileId);

/**
 * Sustituye el `championName` de Match-V5 de cada celda por el nombre de visualización del
 * catálogo (por `championId`), con la misma regla que el perfil (`displayName` en `data.ts`:
 * catálogo y, sin él o sin ese campeón, el `championName` de la partida). Así «MonkeyKing» sale
 * como «Wukong» en /grupo igual que en el perfil del miembro.
 */
export function withDisplayNames(
  table: SeasonTable,
  catalog: ChampionCatalog,
): SeasonTable {
  const displayName = new Map(
    catalog.champions.map((c) => [c.championId, c.name]),
  );
  const resolve = (cell: SeasonCell): SeasonCell =>
    cell.championId === null
      ? cell
      : {
          ...cell,
          championName: displayName.get(cell.championId) ?? cell.championName,
        };
  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(
        Object.entries(row.cells).map(([id, cell]) => [id, resolve(cell)]),
      ) as typeof row.cells,
    })),
  };
}

const EMPTY_CATALOG: ChampionCatalog = { version: null, champions: [] };

export interface GroupViewMember {
  profileId: number;
  /** `memberKey(profileId)`: lo que el dominio llama `puuid`/`puuids` en el resto de la salida. */
  key: string;
  gameName: string;
  tagLine: string;
  /** Slug del perfil (`/euw/<slug>`), ya codificado para URL (`profileSlug`). */
  slug: string;
  /** Icono de invocador (Data Dragon); `null` sin icono guardado o sin catálogo. */
  profileIconUrl: string | null;
  /** Última sincronización del perfil; `null` si nunca se ha sincronizado. */
  lastSyncedAt: Date | null;
  /** Contador oficial del challenge 602002 (`profiles.challengeValue`); `null` si no se ha consultado. */
  official: number | null;
  /** `false` mientras el perfil no tiene `puuid` (sin resolver): no aporta partidas. */
  resolved: boolean;
}

/** El miembro con la sincronización menos reciente (aviso de antigüedad de la vista). */
export interface OldestSync {
  profileId: number;
  gameName: string;
  tagLine: string;
  /** `null`: nunca se ha sincronizado (cuenta como el más antiguo). */
  lastSyncedAt: Date | null;
}

export interface GroupView {
  /** Miembros en el orden de `listGroupMembers` (Riot ID normalizado). Incluye los sin resolver. */
  members: GroupViewMember[];
  /** Bloque Hoy: periodo mostrado, ranking, equipos del periodo y títulos del día. */
  day: GroupPeriodView;
  /** Bloque Semana: ídem. */
  week: GroupPeriodView;
  /**
   * ELO del grupo (iter-09): Clasificación de TODOS los miembros (también los sin partidas, con
   * 1500 y provisionales) y periodos del cambio del día y de la semana. Mismas filas y mismo
   * `now` que `day` y `week`. `standings[i].key` es `GroupViewMember.key`.
   */
  elo: GroupElo;
  /** Dúos y tríos de miembros de toda la temporada con 3 o más partidas juntos. */
  seasonTeams: SeasonTeams;
  /** Tabla de Temporada: una fila por miembro (en el orden de `members`) y líderes por columna. */
  seasonTable: SeasonTable;
  /** Campeones del catálogo de datos estáticos (N del perfil); `0` sin catálogo. */
  championTotal: number;
  /** `null` solo si el grupo no tiene miembros. */
  oldestSync: OldestSync | null;
}

/**
 * Periodos mostrados (día y semana) con su ranking y títulos, sobre las filas de los miembros ya
 * con claves de miembro. ÚNICO cálculo de títulos: lo usan `loadGroupView` y `loadProfileTitles`.
 */
function groupPeriods(
  rows: readonly SeasonMatchRow[],
  now: number,
): { day: GroupPeriodView; week: GroupPeriodView } {
  return {
    day: computeGroupPeriod(rows, now, "day"),
    week: computeGroupPeriod(rows, now, "week"),
  };
}

/**
 * Filas de los miembros en la temporada (una consulta), con el `puuid` ya sustituido por la clave
 * de miembro. Los miembros sin `puuid` no aportan filas.
 */
async function loadMemberRows(
  db: Db,
  members: readonly GroupMember[],
  seasonStart: Date,
): Promise<SeasonMatchRow[]> {
  const keyByPuuid = new Map<string, string>();
  for (const member of members) {
    if (member.puuid) {
      keyByPuuid.set(member.puuid, memberKey(member.profileId));
    }
  }
  const rows = await getGroupRows(db, [...keyByPuuid.keys()], seasonStart);
  return rows.map((row) => ({
    ...row,
    // `getGroupRows` solo devuelve puuids de `keyByPuuid`.
    puuid: keyByPuuid.get(row.puuid) as string,
  }));
}

/** El miembro menos recientemente sincronizado; quien nunca se sincronizó (`null`) gana. */
function oldestSyncOf(members: readonly GroupMember[]): OldestSync | null {
  let oldest: GroupMember | null = null;
  for (const member of members) {
    if (
      oldest === null ||
      (oldest.lastSyncedAt !== null &&
        (member.lastSyncedAt === null ||
          member.lastSyncedAt < oldest.lastSyncedAt))
    ) {
      oldest = member;
    }
  }
  return (
    oldest && {
      profileId: oldest.profileId,
      gameName: oldest.gameName,
      tagLine: oldest.tagLine,
      lastSyncedAt: oldest.lastSyncedAt,
    }
  );
}

/**
 * Todo lo que pinta la vista del grupo, con las partidas de la temporada actual en las colas de
 * Arena **solo de los miembros** (un no miembro no entra en ninguna cifra). `now` es epoch en ms
 * (decide el día y la semana de juego). `seasonStart` sale de `SEASON_START` salvo que se pase otro
 * (tests). `catalog` (o su promesa: la página lo pide antes para cargarlo en paralelo) da el
 * total de campeones y la versión de los iconos; sin él, `championTotal` es 0 y no hay iconos. Ver
 * la cabecera del módulo sobre las claves de miembro.
 */
export async function loadGroupView(
  db: Db,
  now: number,
  seasonStart: Date = getSeasonStart(),
  catalog: ChampionCatalog | Promise<ChampionCatalog> = EMPTY_CATALOG,
): Promise<GroupView> {
  const members = await listGroupMembers(db);
  const [rows, extras, championCatalog] = await Promise.all([
    loadMemberRows(db, members, seasonStart),
    members.length === 0
      ? []
      : db
          .select({
            id: profiles.id,
            profileIconId: profiles.profileIconId,
            challengeValue: profiles.challengeValue,
          })
          .from(profiles)
          .where(
            inArray(
              profiles.id,
              members.map((m) => m.profileId),
            ),
          ),
    catalog,
  ]);
  const extraById = new Map(extras.map((e) => [e.id, e]));

  const viewMembers: GroupViewMember[] = members.map((member) => ({
    profileId: member.profileId,
    key: memberKey(member.profileId),
    gameName: member.gameName,
    tagLine: member.tagLine,
    slug: profileSlug(member.gameName, member.tagLine),
    profileIconUrl: profileIconUrl(
      championCatalog.version,
      extraById.get(member.profileId)?.profileIconId ?? null,
    ),
    lastSyncedAt: member.lastSyncedAt,
    official: extraById.get(member.profileId)?.challengeValue ?? null,
    resolved: member.puuid !== null,
  }));

  return {
    members: viewMembers,
    ...groupPeriods(rows, now),
    elo: computeGroupElo(
      rows,
      viewMembers.map((m) => m.key),
      now,
    ),
    seasonTeams: computeSeasonTeams(rows),
    seasonTable: withDisplayNames(
      computeSeasonTable(
        viewMembers.map((m) => ({ puuid: m.key, official: m.official })),
        rows,
      ),
      championCatalog,
    ),
    championTotal: championCatalog.champions.length,
    oldestSync: oldestSyncOf(members),
  };
}

/** Un punto de la gráfica del ELO: rating con decimales tras una partida. */
export interface EloSeriesPoint {
  /** Epoch en ms del inicio de la partida. */
  gameStartTimestamp: number;
  ratingAfter: number;
}

/**
 * ELO de un miembro para su perfil: su fila de la Clasificación de `GroupView.elo` (misma
 * posición, rating, liga y cambios), con el historial indexable por `matchId` y la serie de la
 * gráfica. Serializable (sin `Map`): puede pasar a componentes cliente. No lleva la clave de miembro.
 */
export interface ProfileElo {
  /** Posición en la Clasificación (los empates de rating redondeado la comparten). */
  position: number;
  /** Rating con decimales. */
  rating: number;
  /** Rating mostrado (`Math.round`). */
  roundedRating: number;
  league: EloStanding["league"];
  provisional: boolean;
  /** Partidas de la temporada que cuentan para el rating. */
  games: number;
  /** Desglose de cada partida que cuenta, por `matchId`. */
  matches: Record<string, EloMatch>;
  /** Una entrada por partida que cuenta, en orden cronológico (gráfica del rating). */
  series: EloSeriesPoint[];
  /** Día y semana mostrados por el bloque Hoy / Semana, y lo que cambió el rating en cada uno. */
  day: DisplayedPeriod;
  week: DisplayedPeriod;
  /** `null` si no jugó en el periodo. */
  dayChange: number | null;
  weekChange: number | null;
}

/** ELO del perfil a partir de la Clasificación del grupo. `null` si la clave no está en ella. */
export function profileEloOf(elo: GroupElo, key: string): ProfileElo | null {
  const standing = elo.standings.find((s) => s.key === key);
  if (!standing) return null;
  return {
    position: standing.position,
    rating: standing.rating,
    roundedRating: standing.roundedRating,
    league: standing.league,
    provisional: standing.provisional,
    games: standing.games,
    matches: Object.fromEntries(standing.history.map((m) => [m.matchId, m])),
    series: standing.history.map((m) => ({
      gameStartTimestamp: m.gameStartTimestamp,
      ratingAfter: m.ratingAfter,
    })),
    day: elo.day,
    week: elo.week,
    dayChange: standing.dayChange,
    weekChange: standing.weekChange,
  };
}

/** Lo que el grupo aporta a la cabecera y al cuerpo del perfil de un miembro. */
export interface ProfileGroupData {
  /** Títulos vigentes (día primero, después semana); vacío si no es miembro. */
  titles: PlayerTitle[];
  /** ELO del miembro; `null` si el perfil no es miembro del grupo (o no existe). */
  elo: ProfileElo | null;
}

/**
 * Títulos vigentes de un perfil (los de los periodos que muestra el bloque Hoy / Semana, día
 * primero, incluidos los de dúo y trío de los que forma parte) y su ELO, con UNA sola lectura del
 * grupo (miembros + partidas). Son exactamente `titlesOf(view.day.titles, key)` +
 * `titlesOf(view.week.titles, key)` y la fila de `view.elo` de `loadGroupView`. Para un no miembro
 * (o un perfil que no existe) no se leen partidas: `{ titles: [], elo: null }`.
 */
export async function loadProfileGroupData(
  db: Db,
  profileId: number,
  now: number,
  seasonStart: Date = getSeasonStart(),
): Promise<ProfileGroupData> {
  const members = await listGroupMembers(db);
  if (!members.some((m) => m.profileId === profileId)) {
    return { titles: [], elo: null };
  }
  const rows = await loadMemberRows(db, members, seasonStart);
  const { day, week } = groupPeriods(rows, now);
  const key = memberKey(profileId);
  const elo = computeGroupElo(
    rows,
    members.map((m) => memberKey(m.profileId)),
    now,
  );
  return {
    titles: [...titlesOf(day.titles, key), ...titlesOf(week.titles, key)],
    elo: profileEloOf(elo, key),
  };
}
