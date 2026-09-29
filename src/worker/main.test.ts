import { asc, DrizzleQueryError, eq, sql } from "drizzle-orm";
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
import { syncJobs } from "@/db/schema";
import { RiotAuthError } from "@/lib/riot/errors";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import { createFakeRiot } from "../../tests/helpers/fake-riot";
import {
  acquireAdvisoryLock,
  createWorker,
  getWorkerStatus,
  startWorker,
  stopWorker,
} from "./main";
import { registerProfile } from "./queue";
import { safeErrorMessage } from "./steps";

const db = getTestDb();
const url = process.env.DATABASE_URL ?? "";
const silent = () => {};

beforeEach(truncateAll);
afterEach(stopWorker);
afterAll(closeDb);

async function jobStatus(profileId: number) {
  const [job] = await db
    .select({ status: syncJobs.status })
    .from(syncJobs)
    .where(eq(syncJobs.profileId, profileId))
    .orderBy(asc(syncJobs.id));
  return job?.status;
}

describe("advisory lock", () => {
  it("una segunda instancia no obtiene el lock mientras la primera lo tiene", async () => {
    const first = await acquireAdvisoryLock(url);
    expect(first?.isHeld()).toBe(true);
    expect(await acquireAdvisoryLock(url)).toBeNull();

    await first?.release();
    expect(first?.isHeld()).toBe(false);
    const next = await acquireAdvisoryLock(url);
    expect(next?.isHeld()).toBe(true);
    await next?.release();
  });

  it("si se cae la conexión que lo sostiene, lo detecta y otro proceso puede cogerlo", async () => {
    const lock = await acquireAdvisoryLock(url);
    expect(lock?.isHeld()).toBe(true);
    await db.execute(sql`
      select pg_terminate_backend(pid) from pg_locks
      where locktype = 'advisory'
        and database = (select oid from pg_database where datname = current_database())
        and pid <> pg_backend_pid()`);
    await vi.waitFor(() => expect(lock?.isHeld()).toBe(false));
    await lock?.release();
    const next = await acquireAdvisoryLock(url);
    expect(next).not.toBeNull();
    await next?.release();
  });
});

describe("run / stop", () => {
  it("el bucle duerme hasta wakeWorker(), procesa la cola y stop() lo termina", async () => {
    const fake = createFakeRiot();
    // `sleep` que nunca termina: solo la señal (o stop) saca al bucle de la espera.
    const worker = createWorker({
      db,
      riot: fake,
      sleep: () => new Promise<void>(() => {}),
      seasonStart: new Date("2026-05-12T00:00:00Z"),
      log: silent,
    });
    const running = worker.run();
    await vi.waitFor(() => expect(getWorkerStatus().state).toBe("idle"));
    expect(fake.calls).toHaveLength(0);

    const profile = await registerProfile(db, "BEJITO MAMBO", "1991"); // despierta al worker
    await vi.waitFor(
      async () => expect(await jobStatus(profile.id)).toBe("done"),
      { timeout: 5_000 },
    );

    await worker.stop();
    await running;
    expect(getWorkerStatus().state).toBe("stopped");
  });
});

describe("startWorker", () => {
  it("idempotente; espera el lock sin llamar a Riot; con el lock trabaja; stop lo libera", async () => {
    const fake = createFakeRiot();
    const blocker = await acquireAdvisoryLock(url);
    const options = {
      riot: fake,
      handleSignals: false,
      lockRetryMs: 20,
      log: silent,
    };
    const started = startWorker(options);
    expect(startWorker(options)).toBe(started);

    await vi.waitFor(() =>
      expect(getWorkerStatus().state).toBe("waiting_lock"),
    );
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake.calls).toHaveLength(0);

    await blocker?.release();
    await vi.waitFor(
      async () => expect(await jobStatus(profile.id)).toBe("done"),
      { timeout: 5_000 },
    );
    await vi.waitFor(() => expect(getWorkerStatus().state).toBe("idle"));

    await stopWorker();
    expect(getWorkerStatus().state).toBe("stopped");
    const next = await acquireAdvisoryLock(url);
    expect(next).not.toBeNull();
    await next?.release();
  });
});

describe("safeErrorMessage", () => {
  it("de un error de Drizzle solo usa la causa (los parámetros llevan puuids)", () => {
    const puuid = "x".repeat(78);
    const error = new DrizzleQueryError(
      "select * from profiles where puuid = $1",
      [puuid],
      new Error('duplicate key value violates unique constraint "x"'),
    );
    const message = safeErrorMessage(error);
    expect(message).toBe('duplicate key value violates unique constraint "x"');
    expect(message).not.toContain(puuid);
  });

  it("enmascara keys y cadenas con forma de puuid", () => {
    const message = safeErrorMessage(
      new Error(`fallo con RGAPI-1234-abcd y ${"a".repeat(78)}`),
    );
    expect(message).not.toMatch(/RGAPI-1234|a{60}/);
  });

  it("los errores de Riot se usan tal cual (ya vienen sin key ni puuid)", () => {
    const error = new RiotAuthError({
      host: "europe",
      path: "/lol/match/v5/matches/by-puuid/:puuid/ids",
      status: 403,
    });
    expect(safeErrorMessage(error)).toBe(error.message);
  });
});
