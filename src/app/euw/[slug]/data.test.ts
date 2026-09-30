import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { matches, matchFetch, profiles, settings, syncJobs } from "@/db/schema";
import { arenaGodState, officialPhrase } from "@/domain/arena-god";
import { storeMatch } from "@/domain/ingest";
import { getRecordRows } from "@/domain/queries";
import { computeRecords } from "@/domain/records";
import {
  ARENA_GOD_THRESHOLD,
  ARENA_QUEUE_IDS,
  ARENA_QUIET_DAYS,
} from "@/lib/config";
import type { ChampionCatalog } from "@/lib/ddragon";
import type { GameData, GameIcon } from "@/lib/game-data";
import { RATE_LIMIT_MARKER, RiotRateLimitError } from "@/lib/riot/errors";
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
import { DEFAULT_MATCH_PARAMS, type MatchParams } from "./matches-view";
import type { TeammateParams } from "./teammates-view";
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

/** Un job que no espera ni tiene cola: lo que suma `SyncProgress` a `kind` y `phase`. */
const NO_WAIT = { retryAt: null, reason: null, queue: null } as const;

/** Otro perfil (`n`-ésimo) para que sus jobs hagan cola con los del perfil de los tests. */
async function insertOtherProfile(n: number) {
  return insertProfile({
    gameName: `Otro ${n}`,
    tagLine: "EUW",
    riotIdNorm: `otro ${n}#euw`,
    puuid: `anon-puuid-otro-${n}`,
  });
}

/** Partida de Arena mínima (sin participantes): solo cuenta para «la última partida de Arena». */
async function insertArenaMatch(
  matchId: string,
  gameCreation: number,
  queueId: number = ARENA_QUEUE_IDS[0],
) {
  await db.insert(matches).values({
    matchId,
    queueId,
    gameCreation,
    gameStartTimestamp: gameCreation,
    gameEndTimestamp: gameCreation + 1_500_000,
    gameDuration: 1500,
    gameVersion: "26.10.1",
  });
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** El `lastError` que guarda el worker tras un 429 persistente, y el de un 5xx. */
const RATE_LIMIT_ERROR = new RiotRateLimitError(
  { host: "europe", path: "/lol/match/v5/matches/:id", status: 429 },
  "límite de peticiones tras 5 intentos",
).message;
const SERVER_ERROR =
  "Riot europe /x -> 503: error del servidor tras 5 intentos";

async function load(
  gameName = "BEJITO MAMBO",
  tagLine = "1991",
  tab: ProfileTab = "campeones",
  teammates?: TeammateParams,
) {
  return loadProfilePage(
    db,
    gameName,
    tagLine,
    { tab, teammates },
    seasonStart,
  );
}

/** La variante `profile` de la carga (falla el test si es otra). */
async function loadProfile(
  tab: ProfileTab = "campeones",
  teammates?: TeammateParams,
) {
  const data = await load("BEJITO MAMBO", "1991", tab, teammates);
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
    expect(data.sync).toEqual({
      kind: "backfill",
      phase: "resolving",
      ...NO_WAIT,
    });
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
      ...NO_WAIT,
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
      ...NO_WAIT,
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

  describe("espera y cola del job activo (§5)", () => {
    const minutesFromNow = (n: number) => new Date(Date.now() + n * MINUTE_MS);

    describe("retryAt y reason", () => {
      it("job en backoff por 429 persistente: retryAt es su nextRunAt y reason, rate_limit", async () => {
        const profile = await insertProfile();
        const nextRunAt = minutesFromNow(2);
        await insertJob(profile.id, {
          status: "listing",
          nextRunAt,
          lastError: RATE_LIMIT_ERROR,
          attempts: 1,
        });
        expect((await loadProfile()).sync).toMatchObject({
          phase: "listing",
          retryAt: nextRunAt,
          reason: "rate_limit",
        });
      });

      it("job en backoff por otro fallo (5xx): reason es error", async () => {
        const profile = await insertProfile();
        const nextRunAt = minutesFromNow(1);
        await insertJob(profile.id, {
          status: "pending",
          nextRunAt,
          lastError: SERVER_ERROR,
        });
        expect((await loadProfile()).sync).toMatchObject({
          retryAt: nextRunAt,
          reason: "error",
        });
      });

      it("sin lastError (o anterior a la marca) el reintento cuenta como error, no como límite", async () => {
        const profile = await insertProfile();
        await insertJob(profile.id, {
          nextRunAt: minutesFromNow(1),
          lastError:
            "Riot europe /x -> 429: límite de peticiones tras 5 intentos",
        });
        expect((await loadProfile()).sync).toMatchObject({ reason: "error" });
      });

      it("un nextRunAt ya vencido no es una espera: el job solo aguarda al worker", async () => {
        const profile = await insertProfile();
        await insertJob(profile.id, {
          nextRunAt: minutesFromNow(-1),
          lastError: RATE_LIMIT_ERROR,
        });
        expect((await loadProfile()).sync).toMatchObject(NO_WAIT);
      });

      it("descargando con TODAS las partidas pendientes en backoff: la nextAttemptAt más cercana y su motivo", async () => {
        const profile = await insertProfile();
        await insertJob(profile.id, {
          status: "fetching",
          matchIds: ["EUW1_A", "EUW1_B", "EUW1_C", "EUW1_D"],
          totalIds: 4,
          fetched: 1,
        });
        const soonest = minutesFromNow(1);
        await db.insert(matchFetch).values([
          { matchId: "EUW1_A", status: "done" },
          // La más cercana es la del límite de peticiones; la más lejana, un 5xx.
          {
            matchId: "EUW1_B",
            nextAttemptAt: minutesFromNow(3),
            lastError: SERVER_ERROR,
          },
          {
            matchId: "EUW1_C",
            nextAttemptAt: soonest,
            lastError: RATE_LIMIT_ERROR,
          },
          // Una resuelta con error no espera nada aunque conserve su nextAttemptAt.
          {
            matchId: "EUW1_D",
            status: "error",
            nextAttemptAt: minutesFromNow(-5),
          },
        ]);
        expect((await loadProfile()).sync).toMatchObject({
          phase: "fetching",
          retryAt: soonest,
          reason: "rate_limit",
        });
      });

      it("basta una partida lista (sin espera o vencida) para que el job no cuente como frenado", async () => {
        const profile = await insertProfile();
        await insertJob(profile.id, {
          status: "fetching",
          matchIds: ["EUW1_A", "EUW1_B", "EUW1_C"],
          totalIds: 3,
        });
        await db.insert(matchFetch).values([
          {
            matchId: "EUW1_A",
            nextAttemptAt: minutesFromNow(2),
            lastError: RATE_LIMIT_ERROR,
          },
          { matchId: "EUW1_B" }, // pendiente y sin espera
          {
            matchId: "EUW1_C",
            nextAttemptAt: minutesFromNow(-1),
            lastError: RATE_LIMIT_ERROR,
          },
        ]);
        expect((await loadProfile()).sync).toMatchObject(NO_WAIT);

        // Con la lista y la vencida resueltas, solo queda la que espera: ahora sí está frenado.
        await db
          .update(matchFetch)
          .set({ status: "done" })
          .where(inArray(matchFetch.matchId, ["EUW1_B", "EUW1_C"]));
        expect((await loadProfile()).sync).toMatchObject({
          reason: "rate_limit",
        });
      });

      it("las partidas en backoff de otro job (que no están en el suyo) no cuentan", async () => {
        const profile = await insertProfile();
        await insertJob(profile.id, {
          status: "fetching",
          matchIds: ["EUW1_A"],
          totalIds: 1,
        });
        await db.insert(matchFetch).values([
          { matchId: "EUW1_A" }, // suya: lista
          {
            matchId: "EUW1_OTRA",
            nextAttemptAt: minutesFromNow(2),
            lastError: RATE_LIMIT_ERROR,
          },
        ]);
        expect((await loadProfile()).sync).toMatchObject(NO_WAIT);
      });

      it("el motivo se clasifica en el servidor: ni el texto de lastError ni la marca llegan a la página", async () => {
        const profile = await insertProfile();
        await insertJob(profile.id, {
          nextRunAt: minutesFromNow(2),
          lastError: `${RATE_LIMIT_ERROR} /srv/secreto/ruta`,
        });
        const json = JSON.stringify(await loadProfile());
        expect(json).toContain("rate_limit"); // la categoría, sí
        for (const leaked of [
          RATE_LIMIT_MARKER,
          "límite de peticiones",
          "matches/:id",
          "secreto",
          "lastError",
        ]) {
          expect(json).not.toContain(leaked);
        }
      });
    });

    describe("queue.ahead (job en pending/listing)", () => {
      it("cuenta los jobs de otros perfiles en pending/listing que se sirven antes (id menor)", async () => {
        const first = await insertOtherProfile(1);
        const second = await insertOtherProfile(2);
        const mine = await insertProfile();
        const later = await insertOtherProfile(3);
        await insertJob(first.id, { status: "pending" });
        await insertJob(second.id, { status: "listing", matchIds: ["EUW1_1"] });
        await insertJob(mine.id, { status: "pending" });
        await insertJob(later.id, { status: "pending" }); // detrás: no cuenta
        expect((await loadProfile()).sync).toMatchObject({
          phase: "resolving",
          queue: { ahead: 2, sharing: 0 },
        });
      });

      it("el primero de la cola no tiene a nadie delante: queue es null", async () => {
        const mine = await insertProfile();
        const later = await insertOtherProfile(1);
        await insertJob(mine.id, { status: "pending" });
        await insertJob(later.id, { status: "pending" });
        expect((await loadProfile()).sync?.queue).toBeNull();
      });

      it("un job interactivo pasa por delante de uno que no lo es, aunque llegue después", async () => {
        const mine = await insertProfile();
        const urgent = await insertOtherProfile(1);
        await insertJob(mine.id, { status: "pending", interactive: false });
        await insertJob(urgent.id, { status: "pending", interactive: true });
        expect((await loadProfile()).sync?.queue).toEqual({
          ahead: 1,
          sharing: 0,
        });
      });

      it("y si el mío es interactivo, solo pasan delante los interactivos anteriores", async () => {
        const olderBackground = await insertOtherProfile(1);
        const olderInteractive = await insertOtherProfile(2);
        const mine = await insertProfile();
        await insertJob(olderBackground.id, {
          status: "pending",
          interactive: false,
        });
        await insertJob(olderInteractive.id, {
          status: "pending",
          interactive: true,
        });
        await insertJob(mine.id, { status: "pending", interactive: true });
        expect((await loadProfile()).sync?.queue).toEqual({
          ahead: 1,
          sharing: 0,
        });
      });

      it("no cuentan los jobs en backoff, los que ya descargan ni los terminados", async () => {
        const waiting = await insertOtherProfile(1);
        const fetching = await insertOtherProfile(2);
        const done = await insertOtherProfile(3);
        const mine = await insertProfile();
        // Un pending en backoff no se sirve; un fetching va después de cualquier pending.
        await insertJob(waiting.id, {
          status: "pending",
          nextRunAt: new Date(Date.now() + 5 * MINUTE_MS),
          lastError: RATE_LIMIT_ERROR,
        });
        await insertJob(fetching.id, {
          status: "fetching",
          matchIds: ["EUW1_1"],
          totalIds: 1,
        });
        await insertJob(done.id, { status: "done" });
        await insertJob(mine.id, { status: "pending" });
        expect((await loadProfile()).sync?.queue).toBeNull();
      });

      it("el incremental de otro perfil también cuenta (la cola es de todos los jobs)", async () => {
        const other = await insertOtherProfile(1);
        const mine = await insertProfile();
        await insertJob(other.id, { kind: "incremental", status: "pending" });
        await insertJob(mine.id, { kind: "incremental", status: "pending" });
        expect((await loadProfile()).sync).toMatchObject({
          kind: "incremental",
          queue: { ahead: 1, sharing: 0 },
        });
      });
    });

    describe("queue.sharing (job en fetching)", () => {
      const fetchingJob = { status: "fetching", totalIds: 2 } as const;

      it("cuenta los otros jobs en fetching con los que reparte el round-robin", async () => {
        const a = await insertOtherProfile(1);
        const b = await insertOtherProfile(2);
        const mine = await insertProfile();
        await insertJob(a.id, { ...fetchingJob, matchIds: ["EUW1_1"] });
        await insertJob(mine.id, { ...fetchingJob, matchIds: ["EUW1_2"] });
        await insertJob(b.id, { ...fetchingJob, matchIds: ["EUW1_3"] });
        expect((await loadProfile()).sync).toMatchObject({
          phase: "fetching",
          queue: { ahead: 0, sharing: 2 },
        });
      });

      it("no reparte con jobs que aún resuelven o listan, ni con los terminados ni con los que esperan reintento", async () => {
        const pending = await insertOtherProfile(1);
        const done = await insertOtherProfile(2);
        const backoff = await insertOtherProfile(3);
        const mine = await insertProfile();
        await insertJob(pending.id, { status: "pending" });
        await insertJob(done.id, { status: "done" });
        await insertJob(backoff.id, {
          ...fetchingJob,
          matchIds: ["EUW1_1"],
          nextRunAt: new Date(Date.now() + 5 * MINUTE_MS),
        });
        await insertJob(mine.id, { ...fetchingJob, matchIds: ["EUW1_2"] });
        expect((await loadProfile()).sync?.queue).toBeNull();
      });

      it("uno interactivo solo reparte con otros interactivos; uno que no lo es, con todos", async () => {
        const background = await insertOtherProfile(1);
        const interactive = await insertOtherProfile(2);
        const mine = await insertProfile();
        await insertJob(background.id, {
          ...fetchingJob,
          matchIds: ["EUW1_1"],
          interactive: false,
        });
        await insertJob(interactive.id, {
          ...fetchingJob,
          matchIds: ["EUW1_2"],
          interactive: true,
        });
        await insertJob(mine.id, {
          ...fetchingJob,
          matchIds: ["EUW1_3"],
          interactive: true,
        });
        expect((await loadProfile()).sync?.queue).toEqual({
          ahead: 0,
          sharing: 1,
        });

        await db
          .update(syncJobs)
          .set({ interactive: false })
          .where(eq(syncJobs.profileId, mine.id));
        expect((await loadProfile()).sync?.queue).toEqual({
          ahead: 0,
          sharing: 2,
        });
      });
    });

    it("un job que espera su reintento no está en la cola: queue es null aunque haya otros", async () => {
      const other = await insertOtherProfile(1);
      const mine = await insertProfile();
      await insertJob(other.id, { status: "pending" });
      await insertJob(mine.id, {
        status: "pending",
        nextRunAt: minutesFromNow(2),
        lastError: RATE_LIMIT_ERROR,
      });
      expect((await loadProfile()).sync).toMatchObject({
        reason: "rate_limit",
        queue: null,
      });
    });

    it("solo recuentos: ni ids, ni nombres, ni puuid de los otros perfiles", async () => {
      const ahead = await insertOtherProfile(1);
      const mine = await insertOtherProfile(2);
      await insertJob(ahead.id, {
        status: "listing",
        matchIds: ["EUW1_AJENA"],
      });
      await insertJob(mine.id, { status: "pending" });
      const data = await load("Otro 2", "EUW");
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);
      expect(data.sync?.queue).toEqual({ ahead: 1, sharing: 0 });
      const json = JSON.stringify(data);
      expect(hasKeyDeep(data, "puuid")).toBe(false);
      for (const leaked of ["Otro 1", "anon-puuid-otro-1", "EUW1_AJENA"]) {
        expect(json).not.toContain(leaked);
      }
    });
  });

  describe("Arena fuera de rotación (arenaQuiet)", () => {
    const ago = (days: number) => Date.now() - days * DAY_MS;
    const SYNCED = new Date("2026-09-29T10:00:00Z");

    it("una partida de Arena de hace más de 7 días en la BD: la etiqueta trae su instante", async () => {
      expect(ARENA_QUIET_DAYS).toBe(7);
      await insertProfile({ lastSyncedAt: SYNCED });
      const at = ago(10);
      await insertArenaMatch("EUW1_OLD", at);
      expect((await loadProfile()).arenaQuiet).toEqual({ lastArenaGameAt: at });
    });

    it("con la última partida reciente no hay etiqueta", async () => {
      await insertProfile({ lastSyncedAt: SYNCED });
      await insertArenaMatch("EUW1_OLD", ago(30));
      await insertArenaMatch("EUW1_NEW", ago(2));
      expect((await loadProfile()).arenaQuiet).toBeNull();
    });

    it("el umbral son 7 días: unos minutos por debajo no; unos minutos por encima, sí", async () => {
      await insertProfile({ lastSyncedAt: SYNCED });
      await insertArenaMatch("EUW1_EDGE", ago(7) + 5 * MINUTE_MS);
      expect((await loadProfile()).arenaQuiet).toBeNull();

      await db.delete(matches);
      const at = ago(7) - 5 * MINUTE_MS;
      await insertArenaMatch("EUW1_EDGE", at);
      expect((await loadProfile()).arenaQuiet).toEqual({ lastArenaGameAt: at });
    });

    it("usa la última partida de Arena de la BD entera, no de las de este perfil ni de la temporada", async () => {
      // Este perfil no tiene ni una partida; las de la BD son de otros y anteriores a la temporada.
      await insertProfile({ lastSyncedAt: SYNCED });
      await insertOtherProfile(1);
      const older = Date.UTC(2026, 0, 3);
      const newest = Date.UTC(2026, 2, 20);
      await insertArenaMatch("EUW1_A", older);
      await insertArenaMatch("EUW1_B", newest);
      const data = await loadProfile();
      expect(data.summary.games).toBe(0);
      expect(data.arenaQuiet).toEqual({ lastArenaGameAt: newest });
    });

    it("solo cuentan las colas de Arena (1750 y 1740): otro modo reciente no la desmiente", async () => {
      await insertProfile({ lastSyncedAt: SYNCED });
      const arena = ago(12);
      await insertArenaMatch("EUW1_ARENA", arena, ARENA_QUEUE_IDS[0]);
      await insertArenaMatch("EUW1_ARAM", ago(1), 450);
      expect((await loadProfile()).arenaQuiet).toEqual({
        lastArenaGameAt: arena,
      });

      // Una partida reciente de la otra cola de Arena sí la desmiente.
      await insertArenaMatch("EUW1_ARENA2", ago(1), ARENA_QUEUE_IDS[1]);
      expect((await loadProfile()).arenaQuiet).toBeNull();
    });

    it("sin ninguna partida de Arena en la BD no hay desde cuándo: sin etiqueta", async () => {
      await insertProfile({ lastSyncedAt: SYNCED });
      await insertArenaMatch("EUW1_ARAM", ago(30), 450);
      expect((await loadProfile()).arenaQuiet).toBeNull();
    });

    it("sin sincronizar nunca no se afirma nada", async () => {
      await insertProfile({ lastSyncedAt: null });
      await insertArenaMatch("EUW1_OLD", ago(10));
      expect((await loadProfile()).arenaQuiet).toBeNull();
    });

    it("si la última actualización falló, el silencio podría ser un fallo de sincronización: sin etiqueta", async () => {
      const profile = await insertProfile({ lastSyncedAt: SYNCED });
      await insertArenaMatch("EUW1_OLD", ago(10));
      await insertJob(profile.id, {
        status: "error",
        finishedAt: new Date(),
        lastError: "boom",
      });
      expect((await loadProfile()).arenaQuiet).toBeNull();

      // Una actualización posterior que acaba bien la devuelve.
      await insertJob(profile.id, {
        kind: "incremental",
        status: "done",
        finishedAt: new Date(),
      });
      expect((await loadProfile()).arenaQuiet).toMatchObject({
        lastArenaGameAt: expect.any(Number),
      });
    });

    it("es un dato común: sale igual en todas las pestañas y no es un puuid ni cuelga de una", async () => {
      await insertProfile({ lastSyncedAt: SYNCED });
      const at = ago(9);
      await insertArenaMatch("EUW1_OLD", at);
      for (const tab of PROFILE_TABS) {
        expect((await loadProfile(tab)).arenaQuiet).toEqual({
          lastArenaGameAt: at,
        });
      }
    });
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

  it("sin contador oficial (challengeValue null) y con partidas: value null y comparación unknown en todas las pestañas (§4.3)", async () => {
    await storeAll();
    await insertProfile(); // nunca se leyó el challenge
    for (const tab of PROFILE_TABS) {
      const data = await loadProfile(tab);
      expect(data.summary.games).toBe(10);
      expect(data.challenge).toEqual({
        value: null,
        level: null,
        checkedAt: null,
        comparison: { status: "unknown", diff: null },
      });
      // La barra Arena God recibe `official: null` y cae en «sin dato oficial», no en un 0.
      const god = arenaGodState({
        verifiedIds: data.verifiedChampions.map((c) => c.championId),
        manualIds: [],
        official: data.challenge.value,
        goal: ARENA_GOD_THRESHOLD,
      });
      expect(god.status).toBe("unknown");
      expect(officialPhrase(god.official)).toBe("oficial sin dato");
    }
  });

  describe("badge y meta de la barra (arenaGod)", () => {
    /** Catálogo de `n` campeones sintéticos. */
    const catalogOf = (n: number): ChampionCatalog => ({
      version: "16.19.1",
      champions: Array.from({ length: n }, (_, i) => ({
        championId: 1000 + i,
        ddId: `Champ${i}`,
        name: `Champ ${i}`,
        portraitUrl: null,
      })),
    });

    async function loadGod(
      challengeValue: number | null,
      catalog: ChampionCatalog,
    ) {
      await storeAll(); // pocos verificados: la condición sale del contador oficial
      await insertProfile({ challengeValue });
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab: "campeones" },
        seasonStart,
        catalog,
      );
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);
      return data.arenaGod;
    }

    it("oficial 60 y catálogo de 172: badge y meta en el tamaño del catálogo (Dios de Arena)", async () => {
      expect(await loadGod(60, catalogOf(172))).toEqual({
        reached: true,
        goal: 172,
        name: "Dios de Arena",
      });
    });

    it("oficial 59: sin badge, la meta sigue en 60 (Deidad de Arena)", async () => {
      expect(await loadGod(59, catalogOf(172))).toEqual({
        reached: false,
        goal: ARENA_GOD_THRESHOLD,
        name: "Deidad de Arena",
      });
    });

    it("badge con el catálogo caído (vacío): la meta se queda en 60", async () => {
      expect(await loadGod(75, { version: null, champions: [] })).toEqual({
        reached: true,
        goal: ARENA_GOD_THRESHOLD,
        name: "Deidad de Arena",
      });
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
    // Claves de `ProfileView` con los datos propios de cada pestaña. Solo existen, y solo se
    // rellenan, en la pestaña activa.
    const OWN_KEYS: Record<ProfileTab, readonly (keyof ProfileView)[]> = {
      campeones: [], // el álbum es común: header, barra Arena God y raíl dependen de él
      resumen: ["summaryTab"],
      estadisticas: ["records"],
      companeros: ["teammates"],
      partidas: ["matches", "matchDetail"],
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
        for (const keys of Object.values(OWN_KEYS)) {
          for (const key of keys) delete data[key];
        }
        expect(data).toEqual(base);
      }
    });

    it("no carga datos de las pestañas no activas", async () => {
      await storeAll();
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        const data = await loadProfile(tab);
        for (const other of PROFILE_TABS) {
          if (other === tab) continue;
          for (const key of OWN_KEYS[other]) {
            expect(data, `${tab} no debe traer ${key}`).not.toHaveProperty(key);
          }
        }
      }
    });

    it("la lista de compañeros no viaja fuera de su pestaña; el top 5 del raíl, sí", async () => {
      await storeAll();
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        if (tab === "companeros") continue;
        const data = await loadProfile(tab);
        expect(hasKeyDeep(data, "teammates")).toBe(false);
        // Player152 (1 partida) queda fuera del top 5 del raíl y solo saldría en la lista completa.
        // Partidas es la excepción: sus filas nombran a los dos compañeros de trío de cada partida.
        if (tab !== "partidas") {
          expect(JSON.stringify(data)).not.toContain("Player152");
        }
        expect(data.railTeammates).toHaveLength(5);
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
  describe("estadisticas (records)", () => {
    it("solo la pestaña Estadísticas trae los récords", async () => {
      await storeAll();
      await insertProfile();
      expect(await loadProfile("estadisticas")).toHaveProperty("records");
      for (const tab of PROFILE_TABS) {
        if (tab === "estadisticas") continue;
        expect(await loadProfile(tab)).not.toHaveProperty("records");
      }
    });

    it("sin partidas: los récords de ninguna partida", async () => {
      await insertProfile();
      const data = await loadProfile("estadisticas");
      expect(data.records).toEqual(computeRecords([]));
      expect(data.records?.records.damage).toBeNull();
      expect(data.records?.deathlessWins).toEqual({ count: 0, matches: [] });
    });

    it("un perfil sin puuid todavía (resolviéndose) no rompe la pestaña", async () => {
      await insertProfile({ puuid: null, status: "resolving" });
      const data = await loadProfile("estadisticas");
      expect(data.records).toEqual(computeRecords([]));
    });

    it("son los récords de las partidas del perfil dentro de la temporada, sin puuid", async () => {
      await storeAll();
      await insertProfile();
      const data = await loadProfile("estadisticas");
      const expected = computeRecords(
        await getRecordRows(db, SELF_PUUID, seasonStart),
      );
      expect(data.records).toEqual(expected);
      expect(data.records?.records.kills).not.toBeNull();
      expect(data.records?.records.damage?.matchId).toMatch(/^EUW1_/);
      expect(hasKeyDeep(data, "puuid")).toBe(false);
      expect(JSON.stringify(data)).not.toContain(SELF_PUUID);
    });

    it("una temporada posterior deja fuera las partidas anteriores", async () => {
      await storeAll();
      await insertProfile();
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab: "estadisticas" },
        new Date("2027-01-01T00:00:00Z"),
      );
      expect(data.kind === "profile" && data.records).toEqual(
        computeRecords([]),
      );
    });

    it("un 1º añade la racha, el campeón con más 1º y la victoria a la primera", async () => {
      await storeAll();
      await storeVariant(fixtures[1], "EUW1_TEST_STATS_WIN", (j) => {
        j.info.gameCreation = 1_790_700_000_000;
        promoteTrioToFirst(j, SELF_PUUID);
      });
      await insertProfile();
      const { records } = await loadProfile("estadisticas");
      expect(records?.longestWinStreak).toMatchObject({
        length: 1,
        toMatchId: "EUW1_TEST_STATS_WIN",
        ongoing: true,
      });
      expect(records?.topChampion).toMatchObject({
        championId: 53,
        firsts: 1,
      });
    });
  });

  describe("resumen (summaryTab)", () => {
    const FIRST_AT = 1_790_700_000_000;
    const TRY_AT = FIRST_AT + 3_600_000;

    /**
     * Las 10 partidas reales más dos 1º sintéticos: uno de Blitzcrank (que ya jugaba) y una partida
     * de un campeón nuevo (999) que gana a la primera.
     */
    async function seedWithWins() {
      await storeAll();
      await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
        j.info.gameCreation = FIRST_AT;
        promoteTrioToFirst(j, SELF_PUUID);
      });
      await storeVariant(fixtures[1], "EUW1_TEST_TRY", (j) => {
        j.info.gameCreation = TRY_AT;
        promoteTrioToFirst(j, SELF_PUUID);
        const self = j.info.participants.find(
          (p) => p.puuid === SELF_PUUID,
        ) as (typeof j.info.participants)[number] & {
          championId: number;
          championName: string;
        };
        self.championId = 999;
        self.championName = "Nuevo";
      });
      await insertProfile();
    }

    it("solo la pestaña Resumen trae la curva y los destacados", async () => {
      await seedWithWins();
      expect(await loadProfile("resumen")).toHaveProperty("summaryTab");
      for (const tab of PROFILE_TABS) {
        if (tab === "resumen") continue;
        expect(await loadProfile(tab)).not.toHaveProperty("summaryTab");
      }
    });

    it("sin partidas: curva vacía, destacados vacíos y la meta de Arena God", async () => {
      await insertProfile();
      const data = await loadProfile("resumen");
      expect(data.summaryTab).toEqual({
        curve: [],
        highlights: { firstTry: [], mostTriedUnwon: [], bestFirstRate: [] },
        threshold: ARENA_GOD_THRESHOLD,
      });
    });

    it("la curva cuenta los verificados: del inicio de temporada a «ahora», un escalón por primer 1º", async () => {
      await seedWithWins();
      const before = Date.now();
      const data = await loadProfile("resumen");
      const { curve } = data.summaryTab ?? { curve: [] };

      expect(data.verifiedChampions.map((c) => c.championId).sort()).toEqual([
        53, 999,
      ]);
      expect(curve).toHaveLength(4);
      expect(curve.slice(0, 3)).toEqual([
        { at: seasonStart.getTime(), count: 0 },
        { at: FIRST_AT, count: 1 },
        { at: TRY_AT, count: 2 },
      ]);
      // El último punto es «ahora» con el recuento final, que es el de campeones verificados.
      expect(curve[3].at).toBeGreaterThanOrEqual(before);
      expect(curve[3].count).toBe(data.verifiedChampions.length);
    });

    it("los destacados salen del álbum: el campeón ganado a la primera y los pendientes de ganar", async () => {
      await seedWithWins();
      const data = await loadProfile("resumen");
      const { highlights } = data.summaryTab ?? {
        highlights: { firstTry: [], mostTriedUnwon: [], bestFirstRate: [] },
      };

      // Blitzcrank ya había jugado antes de su 1º: solo el campeón nuevo es «a la primera».
      expect(highlights.firstTry).toEqual([
        {
          championId: 999,
          name: "Nuevo",
          slug: "nuevo",
          games: 1,
          detail: "1º a la primera",
          portraitUrl: null,
        },
      ]);
      // Los pendientes son los jugados sin 1º, con más partidas primero; Thresh (3) encabeza.
      const played = data.album.filter((e) => e.state === "played");
      expect(highlights.mostTriedUnwon.map((c) => c.championId)).toEqual(
        played
          .sort(
            (a, b) => b.games - a.games || a.name.localeCompare(b.name, "es"),
          )
          .slice(0, 8)
          .map((e) => e.championId),
      );
      expect(highlights.mostTriedUnwon[0]).toMatchObject({
        name: "Thresh",
        slug: "thresh",
        games: 3,
        detail: "3 partidas",
      });
      // Nadie con 3+ partidas y algún 1º: Blitzcrank tiene un 1º pero pocas partidas.
      expect(
        data.album.filter((e) => e.games >= 3 && e.firsts > 0),
      ).toHaveLength(highlights.bestFirstRate.length);
    });
  });

  describe("panel de campeón", () => {
    // De las 10 partidas reales, Thresh (412) tiene tres: un 2º y otro 2º recientes y un 4º.
    const THRESH = {
      championId: 412,
      ddId: "Thresh",
      name: "Thresh",
      portraitUrl: "https://cdn.test/Thresh.png",
    };
    const catalog: ChampionCatalog = {
      version: "16.19.1",
      champions: [THRESH],
    };

    async function loadChampion(
      campeon: string | undefined,
      tab: ProfileTab = "campeones",
      withCatalog: ChampionCatalog | undefined = undefined,
    ) {
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab, campeon },
        seasonStart,
        withCatalog,
      );
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);
      return data;
    }

    it("sin ?campeon no hay clave, en ninguna pestaña: el payload no crece", async () => {
      await storeAll();
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        expect(await loadChampion(undefined, tab)).not.toHaveProperty(
          "champion",
        );
      }
    });

    it("?campeon inexistente o vacío tampoco trae nada", async () => {
      await storeAll();
      await insertProfile();
      expect(await loadChampion("nadie")).not.toHaveProperty("champion");
      expect(await loadChampion("")).not.toHaveProperty("champion");
    });

    it("con ?campeon válido trae su distribución y sus últimas partidas, la más reciente primero", async () => {
      await storeAll();
      await insertProfile();
      const { champion } = await loadChampion("thresh", "campeones", catalog);
      expect(champion).toEqual({
        championId: 412,
        distribution: { 1: 0, 2: 2, 3: 0, 4: 1, 5: 0, 6: 0 },
        recent: [
          {
            matchId: "EUW1_7998513907",
            placement: 2,
            championId: 412,
            championName: "Thresh",
            gameCreation: 1790682703953,
          },
          {
            matchId: "EUW1_7998494554",
            placement: 2,
            championId: 412,
            championName: "Thresh",
            gameCreation: 1790680293890,
          },
          {
            matchId: "EUW1_7998254564",
            placement: 4,
            championId: 412,
            championName: "Thresh",
            gameCreation: 1790633861469,
          },
        ],
        // 3 partidas (< 5): neutral por pocas partidas; la media global sale de todas las del jugador.
        heat: {
          champion: {
            state: "neutral",
            games: 3,
            avg: 8 / 3,
            adjustedAvg: 3.3125,
            reason: "few-games",
          },
          globalAvg: 3.7,
        },
      });
    });

    it("el slug no distingue mayúsculas y, sin ddId, es el nombre en minúsculas", async () => {
      await storeAll();
      await insertProfile();
      // Con catálogo: el id de Data Dragon en minúsculas.
      expect(
        (await loadChampion("THRESH", "campeones", catalog)).champion,
      ).toMatchObject({
        championId: 412,
      });
      // Sin catálogo (o campeón ausente de él): el nombre de la partida en minúsculas.
      expect((await loadChampion("Thresh")).champion).toMatchObject({
        championId: 412,
      });
      expect((await loadChampion("rakan")).champion).toMatchObject({
        championId: 497,
      });
    });

    it("existe sobre cualquier pestaña y es el mismo en todas", async () => {
      await storeAll();
      await insertProfile();
      const base = (await loadChampion("thresh", "campeones", catalog))
        .champion;
      expect(base).toBeDefined();
      for (const tab of PROFILE_TABS) {
        expect((await loadChampion("thresh", tab, catalog)).champion).toEqual(
          base,
        );
      }
    });

    it("el frío/calor del cromo y el del panel salen de las mismas filas, en todas las pestañas", async () => {
      await storeAll();
      await insertProfile();
      for (const tab of PROFILE_TABS) {
        const data = await loadChampion("thresh", tab, catalog);
        const entry = data.album.find((e) => e.championId === 412);
        // Thresh: 3 partidas (< 5), así que neutral, pero con su media ajustada.
        expect(entry).toMatchObject({
          heat: "neutral",
          heatAdjustedAvg: 3.3125,
        });
        expect(data.champion?.heat?.champion.adjustedAvg).toBe(
          entry?.heatAdjustedAvg,
        );
      }
    });

    it("no altera lo común: con ?campeon la vista es la misma salvo la clave champion", async () => {
      await storeAll();
      await insertProfile();
      const { champion, ...withPanel } = await loadChampion("thresh");
      expect(champion).toBeDefined();
      expect(withPanel).toEqual(await loadChampion(undefined));
    });

    it("campeón sin partidas (solo en el catálogo): distribución a cero y sin recientes", async () => {
      await storeAll();
      await insertProfile();
      const ahri = {
        championId: 103,
        ddId: "Ahri",
        name: "Ahri",
        portraitUrl: null,
      };
      const { champion } = await loadChampion("ahri", "campeones", {
        version: "16.19.1",
        champions: [ahri],
      });
      expect(champion).toEqual({
        championId: 103,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        recent: [],
        heat: null,
      });
    });

    it("las recientes son como mucho 10, pero la distribución cuenta todas las partidas", async () => {
      await storeAll();
      for (let i = 0; i < 12; i += 1) {
        await storeVariant(fixtures[1], `EUW1_TEST_LATE_${i}`, (j) => {
          j.info.gameCreation = 1_790_800_000_000 + i * 60_000;
        });
      }
      await insertProfile();
      // Blitzcrank: 1 partida real más 12 variantes, todas en 3º.
      const { champion } = await loadChampion("blitzcrank");
      expect(champion?.recent).toHaveLength(10);
      expect(champion?.recent[0].matchId).toBe("EUW1_TEST_LATE_11");
      expect(champion?.distribution).toEqual({
        1: 0,
        2: 0,
        3: 13,
        4: 0,
        5: 0,
        6: 0,
      });
    });

    it("no contiene puuid", async () => {
      await storeAll();
      await insertProfile();
      const { champion } = await loadChampion("thresh");
      expect(hasKeyDeep(champion, "puuid")).toBe(false);
      expect(JSON.stringify(champion)).not.toContain(SELF_PUUID);
    });
  });

  describe("compañeros", () => {
    const gameNames = (list: { gameName: string }[] | undefined) =>
      list?.map((t) => t.gameName);
    const params = (min: TeammateParams["min"]): TeammateParams => ({
      min,
      orden: "partidas",
    });

    // Las 10 partidas reales: Player013 juega las 10, Player046 cinco, Player115 dos y Player012,
    // Player022 y Player152 una (ver `stats.test.ts`).
    async function seedTeammates() {
      await storeAll();
      await insertProfile();
    }

    it("la pestaña trae los compañeros con al menos ?min partidas, los de mayor a menor", async () => {
      await seedTeammates();
      // Sin parámetros: el mínimo por defecto (3).
      expect(gameNames((await loadProfile("companeros")).teammates)).toEqual([
        "Player013",
        "Player046",
      ]);
      const byMin = async (min: TeammateParams["min"]) =>
        gameNames((await loadProfile("companeros", params(min))).teammates);
      expect(await byMin(1)).toEqual([
        "Player013",
        "Player046",
        "Player115",
        "Player012",
        "Player022",
        "Player152",
      ]);
      expect(await byMin(3)).toEqual(["Player013", "Player046"]);
      expect(await byMin(5)).toEqual(["Player013", "Player046"]); // 046: justo 5
      expect(await byMin(10)).toEqual(["Player013"]);
    });

    it("cada compañero trae sus cifras y ningún puuid", async () => {
      await seedTeammates();
      const data = await loadProfile("companeros", params(1));
      expect(data.teammates?.[0]).toEqual({
        gameName: "Player013",
        tagLine: "ANON",
        games: 10,
        firsts: 0,
        top3: 5,
        avgPlacement: 3.7,
        lastPlayedAt: 1790682703953,
      });
      expect(hasKeyDeep(data, "puuid")).toBe(false);
      expect(JSON.stringify(data)).not.toContain("anon-puuid");
    });

    it("si nadie llega al mínimo la lista sale vacía, pero existe", async () => {
      await seedTeammates();
      // Desde el 29-sep solo quedan dos partidas: 013 suma 2 juntos y los demás 1.
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab: "companeros" },
        new Date("2026-09-29T00:00:00Z"),
      );
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);
      expect(data.teammates).toEqual([]);
      expect(data.railTeammates.map((t) => t.games)).toEqual([2, 1, 1]);
    });

    it("el raíl trae el top 5 por partidas, sin mínimo, en todas las pestañas", async () => {
      await seedTeammates();
      const expected = [
        {
          key: "player013#anon",
          gameName: "Player013",
          tagLine: "ANON",
          href: "/euw/Player013-ANON",
          games: 10,
          pct1: "0\u00a0%",
          medio: "3,7",
          small: false,
        },
        {
          key: "player046#anon",
          gameName: "Player046",
          tagLine: "ANON",
          href: "/euw/Player046-ANON",
          games: 5,
          pct1: "0\u00a0%",
          medio: "4,4",
          small: false,
        },
        {
          key: "player115#anon",
          gameName: "Player115",
          tagLine: "ANON",
          href: "/euw/Player115-ANON",
          games: 2,
          pct1: "0\u00a0%",
          medio: "3,0",
          small: true,
        },
        {
          key: "player012#anon",
          gameName: "Player012",
          tagLine: "ANON",
          href: "/euw/Player012-ANON",
          games: 1,
          pct1: "0\u00a0%",
          medio: "2,0",
          small: true,
        },
        {
          key: "player022#anon",
          gameName: "Player022",
          tagLine: "ANON",
          href: "/euw/Player022-ANON",
          games: 1,
          pct1: "0\u00a0%",
          medio: "2,0",
          small: true,
        },
      ];
      for (const tab of PROFILE_TABS) {
        const data = await loadProfile(tab, params(10));
        // El mínimo de la tabla no afecta al raíl.
        expect(data.railTeammates, tab).toEqual(expected);
      }
    });

    it("sin partidas (o sin puuid) no hay compañeros ni en el raíl", async () => {
      await insertProfile({ puuid: null, status: "resolving" });
      const data = await loadProfile("companeros");
      expect(data.railTeammates).toEqual([]);
      expect(data.teammates).toEqual([]);
    });
  });

  describe("partidas", () => {
    const BLITZCRANK = {
      championId: 53,
      ddId: "Blitzcrank",
      name: "Blitz Display",
      portraitUrl: "https://cdn.test/Blitzcrank.png",
    };
    const catalog: ChampionCatalog = {
      version: "16.19.1",
      champions: [BLITZCRANK],
    };
    const icon = (id: number, name: string): GameIcon => ({
      id,
      name,
      iconUrl: `https://cdn.test/${id}.png`,
    });
    // Rakan (EUW1_7997909147) lleva los augments 181, 177, 313 y 18 y los objetos 447123, 223158,
    // 223084, 226665, 447109 y 3348 (amuleto).
    const gameData: GameData = {
      items: new Map([
        [447123, icon(447123, "Objeto A")],
        [3348, icon(3348, "Barredora arcana")],
      ]),
      augments: new Map([[181, icon(181, "Adaptación")]]),
    };
    const FIRST_ID = fixtures[0].id; // Rakan, 5º
    const seed = async () => {
      await storeAll();
      await insertProfile();
    };

    async function loadPartidas(
      matches: Partial<MatchParams> = {},
      options: { catalog?: ChampionCatalog; gameData?: GameData } = {},
    ) {
      const data = await loadProfilePage(
        db,
        "BEJITO MAMBO",
        "1991",
        { tab: "partidas", matches: { ...DEFAULT_MATCH_PARAMS, ...matches } },
        seasonStart,
        options.catalog,
        options.gameData,
      );
      if (data.kind !== "profile") throw new Error(`kind: ${data.kind}`);
      return data;
    }

    it("por defecto trae las partidas de la temporada, la más reciente primero, en un bloque de 50", async () => {
      await seed();
      const { matches, matchDetail } = await loadPartidas();
      expect(matches?.limit).toBe(50);
      expect(matches?.total).toBe(10);
      expect(matches?.rows).toHaveLength(10);
      expect(matches?.rows[0].gameCreation).toBeGreaterThan(
        matches?.rows[9].gameCreation ?? Infinity,
      );
      expect(matches?.rows.find((r) => r.matchId === FIRST_ID)).toMatchObject({
        championName: "Rakan",
        placement: 5,
        gameDuration: 1504,
        portraitUrl: null, // sin catálogo
        newFirst: false,
        trio: [
          { gameName: "Player013", tagLine: "ANON" },
          { gameName: "Player152", tagLine: "ANON" },
        ],
      });
      // Sin ?partida el detalle no viaja ni existe la clave.
      expect(matchDetail).toBeUndefined();
      expect(await loadPartidas()).not.toHaveProperty("matchDetail");
    });

    it("el nombre y el retrato del campeón salen del catálogo", async () => {
      await seed();
      const { matches } = await loadPartidas({}, { catalog });
      const blitz = matches?.rows.find((r) => r.championId === 53);
      expect(blitz).toMatchObject({
        championName: "Blitz Display",
        portraitUrl: "https://cdn.test/Blitzcrank.png",
      });
      // Rakan no está en el catálogo de prueba: el nombre de la partida y sin retrato.
      expect(
        matches?.rows.find((r) => r.matchId === FIRST_ID)?.championName,
      ).toBe("Rakan");
    });

    it("«nuevo 1º» solo en la partida que verifica al campeón, no en sus 1º posteriores", async () => {
      await seed();
      await storeVariant(fixtures[1], "EUW1_TEST_FIRST_A", (j) => {
        j.info.gameCreation = 1_790_700_000_000;
        promoteTrioToFirst(j, SELF_PUUID);
      });
      await storeVariant(fixtures[1], "EUW1_TEST_FIRST_B", (j) => {
        j.info.gameCreation = 1_790_800_000_000;
        promoteTrioToFirst(j, SELF_PUUID);
      });
      const { matches, album } = await loadPartidas();
      const flagged = matches?.rows
        .filter((r) => r.newFirst)
        .map((r) => r.matchId);
      // El primer 1º con Blitzcrank es el A; el B (más nuevo) ya no verifica nada.
      expect(flagged).toEqual(["EUW1_TEST_FIRST_A"]);
      expect(album.find((e) => e.championId === 53)?.firstWinMatchId).toBe(
        "EUW1_TEST_FIRST_A",
      );
    });

    describe("filtros", () => {
      it("?puesto: solo 1º o top 3, con el total filtrado", async () => {
        await seed();
        await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
          j.info.gameCreation = 1_790_700_000_000;
          promoteTrioToFirst(j, SELF_PUUID);
        });
        const firsts = await loadPartidas({ puesto: "1" });
        expect(firsts.matches?.rows.map((r) => r.matchId)).toEqual([
          "EUW1_TEST_FIRST",
        ]);
        expect(firsts.matches?.total).toBe(1);

        const top3 = await loadPartidas({ puesto: "top3" });
        // Distribución con el 1º sintético: 1 en 1º, 2 en 2º y 3 en 3º.
        expect(top3.matches?.total).toBe(6);
        expect(top3.matches?.rows.every((r) => r.placement <= 3)).toBe(true);
      });

      it("?q: por el nombre de visualización del catálogo, sin tildes ni mayúsculas", async () => {
        await seed();
        const found = await loadPartidas({ q: "BLITZ dísplay" }, { catalog });
        // Plegado: sin tildes, mayúsculas ni espacios, «BLITZ dísplay» es «Blitz Display».
        expect(found.matches?.rows.length).toBeGreaterThan(0);
        expect(found.matches?.rows.every((r) => r.championId === 53)).toBe(
          true,
        );
        expect(found.matches?.total).toBe(found.matches?.rows.length);
      });

      it("?q: por el championName de la partida aunque el catálogo lo llame de otro modo, y sin catálogo", async () => {
        await seed();
        // «Blitzcrank» es el nombre de Riot; el catálogo lo muestra como «Blitz Display».
        const byRiotName = await loadPartidas({ q: "blitzcrank" }, { catalog });
        expect(byRiotName.matches?.rows.every((r) => r.championId === 53)).toBe(
          true,
        );
        expect(byRiotName.matches?.total).toBeGreaterThan(0);
        // Sin catálogo (Data Dragon caído): el álbum lleva los nombres de las partidas.
        const bare = await loadPartidas({ q: "thresh" });
        expect(bare.matches?.rows.every((r) => r.championId === 412)).toBe(
          true,
        );
        expect(bare.matches?.total).toBeGreaterThan(0);
      });

      it("?q sin coincidencias: lista vacía con total 0", async () => {
        await seed();
        const none = await loadPartidas({ q: "zzzzz" });
        expect(none.matches).toMatchObject({ rows: [], total: 0, limit: 50 });
      });

      it("?companero: solo las partidas de ese compañero de trío", async () => {
        await seed();
        const with046 = await loadPartidas({
          companero: { gameName: "player046", tagLine: "anon" },
        });
        expect(with046.matches?.total).toBe(5);
        expect(
          with046.matches?.rows.every((r) =>
            r.trio.some((m) => m.gameName === "Player046"),
          ),
        ).toBe(true);
      });

      it("los filtros se combinan", async () => {
        await seed();
        const both = await loadPartidas({
          puesto: "top3",
          companero: { gameName: "Player013", tagLine: "ANON" },
        });
        expect(both.matches?.rows.every((r) => r.placement <= 3)).toBe(true);
        // Player013 juega las 10 partidas y en 5 de ellas el trío queda entre los tres primeros.
        expect(both.matches?.total).toBe(5);
      });
    });

    describe("bloques de 50", () => {
      /** 10 partidas reales más `extra` variantes anteriores a ellas, de un minuto en un minuto. */
      async function seedMany(extra: number) {
        await seed();
        for (let i = 0; i < extra; i += 1) {
          await storeVariant(fixtures[1], `EUW1_TEST_MANY_${i}`, (j) => {
            j.info.gameCreation = 1_790_000_000_000 + i * 60_000;
          });
        }
      }

      it("?n pide 50 por bloque y el total es el de todas las que cumplen los filtros", async () => {
        await seedMany(45); // 55 en total
        const one = await loadPartidas();
        expect(one.matches).toMatchObject({ total: 55, limit: 50 });
        expect(one.matches?.rows).toHaveLength(50);

        const two = await loadPartidas({ blocks: 2 });
        expect(two.matches).toMatchObject({ total: 55, limit: 100 });
        expect(two.matches?.rows).toHaveLength(55);
        // El primer bloque es el principio del segundo.
        expect(two.matches?.rows.slice(0, 50)).toEqual(one.matches?.rows);
      });
    });

    it("compañeros para el selector: los de 3 o más partidas juntos, sin consulta nueva ni puuid", async () => {
      await seed();
      const { matches } = await loadPartidas();
      expect(matches?.companions).toEqual([
        { gameName: "Player013", tagLine: "ANON", games: 10 },
        { gameName: "Player046", tagLine: "ANON", games: 5 },
      ]);
    });

    describe("detalle (?partida)", () => {
      it("trae los 6 equipos por puesto, el propio resaltado y su fila", async () => {
        await seed();
        const { matchDetail } = await loadPartidas({ partida: FIRST_ID });
        expect(matchDetail?.teams.map((t) => t.placement)).toEqual([
          1, 2, 3, 4, 5, 6,
        ]);
        expect(matchDetail?.teams.every((t) => t.players.length === 3)).toBe(
          true,
        );
        expect(
          matchDetail?.teams.filter((t) => t.isOwnTeam).map((t) => t.placement),
        ).toEqual([5]);
        expect(matchDetail?.row).toMatchObject({
          matchId: FIRST_ID,
          championName: "Rakan",
          placement: 5,
          trio: [
            { gameName: "Player013", tagLine: "ANON" },
            { gameName: "Player152", tagLine: "ANON" },
          ],
        });
      });

      it("los augments y objetos salen con nombre e icono si hay datos, y solo esos", async () => {
        await seed();
        const { matchDetail } = await loadPartidas(
          { partida: FIRST_ID },
          { gameData },
        );
        const self = matchDetail?.teams
          .flatMap((t) => t.players)
          .find((p) => p.isSelf);
        expect(self?.augments).toEqual([icon(181, "Adaptación")]);
        expect(self?.items.map((i) => i.name)).toEqual([
          "Objeto A",
          "Barredora arcana",
        ]);
      });

      it("sin datos de augments y objetos (fuente caída) el detalle sale igualmente, sin iconos", async () => {
        await seed();
        const { matchDetail } = await loadPartidas({ partida: FIRST_ID });
        const players = matchDetail?.teams.flatMap((t) => t.players) ?? [];
        expect(players).toHaveLength(18);
        expect(players.every((p) => p.augments.length === 0)).toBe(true);
        expect(players.every((p) => p.items.length === 0)).toBe(true);
      });

      it("acepta los datos estáticos como promesa, y no los espera sin ?partida", async () => {
        await seed();
        const pending = new Promise<GameData>(() => {}); // nunca se resuelve
        const listOnly = await loadProfilePage(
          db,
          "BEJITO MAMBO",
          "1991",
          { tab: "partidas", matches: DEFAULT_MATCH_PARAMS },
          seasonStart,
          undefined,
          pending,
        );
        expect(listOnly.kind).toBe("profile");

        const detail = await loadProfilePage(
          db,
          "BEJITO MAMBO",
          "1991",
          {
            tab: "partidas",
            matches: { ...DEFAULT_MATCH_PARAMS, partida: FIRST_ID },
          },
          seasonStart,
          undefined,
          Promise.resolve(gameData),
        );
        expect(detail.kind === "profile" && detail.matchDetail).toBeTruthy();
      });

      it("una partida que no existe, de otro jugador o fuera de temporada no trae detalle", async () => {
        await seed();
        await storeVariant(fixtures[1], "EUW1_TEST_Q400", (j) => {
          j.info.queueId = 400;
        });
        for (const partida of ["EUW1_NO_EXISTE", "EUW1_TEST_Q400"]) {
          const data = await loadPartidas({ partida });
          expect(data).not.toHaveProperty("matchDetail");
          expect(data.matches?.total).toBe(10);
        }
        // Fuera de la temporada pedida: la partida existe pero no cuenta.
        const late = await loadProfilePage(
          db,
          "BEJITO MAMBO",
          "1991",
          {
            tab: "partidas",
            matches: { ...DEFAULT_MATCH_PARAMS, partida: FIRST_ID },
          },
          new Date("2026-09-29T00:00:00Z"),
        );
        expect(late.kind === "profile" && late.matchDetail).toBeUndefined();
      });

      it("la partida abierta llega aunque no esté en la lista (otro filtro o más allá del bloque)", async () => {
        await seed();
        const data = await loadPartidas({ puesto: "1", partida: FIRST_ID });
        expect(data.matches?.rows).toEqual([]);
        expect(data.matchDetail?.row.matchId).toBe(FIRST_ID);
      });

      it("«nuevo 1º» también en la fila del detalle", async () => {
        await seed();
        await storeVariant(fixtures[1], "EUW1_TEST_FIRST", (j) => {
          j.info.gameCreation = 1_790_700_000_000;
          promoteTrioToFirst(j, SELF_PUUID);
        });
        const { matchDetail } = await loadPartidas({
          partida: "EUW1_TEST_FIRST",
        });
        expect(matchDetail?.row.newFirst).toBe(true);
      });
    });

    it("sin partidas o sin puuid: lista vacía y sin detalle", async () => {
      await insertProfile({ puuid: null, status: "resolving" });
      const data = await loadPartidas({ partida: FIRST_ID });
      expect(data.matches).toMatchObject({
        rows: [],
        total: 0,
        companions: [],
      });
      expect(data).not.toHaveProperty("matchDetail");
    });

    it("no lleva el puuid: ni la clave ni su valor, en la lista ni en el detalle", async () => {
      await seed();
      const data = await loadPartidas({ partida: FIRST_ID }, { gameData });
      expect(data.matches?.rows.length).toBeGreaterThan(0);
      expect(data.matchDetail).toBeDefined();
      expect(hasKeyDeep(data, "puuid")).toBe(false);
      const json = JSON.stringify(data);
      expect(json).not.toContain(SELF_PUUID);
      expect(json).not.toContain("anon-puuid");
    });

    it("otras pestañas no traen ni la lista ni el detalle aunque la URL los pida", async () => {
      await seed();
      for (const tab of PROFILE_TABS) {
        if (tab === "partidas") continue;
        const data = await loadProfilePage(
          db,
          "BEJITO MAMBO",
          "1991",
          {
            tab,
            matches: { ...DEFAULT_MATCH_PARAMS, partida: FIRST_ID },
          },
          seasonStart,
        );
        expect(data.kind === "profile" && data.matches).toBeUndefined();
        expect(data.kind === "profile" && data.matchDetail).toBeUndefined();
      }
    });
  });
});
