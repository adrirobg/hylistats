import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { asc, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { resetData, summarizeReset } from "@/db/reset";
import {
  groupMembers,
  matches,
  matchFetch,
  type NewParticipant,
  participants,
  profiles,
  settings,
  syncJobs,
} from "@/db/schema";
import { getTestDb, truncateAll } from "../helpers/db";

const db = getTestDb();
const run = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));

async function insertProfile(
  gameName: string,
  tagLine: string,
  puuid: string,
  extra: Partial<typeof profiles.$inferInsert> = {},
) {
  const [profile] = await db
    .insert(profiles)
    .values({
      gameName,
      tagLine,
      riotIdNorm: `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`,
      puuid,
      status: "active",
      lastSyncedAt: new Date(),
      ...extra,
    })
    .returning();
  if (!profile) throw new Error("no se insertó el perfil");
  return profile;
}

async function insertMatch(
  matchId: string,
  gameEnd: number,
  players: Pick<NewParticipant, "puuid" | "riotIdGameName" | "riotIdTagline">[],
) {
  await db.insert(matches).values({
    matchId,
    queueId: 1750,
    gameCreation: gameEnd - 1_000_000,
    gameStartTimestamp: gameEnd - 995_000,
    gameEndTimestamp: gameEnd,
    gameDuration: 995,
    gameVersion: "26.10.123.4567",
  });
  await db.insert(participants).values(
    players.map((player, i) => ({
      ...player,
      matchId,
      participantId: i + 1,
      championId: 266,
      championName: "Aatrox",
      placement: 1,
      playerSubteamId: 1,
      win: true,
      kills: 1,
      deaths: 1,
      assists: 1,
      totalDamageDealtToChampions: 1,
      goldEarned: 1,
      champLevel: 18,
    })),
  );
  await db.insert(matchFetch).values({ matchId, status: "done" });
}

/**
 * Dos miembros del grupo y un perfil fuera de él. Bejito se cambió el nombre: su partida más
 * reciente lleva "Bejito Nuevo#EUW"; la anterior, el nombre con el que se registró.
 */
async function seed() {
  const bejito = await insertProfile("Bejito", "1991", "old-puuid-bejito", {
    challengeValue: 42,
    challengeLevel: "GOLD",
    profileIconId: 1234,
  });
  const hyli = await insertProfile("Hylimichi", "EUW", "old-puuid-hyli");
  const ruffles = await insertProfile("elruffles", "EUW", "old-puuid-ruffles");
  await db
    .insert(groupMembers)
    .values([{ profileId: bejito.id }, { profileId: hyli.id }]);

  await insertMatch("EUW1_1", 1_779_000_000_000, [
    {
      puuid: "old-puuid-bejito",
      riotIdGameName: "Bejito",
      riotIdTagline: "1991",
    },
    {
      puuid: "old-puuid-hyli",
      riotIdGameName: "Hylimichi",
      riotIdTagline: "EUW",
    },
    { puuid: "external", riotIdGameName: "Extra", riotIdTagline: "EUW" },
  ]);
  await insertMatch("EUW1_2", 1_779_100_000_000, [
    {
      puuid: "old-puuid-bejito",
      riotIdGameName: "Bejito Nuevo",
      riotIdTagline: "EUW",
    },
  ]);
  await db
    .insert(syncJobs)
    .values({ profileId: hyli.id, kind: "incremental", status: "error" });
  await db
    .update(settings)
    .set({ riotApiKey: "RGAPI-personal", keyStatus: "ok" })
    .where(eq(settings.id, 1));
  return { bejito, hyli, ruffles };
}

const countOf = async (
  table: typeof matches | typeof participants | typeof matchFetch,
) => (await db.select({ n: count() }).from(table))[0]?.n;

beforeEach(truncateAll);
afterAll(closeDb);

describe("summarizeReset", () => {
  it("resume perfiles, grupo, partidas y Riot ID que se corregirán, sin tocar nada", async () => {
    const { bejito, hyli, ruffles } = await seed();

    const summary = await summarizeReset(db);

    expect(summary.members).toBe(2);
    expect(summary.matches).toBe(2);
    expect(summary.syncJobs).toBe(1);
    expect(summary.profiles).toEqual([
      {
        id: bejito.id,
        riotId: "Bejito#1991",
        status: "active",
        member: true,
        matches: 2,
        challengeValue: 42,
      },
      {
        id: hyli.id,
        riotId: "Hylimichi#EUW",
        status: "active",
        member: true,
        matches: 1,
        challengeValue: null,
      },
      {
        id: ruffles.id,
        riotId: "elruffles#EUW",
        status: "active",
        member: false,
        matches: 0,
        challengeValue: null,
      },
    ]);
    expect(summary.riotIdChanges).toEqual([
      {
        profileId: bejito.id,
        from: "Bejito#1991",
        to: "Bejito Nuevo#EUW",
        gameName: "Bejito Nuevo",
        tagLine: "EUW",
      },
    ]);
    expect(await countOf(participants)).toBe(4);
  });
});

describe("resetData con keepProfiles", () => {
  it("vacía partidas y cola, y conserva perfiles, grupo y settings", async () => {
    const { bejito, hyli, ruffles } = await seed();
    const [oldJob] = await db.select({ id: syncJobs.id }).from(syncJobs);

    const result = await resetData(db, { keepProfiles: true });

    expect(await countOf(matches)).toBe(0);
    expect(await countOf(participants)).toBe(0);
    expect(await countOf(matchFetch)).toBe(0);

    // Mismos ids (las URL y `group_members` siguen apuntando bien), sin PUUID y sin sincronizar.
    const kept = await db.select().from(profiles).orderBy(asc(profiles.id));
    expect(kept.map((p) => p.id)).toEqual([bejito.id, hyli.id, ruffles.id]);
    for (const profile of kept) {
      expect(profile.puuid).toBeNull();
      expect(profile.status).toBe("resolving");
      expect(profile.lastSyncedAt).toBeNull();
    }
    // Lo que no depende de la key se conserva hasta que el backfill lo sobrescriba.
    expect(kept[0]).toMatchObject({
      riotIdNorm: "bejito#1991",
      challengeValue: 42,
      challengeLevel: "GOLD",
      profileIconId: 1234,
    });

    const members = await db
      .select({ profileId: groupMembers.profileId })
      .from(groupMembers)
      .orderBy(asc(groupMembers.profileId));
    expect(members.map((m) => m.profileId)).toEqual([bejito.id, hyli.id]);

    const [key] = await db.select().from(settings);
    expect(key).toMatchObject({
      riotApiKey: "RGAPI-personal",
      keyStatus: "ok",
    });

    // Un backfill pendiente y no interactivo por perfil; la secuencia de jobs no se reinicia.
    const jobs = await db
      .select()
      .from(syncJobs)
      .orderBy(asc(syncJobs.profileId));
    expect(
      jobs.map(({ profileId, kind, status, interactive }) => ({
        profileId,
        kind,
        status,
        interactive,
      })),
    ).toEqual(
      [bejito, hyli, ruffles].map((p) => ({
        profileId: p.id,
        kind: "backfill",
        status: "pending",
        interactive: false,
      })),
    );
    for (const job of jobs) expect(job.id).toBeGreaterThan(oldJob?.id ?? 0);
    expect(result.backfillJobs).toBe(3);
  });

  it("corrige el Riot ID con el de la partida más reciente, sin cambiar la URL", async () => {
    const { bejito } = await seed();

    const result = await resetData(db, { keepProfiles: true });

    expect(result.riotIdChanges.map((c) => c.to)).toEqual(["Bejito Nuevo#EUW"]);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, bejito.id));
    expect(profile).toMatchObject({
      gameName: "Bejito Nuevo",
      tagLine: "EUW",
      riotIdNorm: "bejito#1991",
    });
  });
});

describe("resetData completo", () => {
  it("vacía perfiles y grupo y conserva settings", async () => {
    await seed();

    const result = await resetData(db, { keepProfiles: false });

    expect(result).toEqual({ riotIdChanges: [], backfillJobs: 0 });
    expect((await db.select({ n: count() }).from(profiles))[0]?.n).toBe(0);
    expect((await db.select({ n: count() }).from(groupMembers))[0]?.n).toBe(0);
    expect((await db.select({ n: count() }).from(syncJobs))[0]?.n).toBe(0);
    expect(await countOf(matches)).toBe(0);
    const [key] = await db.select().from(settings);
    expect(key?.riotApiKey).toBe("RGAPI-personal");
  });
});

describe("scripts/db-reset.ts", () => {
  const script = (...args: string[]) =>
    run("npx", ["tsx", "scripts/db-reset.ts", ...args], {
      cwd: root,
      // `--url` manda sobre `DATABASE_URL`: se apunta a una BD inexistente para comprobarlo.
      env: {
        ...process.env,
        DATABASE_URL: "postgres://nadie:nada@localhost:1/no_existe",
      },
    });
  const testUrl = process.env.DATABASE_URL ?? "";

  it("sin --yes imprime el resumen y no toca nada", async () => {
    await seed();

    const error = await script("--keep-profiles", "--url", testUrl).catch(
      (e: { code: number; stdout: string; stderr: string }) => e,
    );

    expect(error).toMatchObject({ code: 1 });
    const { stdout, stderr } = error as { stdout: string; stderr: string };
    expect(stdout).toContain("3 perfiles (2 en el grupo), 2 partidas");
    expect(stdout).toContain("Bejito#1991 -> Bejito Nuevo#EUW");
    expect(stderr).toContain("npm run db:reset -- --keep-profiles --yes");
    // Ni la contraseña ni PUUID en la salida.
    expect(stdout + stderr).not.toContain("hylistats:hylistats@");
    expect(stdout + stderr).not.toContain("old-puuid");
    expect(await countOf(matches)).toBe(2);
  }, 30_000);

  it("con --keep-profiles --yes resetea la BD de --url", async () => {
    await seed();

    const { stdout } = await script(
      "--keep-profiles",
      "--url",
      testUrl,
      "--yes",
    );

    expect(stdout).toContain("1 Riot ID corregidos, 3 backfills encolados");
    expect(await countOf(matches)).toBe(0);
    expect((await db.select({ n: count() }).from(groupMembers))[0]?.n).toBe(2);
  }, 30_000);
});
