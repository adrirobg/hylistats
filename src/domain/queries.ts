import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { matches, participants, profiles } from "@/db/schema";
import { ARENA_QUEUE_IDS, getSeasonStart } from "@/lib/config";
import { lastGameAt } from "./album";
import type { RecordRow } from "./records";
import {
  type ChallengeComparison,
  compareWithChallenge,
  computeSummary,
  computeTeammates,
  type PlayerMatchRow,
  type StatsSummary,
  type TeammateRow,
  type TeammateStats,
  type VerifiedChampion,
  verifiedChampions,
} from "./stats";

// Consultas de BD que alimentan el dominio. Todas acotan a la temporada: las dos colas de Arena
// tríos (`queueId` 1750 y 1740, `ARENA_QUEUE_IDS`) y `gameCreation >= seasonStart`. El orden de las
// filas es cronológico ascendente (`gameCreation`, `matchId`) para que el resultado sea
// determinista.

/**
 * Partidas del jugador dentro de la temporada, una fila por partida.
 * `puuid` es interno (viene del perfil): no se expone.
 */
export async function getPlayerRows(
  db: Db,
  puuid: string,
  seasonStart: Date,
): Promise<PlayerMatchRow[]> {
  return db
    .select({
      matchId: participants.matchId,
      gameCreation: matches.gameCreation,
      championId: participants.championId,
      championName: participants.championName,
      placement: participants.placement,
      playerSubteamId: participants.playerSubteamId,
    })
    .from(participants)
    .innerJoin(matches, eq(matches.matchId, participants.matchId))
    .where(
      and(
        eq(participants.puuid, puuid),
        inArray(matches.queueId, [...ARENA_QUEUE_IDS]),
        gte(matches.gameCreation, seasonStart.getTime()),
      ),
    )
    .orderBy(asc(matches.gameCreation), asc(participants.matchId));
}

/**
 * Partidas del jugador dentro de la temporada con las columnas que usan los récords de la pestaña
 * Estadísticas (`computeRecords`). Mismo filtro y orden que `getPlayerRows`. `totalDamageTaken` y
 * `largestKillingSpree` pueden ser `null` (partidas sin el dato): el dominio los trata como «sin
 * dato».
 */
export async function getRecordRows(
  db: Db,
  puuid: string,
  seasonStart: Date,
): Promise<RecordRow[]> {
  return db
    .select({
      matchId: participants.matchId,
      gameCreation: matches.gameCreation,
      gameStartTimestamp: matches.gameStartTimestamp,
      championId: participants.championId,
      championName: participants.championName,
      placement: participants.placement,
      kills: participants.kills,
      deaths: participants.deaths,
      totalDamageDealtToChampions: participants.totalDamageDealtToChampions,
      totalDamageTaken: participants.totalDamageTaken,
      largestKillingSpree: participants.largestKillingSpree,
    })
    .from(participants)
    .innerJoin(matches, eq(matches.matchId, participants.matchId))
    .where(
      and(
        eq(participants.puuid, puuid),
        inArray(matches.queueId, [...ARENA_QUEUE_IDS]),
        gte(matches.gameCreation, seasonStart.getTime()),
      ),
    )
    .orderBy(asc(matches.gameCreation), asc(participants.matchId));
}

/**
 * Filas para `computeTeammates`: por cada partida del jugador dentro de la temporada, su propia
 * fila y las de su trío (mismo `playerSubteamId`; 3 filas por partida). Se filtra en SQL para no
 * traer los 18 participantes de cada partida; `computeTeammates` sigue filtrando por subteam,
 * así que también funciona con las 18 filas.
 */
export async function getTeammateRows(
  db: Db,
  puuid: string,
  seasonStart: Date,
): Promise<TeammateRow[]> {
  const mine = alias(participants, "mine");
  return db
    .select({
      matchId: participants.matchId,
      gameCreation: matches.gameCreation,
      puuid: participants.puuid,
      riotIdGameName: participants.riotIdGameName,
      riotIdTagline: participants.riotIdTagline,
      placement: participants.placement,
      playerSubteamId: participants.playerSubteamId,
    })
    .from(participants)
    .innerJoin(matches, eq(matches.matchId, participants.matchId))
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
        inArray(matches.queueId, [...ARENA_QUEUE_IDS]),
        gte(matches.gameCreation, seasonStart.getTime()),
      ),
    )
    .orderBy(
      asc(matches.gameCreation),
      asc(participants.matchId),
      asc(participants.participantId),
    );
}

/**
 * Compañero tal y como lo recibe la UI: `TeammateStats` sin `puuid`. El `puuid` es interno (cifrado
 * por key, identifica a un jugador) y no sale de la capa de dominio hacia la UI ni las URLs.
 */
export type TeammateSummary = Omit<TeammateStats, "puuid">;

// Lista blanca explícita: un campo nuevo en `TeammateStats` no llega a la UI sin decidirlo aquí.
const toTeammateSummary = (t: TeammateStats): TeammateSummary => ({
  gameName: t.gameName,
  tagLine: t.tagLine,
  games: t.games,
  firsts: t.firsts,
  top3: t.top3,
  avgPlacement: t.avgPlacement,
  lastPlayedAt: t.lastPlayedAt,
});

export interface ProfileChallenge {
  /** `profiles.challengeValue` (challenge 602002); `null` si aún no se ha consultado. */
  value: number | null;
  level: string | null;
  checkedAt: Date | null;
  /** Recuento propio de campeones verificados (`verifiedChampions.length`) frente a `value`. */
  comparison: ChallengeComparison;
}

/** Stats de un perfil dentro de la temporada: todo lo que necesita la página de perfil. */
export interface ProfileStats {
  summary: StatsSummary;
  /** Epoch en ms de la última partida de la temporada; `null` sin partidas. */
  lastGameAt: number | null;
  verifiedChampions: VerifiedChampion[];
  /**
   * Partidas del jugador en la temporada (cronológicas): la materia prima del álbum (`buildAlbum`).
   * Uso interno de la capa de carga; la página recibe el álbum ya construido, no estas filas.
   */
  playerRows: PlayerMatchRow[];
  teammates: TeammateSummary[];
  challenge: ProfileChallenge;
}

/**
 * Compone las stats de un perfil registrado. `null` si el perfil no existe. Un perfil sin
 * `puuid` todavía (resolviéndose) devuelve las stats vacías. `seasonStart` sale de la
 * configuración (`SEASON_START`) salvo que se pase otro (tests).
 */
export async function getProfileStats(
  db: Db,
  profileId: number,
  seasonStart: Date = getSeasonStart(),
): Promise<ProfileStats | null> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) return null;

  const [playerRows, teammateRows] = profile.puuid
    ? await Promise.all([
        getPlayerRows(db, profile.puuid, seasonStart),
        getTeammateRows(db, profile.puuid, seasonStart),
      ])
    : [[], []];

  const verified = verifiedChampions(playerRows);
  return {
    summary: computeSummary(playerRows),
    lastGameAt: lastGameAt(playerRows),
    verifiedChampions: verified,
    playerRows,
    teammates: profile.puuid
      ? computeTeammates(teammateRows, profile.puuid).map(toTeammateSummary)
      : [],
    challenge: {
      value: profile.challengeValue,
      level: profile.challengeLevel,
      checkedAt: profile.challengeCheckedAt,
      comparison: compareWithChallenge(verified.length, profile.challengeValue),
    },
  };
}
