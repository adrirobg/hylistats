import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { profiles } from "@/db/schema";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  loadMatchFixtures,
  type MatchFixture,
  promoteTrioToFirst,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { storeMatch } from "./ingest";
import { getProfileStats, getTeammateRows } from "./queries";
import { computeTeammates } from "./stats";

const db = getTestDb();
const fixtures = loadMatchFixtures();
const seasonStart = new Date("2026-05-12T00:00:00Z");

beforeEach(truncateAll);
afterAll(closeDb);

async function storeAll() {
  for (const f of fixtures) await storeMatch(db, f.match, f.raw);
}

async function storeVariant(
  fixture: MatchFixture,
  matchId: string,
  mutate: Parameters<typeof variantOf>[2],
) {
  const v = variantOf(fixture, matchId, mutate);
  await storeMatch(db, v.match, v.raw);
}

async function insertProfile(
  overrides: Partial<typeof profiles.$inferInsert> = {},
) {
  const [profile] = await db
    .insert(profiles)
    .values({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
      riotIdNorm: "bejito mambo#1991",
      puuid: SELF_PUUID,
      status: "active",
      ...overrides,
    })
    .returning();
  return profile;
}

describe("getTeammateRows", () => {
  it("devuelve las 3 filas del trío del jugador por partida (él incluido)", async () => {
    await storeAll();
    const rows = await getTeammateRows(db, SELF_PUUID, seasonStart);
    expect(rows).toHaveLength(30); // 10 partidas x 3 (los 15 rivales quedan fuera)
    for (const f of fixtures) {
      const inMatch = rows.filter((r) => r.matchId === f.id);
      expect(inMatch).toHaveLength(3);
      expect(inMatch.some((r) => r.puuid === SELF_PUUID)).toBe(true);
      expect(new Set(inMatch.map((r) => r.playerSubteamId)).size).toBe(1);
    }
    // Orden cronológico ascendente.
    expect([...new Set(rows.map((r) => r.matchId))]).toEqual(
      fixtures.map((f) => f.id),
    );
  });

  it("alimenta computeTeammates con el mismo resultado que las 18 filas de cada partida", async () => {
    await storeAll();
    const fromDb = computeTeammates(
      await getTeammateRows(db, SELF_PUUID, seasonStart),
      SELF_PUUID,
    );
    // Recuento esperado (ver `stats.test.ts`): 013 x10, 046 x5, 115 x2, 012/022/152 x1.
    expect(fromDb.map((t) => [t.puuid, t.games])).toEqual([
      ["anon-puuid-013", 10],
      ["anon-puuid-046", 5],
      ["anon-puuid-115", 2],
      ["anon-puuid-012", 1],
      ["anon-puuid-022", 1],
      ["anon-puuid-152", 1],
    ]);
    const allRows = fixtures.flatMap((f) =>
      f.match.info.participants.map((p) => ({
        matchId: f.id,
        puuid: p.puuid,
        riotIdGameName: p.riotIdGameName,
        riotIdTagline: p.riotIdTagline,
        placement: p.placement,
        playerSubteamId: p.playerSubteamId,
      })),
    );
    expect(fromDb).toEqual(computeTeammates(allRows, SELF_PUUID));
  });

  it("filtra por cola y temporada como getPlayerRows", async () => {
    await storeAll();
    await storeVariant(fixtures[0], "EUW1_TEST_OTHER_QUEUE", (j) => {
      j.info.queueId = 1700;
    });
    await storeVariant(fixtures[0], "EUW1_TEST_PRE_SEASON", (j) => {
      j.info.gameCreation = seasonStart.getTime() - 1;
    });
    const rows = await getTeammateRows(db, SELF_PUUID, seasonStart);
    expect(rows).toHaveLength(30);
    expect(rows.some((r) => r.matchId.startsWith("EUW1_TEST_"))).toBe(false);
  });

  it("un jugador desconocido no devuelve filas", async () => {
    await storeAll();
    expect(await getTeammateRows(db, "anon-puuid-nadie", seasonStart)).toEqual(
      [],
    );
  });
});

describe("getProfileStats", () => {
  it("null si el perfil no existe", async () => {
    expect(await getProfileStats(db, 999, seasonStart)).toBeNull();
  });

  it("perfil sin puuid (resolviéndose): stats vacías", async () => {
    await storeAll();
    const profile = await insertProfile({ puuid: null, status: "resolving" });
    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats).toMatchObject({
      summary: { games: 0, firsts: 0, avgPlacement: null },
      verifiedChampions: [],
      teammates: [],
      challenge: {
        value: null,
        level: null,
        checkedAt: null,
        comparison: { status: "unknown", diff: null },
      },
    });
  });

  it("compone resumen, campeones verificados, compañeros y comparación con el challenge", async () => {
    await storeAll();
    // 1º sintético del jugador (Blitzcrank, 53) en una partida posterior a las reales.
    await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
      j.info.gameCreation = 1_790_700_000_000;
      promoteTrioToFirst(j, SELF_PUUID);
    });
    const checkedAt = new Date("2026-09-29T12:00:00Z");
    const profile = await insertProfile({
      challengeValue: 75,
      challengeLevel: "MASTER",
      challengeCheckedAt: checkedAt,
    });

    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats).not.toBeNull();
    if (!stats) return;

    // 10 partidas reales [5,3,3,3,5,6,4,4,2,2] + la sintética con puesto 1 (#1: 3º -> 1º).
    // Suma = 37 + 1 = 38 -> media 38/11.
    expect(stats.summary.games).toBe(11);
    expect(stats.summary.firsts).toBe(1);
    expect(stats.summary.top3).toBe(6);
    expect(stats.summary.avgPlacement).toBeCloseTo(38 / 11, 10);
    expect(stats.summary.distribution).toEqual({
      1: 1,
      2: 2,
      3: 3,
      4: 2,
      5: 2,
      6: 1,
    });

    expect(stats.verifiedChampions).toEqual([
      {
        championId: 53,
        championName: "Blitzcrank",
        firsts: 1,
        firstWinMatchId: "EUW1_TEST_FIRST",
        firstWinAt: 1_790_700_000_000,
        lastWinMatchId: "EUW1_TEST_FIRST",
        lastWinAt: 1_790_700_000_000,
      },
    ]);

    // 013 está en las 11 (la sintética copia la #1: compañeros 115 y 013).
    expect(stats.teammates.map((t) => [t.gameName, t.games, t.firsts])).toEqual(
      [
        ["Player013", 11, 1],
        ["Player046", 5, 0],
        ["Player115", 3, 1],
        ["Player012", 1, 0],
        ["Player022", 1, 0],
        ["Player152", 1, 0],
      ],
    );

    // 1 campeón verificado frente a 75 del challenge.
    expect(stats.challenge).toEqual({
      value: 75,
      level: "MASTER",
      checkedAt,
      comparison: { status: "diff", diff: -74 },
    });
  });

  it("el puuid no sale en las stats para la UI", async () => {
    await storeAll();
    const profile = await insertProfile();
    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats?.teammates.length).toBeGreaterThan(0);
    for (const teammate of stats?.teammates ?? []) {
      expect(Object.keys(teammate).sort()).toEqual([
        "avgPlacement",
        "firsts",
        "gameName",
        "games",
        "tagLine",
      ]);
    }
    expect(JSON.stringify(stats)).not.toContain("puuid");
  });

  it("match cuando el recuento propio coincide con el challenge", async () => {
    await storeAll();
    await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
      promoteTrioToFirst(j, SELF_PUUID);
    });
    const profile = await insertProfile({ challengeValue: 1 });
    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats?.challenge.comparison).toEqual({ status: "match", diff: 0 });
  });

  it("sin valor del challenge la comparación es unknown", async () => {
    await storeAll();
    const profile = await insertProfile({ challengeValue: null });
    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats?.challenge.comparison).toEqual({
      status: "unknown",
      diff: null,
    });
  });

  it("sin temporada explícita usa SEASON_START", async () => {
    await storeAll();
    const profile = await insertProfile();
    try {
      vi.stubEnv("SEASON_START", "2026-05-12T00:00:00Z");
      expect((await getProfileStats(db, profile.id))?.summary.games).toBe(10);
      // 2026-09-29T00:00Z = 1790640000000: solo las partidas #8 y #9 son posteriores.
      vi.stubEnv("SEASON_START", "2026-09-29T00:00:00Z");
      expect((await getProfileStats(db, profile.id))?.summary.games).toBe(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("solo cuenta las partidas del perfil pedido", async () => {
    await storeAll();
    // 152 solo juega la #0 (con puesto 5).
    const profile = await insertProfile({
      gameName: "Player152",
      tagLine: "ANON",
      riotIdNorm: "player152#anon",
      puuid: "anon-puuid-152",
    });
    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats?.summary.games).toBe(1);
    expect(stats?.summary.avgPlacement).toBe(5);
  });
});
