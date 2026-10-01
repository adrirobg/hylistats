import { asc } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { groupMembers, profiles, syncJobs } from "@/db/schema";
import { countActiveGroupSyncs } from "@/domain/group-sync";
import { wakeSeq } from "@/worker/queue";
import { getTestDb, truncateAll } from "../../../tests/helpers/db";
import { ensureGroupFreshAction, refreshGroupAction } from "./actions";

// Fuera de una petición de Next no hay caché que invalidar: `revalidatePath` se espía.
const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const db = getTestDb();
const MIN = 60_000;

beforeEach(async () => {
  await truncateAll();
  mocks.revalidatePath.mockClear();
});
afterAll(closeDb);

/** Perfil con su última sincronización hace `syncedAgoMs`; `member` lo mete en el grupo. */
async function profile(name: string, syncedAgoMs: number, member = true) {
  const [row] = await db
    .insert(profiles)
    .values({
      gameName: name,
      tagLine: "EUW",
      riotIdNorm: `${name.toLowerCase()}#euw`,
      puuid: `puuid-${name}`,
      status: "active",
      lastSyncedAt: new Date(Date.now() - syncedAgoMs),
    })
    .returning();
  if (member) await db.insert(groupMembers).values({ profileId: row.id });
  return row.id;
}

/** Job terminado hace `agoMs` (lo que dejó el worker en su último incremental). */
async function finishedJob(profileId: number, agoMs: number) {
  await db.insert(syncJobs).values({
    profileId,
    kind: "incremental",
    status: "done",
    finishedAt: new Date(Date.now() - agoMs),
  });
}

/** Job en curso (cuenta como activo para la cola). */
async function activeJob(profileId: number) {
  await db.insert(syncJobs).values({
    profileId,
    kind: "incremental",
    status: "fetching",
  });
}

async function jobs() {
  return db.select().from(syncJobs).orderBy(asc(syncJobs.id));
}

/** Los jobs que no estaban antes de la acción: `status = pending` y creados por la cola. */
async function pendingJobs() {
  return (await jobs()).filter((job) => job.status === "pending");
}

describe("ensureGroupFreshAction (al abrir la vista, volver a la pestaña y latido)", () => {
  it("encola solo a los miembros sin job activo y fuera del límite de 5 min, sin interactivo", async () => {
    const stale = await profile("Antiguo", 10 * MIN);
    await profile("Reciente", 1 * MIN);
    const busy = await profile("Ocupado", 10 * MIN);
    await activeJob(busy);
    const limited = await profile("Limitado", 10 * MIN);
    await finishedJob(limited, 2 * MIN);
    const neverSynced = await db
      .insert(profiles)
      .values({
        gameName: "Nuevo",
        tagLine: "EUW",
        riotIdNorm: "nuevo#euw",
        status: "active",
      })
      .returning();
    await db.insert(groupMembers).values({ profileId: neverSynced[0].id });
    const seq = wakeSeq();

    const summary = await ensureGroupFreshAction();

    expect(summary).toEqual({
      members: 5,
      queued: 2,
      active: 1,
      cooldown: 1,
      fresh: 1,
    });
    const pending = await pendingJobs();
    expect(pending.map((job) => job.profileId).sort()).toEqual(
      [stale, neverSynced[0].id].sort(),
    );
    expect(pending.every((job) => job.kind === "incremental")).toBe(true);
    expect(pending.every((job) => !job.interactive)).toBe(true);
    // El job activo previo sigue siendo el único del miembro ocupado.
    expect((await jobs()).filter((job) => job.profileId === busy)).toHaveLength(
      1,
    );
    expect(wakeSeq()).toBeGreaterThan(seq);
  });

  it("no encola a ningún perfil que no sea miembro, por rancio que esté", async () => {
    await profile("Miembro", 1 * MIN);
    await profile("Externo", 60 * MIN, false);

    const summary = await ensureGroupFreshAction();

    expect(summary).toMatchObject({ members: 1, queued: 0, fresh: 1 });
    expect(await jobs()).toHaveLength(0);
  });

  it("un segundo disparo (otra pestaña, el AutoRefresh del perfil) no encola otra vez", async () => {
    await profile("A", 10 * MIN);
    await profile("B", 10 * MIN);

    await ensureGroupFreshAction();
    const second = await ensureGroupFreshAction();

    expect(second).toMatchObject({ queued: 0, active: 2 });
    expect(await jobs()).toHaveLength(2);
  });

  it("sin miembros no hace nada", async () => {
    await profile("Externo", 60 * MIN, false);
    expect(await ensureGroupFreshAction()).toEqual({
      members: 0,
      queued: 0,
      active: 0,
      cooldown: 0,
      fresh: 0,
    });
    expect(await jobs()).toHaveLength(0);
  });
});

describe("refreshGroupAction (botón «Actualizar grupo»)", () => {
  it("encola un incremental interactivo por cada miembro que no está en cooldown ni activo", async () => {
    // Al día para el automático (sincronizado hace 1 min), pero el botón solo respeta los 60 s.
    const fresh = await profile("Al dia", 1 * MIN);
    await finishedJob(fresh, 2 * MIN);
    const cooling = await profile("Cooldown", 1 * MIN);
    await finishedJob(cooling, 30_000);
    const busy = await profile("Ocupado", 10 * MIN);
    await activeJob(busy);
    const idle = await profile("Libre", 10 * MIN);
    await profile("Externo", 60 * MIN, false);

    const result = await refreshGroupAction(null);

    expect(result?.summary).toEqual({
      members: 4,
      queued: 2,
      active: 1,
      cooldown: 1,
      fresh: 0,
    });
    const pending = await pendingJobs();
    expect(pending.map((job) => job.profileId).sort()).toEqual(
      [fresh, idle].sort(),
    );
    expect(pending.every((job) => job.interactive)).toBe(true);
    expect(pending.every((job) => job.kind === "incremental")).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/grupo", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/euw/[slug]", "page");
  });

  it("pulsarlo otra vez con los jobs en cola no duplica nada", async () => {
    await profile("A", 10 * MIN);
    await profile("B", 10 * MIN);

    await refreshGroupAction(null);
    const again = await refreshGroupAction(null);

    expect(again?.summary).toMatchObject({ queued: 0, active: 2 });
    expect(await jobs()).toHaveLength(2);
  });
});

describe("countActiveGroupSyncs", () => {
  it("cuenta los miembros con job activo, una vez cada uno y sin los no miembros", async () => {
    const a = await profile("A", 10 * MIN);
    await activeJob(a);
    const b = await profile("B", 10 * MIN);
    await finishedJob(b, 2 * MIN);
    const outsider = await profile("Externo", 10 * MIN, false);
    await activeJob(outsider);

    expect(await countActiveGroupSyncs(db)).toBe(1);
  });
});
