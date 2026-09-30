import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { profiles, syncJobs } from "@/db/schema";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  enqueueSeasonBackfill,
  ensureFreshOnView,
  normalizeRiotId,
  onWake,
  REFRESH_COOLDOWN_MS,
  registerProfile,
  requestRefresh,
  STALE_AFTER_MS,
  wakeSeq,
  wakeWorker,
} from "./queue";

const db = getTestDb();

beforeEach(truncateAll);
afterAll(closeDb);

async function jobsOf(profileId: number) {
  return db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.profileId, profileId))
    .orderBy(asc(syncJobs.id));
}

/** Cierra el job activo del perfil como si el worker lo hubiera terminado en `finishedAt`. */
async function finishActiveJob(profileId: number, finishedAt: Date) {
  await db
    .update(syncJobs)
    .set({ status: "done", finishedAt })
    .where(eq(syncJobs.profileId, profileId));
  await db
    .update(profiles)
    .set({ lastSyncedAt: finishedAt })
    .where(eq(profiles.id, profileId));
}

describe("normalizeRiotId", () => {
  it("minúsculas y sin espacios en los extremos", () => {
    expect(normalizeRiotId("  BEJITO MAMBO ", " 1991")).toBe(
      "bejito mambo#1991",
    );
    expect(normalizeRiotId("Ñandú", "EUW")).toBe("ñandú#euw");
  });
});

describe("registerProfile", () => {
  it("crea el perfil y su backfill interactivo, y despierta al worker", async () => {
    const seq = wakeSeq();
    const profile = await registerProfile(db, " BEJITO MAMBO ", "1991");
    expect(profile).toMatchObject({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
      riotIdNorm: "bejito mambo#1991",
      puuid: null,
      status: "resolving",
    });
    const jobs = await jobsOf(profile.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "backfill",
      interactive: true,
      status: "pending",
    });
    expect(wakeSeq()).toBe(seq + 1);
  });

  it("un perfil ya registrado se devuelve tal cual, sin otro job", async () => {
    const first = await registerProfile(db, "BEJITO MAMBO", "1991");
    const again = await registerProfile(db, "bejito mambo", "1991");
    expect(again.id).toBe(first.id);
    expect(again.gameName).toBe("BEJITO MAMBO");
    expect(await jobsOf(first.id)).toHaveLength(1);
  });

  it("rechaza un Riot ID incompleto", async () => {
    await expect(registerProfile(db, " ", "1991")).rejects.toThrow(RangeError);
    await expect(registerProfile(db, "Nombre", "")).rejects.toThrow(RangeError);
  });
});

describe("requestRefresh", () => {
  it("active si hay un job en curso", async () => {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    expect(await requestRefresh(db, profile.id, { interactive: true })).toBe(
      "active",
    );
    expect(await jobsOf(profile.id)).toHaveLength(1);
  });

  it("cooldown de 60 s desde el último job y después encola un incremental", async () => {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    const finishedAt = new Date("2026-09-29T12:00:00Z");
    await finishActiveJob(profile.id, finishedAt);

    const at = (ms: number) => new Date(finishedAt.getTime() + ms);
    expect(
      await requestRefresh(db, profile.id, {
        interactive: true,
        now: at(REFRESH_COOLDOWN_MS - 1),
      }),
    ).toBe("cooldown");

    const seq = wakeSeq();
    expect(
      await requestRefresh(db, profile.id, {
        interactive: true,
        now: at(REFRESH_COOLDOWN_MS),
      }),
    ).toBe("queued");
    expect(wakeSeq()).toBe(seq + 1);
    const jobs = await jobsOf(profile.id);
    expect(jobs.at(-1)).toMatchObject({
      kind: "incremental",
      interactive: true,
      status: "pending",
    });
  });

  it("dos peticiones simultáneas crean un solo job", async () => {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await finishActiveJob(profile.id, new Date("2026-09-29T12:00:00Z"));
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        requestRefresh(db, profile.id, { interactive: true }),
      ),
    );
    expect(results.filter((r) => r === "queued")).toHaveLength(1);
    expect(results.filter((r) => r === "active")).toHaveLength(3);
    expect(await jobsOf(profile.id)).toHaveLength(2);
  });
});

describe("enqueueSeasonBackfill", () => {
  /** Perfil ya resuelto (`active`, con `puuid`) y con su último job terminado. */
  async function syncedProfile() {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await finishActiveJob(profile.id, new Date("2026-09-29T12:00:00Z"));
    await db
      .update(profiles)
      .set({ status: "active", puuid: "anon-puuid-self" })
      .where(eq(profiles.id, profile.id));
    return profile;
  }

  it("perfil inexistente: unknown y no crea nada", async () => {
    expect(await enqueueSeasonBackfill(db, "nadie#0000")).toEqual({
      outcome: "unknown",
    });
    expect(await db.select().from(syncJobs)).toHaveLength(0);
  });

  it.each([
    "resolving",
    "not_found",
  ] as const)("perfil %s: inactive y no encola", async (status) => {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await finishActiveJob(profile.id, new Date("2026-09-29T12:00:00Z"));
    await db
      .update(profiles)
      .set({ status })
      .where(eq(profiles.id, profile.id));

    expect(await enqueueSeasonBackfill(db, "bejito mambo#1991")).toEqual({
      outcome: "inactive",
      status,
    });
    expect(await jobsOf(profile.id)).toHaveLength(1);
  });

  it("perfil con un job en curso: active y no encola otro", async () => {
    const profile = await syncedProfile();
    await db.insert(syncJobs).values({
      profileId: profile.id,
      kind: "incremental",
      status: "fetching",
    });

    const seq = wakeSeq();
    expect(await enqueueSeasonBackfill(db, "bejito mambo#1991")).toEqual({
      outcome: "active",
    });
    expect(await jobsOf(profile.id)).toHaveLength(2);
    expect(wakeSeq()).toBe(seq);
  });

  it("perfil activo sin jobs en curso: backfill no interactivo en pending y despierta al worker", async () => {
    const profile = await syncedProfile();

    const seq = wakeSeq();
    const result = await enqueueSeasonBackfill(db, "bejito mambo#1991");
    expect(result).toMatchObject({ outcome: "queued" });
    expect(wakeSeq()).toBe(seq + 1);

    const jobs = await jobsOf(profile.id);
    expect(jobs).toHaveLength(2);
    const job = jobs.at(-1);
    expect(job).toMatchObject({
      kind: "backfill",
      interactive: false,
      status: "pending",
      listQueueIndex: 0,
      listCursor: 0,
      matchIds: [],
    });
    expect(result).toEqual({ outcome: "queued", jobId: job?.id });
  });

  it("dos peticiones simultáneas crean un solo job", async () => {
    const profile = await syncedProfile();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        enqueueSeasonBackfill(db, "bejito mambo#1991"),
      ),
    );
    expect(results.filter((r) => r.outcome === "queued")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "active")).toHaveLength(3);
    expect(await jobsOf(profile.id)).toHaveLength(2);
  });
});

describe("ensureFreshOnView", () => {
  it("encola un refresco no interactivo si la última sync tiene más de 2 min", async () => {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    // Con el backfill en curso no se encola nada.
    expect(await ensureFreshOnView(db, profile.id)).toBe("active");

    const syncedAt = new Date("2026-09-29T12:00:00Z");
    await finishActiveJob(profile.id, syncedAt);
    const at = (ms: number) => new Date(syncedAt.getTime() + ms);
    expect(
      await ensureFreshOnView(db, profile.id, { now: at(STALE_AFTER_MS - 1) }),
    ).toBe("fresh");
    expect(
      await ensureFreshOnView(db, profile.id, { now: at(STALE_AFTER_MS + 1) }),
    ).toBe("queued");
    expect((await jobsOf(profile.id)).at(-1)).toMatchObject({
      kind: "incremental",
      interactive: false,
    });
  });

  it("no refresca solo un Riot ID inexistente", async () => {
    const profile = await registerProfile(db, "Nadie", "0000");
    await db
      .update(syncJobs)
      .set({ status: "error", finishedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(syncJobs.profileId, profile.id));
    await db
      .update(profiles)
      .set({ status: "not_found" })
      .where(eq(profiles.id, profile.id));
    expect(await ensureFreshOnView(db, profile.id)).toBe("fresh");
    expect(await jobsOf(profile.id)).toHaveLength(1);
  });
});

describe("wakeWorker", () => {
  it("avisa a los suscriptores y se puede cancelar la suscripción", () => {
    const listener = vi.fn();
    const unsubscribe = onWake(listener);
    wakeWorker();
    unsubscribe();
    wakeWorker();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
