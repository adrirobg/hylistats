import { eq } from "drizzle-orm";
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
import { settings } from "@/db/schema";
import { createWorker } from "@/worker/main";
import { registerProfile } from "@/worker/queue";
import { getTestDb, truncateAll } from "../../../tests/helpers/db";
import { createFakeRiot } from "../../../tests/helpers/fake-riot";
import { getKeyStatus, KEY_TTL_MS, saveRiotKey } from "./key-service";

const db = getTestDb();
const KEY = "RGAPI-test-secret-000";

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("RIOT_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(closeDb);

async function readSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row;
}

function deps(validation: "ok" | "invalid" | "error", at = new Date()) {
  return {
    validateKey: vi.fn(async (_candidate: string) => validation),
    wakeWorker: vi.fn(),
    now: () => at,
  };
}

describe("saveRiotKey", () => {
  it("ok: valida, guarda la key recortada con keyStatus ok y despierta al worker", async () => {
    const at = new Date("2026-09-29T10:00:00Z");
    const d = deps("ok", at);

    expect(await saveRiotKey(db, `  ${KEY} \n`, d)).toBe("ok");

    expect(d.validateKey).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(d.wakeWorker).toHaveBeenCalledOnce();
    expect(await readSettings()).toMatchObject({
      riotApiKey: KEY,
      keyStatus: "ok",
      keyStatusSince: at,
      keyStatusReason: null,
      updatedAt: at,
    });
  });

  it("ok: limpia el estado invalid anterior y hace upsert si no hay fila", async () => {
    await db
      .update(settings)
      .set({
        riotApiKey: "RGAPI-old-key-000",
        keyStatus: "invalid",
        keyStatusReason: "Riot 401",
      })
      .where(eq(settings.id, 1));
    expect(await saveRiotKey(db, KEY, deps("ok"))).toBe("ok");
    expect(await readSettings()).toMatchObject({
      riotApiKey: KEY,
      keyStatus: "ok",
      keyStatusReason: null,
    });

    await db.delete(settings);
    expect(await saveRiotKey(db, KEY, deps("ok"))).toBe("ok");
    expect(await readSettings()).toMatchObject({
      id: 1,
      riotApiKey: KEY,
      keyStatus: "ok",
    });
  });

  it.each([
    "invalid",
    "error",
  ] as const)("%s: no guarda ni despierta y deja settings como estaba", async (validation) => {
    await db
      .update(settings)
      .set({ riotApiKey: "RGAPI-old-key-000", keyStatus: "invalid" })
      .where(eq(settings.id, 1));
    const before = await readSettings();
    const d = deps(validation);

    expect(await saveRiotKey(db, KEY, d)).toBe(validation);

    expect(d.validateKey).toHaveBeenCalledOnce();
    expect(d.wakeWorker).not.toHaveBeenCalled();
    expect(await readSettings()).toEqual(before);
  });

  it.each([
    "",
    "   ",
    "abc",
    "RGAPI-",
    "rgapi-minusculas",
    "RGAPI-con espacio",
    "RGAPI-ñandú",
  ])("invalid_format (%j): no llama a Riot ni guarda", async (candidate) => {
    const d = deps("ok");
    expect(await saveRiotKey(db, candidate, d)).toBe("invalid_format");
    expect(d.validateKey).not.toHaveBeenCalled();
    expect(d.wakeWorker).not.toHaveBeenCalled();
    expect((await readSettings()).riotApiKey).toBeNull();
  });

  it("una key nueva reanuda un worker en pausa sin reiniciarlo", async () => {
    await db
      .update(settings)
      .set({ riotApiKey: "RGAPI-old-key-000", keyStatus: "invalid" })
      .where(eq(settings.id, 1));
    await registerProfile(db, "BEJITO MAMBO", "1991");
    const fake = createFakeRiot();
    const worker = createWorker({
      db,
      riot: fake,
      seasonStart: new Date("2026-05-12T00:00:00Z"),
      log: () => {},
    });
    expect(await worker.tick()).toBe("paused");
    expect(fake.calls).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await saveRiotKey(db, KEY, { validateKey: async () => "ok" })).toBe(
      "ok",
    );

    expect(await worker.tick()).toBe("worked");
    expect(fake.calls.length).toBeGreaterThan(0);
  });
});

describe("getKeyStatus", () => {
  it("none: sin key en BD ni en el entorno", async () => {
    expect(await getKeyStatus(db)).toEqual({
      status: "unknown",
      since: null,
      reason: null,
      source: "none",
      updatedAt: (await readSettings()).updatedAt,
      expiresHint: null,
    });
  });

  it("none/unknown: sin fila de settings", async () => {
    await db.delete(settings);
    expect(await getKeyStatus(db)).toEqual({
      status: "unknown",
      since: null,
      reason: null,
      source: "none",
      updatedAt: null,
      expiresHint: null,
    });
  });

  it("db: key guardada; expiresHint = updatedAt + 24 h", async () => {
    const at = new Date("2026-09-29T10:00:00Z");
    await saveRiotKey(db, KEY, deps("ok", at));

    const status = await getKeyStatus(db);
    expect(status).toEqual({
      status: "ok",
      since: at,
      reason: null,
      source: "db",
      updatedAt: at,
      expiresHint: new Date(at.getTime() + KEY_TTL_MS),
    });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  it("env: sin key en BD pero con RIOT_API_KEY; sin expiresHint", async () => {
    vi.stubEnv("RIOT_API_KEY", " RGAPI-env-secret-111 ");
    const status = await getKeyStatus(db);
    expect(status).toMatchObject({ source: "env", expiresHint: null });
    expect(JSON.stringify(status)).not.toContain("RGAPI-env-secret-111");
  });

  it("la key de BD manda sobre la del entorno; una de BD en blanco no cuenta", async () => {
    vi.stubEnv("RIOT_API_KEY", "RGAPI-env-secret-111");
    await db
      .update(settings)
      .set({ riotApiKey: KEY })
      .where(eq(settings.id, 1));
    expect((await getKeyStatus(db)).source).toBe("db");

    await db
      .update(settings)
      .set({ riotApiKey: "   " })
      .where(eq(settings.id, 1));
    expect((await getKeyStatus(db)).source).toBe("env");
  });

  it("refleja invalid y su motivo", async () => {
    const at = new Date("2026-09-29T11:00:00Z");
    await db
      .update(settings)
      .set({
        riotApiKey: KEY,
        keyStatus: "invalid",
        keyStatusSince: at,
        keyStatusReason: "Riot 401",
      })
      .where(eq(settings.id, 1));
    expect(await getKeyStatus(db)).toMatchObject({
      status: "invalid",
      since: at,
      reason: "Riot 401",
    });
  });
});
