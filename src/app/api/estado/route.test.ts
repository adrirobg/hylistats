import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { groupMembers, profiles, settings, syncJobs } from "@/db/schema";
import {
  claimFreshnessCheck,
  FRESHNESS_CHECK_EVERY_MS,
  loadStatus,
} from "@/domain/status";
import { bumpProfileVersions, profileVersion } from "@/lib/data-version";
import { profileSlug } from "@/lib/riot-id";
import type { StatusPayload } from "@/lib/status-payload";
import { STALE_AFTER_MS } from "@/worker/queue";
import { getTestDb, truncateAll } from "../../../../tests/helpers/db";
import { GET } from "./route";

// El estado nunca calcula el grupo ni las stats (AC2): si alguien los llamara, el test revienta.
// `loadGroupView` es el único cálculo de la vista (también el del memo de la cabecera).
vi.mock("@/domain/group-view", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/group-view")>()),
  loadGroupView: () => {
    throw new Error("el estado no calcula GroupView");
  },
}));
vi.mock("@/domain/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/queries")>()),
  getProfileStats: () => {
    throw new Error("el estado no calcula las stats");
  },
}));

const db = getTestDb();
const MIN = 60_000;
const freshnessStore = globalThis as typeof globalThis & {
  __hylistatsFreshnessChecks?: unknown;
};

beforeEach(async () => {
  await truncateAll();
  delete freshnessStore.__hylistatsFreshnessChecks;
});
afterAll(closeDb);

/** Perfil `active` sincronizado hace `syncedAgoMs` (`null`: nunca); `member` lo mete en el grupo. */
async function profile(
  name: string,
  syncedAgoMs: number | null,
  { member = false, status = "active" as "active" | "not_found" } = {},
) {
  const [row] = await db
    .insert(profiles)
    .values({
      gameName: name,
      tagLine: "EUW",
      riotIdNorm: `${name.toLowerCase()}#euw`,
      puuid:
        status === "active" ? `puuid-secreto-${name}`.padEnd(78, "x") : null,
      status,
      lastSyncedAt:
        syncedAgoMs === null ? null : new Date(Date.now() - syncedAgoMs),
    })
    .returning();
  if (member) await db.insert(groupMembers).values({ profileId: row.id });
  return row;
}

async function jobsOf(profileId: number) {
  return db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.profileId, profileId))
    .orderBy(asc(syncJobs.id));
}

/** Cierra los jobs activos del perfil como hace tiempo (vuelve a estar rancio, sin cooldown). */
async function finishJobsLongAgo(profileId: number) {
  await db
    .update(syncJobs)
    .set({ status: "done", finishedAt: new Date(Date.now() - 60 * MIN) })
    .where(eq(syncJobs.profileId, profileId));
}

async function get(query: string) {
  const response = await GET(
    new NextRequest(`http://localhost/api/estado?${query}`),
  );
  return { response, body: (await response.json()) as StatusPayload };
}

const query = (name: string, extra = "") =>
  `perfil=${encodeURIComponent(profileSlug(name, "EUW"))}${extra}`;

describe("GET /api/estado", () => {
  it("400 sin perfil o con un slug inválido, sin caché", async () => {
    for (const q of ["", "perfil=", "perfil=SinTag"]) {
      const { response, body } = await get(q);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body).toEqual({ error: "perfil" });
    }
  });

  it("Riot ID sin registrar: unregistered, sin versión y sin crear nada", async () => {
    const { response, body } = await get(query("Nadie"));
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      kind: "unregistered",
      version: null,
      groupVersion: null,
      profile: null,
      group: null,
    });
    expect(typeof body.now).toBe("number");
    expect(await db.select().from(profiles)).toHaveLength(0);
  });

  it("not_found: versión y estado, pero no encola nada", async () => {
    const row = await profile("Perdido", null, { status: "not_found" });
    const { body } = await get(query("Perdido"));
    expect(body.kind).toBe("not_found");
    expect(body.version).toBe(profileVersion(row.id));
    expect(body.profile).toMatchObject({ sync: null, lastSyncedAt: null });
    expect(await jobsOf(row.id)).toHaveLength(0);
  });

  it("perfil: versión, sincronización y frescura en la misma respuesta, sin puuid ni textos de error", async () => {
    const row = await profile("Rancio", 10 * MIN);
    await db.insert(syncJobs).values({
      profileId: row.id,
      kind: "incremental",
      status: "error",
      lastError: "Riot 500 en /ruta/interna con puuid-secreto",
      finishedAt: new Date(Date.now() - 5 * MIN),
    });
    await db
      .update(settings)
      .set({ keyStatus: "invalid" })
      .where(eq(settings.id, 1));

    const { response, body } = await get(query("Rancio"));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = JSON.stringify(body);
    expect(text).not.toContain("puuid");
    expect(text).not.toContain("Riot 500");
    expect(body.kind).toBe("profile");
    expect(body.version).toBe(profileVersion(row.id));
    expect(body.groupVersion).toBeNull(); // no es miembro
    expect(body.group).toBeNull();
    // Rancio (> 2 min): la frescura encola un incremental no interactivo y ya sale en el estado.
    const jobs = await jobsOf(row.id);
    expect(jobs.at(-1)).toMatchObject({
      kind: "incremental",
      status: "pending",
      interactive: false,
    });
    expect(body.profile).toEqual({
      lastSyncedAt: row.lastSyncedAt?.getTime(),
      sync: {
        kind: "incremental",
        phase: "resolving",
        retryAt: null,
        reason: null,
        queue: null,
      },
      // El job que falló sigue siendo el último terminado.
      lastJobErrorAt: jobs[0].finishedAt?.getTime(),
      paused: true,
    });
  });

  it("la versión cambia cuando el worker guarda algo del perfil", async () => {
    const row = await profile("Visto", 30_000);
    const first = (await get(query("Visto"))).body.version;
    expect((await get(query("Visto"))).body.version).toBe(first);
    bumpProfileVersions([row.id], { group: false });
    expect((await get(query("Visto"))).body.version).not.toBe(first);
  });

  it("miembro con grupo=1: versión y estado del grupo; sin grupo=1, solo la versión", async () => {
    const owner = await profile("Dueno", 30_000, { member: true });
    await profile("Nunca", null, { member: true });
    const busy = await profile("Ocupado", 30_000, { member: true });
    await db
      .insert(syncJobs)
      .values({ profileId: busy.id, kind: "incremental", status: "fetching" });

    const plain = (await get(query("Dueno"))).body;
    expect(plain.groupVersion).toEqual(expect.any(String));
    expect(plain.group).toBeNull();

    const { body } = await get(query("Dueno", "&grupo=1"));
    expect(body.version).toBe(profileVersion(owner.id));
    expect(body.groupVersion).toBe(plain.groupVersion);
    expect(body.group).toEqual({
      // `Nunca` no se había sincronizado: la frescura del grupo lo encola en esta misma petición.
      members: 3,
      active: 2,
      oldest: { gameName: "Nunca", tagLine: "EUW", lastSyncedAt: null },
    });
  });

  it("grupo=1 en un perfil que no es miembro no mira el grupo", async () => {
    await profile("Ajeno", 30_000);
    const stale = await profile("Miembro", 10 * MIN, { member: true });
    const { body } = await get(query("Ajeno", "&grupo=1"));
    expect(body.groupVersion).toBeNull();
    expect(body.group).toBeNull();
    expect(await jobsOf(stale.id)).toHaveLength(0);
  });
});

describe("frescura dentro del estado (AC3)", () => {
  it("cada perfil se comprueba como mucho una vez cada 30 s, la pida quien la pida", async () => {
    const row = await profile("Rancio", 10 * MIN);
    const t0 = Date.now();
    const riotId = { gameName: "Rancio", tagLine: "EUW" };
    const at = (ms: number) => ({ group: false, now: new Date(t0 + ms) });

    await loadStatus(db, riotId, at(0));
    expect(await jobsOf(row.id)).toHaveLength(1);

    // Otro visor 10 s después, con el perfil otra vez rancio y sin job activo: no se comprueba.
    await finishJobsLongAgo(row.id);
    await loadStatus(db, riotId, at(10_000));
    expect(await jobsOf(row.id)).toHaveLength(1);

    // Pasados 30 s, sí.
    await loadStatus(db, riotId, at(FRESHNESS_CHECK_EVERY_MS));
    expect(await jobsOf(row.id)).toHaveLength(2);
  });

  it("en la vista del grupo, el dueño y los miembros comparten el mismo registro de 30 s", async () => {
    const a = await profile("Ana", 10 * MIN, { member: true });
    const b = await profile("Beto", 10 * MIN, { member: true });
    const t0 = Date.now();
    const at = (ms: number) => ({ group: true, now: new Date(t0 + ms) });

    await loadStatus(db, { gameName: "Ana", tagLine: "EUW" }, at(0));
    expect(await jobsOf(a.id)).toHaveLength(1);
    expect(await jobsOf(b.id)).toHaveLength(1);

    // Otro visor mira el grupo desde el perfil de Beto 5 s después: nadie se comprueba de nuevo.
    await finishJobsLongAgo(a.id);
    await finishJobsLongAgo(b.id);
    await loadStatus(db, { gameName: "Beto", tagLine: "EUW" }, at(5_000));
    expect(await jobsOf(a.id)).toHaveLength(1);
    expect(await jobsOf(b.id)).toHaveLength(1);
  });

  it("perfil sincronizado hace menos de STALE_AFTER_MS: no encola", async () => {
    const row = await profile("Fresco", STALE_AFTER_MS - MIN / 2);
    await get(query("Fresco"));
    expect(await jobsOf(row.id)).toHaveLength(0);
  });

  it("claimFreshnessCheck: la primera vez sí, dentro de 30 s no, después otra vez sí", () => {
    expect(claimFreshnessCheck(1, 0)).toBe(true);
    expect(claimFreshnessCheck(1, FRESHNESS_CHECK_EVERY_MS - 1)).toBe(false);
    expect(claimFreshnessCheck(2, 1)).toBe(true); // por perfil
    expect(claimFreshnessCheck(1, FRESHNESS_CHECK_EVERY_MS)).toBe(true);
  });
});
