import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { matches, participants, profiles } from "@/db/schema";
import { ARENA_QUEUE_IDS } from "@/lib/config";
import { normalizeRiotId } from "@/lib/riot-id";

// Consultas de la pestaña Partidas (brief §3.5): la lista de partidas del jugador con filtros y el
// detalle 6×3 de una. Como el resto de consultas de BD, acotan a la temporada y a las dos colas de
// Arena tríos (`ARENA_QUEUE_IDS`, `gameCreation >= seasonStart`). `puuid` es interno: identifica al
// jugador dentro de estas consultas y no sale de aquí; a la UI le llegan `isSelf` e `isOwnTeam`.

/** Otro jugador del trío, tal y como se muestra: su Riot ID en esa partida. */
export interface MatchMate {
  gameName: string;
  tagLine: string;
}

/** Una fila de la lista de partidas (una partida del jugador). */
export interface MatchListRow {
  matchId: string;
  /** Epoch en ms. */
  gameCreation: number;
  /** Segundos. */
  gameDuration: number;
  championId: number;
  /** Nombre de la partida (Riot); la carga lo sustituye por el de visualización del catálogo. */
  championName: string;
  placement: number;
  /** Los otros dos jugadores del trío (mismo `playerSubteamId`), por orden de participante. */
  trio: MatchMate[];
}

export interface MatchList {
  rows: MatchListRow[];
  /** Partidas que cumplen los filtros (no solo las `rows` devueltas): para «Mostrar 50 más». */
  total: number;
}

/** `1`: solo victorias (1º puesto); `top3`: puestos 1º a 3º. */
export type PuestoFilter = "1" | "top3";

export interface MatchListFilters {
  /**
   * `championId` que casan con la búsqueda de campeón. Los resuelve quien llama (la búsqueda es por
   * nombre de visualización, y ese es del catálogo); aquí solo se filtra por id. `undefined` = sin
   * búsqueda; una lista vacía = ninguna partida.
   */
  championIds?: readonly number[];
  puesto?: PuestoFilter;
  /** Riot ID de un compañero de trío: solo las partidas en las que estuvo en el mismo equipo. */
  companero?: { gameName: string; tagLine: string };
  /** Cuántas partidas devolver (las más recientes). */
  limit: number;
}

/**
 * Partidas del jugador de la temporada, la más reciente primero, con los filtros dados. Cada una
 * con sus dos compañeros de trío. `total` cuenta todas las que cumplen los filtros.
 */
export async function getMatchList(
  db: Db,
  puuid: string,
  seasonStart: Date,
  filters: MatchListFilters,
): Promise<MatchList> {
  const { championIds, puesto, companero, limit } = filters;
  if (limit <= 0 || championIds?.length === 0) return { rows: [], total: 0 };

  const conditions = [
    eq(participants.puuid, puuid),
    inArray(matches.queueId, [...ARENA_QUEUE_IDS]),
    gte(matches.gameCreation, seasonStart.getTime()),
    championIds && inArray(participants.championId, [...championIds]),
    puesto === "1" ? eq(participants.placement, 1) : undefined,
    puesto === "top3" ? lte(participants.placement, 3) : undefined,
    companero && withMate(db, puuid, companero),
  ];

  const found = await db
    .select({
      matchId: participants.matchId,
      gameCreation: matches.gameCreation,
      gameDuration: matches.gameDuration,
      championId: participants.championId,
      championName: participants.championName,
      placement: participants.placement,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(participants)
    .innerJoin(matches, eq(matches.matchId, participants.matchId))
    .where(and(...conditions))
    .orderBy(desc(matches.gameCreation), desc(participants.matchId))
    .limit(limit);
  if (found.length === 0) return { rows: [], total: 0 };

  const trios = await getTrios(
    db,
    puuid,
    found.map((row) => row.matchId),
  );
  return {
    rows: found.map(({ total: _total, ...row }) => ({
      ...row,
      trio: trios.get(row.matchId) ?? [],
    })),
    // `count(*) over ()` se calcula antes del `limit`: es el mismo en todas las filas.
    total: found[0].total,
  };
}

/**
 * «Jugó en mi equipo alguien con este Riot ID»: existe en la misma partida y `playerSubteamId` un
 * participante con ese Riot ID (sin distinguir mayúsculas). El Riot ID se busca en toda la tabla
 * para llegar al `puuid` del compañero, y por él se casan también las partidas de antes de que se
 * cambiara el nombre: así el filtro da las mismas partidas que cuenta la pestaña Compañeros.
 */
function withMate(
  db: Db,
  puuid: string,
  riotId: { gameName: string; tagLine: string },
) {
  const mate = alias(participants, "mate");
  const named = alias(participants, "named");
  const wanted = normalizeRiotId(riotId.gameName, riotId.tagLine);
  return exists(
    db
      .select({ one: sql`1` })
      .from(mate)
      .where(
        and(
          eq(mate.matchId, participants.matchId),
          eq(mate.playerSubteamId, participants.playerSubteamId),
          ne(mate.puuid, puuid),
          inArray(
            mate.puuid,
            db
              .select({ puuid: named.puuid })
              .from(named)
              .where(
                sql`lower(btrim(${named.riotIdGameName})) || '#' || lower(btrim(${named.riotIdTagline})) = ${wanted}`,
              ),
          ),
        ),
      ),
  );
}

/** Los otros dos jugadores del trío del jugador en cada partida de `matchIds`. */
async function getTrios(
  db: Db,
  puuid: string,
  matchIds: string[],
): Promise<Map<string, MatchMate[]>> {
  const mine = alias(participants, "mine");
  const found = await db
    .select({
      matchId: participants.matchId,
      gameName: participants.riotIdGameName,
      tagLine: participants.riotIdTagline,
    })
    .from(participants)
    .innerJoin(
      mine,
      and(
        eq(mine.matchId, participants.matchId),
        eq(mine.puuid, puuid),
        eq(mine.playerSubteamId, participants.playerSubteamId),
      ),
    )
    .where(
      and(
        inArray(participants.matchId, matchIds),
        ne(participants.puuid, puuid),
      ),
    )
    .orderBy(asc(participants.matchId), asc(participants.participantId));

  const trios = new Map<string, MatchMate[]>();
  for (const { matchId, gameName, tagLine } of found) {
    const trio = trios.get(matchId);
    if (trio) trio.push({ gameName, tagLine });
    else trios.set(matchId, [{ gameName, tagLine }]);
  }
  return trios;
}

/** Un jugador del detalle de una partida. */
export interface MatchPlayer {
  gameName: string;
  tagLine: string;
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  /** `totalDamageDealtToChampions`. */
  damage: number;
  /** `totalDamageTaken`; `null` si la partida se guardó antes de que existiera la columna. */
  damageTaken: number | null;
  /** `largestKillingSpree`; `null` como `damageTaken`. */
  killingSpree: number | null;
  gold: number;
  level: number;
  /** Ids de augment, sin los huecos (`0`), en el orden de la partida. */
  augments: number[];
  /** Ids de objeto (`item0..item6`, el último es el amuleto), sin los huecos (`0`). */
  items: number[];
  /** Es el jugador del perfil. */
  isSelf: boolean;
}

export interface MatchTeam {
  placement: number;
  /** Es el equipo del jugador del perfil (se resalta aunque quede 5º o 6º). */
  isOwnTeam: boolean;
  players: MatchPlayer[];
}

export interface MatchDetail {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  /** Campeón y puesto del jugador del perfil: bastan para pintar la cabecera de la partida. */
  championId: number;
  championName: string;
  placement: number;
  /** Los 6 equipos, del 1º al 6º puesto. */
  teams: MatchTeam[];
}

/**
 * Detalle de una partida del jugador: los equipos de 3 ordenados por puesto. `null` si la partida
 * no existe, no es del jugador o queda fuera de la temporada o de las colas de Arena tríos.
 */
export async function getMatchDetail(
  db: Db,
  puuid: string,
  matchId: string,
  seasonStart: Date,
): Promise<MatchDetail | null> {
  const [own] = await db
    .select({
      gameCreation: matches.gameCreation,
      gameDuration: matches.gameDuration,
      championId: participants.championId,
      championName: participants.championName,
      placement: participants.placement,
      subteamId: participants.playerSubteamId,
    })
    .from(participants)
    .innerJoin(matches, eq(matches.matchId, participants.matchId))
    .where(
      and(
        eq(participants.puuid, puuid),
        eq(participants.matchId, matchId),
        inArray(matches.queueId, [...ARENA_QUEUE_IDS]),
        gte(matches.gameCreation, seasonStart.getTime()),
      ),
    )
    .limit(1);
  if (!own) return null;

  const all = await db
    .select({
      puuid: participants.puuid,
      subteamId: participants.playerSubteamId,
      placement: participants.placement,
      gameName: participants.riotIdGameName,
      tagLine: participants.riotIdTagline,
      championId: participants.championId,
      championName: participants.championName,
      kills: participants.kills,
      deaths: participants.deaths,
      assists: participants.assists,
      damage: participants.totalDamageDealtToChampions,
      damageTaken: participants.totalDamageTaken,
      killingSpree: participants.largestKillingSpree,
      gold: participants.goldEarned,
      level: participants.champLevel,
      augments: participants.augments,
      items: participants.items,
    })
    .from(participants)
    .where(eq(participants.matchId, matchId))
    .orderBy(asc(participants.placement), asc(participants.participantId));

  const teams = new Map<number, MatchTeam>();
  for (const { puuid: playerPuuid, subteamId, ...player } of all) {
    const team = teams.get(subteamId) ?? {
      placement: player.placement,
      isOwnTeam: subteamId === own.subteamId,
      players: [],
    };
    team.players.push({
      gameName: player.gameName,
      tagLine: player.tagLine,
      championId: player.championId,
      championName: player.championName,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      damage: player.damage,
      damageTaken: player.damageTaken,
      killingSpree: player.killingSpree,
      gold: player.gold,
      level: player.level,
      augments: player.augments.filter((id) => id !== 0),
      items: player.items.filter((id) => id !== 0),
      isSelf: playerPuuid === puuid,
    });
    teams.set(subteamId, team);
  }

  return {
    matchId,
    gameCreation: own.gameCreation,
    gameDuration: own.gameDuration,
    championId: own.championId,
    championName: own.championName,
    placement: own.placement,
    // Ya llegan por puesto (el orden de la consulta), pero el `Map` no lo garantiza para equipos
    // con el mismo puesto: se ordena por puesto y, a igualdad, por el orden de llegada.
    teams: [...teams.values()].sort((a, b) => a.placement - b.placement),
  };
}

/** Lo que pide la pestaña Partidas de un perfil: la lista con filtros y, si se pide, una partida abierta. */
export interface ProfileMatches {
  list: MatchList;
  /** `null` si no se pidió partida o no existe/no es del perfil (`getMatchDetail`). */
  detail: MatchDetail | null;
}

/**
 * `getMatchList` y `getMatchDetail` de un perfil registrado, por su id: resuelve el `puuid` aquí
 * dentro, así que quien llama (la carga de la página) nunca lo lee. Un perfil sin `puuid` todavía
 * (resolviéndose) o inexistente devuelve una lista vacía.
 */
export async function getProfileMatches(
  db: Db,
  profileId: number,
  seasonStart: Date,
  request: { filters: MatchListFilters; matchId: string | null },
): Promise<ProfileMatches> {
  const [profile] = await db
    .select({ puuid: profiles.puuid })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile?.puuid) return { list: { rows: [], total: 0 }, detail: null };
  const [list, detail] = await Promise.all([
    getMatchList(db, profile.puuid, seasonStart, request.filters),
    request.matchId === null
      ? null
      : getMatchDetail(db, profile.puuid, request.matchId, seasonStart),
  ]);
  return { list, detail };
}
