import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import {
  matches,
  type NewMatch,
  type NewParticipant,
  participants,
  profiles,
  settings,
  syncJobs,
} from "@/db/schema";
import { getTestDb, truncateAll } from "../helpers/db";

const db = getTestDb();

// Drizzle envuelve el error de `pg` en `cause`; el SQLSTATE es lo estable.
async function sqlState(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code;
  }
  return undefined;
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

async function insertProfile(gameName: string, tagLine: string) {
  const [profile] = await db
    .insert(profiles)
    .values({
      gameName,
      tagLine,
      riotIdNorm: `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`,
    })
    .returning();
  return profile;
}

const match: NewMatch = {
  matchId: "EUW1_1",
  queueId: 1750,
  gameCreation: 1_779_000_000_000,
  gameStartTimestamp: 1_779_000_005_000,
  gameEndTimestamp: 1_779_001_000_000,
  gameDuration: 995,
  gameVersion: "26.10.123.4567",
};

const participant = (
  overrides: Partial<NewParticipant> = {},
): NewParticipant => ({
  matchId: match.matchId,
  puuid: "puuid-1",
  participantId: 1,
  riotIdGameName: "Player",
  riotIdTagline: "EUW",
  championId: 266,
  championName: "Aatrox",
  placement: 1,
  playerSubteamId: 1,
  win: true,
  augments: [1, 2, 3, 4, 0, 0],
  items: [3006, 0, 0, 0, 0, 0, 3340],
  kills: 10,
  deaths: 2,
  assists: 5,
  totalDamageDealtToChampions: 25_000,
  goldEarned: 12_000,
  champLevel: 18,
  ...overrides,
});

beforeEach(truncateAll);
afterAll(closeDb);

describe("profiles", () => {
  it("inserta y lee un perfil con sus valores por defecto", async () => {
    const created = await insertProfile("Player", "EUW");

    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, created.id));
    expect(row).toMatchObject({
      region: "euw",
      gameName: "Player",
      tagLine: "EUW",
      riotIdNorm: "player#euw",
      puuid: null,
      status: "resolving",
      challengeValue: null,
      lastSyncedAt: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("rechaza un riotIdNorm duplicado", async () => {
    await insertProfile("Player", "EUW");
    expect(await sqlState(insertProfile("PLAYER", "euw"))).toBe(
      UNIQUE_VIOLATION,
    );
  });
});

describe("matches y participants", () => {
  it("round-trip de bigint (ms) y de rawGz (bytea <-> Buffer)", async () => {
    const raw = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff]);
    await db.insert(matches).values({ ...match, rawGz: raw });

    const [row] = await db.select().from(matches);
    expect(row.gameCreation).toBe(match.gameCreation);
    expect(row.rawGz).toEqual(raw);
    expect(row.endOfGameResult).toBeNull();
  });

  it("la PK (matchId, puuid) deja una sola fila con onConflictDoNothing", async () => {
    await db.insert(matches).values(match);
    await db.insert(participants).values(participant());
    await db
      .insert(participants)
      .values(participant({ kills: 99 }))
      .onConflictDoNothing();

    const rows = await db.select().from(participants);
    expect(rows).toHaveLength(1);
    expect(rows[0].kills).toBe(10);
    expect(rows[0].augments).toEqual([1, 2, 3, 4, 0, 0]);
  });

  it("rechaza un participante duplicado sin onConflict", async () => {
    await db.insert(matches).values(match);
    await db.insert(participants).values(participant());
    expect(await sqlState(db.insert(participants).values(participant()))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it("borrar la partida elimina sus participantes (cascade)", async () => {
    await db.insert(matches).values(match);
    await db
      .insert(participants)
      .values([participant(), participant({ puuid: "puuid-2" })]);

    await db.delete(matches).where(eq(matches.matchId, match.matchId));
    expect(await db.select().from(participants)).toHaveLength(0);
  });
});

describe("sync_jobs", () => {
  const job = (profileId: number, status: "pending" | "done" = "pending") => ({
    profileId,
    kind: "backfill" as const,
    status,
  });

  it("solo permite un job activo por perfil", async () => {
    const a = await insertProfile("A", "EUW");
    const b = await insertProfile("B", "EUW");

    await db.insert(syncJobs).values(job(a.id));
    expect(await sqlState(db.insert(syncJobs).values(job(a.id)))).toBe(
      UNIQUE_VIOLATION,
    );
    // Otro perfil sí puede tener su propio job activo.
    await db.insert(syncJobs).values(job(b.id));
  });

  it("los jobs terminados no cuentan como activos", async () => {
    const a = await insertProfile("A", "EUW");

    await db.insert(syncJobs).values(job(a.id, "done"));
    await db.insert(syncJobs).values(job(a.id, "done"));
    await db.insert(syncJobs).values(job(a.id, "pending"));

    expect(await db.select().from(syncJobs)).toHaveLength(3);
  });

  it("tiene valores por defecto (cola vacía) y se borra con el perfil", async () => {
    const a = await insertProfile("A", "EUW");
    await db.insert(syncJobs).values(job(a.id));

    const [row] = await db.select().from(syncJobs);
    expect(row).toMatchObject({
      interactive: false,
      matchIds: [],
      totalIds: 0,
      fetched: 0,
      listQueueIndex: 0,
      listCursor: 0,
      attempts: 0,
    });

    await db.delete(profiles).where(eq(profiles.id, a.id));
    expect(await db.select().from(syncJobs)).toHaveLength(0);
  });
});

describe("settings", () => {
  it("existe la fila única id = 1 con valores por defecto", async () => {
    const rows = await db.select().from(settings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      riotApiKey: null,
      keyStatus: "unknown",
    });
  });

  it("no admite otra fila (PK y check id = 1)", async () => {
    expect(await sqlState(db.insert(settings).values({ id: 1 }))).toBe(
      UNIQUE_VIOLATION,
    );
    expect(await sqlState(db.insert(settings).values({ id: 2 }))).toBe(
      CHECK_VIOLATION,
    );
  });

  it("truncateAll conserva la fila y la devuelve a sus valores por defecto", async () => {
    await db
      .update(settings)
      .set({ riotApiKey: "RGAPI-test", keyStatus: "ok" });
    await truncateAll();

    const rows = await db.select().from(settings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ riotApiKey: null, keyStatus: "unknown" });
  });
});
