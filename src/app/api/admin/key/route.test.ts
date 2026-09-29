import { DrizzleQueryError, eq } from "drizzle-orm";
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
import { getTestDb, truncateAll } from "../../../../../tests/helpers/db";
import { POST } from "./route";

// Riot no se toca: el validador real se sustituye por uno falso.
const mocks = vi.hoisted(() => ({ validateKey: vi.fn() }));
vi.mock("@/lib/riot/client", () => ({
  getRiotClient: () => ({ validateKey: mocks.validateKey }),
}));

const db = getTestDb();
const TOKEN = "test-admin-token-123";
const KEY = "RGAPI-test-secret-000";

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("ADMIN_TOKEN", TOKEN);
  mocks.validateKey.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(closeDb);

function request(
  body: unknown,
  authorization: string | null = `Bearer ${TOKEN}`,
) {
  return new Request("http://localhost/api/admin/key", {
    method: "POST",
    headers: authorization ? { authorization } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function savedKey() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row.riotApiKey;
}

describe("POST /api/admin/key", () => {
  it.each([
    ["sin cabecera", null],
    ["token incorrecto", "Bearer otro"],
    ["esquema distinto", `Basic ${TOKEN}`],
  ])("401 (%s): no valida ni guarda", async (_name, authorization) => {
    const response = await POST(request({ key: KEY }, authorization));
    expect(response.status).toBe(401);
    expect(mocks.validateKey).not.toHaveBeenCalled();
    expect(await savedKey()).toBeNull();
  });

  it("401 si no hay ADMIN_TOKEN configurado", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const response = await POST(request({ key: KEY }, "Bearer "));
    expect(response.status).toBe(401);
    expect(mocks.validateKey).not.toHaveBeenCalled();
  });

  it("200 con bearer y key válida: la guarda y no la devuelve", async () => {
    mocks.validateKey.mockResolvedValue("ok");

    const response = await POST(request({ key: `  ${KEY} ` }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ result: "ok" });
    expect(text).not.toContain(KEY);
    expect(mocks.validateKey).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(await savedKey()).toBe(KEY);
    const [row] = await db.select().from(settings);
    expect(row.keyStatus).toBe("ok");
  });

  it.each([
    ["invalid", 400],
    ["error", 502],
  ] as const)("validador %s: %i y no guarda", async (validation, status) => {
    mocks.validateKey.mockResolvedValue(validation);
    const response = await POST(request({ key: KEY }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ result: validation });
    expect(await savedKey()).toBeNull();
  });

  it.each([
    ["formato inválido", { key: "no-es-una-key" }],
    ["sin key", {}],
    ["key que no es texto", { key: 42 }],
    ["JSON nulo", "null"],
    ["cuerpo que no es JSON", "esto no es json"],
  ])("400 invalid_format (%s): no llama a Riot", async (_name, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ result: "invalid_format" });
    expect(mocks.validateKey).not.toHaveBeenCalled();
  });

  it("un fallo de BD da 500 y no filtra la key ni a la respuesta ni a los logs", async () => {
    mocks.validateKey.mockResolvedValue("ok");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Los errores de Drizzle citan los parámetros de la consulta.
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw new DrizzleQueryError(
        `insert into "settings" ... params: 1,${KEY}`,
        [KEY],
        new Error("connection terminated"),
      );
    });

    const response = await POST(request({ key: KEY }));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain(KEY);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(logged.mock.calls)).toContain(
      "connection terminated",
    );
  });
});
