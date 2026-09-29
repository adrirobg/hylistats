import { gzipSync } from "node:zlib";
import type { Db } from "@/db";
import {
  matches,
  type NewMatch,
  type NewParticipant,
  participants,
} from "@/db/schema";
import type { MatchDto, ParticipantDto } from "@/lib/riot/schemas";

export interface MatchRows {
  match: NewMatch;
  /** Un registro por participante de la partida (18 en Arena tríos). */
  participants: NewParticipant[];
}

/** `playerAugment1..6` en orden; `0` = hueco vacío. */
function augmentsOf(p: ParticipantDto): number[] {
  return [
    p.playerAugment1,
    p.playerAugment2,
    p.playerAugment3,
    p.playerAugment4,
    p.playerAugment5,
    p.playerAugment6,
  ];
}

/** `item0..item5` y `item6` (amuleto) en orden. */
function itemsOf(p: ParticipantDto): number[] {
  return [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
}

/**
 * Mapeo puro de una partida Match-V5 a las filas de `matches` y `participants`.
 * No incluye `rawGz` (lo añade `storeMatch`, que es quien tiene el JSON original) ni
 * `fetchedAt` (lo pone la BD).
 */
export function matchToRows(match: MatchDto): MatchRows {
  const { metadata, info } = match;
  return {
    match: {
      matchId: metadata.matchId,
      queueId: info.queueId,
      gameCreation: info.gameCreation,
      gameStartTimestamp: info.gameStartTimestamp,
      gameEndTimestamp: info.gameEndTimestamp,
      // Segundos; la columna es `integer`.
      gameDuration: Math.round(info.gameDuration),
      gameVersion: info.gameVersion,
      endOfGameResult: info.endOfGameResult ?? null,
    },
    participants: info.participants.map((p) => ({
      matchId: metadata.matchId,
      puuid: p.puuid,
      participantId: p.participantId,
      riotIdGameName: p.riotIdGameName,
      riotIdTagline: p.riotIdTagline,
      championId: p.championId,
      championName: p.championName,
      placement: p.placement,
      playerSubteamId: p.playerSubteamId,
      win: p.win,
      augments: augmentsOf(p),
      items: itemsOf(p),
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions,
      goldEarned: p.goldEarned,
      champLevel: p.champLevel,
    })),
  };
}

export interface StoreMatchResult {
  /** `true` si la partida se insertó ahora; `false` si ya estaba guardada (no se toca nada). */
  inserted: boolean;
}

/**
 * Guarda una partida (`matches` + sus `participants`) en una única transacción. Es idempotente:
 * la PK y `onConflictDoNothing` hacen que guardar dos veces la misma partida (o dos workers a la
 * vez) deje una sola copia; las partidas son inmutables, así que no hay nada que actualizar.
 *
 * `raw` es el JSON original de Riot tal cual (`getMatch().raw`); se guarda comprimido con gzip.
 */
export async function storeMatch(
  db: Db,
  match: MatchDto,
  raw: string,
): Promise<StoreMatchResult> {
  const rows = matchToRows(match);
  return db.transaction(async (tx) => {
    const created = await tx
      .insert(matches)
      .values({ ...rows.match, rawGz: gzipSync(raw) })
      .onConflictDoNothing()
      .returning({ matchId: matches.matchId });

    if (rows.participants.length > 0) {
      await tx
        .insert(participants)
        .values(rows.participants)
        .onConflictDoNothing();
    }
    return { inserted: created.length > 0 };
  });
}
