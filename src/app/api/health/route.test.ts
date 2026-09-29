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
import { matchFetch, profiles, settings } from "@/db/schema";
import { registerProfile } from "@/worker/queue";
import { getTestDb, truncateAll } from "../../../../tests/helpers/db";
import { GET } from "./route";

const db = getTestDb();
const DB_KEY = "RGAPI-test-secret-000";
const ENV_KEY = "RGAPI-env-secret-111";
const PUUID = "puuid-secreto-".padEnd(78, "x");

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("RIOT_API_KEY", ENV_KEY);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(closeDb);

describe("GET /api/health", () => {
  it("devuelve BD, worker, key, cola y métricas, sin caché y sin filtrar la key ni puuids", async () => {
    const reason = "Riot 401";
    await db
      .update(settings)
      .set({
        riotApiKey: DB_KEY,
        keyStatus: "invalid",
        keyStatusSince: new Date("2026-09-29T09:00:00Z"),
        keyStatusReason: reason,
      })
      .where(eq(settings.id, 1));
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991"); // job activo
    await db
      .update(profiles)
      .set({ puuid: PUUID })
      .where(eq(profiles.id, profile.id));
    await db.insert(matchFetch).values([
      { matchId: "EUW1_1", status: "pending" },
      { matchId: "EUW1_2", status: "pending" },
      { matchId: "EUW1_3", status: "done" },
    ]);

    const response = await GET();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      ok: true,
      db: "ok",
      worker: { state: expect.any(String), currentJobId: null },
      key: {
        status: "invalid",
        since: "2026-09-29T09:00:00.000Z",
        source: "db",
      },
      queue: { activeJobs: 1, pendingMatches: 2 },
      riot: {
        requests: expect.objectContaining({ account: expect.any(Number) }),
        status429: expect.any(Number),
        retries: expect.any(Number),
      },
    });
    // La key (de BD y del entorno), su motivo y los puuids no salen nunca.
    expect(Object.keys(body.key).sort()).toEqual(["since", "source", "status"]);
    for (const secret of [DB_KEY, ENV_KEY, "RGAPI-", PUUID, reason]) {
      expect(text).not.toContain(secret);
    }
  });

  it("con la key solo en el entorno: source env", async () => {
    const body = await (await GET()).json();
    expect(body.key).toMatchObject({ status: "unknown", source: "env" });
  });

  it("BD inaccesible: ok false, db error, 503 y sin detalles del fallo", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const response = await GET();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      ok: false,
      db: "error",
      key: { status: "unknown", source: "none" },
      queue: { activeJobs: 0, pendingMatches: 0 },
    });
    expect(text).not.toContain("connection refused");
  });
});
