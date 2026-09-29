import { asc, count, eq, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDb } from "@/db";
import {
  matches,
  matchFetch,
  participants,
  profiles,
  settings,
  syncJobs,
} from "@/db/schema";
import { storeMatch } from "@/domain/ingest";
import {
  RiotAuthError,
  RiotNotFoundError,
  RiotRetryableError,
} from "@/lib/riot/errors";
import { PRIORITY } from "@/lib/riot/limiter";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import { createFakeRiot, type FakeRiot } from "../../tests/helpers/fake-riot";
import {
  type FixtureJson,
  loadMatchFixtures,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { createFakeClock, readFixtureJson } from "../../tests/helpers/riot";
import { createWorker, getWorkerStatus, type Worker } from "./main";
import {
  ensureFreshOnView,
  REFRESH_COOLDOWN_MS,
  registerProfile,
  requestRefresh,
  STALE_AFTER_MS,
  wakeWorker,
} from "./queue";
import { MAX_ATTEMPTS, retryDelayMs } from "./steps";

// Escenarios del worker contra la BD de tests y un `RiotApi` falso que sirve los fixtures.

const db = getTestDb();
const fixtures = loadMatchFixtures();
const seasonStart = new Date("2026-05-12T00:00:00Z");
const SEASON_START_S = 1_778_544_000;
/** Ids de las 10 partidas del fixture, más reciente primero (orden de la API). */
const IDS_DESC = readFixtureJson<string[]>("match-ids.json");
const HOUR_MS = 3_600_000;

beforeEach(truncateAll);
afterAll(closeDb);

function setup(fake: FakeRiot = createFakeRiot()) {
  const clock = createFakeClock();
  const logs: string[] = [];
  const make = () =>
    createWorker({
      db,
      riot: fake,
      now: clock.now,
      sleep: clock.sleep,
      seasonStart,
      log: (message) => logs.push(message),
    });
  return { fake, clock, logs, make, worker: make() };
}

/** Ejecuta pasos hasta que el worker no tenga nada que hacer (o se pause). */
async function drain(worker: Worker, max = 500) {
  for (let worked = 0; worked <= max; worked++) {
    const result = await worker.tick();
    if (result !== "worked") return { result, worked };
  }
  throw new Error("el worker no termina");
}

async function jobsOf(profileId: number) {
  return db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.profileId, profileId))
    .orderBy(asc(syncJobs.id));
}

async function lastJob(profileId: number) {
  const jobs = await jobsOf(profileId);
  const job = jobs.at(-1);
  if (!job) throw new Error("sin jobs");
  return job;
}

async function counts() {
  const [m] = await db.select({ n: count() }).from(matches);
  const [p] = await db.select({ n: count() }).from(participants);
  const [f] = await db.select({ n: count() }).from(matchFetch);
  return { matches: m.n, participants: p.n, matchFetch: f.n };
}

async function readSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row;
}

async function getProfile(id: number) {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
  return row;
}

/** Copia de una partida `hours` horas más tarde, con otro id. */
function laterVariant(matchId: string, hours: number) {
  const newest = fixtures.at(-1);
  if (!newest) throw new Error("sin fixtures");
  return variantOf(newest, matchId, (json) => {
    const info = json.info as unknown as Record<string, number>;
    for (const key of [
      "gameCreation",
      "gameStartTimestamp",
      "gameEndTimestamp",
    ]) {
      info[key] += hours * HOUR_MS;
    }
  });
}

describe("backfill", () => {
  it("completo: más reciente primero, 18 participantes por partida y 602002 guardado", async () => {
    const { fake, worker, logs } = setup();
    // Tecleado en minúsculas: se guarda la forma canónica que devuelve Account-V1.
    const profile = await registerProfile(db, "bejito mambo", "1991");

    const { result, worked } = await drain(worker);
    expect(result).toBe("idle");
    expect(worked).toBe(13); // cuenta + 1 página de ids + 10 detalles + cierre

    const job = await lastJob(profile.id);
    expect(job).toMatchObject({
      kind: "backfill",
      interactive: true,
      status: "done",
      totalIds: 10,
      fetched: 10,
      lastError: null,
    });
    expect(job.matchIds).toEqual(IDS_DESC);
    expect(job.startedAt).not.toBeNull();
    expect(job.finishedAt).not.toBeNull();

    // Orden de descarga = más reciente primero; 1 petición de cada tipo salvo el detalle.
    expect(fake.matchCalls()).toEqual(IDS_DESC);
    expect(fake.count("account")).toBe(1);
    expect(fake.count("playerData")).toBe(1);
    expect(
      fake.calls.filter((c) => c.method === "matchIds").map((c) => c.query),
    ).toEqual([
      { start: 0, count: 100, queue: 1750, startTime: SEASON_START_S },
    ]);
    // Job interactivo (registro): todo con prioridad interactiva.
    expect(fake.calls.every((c) => c.priority === PRIORITY.interactive)).toBe(
      true,
    );

    expect(await counts()).toEqual({
      matches: 10,
      participants: 180,
      matchFetch: 10,
    });
    const perMatch = await db
      .select({ matchId: participants.matchId, n: count() })
      .from(participants)
      .groupBy(participants.matchId);
    expect(perMatch.map((r) => r.n)).toEqual(Array(10).fill(18));
    const fetchRows = await db.select().from(matchFetch);
    expect(fetchRows.every((r) => r.status === "done")).toBe(true);

    expect(await getProfile(profile.id)).toMatchObject({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
      puuid: SELF_PUUID,
      status: "active",
      challengeValue: 75,
      challengeLevel: "MASTER",
    });
    const updated = await getProfile(profile.id);
    expect(updated.challengeCheckedAt).not.toBeNull();
    expect(updated.lastSyncedAt).not.toBeNull();

    // Tras la primera petición OK la key queda confirmada.
    expect((await readSettings()).keyStatus).toBe("ok");
    expect(getWorkerStatus()).toMatchObject({
      state: "idle",
      currentJobId: null,
    });

    // Logs con id de job y Riot ID, sin puuids.
    const text = logs.join("\n");
    expect(text).toContain(`job ${job.id} (BEJITO MAMBO#1991)`);
    expect(text).not.toMatch(/anon-puuid/);
  });

  it("Riot ID inexistente: perfil not_found y job en error, sin más peticiones", async () => {
    const { fake, worker } = setup();
    const profile = await registerProfile(db, "Nadie", "0000");
    await drain(worker);
    expect(await lastJob(profile.id)).toMatchObject({
      status: "error",
      lastError: "Riot ID no encontrado",
    });
    expect((await getProfile(profile.id)).status).toBe("not_found");
    expect(fake.calls.map((c) => c.method)).toEqual(["account"]);
  });

  it("pagina de 100 en 100, sin duplicar ids aunque entre una partida nueva a mitad", async () => {
    const { fake, make } = setup();
    const ids = Array.from(
      { length: 250 },
      (_, i) => `EUW1_${8_100_000_000 - i}`,
    );
    fake.setMatchIds(SELF_PUUID, ids);
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    const first = make();
    expect(await first.tick()).toBe("worked"); // cuenta
    expect(await first.tick()).toBe("worked"); // página 1
    const afterFirstPage = await lastJob(profile.id);
    expect(afterFirstPage).toMatchObject({
      status: "listing",
      listCursor: 100,
    });
    expect(afterFirstPage.matchIds).toEqual(ids.slice(0, 100));

    // Entra una partida nueva: los desplazamientos corren una posición.
    fake.setMatchIds(SELF_PUUID, ["EUW1_8200000000", ...ids]);

    // Caída a mitad del listado: otra instancia sigue desde el cursor guardado.
    const second = make();
    expect(await second.tick()).toBe("worked"); // página 2 (repite un id)
    expect(await second.tick()).toBe("worked"); // página 3 (incompleta)
    const job = await lastJob(profile.id);
    expect(job).toMatchObject({ status: "fetching", totalIds: 250 });
    expect(job.matchIds).toEqual(ids);
    expect(
      fake.calls
        .filter((c) => c.method === "matchIds")
        .map((c) => c.query?.start),
    ).toEqual([0, 100, 200]);
    expect((await counts()).matchFetch).toBe(250);
  });
});

describe("AC3 deduplicación", () => {
  it("una partida compartida por dos perfiles se descarga una sola vez", async () => {
    const { fake, worker } = setup();
    const self = await registerProfile(db, "BEJITO MAMBO", "1991");
    // `anon-puuid-013` juega las 10 partidas con el jugador de prueba.
    const mate = await registerProfile(db, "Player013", "ANON");

    await drain(worker);

    for (const profile of [self, mate]) {
      expect(await lastJob(profile.id)).toMatchObject({
        status: "done",
        totalIds: 10,
        fetched: 10,
      });
    }
    // Ambos listaron las 10 partidas, pero cada detalle se pidió una vez.
    expect(fake.count("matchIds")).toBe(2);
    for (const id of IDS_DESC) expect(fake.count("match", id)).toBe(1);
    expect(fake.matchCalls()).toHaveLength(10);
    expect(await counts()).toEqual({
      matches: 10,
      participants: 180,
      matchFetch: 10,
    });
  });
});

describe("AC5 refresco incremental", () => {
  it("sin partidas nuevas: 1 petición de ids y 0 de detalle; con 1 nueva: 1 y 1; cooldown", async () => {
    const { fake, worker, clock } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    const now = () => new Date(clock.now());

    // Recién terminado el backfill: cooldown.
    expect(
      await requestRefresh(db, profile.id, { interactive: true, now: now() }),
    ).toBe("cooldown");
    clock.advance(REFRESH_COOLDOWN_MS);
    expect(
      await requestRefresh(db, profile.id, { interactive: true, now: now() }),
    ).toBe("queued");
    expect(
      await requestRefresh(db, profile.id, { interactive: true, now: now() }),
    ).toBe("active");

    let before = fake.calls.length;
    await drain(worker);
    let delta = fake.calls.slice(before);
    // 1 de ids + el contador 602002 (otro host); ningún detalle.
    expect(delta.map((c) => c.method)).toEqual(["matchIds", "playerData"]);
    const [lastEnd] = await db
      .select({ max: sql<string>`max(${matches.gameEndTimestamp})` })
      .from(matches);
    expect(delta[0].query).toMatchObject({
      start: 0,
      count: 100,
      queue: 1750,
      startTime: Math.floor(Number(lastEnd.max) / 1000) - 60,
    });
    expect(await lastJob(profile.id)).toMatchObject({
      kind: "incremental",
      status: "done",
      totalIds: 0,
      fetched: 0,
    });

    // Una partida nueva.
    fake.addMatch(laterVariant("EUW1_7999000001", 1));
    clock.advance(REFRESH_COOLDOWN_MS);
    expect(
      await requestRefresh(db, profile.id, { interactive: true, now: now() }),
    ).toBe("queued");
    before = fake.calls.length;
    await drain(worker);
    delta = fake.calls.slice(before);
    expect(delta.filter((c) => c.method === "matchIds")).toHaveLength(1);
    expect(delta.filter((c) => c.method === "match").map((c) => c.arg)).toEqual(
      ["EUW1_7999000001"],
    );
    const job = await lastJob(profile.id);
    expect(job).toMatchObject({ status: "done", totalIds: 1, fetched: 1 });
    expect(job.matchIds).toEqual(["EUW1_7999000001"]);
    expect((await counts()).matches).toBe(11);
  });

  it("al abrir la página se encola un refresco no interactivo (prioridades de lista y detalle)", async () => {
    const { fake, worker, clock } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    const now = () => new Date(clock.now());

    expect(await ensureFreshOnView(db, profile.id, { now: now() })).toBe(
      "fresh",
    );
    fake.addMatch(laterVariant("EUW1_7999000002", 2));
    clock.advance(STALE_AFTER_MS + 1);
    expect(await ensureFreshOnView(db, profile.id, { now: now() })).toBe(
      "queued",
    );
    expect((await lastJob(profile.id)).interactive).toBe(false);

    const before = fake.calls.length;
    await drain(worker);
    const delta = fake.calls.slice(before);
    expect(delta.map((c) => [c.method, c.priority])).toEqual([
      ["matchIds", PRIORITY.list],
      ["match", PRIORITY.detail],
      ["playerData", PRIORITY.list],
    ]);
  });

  it("una partida en trío guardada antes por un amigo no hace saltar las anteriores", async () => {
    const { fake, worker, clock } = setup();
    const self = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    const now = () => new Date(clock.now());

    // El jugador juega dos partidas: la 1ª sin el amigo 013, la 2ª con él.
    fake.addMatch(
      variantOf(fixtures[9], "EUW1_7999000010", (json: FixtureJson) => {
        const info = json.info as unknown as Record<string, number>;
        info.gameCreation += HOUR_MS;
        info.gameStartTimestamp += HOUR_MS;
        info.gameEndTimestamp += HOUR_MS;
        for (const p of json.info.participants) {
          if (p.puuid === "anon-puuid-013") p.puuid = "anon-puuid-999";
        }
      }),
    );
    fake.addMatch(laterVariant("EUW1_7999000011", 2));
    // El amigo se registra y sincroniza primero: guarda la partida en trío (la más reciente).
    const mate = await registerProfile(db, "Player013", "ANON");
    await drain(worker);
    expect(await lastJob(mate.id)).toMatchObject({ status: "done" });

    clock.advance(REFRESH_COOLDOWN_MS);
    await requestRefresh(db, self.id, { interactive: true, now: now() });
    await drain(worker);
    const job = await lastJob(self.id);
    // Lista desde su propia última partida sincronizada: ve las dos y solo descarga la que falta.
    expect(job.matchIds).toEqual(["EUW1_7999000010"]);
    expect(fake.count("match", "EUW1_7999000010")).toBe(1);
    expect(fake.count("match", "EUW1_7999000011")).toBe(1);
  });
});

describe("AC6 pausa por key rechazada", () => {
  it("401 -> pausa sin avanzar ni consumir intento; sin llamadas hasta que cambie la key", async () => {
    const { fake, worker } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    for (let i = 0; i < 5; i++) expect(await worker.tick()).toBe("worked"); // cuenta, ids, 3 detalles

    const jobBefore = await lastJob(profile.id);
    const fetchBefore = await db
      .select()
      .from(matchFetch)
      .orderBy(asc(matchFetch.matchId));
    expect(jobBefore).toMatchObject({ status: "fetching", fetched: 3 });

    fake.failWith = () =>
      new RiotAuthError({
        host: "europe",
        path: "/lol/match/v5/matches/x",
        status: 401,
      });
    const callsBefore = fake.calls.length;
    expect(await worker.tick()).toBe("paused");
    expect(fake.calls.length).toBe(callsBefore + 1);

    const key = await readSettings();
    expect(key.keyStatus).toBe("invalid");
    expect(key.keyStatusSince).not.toBeNull();
    expect(key.keyStatusReason).toContain("401");
    expect(getWorkerStatus().state).toBe("paused");

    // El job y match_fetch quedan exactamente como estaban.
    const jobAfter = await lastJob(profile.id);
    expect(jobAfter).toEqual(jobBefore);
    expect(
      await db.select().from(matchFetch).orderBy(asc(matchFetch.matchId)),
    ).toEqual(fetchBefore);

    // En pausa: ninguna llamada, tampoco por una señal sin cambio de key.
    for (let i = 0; i < 3; i++) expect(await worker.tick()).toBe("paused");
    wakeWorker();
    expect(await worker.tick()).toBe("paused");
    expect(fake.calls.length).toBe(callsBefore + 1);

    // Key nueva (lo que hace /admin) + señal: reanuda y termina.
    fake.failWith = undefined;
    await db
      .update(settings)
      .set({
        keyStatus: "ok",
        keyStatusSince: new Date(),
        keyStatusReason: null,
      })
      .where(eq(settings.id, 1));
    wakeWorker();
    expect(await worker.tick()).toBe("worked");
    expect(await drain(worker)).toMatchObject({ result: "idle" });

    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      fetched: 10,
      totalIds: 10,
    });
    expect(await counts()).toMatchObject({ matches: 10, participants: 180 });
    // 10 detalles + el intento rechazado.
    expect(fake.count("match")).toBe(11);
    expect((await readSettings()).keyStatus).toBe("ok");
  });

  it("arranca en pausa si keyStatus = 'invalid' con key en BD y reanuda cuando cambia settings", async () => {
    await db
      .update(settings)
      .set({
        riotApiKey: "RGAPI-fake-expired-key-0000",
        keyStatus: "invalid",
        keyStatusSince: new Date(),
      })
      .where(eq(settings.id, 1));
    await registerProfile(db, "BEJITO MAMBO", "1991");
    const { fake, worker } = setup();

    expect(await worker.tick()).toBe("paused");
    expect(await worker.tick()).toBe("paused");
    expect(fake.calls).toHaveLength(0);

    // Se guarda otra key: cambia `updatedAt` aunque `keyStatus` siga en `invalid`.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db
      .update(settings)
      .set({ riotApiKey: "RGAPI-fake-rotated-key-0000" })
      .where(eq(settings.id, 1));
    expect(await worker.tick()).toBe("worked");
    expect(fake.calls.map((c) => c.method)).toEqual(["account"]);
    // Primera petición OK con la key nueva.
    expect((await readSettings()).keyStatus).toBe("ok");
  });
});

describe("arranque con la key del entorno marcada como inválida", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function markInvalid(riotApiKey: string | null) {
    const since = new Date("2026-09-29T09:00:00Z");
    await db
      .update(settings)
      .set({
        riotApiKey,
        keyStatus: "invalid",
        keyStatusSince: since,
        keyStatusReason: "Riot 401",
      })
      .where(eq(settings.id, 1));
    return since;
  }

  it("sin key en BD (sale de RIOT_API_KEY) se reprueba una vez al arrancar", async () => {
    vi.stubEnv("RIOT_API_KEY", "RGAPI-env-key-000");
    await markInvalid(null);
    const before = await readSettings();
    await registerProfile(db, "BEJITO MAMBO", "1991");
    const { fake, worker } = setup();

    expect(await worker.tick()).toBe("worked");
    expect(fake.calls.map((c) => c.method)).toEqual(["account"]);

    // La petición fue bien: la key queda confirmada; `updatedAt` no se toca.
    const after = await readSettings();
    expect(after).toMatchObject({ keyStatus: "ok", keyStatusReason: null });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("si la key del entorno sigue rechazada, vuelve a pausar tras esa única prueba", async () => {
    vi.stubEnv("RIOT_API_KEY", "RGAPI-env-key-000");
    await markInvalid(null);
    await registerProfile(db, "BEJITO MAMBO", "1991");
    const { fake, worker } = setup();
    fake.failWith = () =>
      new RiotAuthError({
        host: "europe",
        path: "/riot/account/v1/accounts/by-riot-id/:gameName/:tagLine",
        status: 401,
      });

    expect(await worker.tick()).toBe("paused");
    expect((await readSettings()).keyStatus).toBe("invalid");
    for (let i = 0; i < 3; i++) expect(await worker.tick()).toBe("paused");
    expect(fake.calls).toHaveLength(1);
  });

  it("con una key guardada en BD (desde /admin) mantiene la pausa", async () => {
    vi.stubEnv("RIOT_API_KEY", "RGAPI-env-key-000");
    await markInvalid("RGAPI-fake-expired-key-0000");
    await registerProfile(db, "BEJITO MAMBO", "1991");
    const { fake, worker } = setup();

    expect(await worker.tick()).toBe("paused");
    expect(fake.calls).toHaveLength(0);
    expect((await readSettings()).keyStatus).toBe("invalid");
  });
});

describe("AC7 caída y reanudación", () => {
  it("otra instancia termina el backfill sin duplicados ni repetir partidas guardadas", async () => {
    const { fake, make } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    const first = make();
    for (let i = 0; i < 5; i++) expect(await first.tick()).toBe("worked"); // cuenta, ids, 3 detalles
    // `kill -9` justo después de guardar la 4ª partida y antes de marcarla en match_fetch.
    const fourth = IDS_DESC[3];
    const fixture = fixtures.find((f) => f.id === fourth);
    if (!fixture) throw new Error("fixture no encontrado");
    await storeMatch(db, fixture.match, fixture.raw);
    // La instancia se descarta sin `stop()`: una nueva usa la misma BD.

    const second = make();
    expect(await drain(second)).toMatchObject({ result: "idle" });

    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      fetched: 10,
      totalIds: 10,
    });
    expect(fake.count("account")).toBe(1);
    expect(fake.count("matchIds")).toBe(1);
    expect(fake.count("match", fourth)).toBe(0);
    expect(fake.matchCalls()).toHaveLength(9);
    expect(new Set(fake.matchCalls()).size).toBe(9);
    expect(await counts()).toEqual({
      matches: 10,
      participants: 180,
      matchFetch: 10,
    });
  });
});

describe("round-robin", () => {
  it("dos backfills en fetching alternan las peticiones de detalle", async () => {
    const fake = createFakeRiot();
    // Segundo jugador con un historial disjunto: variantes con otros ids y otros puuids.
    const otherIds = fixtures.map((_, i) => `EUW1_${9_000_000_000 + i}`);
    for (const [i, f] of fixtures.entries()) {
      fake.addMatch(
        variantOf(f, otherIds[i], (json) => {
          for (const p of json.info.participants) p.puuid = `rr-${p.puuid}`;
        }),
      );
    }
    fake.addAccount({
      puuid: `rr-${SELF_PUUID}`,
      gameName: "Other",
      tagLine: "RR",
    });
    const { worker } = setup(fake);
    await registerProfile(db, "BEJITO MAMBO", "1991");
    await registerProfile(db, "Other", "RR");

    await drain(worker);

    const calls = fake.matchCalls();
    expect(calls).toHaveLength(20);
    const selfIds = new Set(IDS_DESC);
    // A, B, A, B...: el perfil servido hace más tiempo va primero.
    expect(calls.map((id) => (selfIds.has(id) ? "A" : "B")).join("")).toBe(
      "AB".repeat(10),
    );
    // Cada perfil, de más reciente a más antigua.
    expect(calls.filter((id) => selfIds.has(id))).toEqual(IDS_DESC);
    expect(calls.filter((id) => !selfIds.has(id))).toEqual(
      [...otherIds].reverse(),
    );
  });
});

describe("errores en el detalle", () => {
  it("404 -> missing y el job termina", async () => {
    const { fake, worker } = setup();
    const missingId = IDS_DESC[2];
    fake.failWith = (call) =>
      call.method === "match" && call.arg === missingId
        ? new RiotNotFoundError({ host: "europe", path: "/x", status: 404 })
        : undefined;
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    await drain(worker);

    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      fetched: 10,
      totalIds: 10,
    });
    const [row] = await db
      .select()
      .from(matchFetch)
      .where(eq(matchFetch.matchId, missingId));
    expect(row.status).toBe("missing");
    expect(fake.count("match", missingId)).toBe(1);
    expect((await counts()).matches).toBe(9);
  });

  it("5xx persistente -> reintentos con backoff y, al 5º, error; el job termina", async () => {
    const { fake, worker, clock } = setup();
    const failingId = IDS_DESC[0];
    fake.failWith = (call) =>
      call.method === "match" && call.arg === failingId
        ? new RiotRetryableError({ host: "europe", path: "/x", status: 503 })
        : undefined;
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    // Todo lo demás se resuelve; esa partida espera su backoff y el job no puede cerrarse.
    expect(await drain(worker)).toMatchObject({ result: "idle" });
    let [row] = await db
      .select()
      .from(matchFetch)
      .where(eq(matchFetch.matchId, failingId));
    expect(row).toMatchObject({ status: "pending", attempts: 1 });
    expect(row.nextAttemptAt?.getTime()).toBe(clock.now() + retryDelayMs(1));
    expect(await lastJob(profile.id)).toMatchObject({
      status: "fetching",
      fetched: 9,
    });

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      clock.advance(retryDelayMs(attempt));
      await drain(worker);
    }
    [row] = await db
      .select()
      .from(matchFetch)
      .where(eq(matchFetch.matchId, failingId));
    expect(row).toMatchObject({ status: "error", attempts: MAX_ATTEMPTS });
    expect(row.lastError).toContain("503");
    expect(fake.count("match", failingId)).toBe(MAX_ATTEMPTS);
    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      fetched: 10,
    });
  });

  it("fallo transitorio al listar -> backoff del job sin perder el cursor", async () => {
    const { fake, worker, clock } = setup();
    let failures = 1;
    fake.failWith = (call) => {
      if (call.method !== "matchIds" || failures === 0) return undefined;
      failures--;
      return new RiotRetryableError({
        host: "europe",
        path: "/x",
        status: 500,
      });
    };
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    expect(await worker.tick()).toBe("worked"); // cuenta
    expect(await worker.tick()).toBe("worked"); // listado: falla
    expect(await lastJob(profile.id)).toMatchObject({
      status: "listing",
      attempts: 1,
      listCursor: 0,
    });
    expect(await worker.tick()).toBe("idle"); // en backoff
    clock.advance(retryDelayMs(1));
    await drain(worker);
    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      fetched: 10,
      attempts: 0,
    });
    expect(fake.count("matchIds")).toBe(2);
  });
});
