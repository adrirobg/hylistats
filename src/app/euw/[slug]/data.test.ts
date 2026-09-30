import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { profiles, settings, syncJobs } from "@/db/schema";
import { storeMatch } from "@/domain/ingest";
import type { ChampionCatalog } from "@/lib/ddragon";
import { getTestDb, truncateAll } from "../../../../tests/helpers/db";
import {
  loadMatchFixtures,
  type MatchFixture,
  promoteTrioToFirst,
  SELF_PUUID,
  variantOf,
} from "../../../../tests/helpers/matches";
import {
  loadProfilePage,
  type ProfilePageData,
  type ProfileView,
} from "./data";
import { PROFILE_TABS, type ProfileTab } from "./view-model";

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

async function insertJob(
  profileId: number,
  values: Partial<typeof syncJobs.$inferInsert> = {},
) {
  await db.insert(syncJobs).values({ profileId, kind: "backfill", ...values });
}

async function load(
  gameName = "BEJITO MAMBO",
  tagLine = "1991",
  tab: ProfileTab = "campeones",
) {
  return loadProfilePage(db, gameName, tagLine, { tab }, seasonStart);
}

/** La variante `profile` de la carga (falla el test si es otra). */
async function loadProfile(tab: ProfileTab = "campeones") {
  const data = await load("BEJITO MAMBO", "1991", tab);
  if (data.kind !== "profile") throw new Error(`kind inesperado: ${data.kind}`);
  return data;
}

/** ¿Aparece la clave `key` en algún nivel del valor? (recorre objetos y arrays; salta fechas). */
function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return false;
  }
  return Object.entries(value).some(
    ([k, v]) => k === key || hasKeyDeep(v, key),
  );
}

describe("loadProfilePage", () => {
  it("perfil inexistente: unregistered con el Riot ID tecleado", async () => {
    expect(await load("Faker", "KR1")).toEqual({
      kind: "unregistered",
      gameName: "Faker",
      tagLine: "KR1",
    });
  });

  it("perfil not_found: not_found", async () => {
    await insertProfile({ status: "not_found", puuid: null });
    expect(await load()).toEqual({
      kind: "not_found",
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
    });
  });

  it("busca por riotIdNorm y devuelve el Riot ID canónico del perfil", async () => {
    await insertProfile({
      gameName: "Bejito Mambo",
      tagLine: "1991",
      riotIdNorm: "bejito mambo#1991",
    });
    const data = await load("  BEJITO mambo ", "1991");
    expect(data).toMatchObject({
      kind: "profile",
      gameName: "Bejito Mambo",
      tagLine: "1991",
      seasonStart,
    });
  });

  it("perfil recién registrado (sin puuid): job pending = resolviendo y stats vacías", async () => {
    const profile = await insertProfile({
      puuid: null,
      status: "resolving",
    });
    await insertJob(profile.id);
    const data = await loadProfile();
    expect(data.sync).toEqual({ kind: "backfill", phase: "resolving" });
    expect(data.lastSyncedAt).toBeNull();
    expect(data.summary.games).toBe(0);
    expect(data.summary.avgPlacement).toBeNull();
    expect(data.verifiedChampions).toEqual([]);
    expect(data.challenge.comparison.status).toBe("unknown");
    expect(data.paused).toBe(false);
  });

  it("job listing: cuenta los ids ya listados (totalIds aún vale 0)", async () => {
    const profile = await insertProfile();
    await insertJob(profile.id, {
      status: "listing",
      matchIds: ["EUW1_1", "EUW1_2", "EUW1_3"],
      totalIds: 0,
    });
    expect((await loadProfile()).sync).toEqual({
      kind: "backfill",
      phase: "listing",
      listedIds: 3,
    });
  });

  it("job fetching: devuelve fetched/total", async () => {
    const profile = await insertProfile();
    await insertJob(profile.id, {
      kind: "incremental",
      status: "fetching",
      matchIds: ["EUW1_1", "EUW1_2", "EUW1_3"],
      totalIds: 3,
      fetched: 2,
    });
    expect((await loadProfile()).sync).toEqual({
      kind: "incremental",
      phase: "fetching",
      fetched: 2,
      total: 3,
    });
  });

  it("sin job activo (solo done/error) no hay progreso y sale lastSyncedAt", async () => {
    const lastSyncedAt = new Date("2026-09-29T10:00:00Z");
    const profile = await insertProfile({ lastSyncedAt });
    await insertJob(profile.id, { status: "done", finishedAt: lastSyncedAt });
    await insertJob(profile.id, { kind: "incremental", status: "error" });
    const data = await loadProfile();
    expect(data.sync).toBeNull();
    expect(data.lastSyncedAt).toEqual(lastSyncedAt);
    // El último job terminado (el incremental) acabó en error.
    expect(data.lastJobError).not.toBeNull();
  });

  it("lastJobError: solo si el último job terminado acabó en error, con su instante y sin el texto", async () => {
    const profile = await insertProfile();
    expect((await loadProfile()).lastJobError).toBeNull(); // sin jobs

    const failedAt = new Date("2026-09-29T11:00:00Z");
    await insertJob(profile.id, {
      status: "error",
      finishedAt: failedAt,
      lastError: "connect ECONNREFUSED /srv/secreto/ruta",
    });
    const failed = await loadProfile();
    expect(failed.lastJobError).toEqual({ at: failedAt });
    // El motivo (puede traer rutas o detalles internos) no viaja a la página.
    expect(JSON.stringify(failed)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(failed)).not.toContain("secreto");

    // Un job activo posterior no borra el dato (la UI decide ocultarlo mientras se sincroniza)...
    await insertJob(profile.id, { kind: "incremental", status: "pending" });
    const retrying = await loadProfile();
    expect(retrying.sync).not.toBeNull();
    expect(retrying.lastJobError).toEqual({ at: failedAt });

    // ...pero un `done` posterior sí: la actualización se recuperó.
    await db
      .update(syncJobs)
      .set({ status: "done", finishedAt: new Date("2026-09-29T12:00:00Z") })
      .where(eq(syncJobs.status, "pending"));
    const recovered = await loadProfile();
    expect(recovered.sync).toBeNull();
    expect(recovered.lastJobError).toBeNull();
  });

  it("lastJobError: sin finishedAt usa updatedAt; un error antiguo tras un done reciente no cuenta", async () => {
    const profile = await insertProfile();
    // Error más antiguo (id 1) y luego un done (id 2): el último terminado es el done.
    await insertJob(profile.id, { status: "error", lastError: "boom" });
    await insertJob(profile.id, {
      kind: "incremental",
      status: "done",
      finishedAt: new Date("2026-09-29T12:00:00Z"),
    });
    expect((await loadProfile()).lastJobError).toBeNull();

    await insertJob(profile.id, { kind: "incremental", status: "error" });
    const data = await loadProfile();
    expect(data.lastJobError?.at).toBeInstanceOf(Date);
  });

  it("lastGameAt: null sin partidas y la última partida de la temporada con ellas", async () => {
    await insertProfile();
    expect((await loadProfile()).lastGameAt).toBeNull();

    await storeAll();
    await storeVariant(fixtures[1], "EUW1_TEST_LATEST", (j) => {
      j.info.gameCreation = 1_790_700_000_000;
    });
    expect((await loadProfile()).lastGameAt).toBe(1_790_700_000_000);
  });

  it("solo mira los jobs del perfil pedido", async () => {
    const other = await insertProfile({
      gameName: "Otro Jugador",
      riotIdNorm: "otro jugador#eu1",
      tagLine: "EU1",
      puuid: "anon-puuid-otro",
    });
    await insertJob(other.id, { status: "fetching", totalIds: 9, fetched: 4 });
    await insertProfile();
    expect((await loadProfile()).sync).toBeNull();
  });

  it("perfil con stats y challengeValue: resumen, campeones verificados y comparación", async () => {
    await storeAll();
    await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
      j.info.gameCreation = 1_790_700_000_000;
      promoteTrioToFirst(j, SELF_PUUID);
    });
    const checkedAt = new Date("2026-09-29T12:00:00Z");
    await insertProfile({
      challengeValue: 75,
      challengeLevel: "MASTER",
      challengeCheckedAt: checkedAt,
    });

    const data = await loadProfile();
    expect(data.summary.games).toBe(11);
    expect(data.summary.firsts).toBe(1);
    expect(data.summary.distribution).toEqual({
      1: 1,
      2: 2,
      3: 3,
      4: 2,
      5: 2,
      6: 1,
    });
    expect(data.verifiedChampions).toEqual([
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
    // 1 campeón verificado frente a 75 del challenge.
    expect(data.challenge).toEqual({
      value: 75,
      level: "MASTER",
      checkedAt,
      comparison: { status: "diff", diff: -74 },
    });
  });

  describe("álbum", () => {
    const BLITZCRANK = {
      championId: 53,
      ddId: "Blitzcrank",
      name: "Blitzcrank",
      portraitUrl: "https://cdn.test/Blitzcrank.png",
    };
    const AHRI = {
      championId: 103,
      ddId: "Ahri",
      name: "Ahri",
      portraitUrl: "https://cdn.test/Ahri.png",
    };
    const catalog: ChampionCatalog = {
      version: "16.19.1",
      champions: [AHRI, BLITZCRANK],
    };

    /** Perfil con las 10 partidas reales y un 1º sintético de Blitzcrank. */
    async function seedProfileWithFirst() {
      await storeAll();
      await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
        j.info.gameCreation = 1_790_700_000_000;
        promoteTrioToFirst(j, SELF_PUUID);
      });
      await insertProfile();
    }

    async function loadWith(
      catalogOrPromise: ChampionCatalog | Promise<ChampionCatalog>,
    ) {
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab: "campeones" },
        seasonStart,
        catalogOrPromise,
      );
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);
      return data.album;
    }

    it("catálogo inyectado (también como promesa): catálogo completo más los jugados ausentes", async () => {
      await seedProfileWithFirst();
      const album = await loadWith(Promise.resolve(catalog));

      // Blitzcrank está verificado y con retrato; Ahri está en el catálogo pero no se ha jugado.
      expect(album.find((e) => e.championId === 53)).toMatchObject({
        ddId: "Blitzcrank",
        portraitUrl: "https://cdn.test/Blitzcrank.png",
        state: "won",
        firsts: 1,
        firstWinMatchId: "EUW1_TEST_FIRST",
        firstWinAt: 1_790_700_000_000,
      });
      expect(album.find((e) => e.championId === 103)).toMatchObject({
        state: "none",
        games: 0,
      });
      // Los demás campeones jugados no están en el catálogo de prueba: salen igualmente, sin retrato.
      const absent = album.filter((e) => e.ddId === null);
      expect(absent.length).toBeGreaterThan(0);
      expect(
        absent.every((e) => e.state === "played" && e.portraitUrl === null),
      ).toBe(true);
      expect(album).toHaveLength(2 + absent.length);
    });

    it("sin catálogo: solo los campeones jugados, sin retratos, y los verificados coinciden con la lista", async () => {
      await seedProfileWithFirst();
      const data = await loadProfile();
      expect(data.album.every((e) => e.portraitUrl === null)).toBe(true);
      expect(data.album.every((e) => e.games > 0)).toBe(true);
      expect(
        data.album.filter((e) => e.state === "won").map((e) => e.championId),
      ).toEqual(data.verifiedChampions.map((c) => c.championId));
    });

    it("perfil sin partidas: el álbum es el catálogo entero, sin jugar", async () => {
      await insertProfile();
      const album = await loadWith(catalog);
      expect(album.map((e) => e.championId)).toEqual([103, 53]);
      expect(album.every((e) => e.state === "none")).toBe(true);
    });
  });

  describe("forma reciente", () => {
    /** Las 10 partidas reales más `extra` variantes posteriores de Blitzcrank, una por minuto. */
    async function seedWithLater(extra: number) {
      await storeAll();
      for (let i = 0; i < extra; i += 1) {
        await storeVariant(fixtures[1], `EUW1_TEST_LATE_${i}`, (j) => {
          j.info.gameCreation = 1_790_800_000_000 + i * 60_000;
        });
      }
      await insertProfile();
    }

    it("las últimas 20 partidas, la más reciente primero", async () => {
      await seedWithLater(12); // 22 partidas en total: las dos más antiguas quedan fuera
      const { form } = await loadProfile();

      expect(form).toHaveLength(20);
      const lateIds = Array.from({ length: 12 }, (_, i) => i)
        .reverse()
        .map((i) => `EUW1_TEST_LATE_${i}`);
      const realIds = fixtures
        .map((f) => f.match)
        .sort((a, b) => b.info.gameCreation - a.info.gameCreation)
        .slice(0, 8)
        .map((m) => m.metadata.matchId);
      expect(form.map((g) => g.matchId)).toEqual([...lateIds, ...realIds]);
      expect(form[0]).toMatchObject({
        matchId: "EUW1_TEST_LATE_11",
        championId: 53,
        gameCreation: 1_790_800_000_000 + 11 * 60_000,
      });
      // Orden estrictamente descendente en el tiempo.
      for (let i = 1; i < form.length; i += 1) {
        expect(form[i - 1].gameCreation).toBeGreaterThan(form[i].gameCreation);
      }
    });

    it("con menos de 20 partidas salen las que hay; el nombre lo pone el catálogo si existe", async () => {
      await seedWithLater(0);
      const named: ChampionCatalog = {
        version: "16.19.1",
        champions: [
          {
            championId: 53,
            ddId: "Blitzcrank",
            name: "Blitzcrank (catálogo)",
            portraitUrl: "https://cdn.test/Blitzcrank.png",
          },
        ],
      };
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab: "campeones" },
        seasonStart,
        named,
      );
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);

      expect(data.form).toHaveLength(10);
      // Blitzcrank está en el catálogo: sale con su nombre de visualización...
      expect(data.form.find((g) => g.championId === 53)?.championName).toBe(
        "Blitzcrank (catálogo)",
      );
      // ...y Thresh, que no está, conserva el de la partida.
      expect(data.form.find((g) => g.championId === 412)?.championName).toBe(
        "Thresh",
      );
      // Sin catálogo todos salen con el nombre de la partida.
      const bare = await loadProfile();
      expect(bare.form.find((g) => g.championId === 53)?.championName).toBe(
        "Blitzcrank",
      );
    });

    it("sin partidas: forma vacía", async () => {
      await insertProfile();
      expect((await loadProfile()).form).toEqual([]);
    });
  });

  it("acota a la temporada pedida", async () => {
    await storeAll();
    await insertProfile();
    const data = await loadProfilePage(
      db,
      "BEJITO MAMBO",
      "1991",
      { tab: "campeones" },
      new Date("2026-09-29T00:00:00Z"),
    );
    expect(data.kind === "profile" && data.summary.games).toBe(2);
  });

  it("sin temporada explícita usa SEASON_START", async () => {
    await storeAll();
    await insertProfile();
    try {
      vi.stubEnv("SEASON_START", "2026-05-12T00:00:00Z");
      const all = await loadProfilePage(db, "BEJITO MAMBO", "1991", {
        tab: "campeones",
      });
      expect(all.kind === "profile" && all.summary.games).toBe(10);
      vi.stubEnv("SEASON_START", "2026-09-29T00:00:00Z");
      const late = await loadProfilePage(db, "BEJITO MAMBO", "1991", {
        tab: "campeones",
      });
      expect(late.kind === "profile" && late.summary.games).toBe(2);
      expect(late.kind === "profile" && late.seasonStart).toEqual(
        new Date("2026-09-29T00:00:00Z"),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keyStatus = 'invalid' -> paused: true (y solo entonces)", async () => {
    await insertProfile();
    expect((await loadProfile()).paused).toBe(false); // unknown

    await db
      .update(settings)
      .set({ keyStatus: "ok" })
      .where(eq(settings.id, 1));
    expect((await loadProfile()).paused).toBe(false);

    await db
      .update(settings)
      .set({
        keyStatus: "invalid",
        keyStatusReason: "401 Unauthorized",
        keyStatusSince: new Date(),
      })
      .where(eq(settings.id, 1));
    const data = await loadProfile();
    expect(data.paused).toBe(true);
    // El motivo de la pausa no viaja a la página pública.
    expect(JSON.stringify(data)).not.toContain("401");
  });

  it("no contiene la clave puuid en ningún nivel ni el valor del puuid", async () => {
    await storeAll();
    const profile = await insertProfile({
      challengeValue: 3,
      lastSyncedAt: new Date(),
    });
    await insertJob(profile.id, {
      status: "fetching",
      matchIds: ["EUW1_1"],
      totalIds: 1,
    });
    await db.insert(syncJobs).values({
      profileId: profile.id,
      kind: "incremental",
      status: "error",
      lastError: `fallo con ${SELF_PUUID}`,
    });
    const datas: ProfilePageData[] = [await load(), await load("Faker", "KR1")];
    await insertProfile({
      gameName: "Fantasma",
      tagLine: "EUW",
      riotIdNorm: "fantasma#euw",
      puuid: "anon-puuid-fantasma",
      status: "not_found",
    });
    datas.push(await load("Fantasma", "EUW"));

    expect(datas.map((d) => d.kind)).toEqual([
      "profile",
      "unregistered",
      "not_found",
    ]);
    for (const data of datas) {
      expect(hasKeyDeep(data, "puuid")).toBe(false);
      const json = JSON.stringify(data);
      expect(json).not.toContain(SELF_PUUID);
      expect(json).not.toContain("anon-puuid");
    }
  });

  describe("carga por pestaña", () => {
    // Clave de `ProfileView` con los datos propios de cada pestaña (`null` = no tiene). Solo existe,
    // y solo se rellena, en la pestaña activa.
    const OWN_KEY: Record<
      ProfileTab,
      "summaryTab" | "teammates" | "matches" | null
    > = {
      campeones: null, // el álbum es común: header, barra Arena God y raíl dependen de él
      resumen: "summaryTab",
      companeros: "teammates",
      partidas: "matches",
    };

    it("la pestaña pedida se refleja en la vista", async () => {
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        expect((await loadProfile(tab)).tab).toBe(tab);
      }
    });

    it("lo común (resumen, álbum, forma, verificados) se carga en todas las pestañas", async () => {
      await storeAll();
      await insertProfile();
      const base = await loadProfile("campeones");
      expect(base.summary.games).toBe(10);
      expect(base.album.length).toBeGreaterThan(0);
      expect(base.form).toHaveLength(10);
      for (const tab of PROFILE_TABS) {
        const data: ProfileView = {
          ...(await loadProfile(tab)),
          tab: base.tab,
        };
        // Salvo la pestaña y sus claves propias, la vista es la misma en las cuatro.
        for (const key of Object.values(OWN_KEY)) if (key) delete data[key];
        expect(data).toEqual(base);
      }
    });

    it("no carga datos de las pestañas no activas", async () => {
      await storeAll();
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        const data = await loadProfile(tab);
        for (const other of PROFILE_TABS) {
          const key = OWN_KEY[other];
          if (other === tab || key === null) continue;
          expect(data, `${tab} no debe traer ${key}`).not.toHaveProperty(key);
        }
      }
    });

    it("los compañeros no viajan fuera de su pestaña", async () => {
      await storeAll();
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        if (tab === "companeros") continue;
        const data = await loadProfile(tab);
        expect(hasKeyDeep(data, "teammates")).toBe(false);
        expect(JSON.stringify(data)).not.toContain("Player013");
      }
    });

    it("las vistas sin perfil no dependen de la pestaña", async () => {
      expect(await load("Faker", "KR1", "partidas")).toEqual({
        kind: "unregistered",
        gameName: "Faker",
        tagLine: "KR1",
      });
    });
  });
});
