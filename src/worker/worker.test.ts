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
import { resetData } from "@/db/reset";
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
  classifyRetry,
  RiotAuthError,
  RiotNotFoundError,
  RiotRateLimitError,
  RiotRetryableError,
} from "@/lib/riot/errors";
import { PRIORITY } from "@/lib/riot/limiter";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  createFakeRiot,
  FAKE_PROFILE_ICON_ID,
  type FakeRiot,
} from "../../tests/helpers/fake-riot";
import {
  type FixtureJson,
  loadMatchFixtures,
  type MatchFixture,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { createFakeClock, readFixtureJson } from "../../tests/helpers/riot";
import { createWorker, getWorkerStatus, type Worker } from "./main";
import {
  enqueueSeasonBackfill,
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

/**
 * Copia de una partida de la cola 1740 con el id consecutivo al de `fixture` y 1 minuto después:
 * queda justo detrás de ella en el tiempo y en la numeración de EUW1.
 */
function queue1740After(fixture: MatchFixture) {
  return variantOf(
    fixture,
    `EUW1_${Number(fixture.id.split("_")[1]) + 1}`,
    (json) => {
      json.info.queueId = 1740;
      const info = json.info as unknown as Record<string, number>;
      for (const key of [
        "gameCreation",
        "gameStartTimestamp",
        "gameEndTimestamp",
      ]) {
        info[key] += 60_000;
      }
    },
  );
}

/** Ids de más reciente a más antigua por su parte numérica (en EUW1 crece con el tiempo). */
const newestFirst = (ids: string[]) =>
  [...ids].sort((a, b) => Number(b.split("_")[1]) - Number(a.split("_")[1]));

describe("migración de key (db:reset --keep-profiles)", () => {
  it("el worker vuelve a resolver el perfil y rehace el backfill entero", async () => {
    const { fake, worker } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    const before = await counts();

    await resetData(db, { keepProfiles: true });
    expect(await counts()).toEqual({
      matches: 0,
      participants: 0,
      matchFetch: 0,
    });

    const { result } = await drain(worker);
    expect(result).toBe("idle");
    expect(fake.count("account")).toBe(2);
    expect(await counts()).toEqual(before);
    expect(await getProfile(profile.id)).toMatchObject({
      puuid: SELF_PUUID,
      status: "active",
    });
    expect(await lastJob(profile.id)).toMatchObject({
      kind: "backfill",
      status: "done",
      totalIds: 10,
    });
  });

  it("un perfil con un Riot ID antiguo se resuelve con el de su última partida", async () => {
    const { fake, worker } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    // Registrado con un nombre que ya no existe en Riot (el jugador se lo cambió después).
    await db
      .update(profiles)
      .set({ gameName: "Nombre Antiguo", tagLine: "OLD" })
      .where(eq(profiles.id, profile.id));

    await resetData(db, { keepProfiles: true });
    await drain(worker);

    expect(fake.calls.filter((c) => c.method === "account").at(-1)?.arg).toBe(
      "BEJITO MAMBO#1991",
    );
    expect(await getProfile(profile.id)).toMatchObject({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
      status: "active",
    });
  });
});

describe("backfill", () => {
  it("completo: más reciente primero, 18 participantes por partida y 602002 guardado", async () => {
    const { fake, worker, logs } = setup();
    // Tecleado en minúsculas: se guarda la forma canónica que devuelve Account-V1.
    const profile = await registerProfile(db, "bejito mambo", "1991");

    const { result, worked } = await drain(worker);
    expect(result).toBe("idle");
    expect(worked).toBe(14); // cuenta + 2 páginas de ids (una por cola) + 10 detalles + cierre

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

    // Orden de descarga = más reciente primero; 1 petición de cada tipo salvo ids (1 por cola) y
    // detalle.
    expect(fake.matchCalls()).toEqual(IDS_DESC);
    expect(fake.count("account")).toBe(1);
    expect(fake.count("playerData")).toBe(1);
    expect(fake.count("summoner")).toBe(1);
    expect(
      fake.calls.filter((c) => c.method === "matchIds").map((c) => c.query),
    ).toEqual([
      { start: 0, count: 100, queue: 1750, startTime: SEASON_START_S },
      { start: 0, count: 100, queue: 1740, startTime: SEASON_START_S },
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
    expect(await second.tick()).toBe("worked"); // página 3 (incompleta) y paso a la 1740
    expect(await lastJob(profile.id)).toMatchObject({
      status: "listing",
      listQueueIndex: 1,
      listCursor: 0,
    });
    expect(await second.tick()).toBe("worked"); // 1740: sin partidas
    const job = await lastJob(profile.id);
    expect(job).toMatchObject({ status: "fetching", totalIds: 250 });
    expect(job.matchIds).toEqual(ids);
    expect(
      fake.calls
        .filter((c) => c.method === "matchIds")
        .map((c) => [c.query?.queue, c.query?.start]),
    ).toEqual([
      [1750, 0],
      [1750, 100],
      [1750, 200],
      [1740, 0],
    ]);
    expect((await counts()).matchFetch).toBe(250);
  });

  it.each([
    {
      name: "1750 con página llena y 1740 incompleta",
      inA: 100,
      inB: 40,
      calls: [
        [1750, 0],
        [1750, 100], // la página llena obliga a pedir otra, aquí vacía
        [1740, 0],
      ],
    },
    {
      name: "1750 incompleta y 1740 con más de una página",
      inA: 20,
      inB: 130,
      calls: [
        [1750, 0],
        [1740, 0],
        [1740, 100],
      ],
    },
  ])("dos colas: $name", async ({ inA, inB, calls }) => {
    const { fake, worker } = setup();
    // Ids de las dos colas intercalados: 1750 en los pares y 1740 en los impares.
    const base = 8_100_000_000;
    const idsA = Array.from({ length: inA }, (_, i) => `EUW1_${base - 2 * i}`);
    const idsB = Array.from(
      { length: inB },
      (_, i) => `EUW1_${base - 1 - 2 * i}`,
    );
    fake.setMatchIds(SELF_PUUID, idsA, 1750);
    fake.setMatchIds(SELF_PUUID, idsB, 1740);
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    expect(await worker.tick()).toBe("worked"); // cuenta
    const pagesOfA = calls.filter(([queue]) => queue === 1750).length;
    for (let i = 0; i < pagesOfA; i++)
      expect(await worker.tick()).toBe("worked");
    // Terminada la 1750 el job sigue en `listing`, en la cola siguiente y con lo listado hasta ahora.
    expect(await lastJob(profile.id)).toMatchObject({
      status: "listing",
      listQueueIndex: 1,
      listCursor: 0,
      matchIds: idsA,
    });
    for (let i = 0; i < calls.length - pagesOfA; i++) {
      expect(await worker.tick()).toBe("worked");
    }

    const expected = [...idsA, ...idsB].sort(
      (a, b) => Number(b.slice(5)) - Number(a.slice(5)),
    );
    const job = await lastJob(profile.id);
    expect(job).toMatchObject({
      status: "fetching",
      listQueueIndex: 1,
      totalIds: inA + inB,
    });
    expect(job.matchIds).toEqual(expected);
    expect(
      fake.calls
        .filter((c) => c.method === "matchIds")
        .map((c) => [c.query?.queue, c.query?.start]),
    ).toEqual(calls);
    expect((await counts()).matchFetch).toBe(inA + inB);
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
    // Ambos listaron las 10 partidas (2 peticiones de ids cada uno, una por cola), pero cada
    // detalle se pidió una vez.
    expect(fake.count("matchIds")).toBe(4);
    for (const id of IDS_DESC) expect(fake.count("match", id)).toBe(1);
    expect(fake.matchCalls()).toHaveLength(10);
    expect(await counts()).toEqual({
      matches: 10,
      participants: 180,
      matchFetch: 10,
    });
  });
});

describe("colas de Arena 1750 y 1740", () => {
  // Tres partidas de la 1740 intercaladas entre las 10 de la 1750.
  const extras = [fixtures[9], fixtures[4], fixtures[0]].map(queue1740After);
  const extraIds = extras.map((e) => e.match.metadata.matchId);

  it("backfill: lista las dos colas y descarga de más reciente a más antigua entre ambas", async () => {
    const { fake, worker } = setup();
    for (const extra of extras) fake.addMatch(extra);
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    await drain(worker);

    const expected = newestFirst([...IDS_DESC, ...extraIds]);
    // Las de la 1740 no quedan al final: se intercalan con las de la 1750.
    expect(expected.slice(0, 3)).toEqual([
      extraIds[0],
      IDS_DESC[0],
      IDS_DESC[1],
    ]);
    const job = await lastJob(profile.id);
    expect(job).toMatchObject({
      status: "done",
      listQueueIndex: 1,
      totalIds: 13,
      fetched: 13,
    });
    expect(job.matchIds).toEqual(expected);
    expect(fake.matchCalls()).toEqual(expected);
    expect(
      fake.calls.filter((c) => c.method === "matchIds").map((c) => c.query),
    ).toEqual([
      { start: 0, count: 100, queue: 1750, startTime: SEASON_START_S },
      { start: 0, count: 100, queue: 1740, startTime: SEASON_START_S },
    ]);
    const stored = await db
      .select({ queueId: matches.queueId, n: count() })
      .from(matches)
      .groupBy(matches.queueId)
      .orderBy(asc(matches.queueId));
    expect(stored).toEqual([
      { queueId: 1740, n: 3 },
      { queueId: 1750, n: 10 },
    ]);
  });

  it("una partida que sale en las dos colas cuenta una sola vez", async () => {
    const { fake, worker } = setup();
    fake.setMatchIds(SELF_PUUID, [IDS_DESC[3], IDS_DESC[5]], 1740);
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    await drain(worker);

    const job = await lastJob(profile.id);
    expect(job).toMatchObject({ status: "done", totalIds: 10, fetched: 10 });
    expect(job.matchIds).toEqual(IDS_DESC);
    expect(fake.matchCalls()).toEqual(IDS_DESC);
  });
});

describe("re-backfill de temporada (sync:season)", () => {
  it("completa el perfil con las partidas de la 1740 sin pedir la cuenta ni las ya guardadas", async () => {
    const { fake, worker } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    // Sincronizado como antes de añadir la 1740: solo hay partidas de la 1750.
    await drain(worker);
    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      totalIds: 10,
    });
    const extras = [fixtures[9], fixtures[4], fixtures[0]].map(queue1740After);
    for (const extra of extras) fake.addMatch(extra);
    const before = fake.calls.length;

    expect(await enqueueSeasonBackfill(db, "bejito mambo#1991")).toMatchObject({
      outcome: "queued",
    });
    expect(await drain(worker)).toMatchObject({ result: "idle" });

    const delta = fake.calls.slice(before);
    // Sin Account-V1 (el perfil ya tiene puuid): un listado por cola desde el inicio de la
    // temporada, solo las 3 nuevas en detalle y, al cerrar, el contador 602002 y el icono.
    expect(delta.map((c) => c.method)).toEqual([
      "matchIds",
      "matchIds",
      "match",
      "match",
      "match",
      "playerData",
      "summoner",
    ]);
    expect(delta.slice(0, 2).map((c) => c.query)).toEqual([
      { start: 0, count: 100, queue: 1750, startTime: SEASON_START_S },
      { start: 0, count: 100, queue: 1740, startTime: SEASON_START_S },
    ]);
    const requested = delta.filter((c) => c.method === "match");
    expect(requested.map((c) => c.arg)).toEqual(
      newestFirst(extras.map((e) => e.match.metadata.matchId)),
    );
    // Mantenimiento: no interactivo, prioridades de lista y detalle.
    expect(requested.every((c) => c.priority === PRIORITY.detail)).toBe(true);
    expect(delta[0].priority).toBe(PRIORITY.list);

    const job = await lastJob(profile.id);
    expect(job).toMatchObject({
      kind: "backfill",
      interactive: false,
      status: "done",
      totalIds: 13,
      fetched: 13,
    });
    expect(job.startedAt).not.toBeNull();
    expect(job.matchIds).toEqual(
      newestFirst([
        ...IDS_DESC,
        ...extras.map((e) => e.match.metadata.matchId),
      ]),
    );
    expect(fake.count("account")).toBe(1);
    expect((await counts()).matches).toBe(13);
  });
});

describe("AC5 refresco incremental", () => {
  it("sin partidas nuevas: 1 petición de ids por cola y 0 de detalle; con 1 nueva: 1 por cola y 1; cooldown", async () => {
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

    const synced = await getProfile(profile.id);
    expect(synced.challengeValue).not.toBeNull();
    let before = fake.calls.length;
    await drain(worker);
    let delta = fake.calls.slice(before);
    // 1 de ids por cola y nada más: ni detalle ni el contador 602002 ni el icono (AC7).
    expect(delta.map((c) => c.method)).toEqual(["matchIds", "matchIds"]);
    const [lastEnd] = await db
      .select({ max: sql<string>`max(${matches.gameEndTimestamp})` })
      .from(matches);
    // Un único `startTime` para las dos colas.
    const startTime = Math.floor(Number(lastEnd.max) / 1000) - 60;
    expect(delta.slice(0, 2).map((c) => c.query)).toEqual([
      { start: 0, count: 100, queue: 1750, startTime },
      { start: 0, count: 100, queue: 1740, startTime },
    ]);
    expect(await lastJob(profile.id)).toMatchObject({
      kind: "incremental",
      status: "done",
      totalIds: 0,
      fetched: 0,
      lastError: null,
    });
    // El cierre anota la sincronización y conserva lo guardado (sin pisarlo con `null`).
    const kept = await getProfile(profile.id);
    expect(kept.lastSyncedAt).toEqual(new Date(clock.now()));
    expect(kept.challengeValue).toBe(synced.challengeValue);
    expect(kept.challengeLevel).toBe(synced.challengeLevel);
    expect(kept.challengeCheckedAt).toEqual(synced.challengeCheckedAt);
    expect(kept.profileIconId).toBe(FAKE_PROFILE_ICON_ID);

    // Una partida nueva.
    fake.addMatch(laterVariant("EUW1_7999000001", 1));
    clock.advance(REFRESH_COOLDOWN_MS);
    expect(
      await requestRefresh(db, profile.id, { interactive: true, now: now() }),
    ).toBe("queued");
    before = fake.calls.length;
    await drain(worker);
    delta = fake.calls.slice(before);
    expect(delta.filter((c) => c.method === "matchIds")).toHaveLength(2);
    expect(delta.filter((c) => c.method === "match").map((c) => c.arg)).toEqual(
      ["EUW1_7999000001"],
    );
    const job = await lastJob(profile.id);
    expect(job).toMatchObject({ status: "done", totalIds: 1, fetched: 1 });
    expect(job.matchIds).toEqual(["EUW1_7999000001"]);
    expect((await counts()).matches).toBe(11);
    // Con una partida nueva, el cierre sí pide el contador 602002 y el icono (AC7).
    expect(delta.map((c) => c.method)).toEqual([
      "matchIds",
      "matchIds",
      "match",
      "playerData",
      "summoner",
    ]);
    expect((await getProfile(profile.id)).challengeCheckedAt).toEqual(
      new Date(clock.now()),
    );
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
      ["matchIds", PRIORITY.list],
      ["match", PRIORITY.detail],
      ["playerData", PRIORITY.list],
      ["summoner", PRIORITY.list],
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
    for (let i = 0; i < 6; i++) expect(await worker.tick()).toBe("worked"); // cuenta, 2 de ids, 3 detalles

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
    for (let i = 0; i < 6; i++) expect(await first.tick()).toBe("worked"); // cuenta, 2 de ids, 3 detalles
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
    expect(fake.count("matchIds")).toBe(2); // una por cola
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

  it("429 persistente: el backoff guarda un lastError que se clasifica como límite de peticiones; el 5xx, como error", async () => {
    const { fake, worker } = setup();
    const [limited, broken] = [IDS_DESC[0], IDS_DESC[1]];
    fake.failWith = (call) => {
      if (call.method !== "match") return undefined;
      if (call.arg === limited) {
        return new RiotRateLimitError(
          { host: "europe", path: "/x", status: 429 },
          "límite de peticiones tras 5 intentos",
        );
      }
      return call.arg === broken
        ? new RiotRetryableError({ host: "europe", path: "/x", status: 503 })
        : undefined;
    };
    await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);

    const rows = await db
      .select()
      .from(matchFetch)
      .where(sql`${matchFetch.matchId} in (${limited}, ${broken})`);
    const byId = new Map(rows.map((r) => [r.matchId, r]));
    // Las dos esperan su reintento; solo el motivo las distingue (el texto no sale del servidor).
    expect(byId.get(limited)?.nextAttemptAt).not.toBeNull();
    expect(byId.get(broken)?.nextAttemptAt).not.toBeNull();
    expect(classifyRetry(byId.get(limited)?.lastError ?? null)).toBe(
      "rate_limit",
    );
    expect(classifyRetry(byId.get(broken)?.lastError ?? null)).toBe("error");
  });

  it("429 persistente al listar: el backoff del job también queda clasificado", async () => {
    const { fake, worker } = setup();
    fake.failWith = (call) =>
      call.method === "matchIds"
        ? new RiotRateLimitError(
            { host: "europe", path: "/x", status: 429 },
            "límite de peticiones tras 5 intentos",
          )
        : undefined;
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    expect(await worker.tick()).toBe("worked"); // cuenta
    expect(await worker.tick()).toBe("worked"); // listado: 429
    const job = await lastJob(profile.id);
    expect(job.nextRunAt).not.toBeNull();
    expect(classifyRetry(job.lastError)).toBe("rate_limit");
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
    expect(fake.count("matchIds")).toBe(3); // el fallo + una por cola
  });
});

describe("AC7 incremental ligero: 602002 e icono solo si el perfil pudo cambiar", () => {
  /** El jugador de prueba sincronizado y, tras él, una partida en trío con el amigo 013. */
  async function selfWithSharedMatch() {
    const ctx = setup();
    const self = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(ctx.worker);
    // La última lectura del 602002 fue justo al acabar la última partida guardada: la nueva
    // (2 h después) acaba más tarde que esa lectura.
    const [{ lastEnd }] = await db
      .select({ lastEnd: sql<string>`max(${matches.gameEndTimestamp})` })
      .from(matches);
    await db
      .update(profiles)
      .set({ challengeCheckedAt: new Date(Number(lastEnd)) })
      .where(eq(profiles.id, self.id));
    ctx.fake.addMatch(laterVariant("EUW1_7999000020", 2));
    return { ...ctx, self };
  }

  const refresh = async (
    clock: ReturnType<typeof setup>["clock"],
    profileId: number,
  ) => {
    clock.advance(REFRESH_COOLDOWN_MS);
    expect(
      await requestRefresh(db, profileId, {
        interactive: false,
        now: new Date(clock.now()),
      }),
    ).toBe("queued");
  };

  it("una partida en trío que ya guardó un amigo no se descarga, pero el contador del perfil sí se lee", async () => {
    const { fake, worker, clock, self } = await selfWithSharedMatch();
    // El amigo sincroniza primero y guarda la partida (su job pide su propio contador).
    const mate = await registerProfile(db, "Player013", "ANON");
    await drain(worker);
    expect(await lastJob(mate.id)).toMatchObject({ status: "done" });
    const checkedBefore = (await getProfile(self.id)).challengeCheckedAt;

    await refresh(clock, self.id);
    const before = fake.calls.length;
    await drain(worker);

    const delta = fake.calls.slice(before);
    expect(await lastJob(self.id)).toMatchObject({
      status: "done",
      totalIds: 0,
    });
    expect(delta.map((c) => c.method)).toEqual([
      "matchIds",
      "matchIds",
      "playerData",
      "summoner",
    ]);
    expect(
      (await getProfile(self.id)).challengeCheckedAt?.getTime(),
    ).toBeGreaterThan(checkedBefore?.getTime() ?? 0);

    // Ya leído después de esa partida: el siguiente incremental vuelve a ser ligero.
    await refresh(clock, self.id);
    const next = fake.calls.length;
    await drain(worker);
    expect(fake.calls.slice(next).map((c) => c.method)).toEqual([
      "matchIds",
      "matchIds",
    ]);
  });

  it("un perfil con partidas guardadas y sin lectura previa del 602002 lo pide aunque no haya partidas nuevas", async () => {
    const { fake, worker, clock } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    await db
      .update(profiles)
      .set({ challengeCheckedAt: null })
      .where(eq(profiles.id, profile.id));

    await refresh(clock, profile.id);
    const before = fake.calls.length;
    await drain(worker);

    expect(fake.calls.slice(before).map((c) => c.method)).toEqual([
      "matchIds",
      "matchIds",
      "playerData",
      "summoner",
    ]);
    expect((await getProfile(profile.id)).challengeCheckedAt).not.toBeNull();
  });

  it("un incremental vacío no toca euw1: un fallo de player-data y de summoner no le afecta", async () => {
    const { fake, worker, clock } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    fake.failWith = (call) =>
      call.method === "playerData" || call.method === "summoner"
        ? new RiotRetryableError({ host: "euw1", path: "/x", status: 500 })
        : undefined;

    await refresh(clock, profile.id);
    await drain(worker);

    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      lastError: null,
    });
  });
});

describe("icono de invocador (Summoner-V4 al cerrar)", () => {
  it("guarda el profileIconId en el perfil", async () => {
    const { fake, worker } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    expect((await getProfile(profile.id)).profileIconId).toBeNull();

    expect(await drain(worker)).toMatchObject({ result: "idle" });

    expect((await getProfile(profile.id)).profileIconId).toBe(
      FAKE_PROFILE_ICON_ID,
    );
    expect(await lastJob(profile.id)).toMatchObject({
      status: "done",
      lastError: null,
    });
    expect(fake.count("summoner", SELF_PUUID)).toBe(1);
  });

  it("un 500 persistente no rompe el job: termina, anota 'summoner' y el perfil sigue sin icono", async () => {
    const { fake, worker } = setup();
    fake.failWith = (call) =>
      call.method === "summoner"
        ? new RiotRetryableError({
            host: "euw1",
            path: "/lol/summoner/v4/summoners/by-puuid/:puuid",
            status: 500,
          })
        : undefined;
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    expect(await drain(worker)).toMatchObject({ result: "idle" });

    const job = await lastJob(profile.id);
    expect(job).toMatchObject({ status: "done", fetched: 10 });
    expect(job.lastError).toContain("summoner");
    expect(job.lastError).not.toContain("player-data");
    const row = await getProfile(profile.id);
    expect(row.profileIconId).toBeNull();
    // Lo demás del cierre sigue en pie: el contador 602002 y `lastSyncedAt`.
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row.challengeValue).not.toBeNull();
  });

  it("un fallo posterior no borra el icono que ya había", async () => {
    const { fake, worker, clock } = setup();
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await drain(worker);
    expect((await getProfile(profile.id)).profileIconId).toBe(
      FAKE_PROFILE_ICON_ID,
    );

    fake.failWith = (call) =>
      call.method === "summoner"
        ? new RiotRetryableError({ host: "euw1", path: "/x", status: 500 })
        : undefined;
    // Con una partida nueva: un incremental vacío no pide el icono.
    fake.addMatch(laterVariant("EUW1_7999000003", 1));
    clock.advance(REFRESH_COOLDOWN_MS);
    expect(
      await requestRefresh(db, profile.id, {
        interactive: true,
        now: new Date(clock.now()),
      }),
    ).toBe("queued");
    await drain(worker);

    expect((await lastJob(profile.id)).lastError).toContain("summoner");
    expect((await getProfile(profile.id)).profileIconId).toBe(
      FAKE_PROFILE_ICON_ID,
    );
  });

  it("un error de auth en Summoner-V4 se propaga: pausa y el job no se cierra", async () => {
    const { fake, worker } = setup();
    fake.failWith = (call) =>
      call.method === "summoner"
        ? new RiotAuthError({
            host: "euw1",
            path: "/lol/summoner/v4/summoners/by-puuid/:puuid",
            status: 403,
          })
        : undefined;
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");

    expect((await drain(worker)).result).toBe("paused");

    expect((await readSettings()).keyStatus).toBe("invalid");
    expect((await lastJob(profile.id)).status).not.toBe("done");
    expect((await getProfile(profile.id)).profileIconId).toBeNull();
  });
});
