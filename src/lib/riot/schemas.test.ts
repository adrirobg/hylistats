import { describe, expect, it } from "vitest";
import {
  listMatchFixtureIds,
  readFixtureJson,
} from "../../../tests/helpers/riot";
import {
  AccountDto,
  MatchDto,
  MatchIdsDto,
  ParticipantDto,
  PlayerDataDto,
} from "./schemas";

// Contrato: los fixtures reales de `tests/fixtures/` deben pasar; los campos extra se toleran.

type Json = Record<string, unknown>;

const fixtureMatch = () =>
  readFixtureJson<{ info: { participants: Json[] } } & Json>(
    `matches/${listMatchFixtureIds()[0]}.json`,
  );

describe("esquemas Zod de la Riot API", () => {
  it("aceptan todos los fixtures reales", () => {
    expect(AccountDto.parse(readFixtureJson("account.json"))).toMatchObject({
      puuid: "anon-puuid-self",
    });
    expect(
      MatchIdsDto.parse(readFixtureJson("match-ids.json")).length,
    ).toBeGreaterThan(0);
    expect(() =>
      PlayerDataDto.parse(readFixtureJson("player-data.json")),
    ).not.toThrow();
    for (const id of listMatchFixtureIds()) {
      expect(
        () => MatchDto.parse(readFixtureJson(`matches/${id}.json`)),
        id,
      ).not.toThrow();
    }
  });

  it("toleran campos extra: se descartan sin error", () => {
    const account = AccountDto.parse({
      puuid: "p",
      gameName: "g",
      tagLine: "t",
      campoNuevo: 1,
    });
    expect(account).toEqual({ puuid: "p", gameName: "g", tagLine: "t" });
    // Los fixtures traen ~170 campos por participante; solo quedan los usados.
    const match = MatchDto.parse(fixtureMatch());
    expect(Object.keys(match.info.participants[0] as object)).not.toContain(
      "summonerName",
    );
  });

  it("los augments e ítems ausentes valen 0", () => {
    const base = {
      puuid: "p",
      participantId: 1,
      riotIdGameName: "g",
      riotIdTagline: "t",
      championId: 1,
      championName: "Annie",
      placement: 1,
      playerSubteamId: 1,
      win: true,
      kills: 0,
      deaths: 0,
      assists: 0,
      totalDamageDealtToChampions: 0,
      goldEarned: 0,
      champLevel: 1,
    };
    const participant = ParticipantDto.parse({ ...base, playerAugment1: 42 });
    expect(participant.playerAugment1).toBe(42);
    expect(participant.playerAugment2).toBe(0);
    expect(participant.playerAugment6).toBe(0);
    expect(participant.item0).toBe(0);
    expect(participant.item6).toBe(0);
  });

  it("endOfGameResult, percentile y achievedTime son opcionales", () => {
    const raw = fixtureMatch();
    const info = { ...(raw.info as Json) };
    delete info.endOfGameResult;
    expect(
      MatchDto.parse({ ...raw, info }).info.endOfGameResult,
    ).toBeUndefined();

    const data = PlayerDataDto.parse({
      challenges: [{ challengeId: 1, value: 2, level: "NONE" }],
    });
    expect(data.challenges[0]).toEqual({
      challengeId: 1,
      value: 2,
      level: "NONE",
    });
  });

  it("rechazan lo que no cumple el contrato", () => {
    expect(AccountDto.safeParse({ puuid: "p" }).success).toBe(false);
    expect(
      AccountDto.safeParse({ puuid: "", gameName: "g", tagLine: "t" }).success,
    ).toBe(false);
    expect(MatchIdsDto.safeParse([1, 2]).success).toBe(false);
    const raw = fixtureMatch();
    const participants = raw.info.participants.map((p) => ({ ...p }));
    delete (participants[0] as Json).placement;
    expect(
      MatchDto.safeParse({ ...raw, info: { ...raw.info, participants } })
        .success,
    ).toBe(false);
    expect(PlayerDataDto.safeParse({}).success).toBe(false);
  });
});
