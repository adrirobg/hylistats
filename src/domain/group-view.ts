// Carga de datos de la vista del grupo (iter-05, T04): una sola función (`loadGroupView`) devuelve
// todo lo que pintan `/grupo`, la pestaña Grupo y los badges, y otra ligera (`loadProfileTitles`)
// los títulos vigentes de un perfil para su cabecera. Va en su propio módulo para no hacer crecer
// `src/app/euw/[slug]/data.ts`.
//
// Las reglas viven en el dominio puro (`group-titles`, `group-season`); aquí solo se cargan las
// partidas de los miembros (una consulta, `getGroupRows`) y se llama a esas funciones. Los títulos
// de `loadGroupView` y de `loadProfileTitles` salen de la MISMA función (`groupPeriods`), así que
// coinciden por construcción. Nada se guarda: se calcula al leer (P9).
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
import { type GroupMember, isGroupMember, listGroupMembers } from "./group";
import {
  computeSeasonTable,
  computeSeasonTeams,
  type SeasonMatchRow,
  type SeasonTable,
  type SeasonTeams,
} from "./group-season";
import {
  computeGroupPeriod,
  type GroupPeriodView,
  type PlayerTitle,
  titlesOf,
} from "./group-titles";
import { getGroupRows } from "./queries";

/** Clave estable y no sensible de un miembro en la salida: `String(profileId)`. */
export const memberKey = (profileId: number): string => String(profileId);

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
    seasonTeams: computeSeasonTeams(rows),
    seasonTable: computeSeasonTable(
      viewMembers.map((m) => ({ puuid: m.key, official: m.official })),
      rows,
    ),
    championTotal: championCatalog.champions.length,
    oldestSync: oldestSyncOf(members),
  };
}

/**
 * Títulos vigentes de un perfil para su cabecera: los de los periodos que muestra el bloque Hoy /
 * Semana (día primero, después semana), incluidos los de dúo y trío de los que forma parte. Lista
 * vacía si el perfil no es miembro (o no existe). Usa el mismo cálculo que `loadGroupView`
 * (`groupPeriods`): son exactamente los de `titlesOf(view.day.titles, key)` y
 * `titlesOf(view.week.titles, key)`.
 */
export async function loadProfileTitles(
  db: Db,
  profileId: number,
  now: number,
  seasonStart: Date = getSeasonStart(),
): Promise<PlayerTitle[]> {
  if (!(await isGroupMember(db, profileId))) return [];
  const members = await listGroupMembers(db);
  const { day, week } = groupPeriods(
    await loadMemberRows(db, members, seasonStart),
    now,
  );
  const key = memberKey(profileId);
  return [...titlesOf(day.titles, key), ...titlesOf(week.titles, key)];
}
