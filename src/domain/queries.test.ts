import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { participants, profiles } from "@/db/schema";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  loadMatchFixtures,
  type MatchFixture,
  promoteTrioToFirst,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { storeMatch } from "./ingest";
import {
  getPlayerRows,
  getProfileStats,
  getRecordRows,
  getTeammateRows,
} from "./queries";
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

/**
 * Un 1º del jugador de prueba en `queueId`, `gameCreation` posterior a las partidas reales.
 * La 1740 es la otra cola de Arena tríos; la 400 no es Arena y no debe contar.
 */
function storeFirst(
  fixture: MatchFixture,
  matchId: string,
  queueId: number,
  gameCreation: number,
) {
  return storeVariant(fixture, matchId, (j) => {
    j.info.queueId = queueId;
    j.info.gameCreation = gameCreation;
    promoteTrioToFirst(j, SELF_PUUID);
  });
}

describe("colas de Arena 1750 y 1740", () => {
  it("getPlayerRows cuenta las partidas de las dos colas e ignora otras", async () => {
    await storeAll();
    await storeFirst(fixtures[1], "EUW1_TEST_Q1740", 1740, 1_790_700_000_000);
    await storeFirst(fixtures[2], "EUW1_TEST_Q400", 400, 1_790_700_100_000);

    const rows = await getPlayerRows(db, SELF_PUUID, seasonStart);
    // Las 10 reales (1750) + la de la 1740; la de la 400 no está.
    expect(rows).toHaveLength(11);
    expect(rows.at(-1)).toMatchObject({
      matchId: "EUW1_TEST_Q1740",
      placement: 1,
    });
    expect(rows.some((r) => r.matchId === "EUW1_TEST_Q400")).toBe(false);
  });

  it("getTeammateRows incluye el trío de las partidas de la 1740 e ignora otras colas", async () => {
    await storeAll();
    await storeFirst(fixtures[1], "EUW1_TEST_Q1740", 1740, 1_790_700_000_000);
    await storeFirst(fixtures[2], "EUW1_TEST_Q400", 400, 1_790_700_100_000);

    const rows = await getTeammateRows(db, SELF_PUUID, seasonStart);
    expect(rows).toHaveLength(33); // 11 partidas x 3
    expect(rows.filter((r) => r.matchId === "EUW1_TEST_Q1740")).toHaveLength(3);
    expect(rows.some((r) => r.matchId === "EUW1_TEST_Q400")).toBe(false);
  });

  it("getProfileStats cuenta partidas y 1º de 1750 ∪ 1740 (y los campeones verificados de ambas)", async () => {
    await storeAll();
    // 1º con Blitzcrank en la 1750, 1º con Zaahen en la 1740 y 1º con Teemo en la 400 (fuera).
    await storeFirst(fixtures[1], "EUW1_TEST_Q1750", 1750, 1_790_700_000_000);
    await storeFirst(fixtures[2], "EUW1_TEST_Q1740", 1740, 1_790_700_100_000);
    await storeFirst(fixtures[4], "EUW1_TEST_Q400", 400, 1_790_700_200_000);
    const profile = await insertProfile();

    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats).not.toBeNull();
    if (!stats) return;

    // 10 reales [5,3,3,3,5,6,4,4,2,2] (suma 37) + dos 1º = 12 partidas, suma 39.
    expect(stats.summary.games).toBe(12);
    expect(stats.summary.firsts).toBe(2);
    expect(stats.summary.top3).toBe(7);
    expect(stats.summary.avgPlacement).toBeCloseTo(39 / 12, 10);
    expect(stats.summary.distribution).toEqual({
      1: 2,
      2: 2,
      3: 3,
      4: 2,
      5: 2,
      6: 1,
    });
    expect(
      stats.verifiedChampions.map((c) => [c.championId, c.lastWinMatchId]),
    ).toEqual([
      [904, "EUW1_TEST_Q1740"],
      [53, "EUW1_TEST_Q1750"],
    ]);
  });
});

describe("getRecordRows", () => {
  it("devuelve las columnas de los récords de las partidas del jugador, en el orden de getPlayerRows", async () => {
    await storeAll();
    const rows = await getRecordRows(db, SELF_PUUID, seasonStart);
    const playerRows = await getPlayerRows(db, SELF_PUUID, seasonStart);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.matchId)).toEqual(
      playerRows.map((r) => r.matchId),
    );
    expect(rows.map((r) => r.matchId)).toEqual(fixtures.map((f) => f.id));

    // Cada fila coincide con el participante del JSON original.
    for (const [i, f] of fixtures.entries()) {
      const self = f.match.info.participants.find(
        (p) => p.puuid === SELF_PUUID,
      );
      expect(self).toBeDefined();
      expect(rows[i]).toEqual({
        matchId: f.id,
        gameCreation: f.match.info.gameCreation,
        gameStartTimestamp: f.match.info.gameStartTimestamp,
        championId: self?.championId,
        championName: self?.championName,
        placement: self?.placement,
        kills: self?.kills,
        deaths: self?.deaths,
        totalDamageDealtToChampions: self?.totalDamageDealtToChampions,
        totalDamageTaken: self?.totalDamageTaken,
        largestKillingSpree: self?.largestKillingSpree,
      });
    }
  });

  it("filtra por cola y temporada, igual que getPlayerRows", async () => {
    await storeAll();
    await storeFirst(fixtures[1], "EUW1_TEST_Q1740", 1740, 1_790_700_000_000);
    await storeFirst(fixtures[2], "EUW1_TEST_Q400", 400, 1_790_700_100_000);

    const rows = await getRecordRows(db, SELF_PUUID, seasonStart);
    expect(rows).toHaveLength(11); // 10 reales + la de la 1740; la de la 400 no
    expect(rows.at(-1)?.matchId).toBe("EUW1_TEST_Q1740");
    // Con la temporada empezando después de todas las partidas, no queda ninguna.
    expect(
      await getRecordRows(db, SELF_PUUID, new Date("2027-01-01T00:00:00Z")),
    ).toEqual([]);
  });

  it("devuelve null en las columnas nuevas de las partidas sin el dato", async () => {
    await storeAll();
    await db
      .update(participants)
      .set({ totalDamageTaken: null, largestKillingSpree: null })
      .where(
        and(
          eq(participants.matchId, fixtures[0].id),
          eq(participants.puuid, SELF_PUUID),
        ),
      );
    const rows = await getRecordRows(db, SELF_PUUID, seasonStart);
    expect(rows[0]).toMatchObject({
      matchId: fixtures[0].id,
      totalDamageTaken: null,
      largestKillingSpree: null,
    });
    expect(rows[1].totalDamageTaken).not.toBeNull();
  });

  it("un jugador desconocido no devuelve filas", async () => {
    await storeAll();
    expect(await getRecordRows(db, "otro-puuid", seasonStart)).toEqual([]);
  });
});

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
        gameCreation: f.match.info.gameCreation,
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
      lastGameAt: null,
      verifiedChampions: [],
      playerRows: [],
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
    expect(stats.playerRows).toHaveLength(11); // las filas que alimentan el álbum
    expect(stats.summary.games).toBe(11);
    expect(stats.summary.firsts).toBe(1);
    expect(stats.summary.top3).toBe(6);
    expect(stats.summary.avgPlacement).toBeCloseTo(38 / 11, 10);
    // La partida sintética (posterior a las reales) es la última.
    expect(stats.lastGameAt).toBe(1_790_700_000_000);
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
    // top3 (013: 5 reales + la sintética; 046: 1; 115: 2 reales + la sintética) y última partida
    // juntos (la sintética para 013 y 115; la #7 para 046).
    expect(
      stats.teammates.map((t) => [t.gameName, t.top3, t.lastPlayedAt]),
    ).toEqual([
      ["Player013", 6, 1_790_700_000_000],
      ["Player046", 1, 1_790_633_861_469],
      ["Player115", 3, 1_790_700_000_000],
      ["Player012", 1, 1_790_682_703_953],
      ["Player022", 1, 1_790_680_293_890],
      ["Player152", 0, 1_790_618_903_881],
    ]);

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
        "lastPlayedAt",
        "tagLine",
        "top3",
      ]);
    }
    expect(JSON.stringify(stats)).not.toContain("puuid");
  });

  it("cada partida aporta exactamente 2 compañeros y ninguno lleva puuid", async () => {
    await storeAll();
    const profile = await insertProfile();
    const stats = await getProfileStats(db, profile.id, seasonStart);
    expect(stats).not.toBeNull();
    if (!stats) return;

    // Tríos: 2 compañeros por partida, así que la suma de `games` es 2 × partidas del jugador.
    expect(stats.summary.games).toBe(fixtures.length);
    expect(stats.teammates.reduce((total, t) => total + t.games, 0)).toBe(
      2 * stats.summary.games,
    );
    for (const teammate of stats.teammates) {
      expect(teammate).not.toHaveProperty("puuid");
    }
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
