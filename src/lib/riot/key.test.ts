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
import { getRiotApiKey } from "./key";

// Usa la BD de tests (`settings`, fila id = 1) y valores falsos: nunca la key real.

const db = getTestDb();
const DB_KEY = "RGAPI-fake-db-key-0000";
const ENV_KEY = "RGAPI-fake-env-key-1111";

const setDbKey = (riotApiKey: string | null) =>
  db.update(settings).set({ riotApiKey }).where(eq(settings.id, 1));

describe("getRiotApiKey", () => {
  beforeEach(async () => {
    await truncateAll(); // deja la fila `settings` con la key a null
    vi.stubEnv("RIOT_API_KEY", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("devuelve null si no hay key ni en BD ni en el entorno", async () => {
    expect(await getRiotApiKey(db)).toBeNull();
  });

  it("usa la del entorno si la BD no tiene", async () => {
    vi.stubEnv("RIOT_API_KEY", ENV_KEY);
    expect(await getRiotApiKey(db)).toEqual({ key: ENV_KEY, source: "env" });
  });

  it("prioriza la BD sobre el entorno", async () => {
    vi.stubEnv("RIOT_API_KEY", ENV_KEY);
    await setDbKey(DB_KEY);
    expect(await getRiotApiKey(db)).toEqual({ key: DB_KEY, source: "db" });
  });

  it("usa la de la BD aunque no haya entorno", async () => {
    await setDbKey(DB_KEY);
    expect(await getRiotApiKey(db)).toEqual({ key: DB_KEY, source: "db" });
  });

  it("una key vacía o solo espacios en BD cuenta como ausente", async () => {
    vi.stubEnv("RIOT_API_KEY", ENV_KEY);
    await setDbKey("   ");
    expect(await getRiotApiKey(db)).toEqual({ key: ENV_KEY, source: "env" });
    await setDbKey("");
    expect(await getRiotApiKey(db)).toEqual({ key: ENV_KEY, source: "env" });
  });

  it("quita espacios y saltos de línea alrededor de la key", async () => {
    await setDbKey(`  ${DB_KEY}\n`);
    expect(await getRiotApiKey(db)).toEqual({ key: DB_KEY, source: "db" });
    await setDbKey(null);
    vi.stubEnv("RIOT_API_KEY", `${ENV_KEY}\n`);
    expect(await getRiotApiKey(db)).toEqual({ key: ENV_KEY, source: "env" });
  });

  it("no cachea: cada llamada refleja el estado actual de la BD y del entorno", async () => {
    expect(await getRiotApiKey(db)).toBeNull();
    await setDbKey(DB_KEY);
    expect(await getRiotApiKey(db)).toEqual({ key: DB_KEY, source: "db" });
    await setDbKey("RGAPI-fake-rotated-key-2222");
    expect(await getRiotApiKey(db)).toEqual({
      key: "RGAPI-fake-rotated-key-2222",
      source: "db",
    });
    await setDbKey(null);
    vi.stubEnv("RIOT_API_KEY", ENV_KEY);
    expect(await getRiotApiKey(db)).toEqual({ key: ENV_KEY, source: "env" });
  });

  it("sin fila en settings sigue funcionando con el entorno", async () => {
    await db.delete(settings);
    vi.stubEnv("RIOT_API_KEY", ENV_KEY);
    expect(await getRiotApiKey(db)).toEqual({ key: ENV_KEY, source: "env" });
  });
});
