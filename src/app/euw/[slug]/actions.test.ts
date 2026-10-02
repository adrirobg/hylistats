import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { profiles, syncJobs } from "@/db/schema";
import { profileSlug } from "@/lib/riot-id";
import { wakeSeq } from "@/worker/queue";
import { getTestDb, truncateAll } from "../../../../tests/helpers/db";
import { refreshAction, registerProfileAction } from "./actions";

// Fuera de una petición de Next no hay caché que invalidar ni 404 real: `revalidatePath` se
// espía y `notFound()` lanza (como el real).
const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const db = getTestDb();
const SLUG = profileSlug("BEJITO MAMBO", "1991");

beforeEach(async () => {
  await truncateAll();
  mocks.revalidatePath.mockClear();
});
afterAll(closeDb);

function form(slug: string) {
  const data = new FormData();
  data.set("slug", slug);
  return data;
}

async function jobs() {
  return db.select().from(syncJobs).orderBy(asc(syncJobs.id));
}

async function register() {
  await registerProfileAction(form(SLUG));
  const [profile] = await db.select().from(profiles);
  return profile;
}

/** Cierra el job activo como si el worker lo hubiera terminado hace `agoMs`. */
async function finishJob(profileId: number, agoMs: number) {
  const finishedAt = new Date(Date.now() - agoMs);
  await db
    .update(syncJobs)
    .set({ status: "done", finishedAt })
    .where(eq(syncJobs.profileId, profileId));
  await db
    .update(profiles)
    .set({ lastSyncedAt: finishedAt })
    .where(eq(profiles.id, profileId));
}

describe("registerProfileAction", () => {
  it("registra el perfil con su backfill interactivo, despierta al worker y revalida la página", async () => {
    const seq = wakeSeq();
    const profile = await register();
    expect(profile).toMatchObject({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
      riotIdNorm: "bejito mambo#1991",
      status: "resolving",
    });
    expect(await jobs()).toMatchObject([
      { kind: "backfill", interactive: true, status: "pending" },
    ]);
    expect(wakeSeq()).toBeGreaterThan(seq);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/euw/[slug]", "page");
  });

  it("registrar dos veces no duplica perfil ni job", async () => {
    await register();
    await register();
    expect(await db.select().from(profiles)).toHaveLength(1);
    expect(await jobs()).toHaveLength(1);
  });

  it("slug inválido o ausente: 404 y no crea nada", async () => {
    await expect(registerProfileAction(form("SinTag"))).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    await expect(registerProfileAction(new FormData())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(await db.select().from(profiles)).toEqual([]);
  });
});

describe("refreshAction", () => {
  it("perfil no registrado o slug inválido: not_found", async () => {
    expect(await refreshAction(null, form(SLUG))).toEqual({
      result: "not_found",
    });
    expect(await refreshAction(null, form("SinTag"))).toEqual({
      result: "not_found",
    });
    expect(await jobs()).toEqual([]);
  });

  it("con un job en curso: active", async () => {
    await register();
    expect(await refreshAction(null, form(SLUG))).toEqual({ result: "active" });
    expect(await jobs()).toHaveLength(1);
  });

  it("recién sincronizado: cooldown", async () => {
    const profile = await register();
    await finishJob(profile.id, 10_000);
    expect(await refreshAction(null, form(SLUG))).toEqual({
      result: "cooldown",
    });
    expect(await jobs()).toHaveLength(1);
  });

  it("pasado el cooldown: queued (job incremental interactivo) y revalida la página", async () => {
    const profile = await register();
    await finishJob(profile.id, 120_000);
    const seq = wakeSeq();
    mocks.revalidatePath.mockClear();
    expect(await refreshAction(null, form(SLUG))).toEqual({ result: "queued" });
    expect((await jobs()).at(-1)).toMatchObject({
      kind: "incremental",
      interactive: true,
      status: "pending",
    });
    expect(wakeSeq()).toBeGreaterThan(seq);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/euw/[slug]", "page");
  });

  it("un Riot ID con otra capitalización resuelve al mismo perfil", async () => {
    const profile = await register();
    await finishJob(profile.id, 10_000);
    expect(
      await refreshAction(null, form(profileSlug("bejito mambo", "1991"))),
    ).toEqual({ result: "cooldown" });
  });
});
