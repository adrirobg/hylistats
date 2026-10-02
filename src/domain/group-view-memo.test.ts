import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { groupMembers, profiles } from "@/db/schema";
import { bumpGroupVersion, bumpProfileVersions } from "@/lib/data-version";
import type { ChampionCatalog } from "@/lib/ddragon";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import { loadGroupView, profileGroupDataOf } from "./group-view";
import { groupViewComputations, loadProfileGroupData } from "./group-view-memo";

const db = getTestDb();
const seasonStart = new Date("2026-05-12T00:00:00Z");
// Octubre antes del cambio de hora: Madrid = UTC+2, las 06:00 de Madrid son las 04:00 UTC.
// Jueves 2026-10-01, 14:00 Madrid.
const now = Date.UTC(2026, 9, 1, 12, 0, 0);

beforeEach(truncateAll);
afterAll(closeDb);

async function insertMember(gameName: string, puuid: string | null) {
  const [profile] = await db
    .insert(profiles)
    .values({
      gameName,
      tagLine: "EUW",
      riotIdNorm: `${gameName.toLowerCase()}#euw`,
      puuid,
      status: "active",
      lastSyncedAt: new Date("2026-10-01T10:00:00Z"),
    })
    .returning();
  await db.insert(groupMembers).values({ profileId: profile.id });
  return profile;
}

async function seed() {
  const a = await insertMember("Alfa", "puuid-a");
  const b = await insertMember("Bravo", "puuid-b");
  return { a, b };
}

/** Cálculos de `GroupView` que hace `fn`. */
async function computationsDuring(fn: () => Promise<unknown>) {
  const before = groupViewComputations();
  await fn();
  return groupViewComputations() - before;
}

const load = (profileId: number, at: number = now) =>
  loadProfileGroupData(db, profileId, at, seasonStart);

describe("memo de GroupView", () => {
  it("misma clave: un solo cálculo para N llamadas, también concurrentes y de varios miembros", async () => {
    const { a, b } = await seed();
    const count = await computationsDuring(async () => {
      await Promise.all([load(a.id), load(b.id), load(a.id), load(b.id)]);
      await load(a.id);
      // Otro instante del mismo día de juego: misma clave.
      await load(b.id, now + 3_600_000);
    });
    expect(count).toBe(1);
  });

  it("las llamadas concurrentes comparten la misma vista", async () => {
    const { a, b } = await seed();
    const [first, second] = await Promise.all([load(a.id), load(b.id)]);
    expect(first.view?.day).toBe(second.view?.day);
    expect(first.view?.elo).toBe(second.view?.elo);
  });

  it("un no miembro no calcula nada", async () => {
    await seed();
    const [x] = await db
      .insert(profiles)
      .values({
        gameName: "elruffles",
        tagLine: "EUW",
        riotIdNorm: "elruffles#euw",
        puuid: "puuid-x",
        status: "active",
      })
      .returning();
    const count = await computationsDuring(async () => {
      expect(await load(x.id)).toEqual({ titles: [], elo: null, view: null });
      expect(await load(999_999)).toEqual({
        titles: [],
        elo: null,
        view: null,
      });
    });
    expect(count).toBe(0);
  });

  it("cambiar la versión del grupo recalcula; la de un perfil ajeno al grupo no", async () => {
    const { a } = await seed();
    await load(a.id);
    expect(
      await computationsDuring(async () => {
        bumpProfileVersions([999_999], { group: false });
        await load(a.id);
      }),
    ).toBe(0);
    expect(
      await computationsDuring(async () => {
        bumpGroupVersion();
        await load(a.id);
        await load(a.id);
      }),
    ).toBe(1);
  });

  it("el día de juego cambia a las 06:00 de Madrid: 05:58 → 05:59 no recalcula, 05:59 → 06:00 sí", async () => {
    const { a } = await seed();
    const at0558 = Date.UTC(2026, 9, 1, 3, 58);
    const at0559 = Date.UTC(2026, 9, 1, 3, 59);
    const at0600 = Date.UTC(2026, 9, 1, 4, 0);
    await load(a.id, at0558);
    expect(await computationsDuring(() => load(a.id, at0559))).toBe(0);
    let atSix: Awaited<ReturnType<typeof load>> | undefined;
    expect(
      await computationsDuring(async () => {
        atSix = await load(a.id, at0600);
      }),
    ).toBe(1);
    expect(atSix?.view?.day.period.key).toBe("2026-10-01");
  });

  it("la semana cambia el lunes a las 06:00 de Madrid y recalcula", async () => {
    const { a } = await seed();
    // Domingo 2026-10-04 23:00 y lunes 2026-10-05 05:59 Madrid: mismo día de juego (domingo).
    const sunday = Date.UTC(2026, 9, 4, 21, 0);
    const mondayEarly = Date.UTC(2026, 9, 5, 3, 59);
    const monday = Date.UTC(2026, 9, 5, 4, 0);
    const before = await load(a.id, sunday);
    expect(await computationsDuring(() => load(a.id, mondayEarly))).toBe(0);
    let after: Awaited<ReturnType<typeof load>> | undefined;
    expect(
      await computationsDuring(async () => {
        after = await load(a.id, monday);
      }),
    ).toBe(1);
    expect(before.view?.week.period.key).toBe("2026-09-28");
    expect(after?.view?.week.period.key).toBe("2026-10-05");
  });

  it("cambiar de catálogo (iconos o total de campeones) recalcula", async () => {
    const { a } = await seed();
    const catalog: ChampionCatalog = { version: "16.1.1", champions: [] };
    await loadProfileGroupData(db, a.id, now, seasonStart, catalog);
    expect(
      await computationsDuring(() =>
        loadProfileGroupData(db, a.id, now, seasonStart, catalog),
      ),
    ).toBe(0);
    expect(
      await computationsDuring(() =>
        loadProfileGroupData(db, a.id, now, seasonStart, {
          ...catalog,
          version: "16.2.1",
        }),
      ),
    ).toBe(1);
  });

  it("la vista y los datos de cabecera son los de loadGroupView (sin memo)", async () => {
    const { a, b } = await seed();
    const catalog: ChampionCatalog = { version: "16.1.1", champions: [] };
    const reference = await loadGroupView(db, now, seasonStart, catalog);
    for (const member of [a, b]) {
      const data = await loadProfileGroupData(
        db,
        member.id,
        now,
        seasonStart,
        catalog,
      );
      expect(data.view).toEqual(reference);
      expect({ titles: data.titles, elo: data.elo }).toEqual(
        profileGroupDataOf(reference, member.id),
      );
    }
  });

  it("la última sincronización se lee al día sin recalcular (no sube la versión)", async () => {
    const { a, b } = await seed();
    await db
      .update(profiles)
      .set({ lastSyncedAt: new Date("2026-10-01T08:00:00Z") })
      .where(eq(profiles.id, b.id));
    const first = await load(a.id);
    expect(first.view?.oldestSync).toMatchObject({ gameName: "Bravo" });

    await db
      .update(profiles)
      .set({ lastSyncedAt: new Date("2026-10-01T11:00:00Z") })
      .where(eq(profiles.id, b.id));
    let second: Awaited<ReturnType<typeof load>> | undefined;
    expect(
      await computationsDuring(async () => {
        second = await load(a.id);
      }),
    ).toBe(0);
    expect(second?.view?.oldestSync).toMatchObject({
      gameName: "Alfa",
      lastSyncedAt: new Date("2026-10-01T10:00:00Z"),
    });
    expect(
      second?.view?.members.find((m) => m.profileId === b.id)?.lastSyncedAt,
    ).toEqual(new Date("2026-10-01T11:00:00Z"));
  });
});
