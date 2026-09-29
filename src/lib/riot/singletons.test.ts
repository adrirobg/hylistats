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
import { getTestDb, truncateAll } from "../../../tests/helpers/db";
import { readFixtureJson } from "../../../tests/helpers/riot";

// Singletons en `globalThis` y cliente real (con `fetch` global falso y la BD de tests).

const db = getTestDb();
const DB_KEY = "RGAPI-fake-db-key-0000";
const ROTATED_KEY = "RGAPI-fake-rotated-key-2222";
const ENV_KEY = "RGAPI-fake-env-key-1111";

const globalForRiot = globalThis as typeof globalThis & {
  __hylistatsRiot?: unknown;
};

// Cada `loadClient()` es una copia nueva del módulo (como la de otro bundle de Next o tras HMR).
async function loadClient() {
  vi.resetModules();
  return import("./client");
}

describe("singletons del cliente Riot", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.stubEnv("RIOT_API_KEY", undefined);
    // Estado limpio: limitadores y métricas nuevos en cada test.
    globalForRiot.__hylistatsRiot = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    globalForRiot.__hylistatsRiot = undefined;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("hay un limitador por host y siempre el mismo", async () => {
    const { getLimiters } = await loadClient();
    const limiters = getLimiters();
    expect(Object.keys(limiters).sort()).toEqual(["europe", "euw1"]);
    expect(limiters.europe).not.toBe(limiters.euw1);
    expect(getLimiters()).toBe(limiters);
    expect(getLimiters().europe).toBe(limiters.europe);
  });

  it("limitadores y métricas se comparten entre copias del módulo (HMR, bundles distintos)", async () => {
    const original = await loadClient();
    const limiters = original.getLimiters();
    const metrics = original.getRiotMetrics();
    const copy = await loadClient();
    expect(copy).not.toBe(original);
    expect(copy.getLimiters().europe).toBe(limiters.europe);
    expect(copy.getLimiters().euw1).toBe(limiters.euw1);
    expect(copy.getRiotMetrics()).toBe(metrics);
  });

  it("getRiotClient devuelve siempre el mismo cliente", async () => {
    const { getRiotClient } = await loadClient();
    expect(getRiotClient()).toBe(getRiotClient());
  });

  it("el cliente real lee la key de la BD en cada llamada y cae al entorno", async () => {
    const headers: Array<string | undefined> = [];
    vi.stubGlobal(
      "fetch",
      async (_url: string, init: { headers: Record<string, string> }) => {
        headers.push(init.headers["X-Riot-Token"]);
        return new Response(JSON.stringify(readFixtureJson("account.json")));
      },
    );
    const { getRiotClient, getRiotMetrics } = await loadClient();
    const client = getRiotClient();
    const call = () => client.getAccountByRiotId("BEJITO MAMBO", "1991", 0);

    await db
      .update(settings)
      .set({ riotApiKey: DB_KEY })
      .where(eq(settings.id, 1));
    vi.stubEnv("RIOT_API_KEY", ENV_KEY);
    await call();
    // Cambio de key desde /admin: la siguiente llamada la usa sin reiniciar.
    await db
      .update(settings)
      .set({ riotApiKey: ROTATED_KEY })
      .where(eq(settings.id, 1));
    await call();
    // Sin key en BD: entorno.
    await db
      .update(settings)
      .set({ riotApiKey: null })
      .where(eq(settings.id, 1));
    await call();

    expect(headers).toEqual([DB_KEY, ROTATED_KEY, ENV_KEY]);
    const metrics = getRiotMetrics();
    expect(metrics.requests.account).toBe(3);
    expect(metrics.lastRequestAt).toBeGreaterThan(0);
    expect(JSON.stringify(metrics)).not.toMatch(/RGAPI/);
  });
});
