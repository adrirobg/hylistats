import { z } from "zod";

// Esquemas de los campos que hylistats usa. Son laxos: los campos que no se listan se
// aceptan y se descartan (Riot añade campos sin avisar); el JSON completo se conserva aparte
// en `raw` (ver `getMatch`). Los fixtures de `tests/fixtures/` son los tests de contrato.

const int = z.number().int();

/** Account-V1 `by-riot-id`. */
export const AccountDto = z.object({
  puuid: z.string().min(1),
  gameName: z.string(),
  tagLine: z.string(),
});
export type AccountDto = z.infer<typeof AccountDto>;

/** Match-V5 `by-puuid/{puuid}/ids`: más reciente primero. */
export const MatchIdsDto = z.array(z.string());
export type MatchIdsDto = z.infer<typeof MatchIdsDto>;

// Ids de augment/ítem: `0` = hueco vacío; si Riot omite el campo se trata como vacío.
const slot = int.default(0);

/** Solo los campos que persiste la tabla `participants`. */
export const ParticipantDto = z.object({
  puuid: z.string().min(1),
  participantId: int,
  riotIdGameName: z.string(),
  riotIdTagline: z.string(),
  championId: int,
  championName: z.string(),
  // 1..6: puesto del equipo. `win` NO equivale a 1º (es true para los puestos 1-3).
  placement: int,
  // Etiqueta arbitraria 1..6: mismos valores = compañeros de trío.
  playerSubteamId: int,
  win: z.boolean(),
  kills: int,
  deaths: int,
  assists: int,
  totalDamageDealtToChampions: int,
  goldEarned: int,
  champLevel: int,
  totalDamageTaken: int,
  largestKillingSpree: int,
  playerAugment1: slot,
  playerAugment2: slot,
  playerAugment3: slot,
  playerAugment4: slot,
  playerAugment5: slot,
  playerAugment6: slot,
  item0: slot,
  item1: slot,
  item2: slot,
  item3: slot,
  item4: slot,
  item5: slot,
  item6: slot,
});
export type ParticipantDto = z.infer<typeof ParticipantDto>;

/** Match-V5 `matches/{matchId}`. Timestamps en ms, `gameDuration` en segundos. */
export const MatchDto = z.object({
  metadata: z.object({
    matchId: z.string().min(1),
    participants: z.array(z.string()),
  }),
  info: z.object({
    gameCreation: z.number(),
    gameStartTimestamp: z.number(),
    gameEndTimestamp: z.number(),
    gameDuration: z.number(),
    gameVersion: z.string(),
    queueId: int,
    endOfGameResult: z.string().optional(),
    participants: z.array(ParticipantDto),
  }),
});
export type MatchDto = z.infer<typeof MatchDto>;

/** Challenges-V1 `player-data`: solo la lista de retos (`602002` = Arena God). */
export const PlayerDataDto = z.object({
  challenges: z.array(
    z.object({
      challengeId: int,
      value: z.number(),
      level: z.string(),
      percentile: z.number().optional(),
      achievedTime: z.number().optional(),
    }),
  ),
});
export type PlayerDataDto = z.infer<typeof PlayerDataDto>;

/** Summoner-V4 `by-puuid`: solo el icono de perfil (ya no trae `id` ni `name`). */
export const SummonerDto = z.object({
  puuid: z.string().min(1),
  profileIconId: int,
});
export type SummonerDto = z.infer<typeof SummonerDto>;
