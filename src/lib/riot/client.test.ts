import { describe, expect, it, vi } from "vitest";
import {
  createFakeClock,
  listMatchFixtureIds,
  readFixtureJson,
  readFixtureText,
} from "../../../tests/helpers/riot";
import {
  BACKOFF_MAX_MS,
  computeBackoffMs,
  createRiotClient,
  createRiotMetrics,
  DEFAULT_VALIDATION_RIOT_ID,
  type RiotClientDeps,
  type RiotFetch,
} from "./client";
import {
  RiotAuthError,
  RiotBadRequestError,
  RiotError,
  RiotNotFoundError,
  RiotRateLimitError,
  RiotRetryableError,
  RiotSchemaError,
} from "./errors";
import { HostLimiter, type Limiter } from "./limiter";

// Sin red, sin key real y con reloj falso: el `fetch` es un doble que reparte respuestas.

const KEY = "RGAPI-fake-key-for-tests-0000";
const OTHER_KEY = "RGAPI-another-fake-key-1111";
const EUROPE = "https://europe.api.riotgames.com";
const EUW1 = "https://euw1.api.riotgames.com";

type Reply = Response | Error;

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });
const empty = (status: number, headers?: Record<string, string>) =>
  new Response(null, { status, headers });

interface Call {
  url: string;
  headers: Record<string, string>;
}

function setup(
  replies: Reply[] = [],
  overrides: Partial<RiotClientDeps> = {},
  options?: Parameters<typeof createRiotClient>[1],
) {
  const clock = createFakeClock();
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch: RiotFetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const reply = queue.shift();
    if (!reply) throw new Error("sin respuesta programada en el test");
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const metrics = createRiotMetrics();
  const limiterOptions = { now: clock.now, sleep: clock.sleep };
  const client = createRiotClient(
    {
      fetch,
      getKey: async () => ({ key: KEY, source: "db" }),
      limiters: {
        europe: new HostLimiter(limiterOptions),
        euw1: new HostLimiter(limiterOptions),
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
      metrics,
      ...overrides,
    },
    options,
  );
  return { client, clock, calls, metrics, start: clock.now() };
}

/** Ejecuta la promesa y devuelve el error que lanza (falla el test si no lanza). */
async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("se esperaba un error y no hubo ninguno");
}

const networkError = () =>
  new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
const timeoutError = () =>
  new DOMException("The operation was aborted due to timeout", "TimeoutError");

describe("createRiotClient: peticiones y esquemas con los fixtures", () => {
  it("getAccountByRiotId: host europe, Riot ID codificado y cabecera con la key", async () => {
    const { client, calls } = setup([json(readFixtureJson("account.json"))]);
    const account = await client.getAccountByRiotId("BEJITO MAMBO", "1991", 0);
    expect(account).toEqual(readFixtureJson("account.json"));
    expect(calls).toEqual([
      {
        url: `${EUROPE}/riot/account/v1/accounts/by-riot-id/BEJITO%20MAMBO/1991`,
        headers: { "X-Riot-Token": KEY },
      },
    ]);
  });

  it("getMatchIds: host europe y query queue/start/count/startTime", async () => {
    const ids = readFixtureJson<string[]>("match-ids.json");
    const { client, calls } = setup([json(ids)]);
    const result = await client.getMatchIds(
      "anon-puuid-self",
      { start: 0, count: 10, startTime: 1_778_544_000, queue: 1750 },
      1,
    );
    expect(result).toEqual(ids);
    expect(calls[0]?.url).toBe(
      `${EUROPE}/lol/match/v5/matches/by-puuid/anon-puuid-self/ids?queue=1750&start=0&count=10&startTime=1778544000`,
    );
  });

  it("getMatchIds: sin startTime no lo envía", async () => {
    const { client, calls } = setup([json([])]);
    expect(
      await client.getMatchIds("p", { start: 100, count: 100, queue: 1750 }, 1),
    ).toEqual([]);
    expect(calls[0]?.url).toBe(
      `${EUROPE}/lol/match/v5/matches/by-puuid/p/ids?queue=1750&start=100&count=100`,
    );
  });

  it.each(
    listMatchFixtureIds(),
  )("getMatch parsea la partida %s y devuelve el JSON crudo", async (matchId) => {
    const raw = readFixtureText(`matches/${matchId}.json`);
    const { client, calls } = setup([new Response(raw)]);
    const { match, raw: returnedRaw } = await client.getMatch(matchId, 2);

    expect(calls[0]?.url).toBe(`${EUROPE}/lol/match/v5/matches/${matchId}`);
    // `raw` es el texto original byte a byte (para `rawGz`), no una reserialización.
    expect(returnedRaw).toBe(raw);
    expect(match.metadata.matchId).toBe(matchId);
    expect(match.metadata.participants).toHaveLength(18);
    expect(match.info.queueId).toBe(1750);
    expect(match.info.endOfGameResult).toBe("GameComplete");
    expect(match.info.participants).toHaveLength(18);
    const source = JSON.parse(raw);
    expect(match.info.gameCreation).toBe(source.info.gameCreation);
    expect(match.info.gameDuration).toBe(source.info.gameDuration);
    for (const [i, p] of match.info.participants.entries()) {
      const original = source.info.participants[i];
      expect(p.puuid).toBe(original.puuid);
      expect(p.placement).toBe(original.placement);
      expect(p.playerSubteamId).toBe(original.playerSubteamId);
      expect(p.win).toBe(original.win);
      expect(p.championId).toBe(original.championId);
      expect(p.playerAugment1).toBe(original.playerAugment1);
      expect(p.item0).toBe(original.item0);
      expect(p.item6).toBe(original.item6);
    }
  });

  it("getPlayerData: host euw1 y challenge 602002", async () => {
    const { client, calls } = setup([
      json(readFixtureJson("player-data.json")),
    ]);
    const data = await client.getPlayerData("anon-puuid-self", 0);
    expect(calls[0]?.url).toBe(
      `${EUW1}/lol/challenges/v1/player-data/anon-puuid-self`,
    );
    const arenaGod = data.challenges.find((c) => c.challengeId === 602002);
    expect(arenaGod).toMatchObject({ value: 75, level: "MASTER" });
  });

  it("getSummonerByPuuid: host euw1, ruta Summoner-V4 y profileIconId", async () => {
    const { client, calls } = setup([
      json({
        puuid: "anon-puuid-self",
        profileIconId: 7176,
        revisionDate: 1_790_000_000_000,
        summonerLevel: 869,
      }),
    ]);
    const data = await client.getSummonerByPuuid("anon-puuid-self", 0);
    expect(calls[0]?.url).toBe(
      `${EUW1}/lol/summoner/v4/summoners/by-puuid/anon-puuid-self`,
    );
    expect(data).toEqual({ puuid: "anon-puuid-self", profileIconId: 7176 });
  });

  it("getSummonerByPuuid: sin profileIconId es un error de esquema", async () => {
    const { client } = setup([json({ puuid: "p", summonerLevel: 1 })]);
    const error = await catchError(client.getSummonerByPuuid("p", 1));
    expect(error).toBeInstanceOf(RiotSchemaError);
  });

  it("cada método pide hueco al limitador de SU host con la prioridad indicada, antes del fetch", async () => {
    const events: string[] = [];
    const spy = (host: string): Limiter => ({
      acquire: async (priority) => {
        events.push(`acquire:${host}:${priority}`);
      },
      blockUntil: () => {},
    });
    const matchId = listMatchFixtureIds()[0] as string;
    const replies = [
      json(readFixtureJson("account.json")),
      json([]),
      new Response(readFixtureText(`matches/${matchId}.json`)),
      json(readFixtureJson("player-data.json")),
      json({ puuid: "p", profileIconId: 1 }),
    ];
    const { client } = setup([], {
      limiters: { europe: spy("europe"), euw1: spy("euw1") },
      fetch: async (url) => {
        events.push(`fetch:${new URL(url).hostname.split(".")[0]}`);
        return replies.shift() as Response;
      },
    });
    await client.getAccountByRiotId("a", "b", 0);
    await client.getMatchIds("p", { start: 0, count: 5, queue: 1750 }, 1);
    await client.getMatch(matchId, 2);
    await client.getPlayerData("p", 1);
    await client.getSummonerByPuuid("p", 1);
    expect(events).toEqual([
      "acquire:europe:0",
      "fetch:europe",
      "acquire:europe:1",
      "fetch:europe",
      "acquire:europe:2",
      "fetch:europe",
      "acquire:euw1:1",
      "fetch:euw1",
      "acquire:euw1:1",
      "fetch:euw1",
    ]);
  });

  it("valida los argumentos de getMatchIds antes de gastar una petición", async () => {
    const { client, calls } = setup();
    const query = { start: 0, count: 10, queue: 1750 };
    await expect(
      client.getMatchIds("p", { ...query, count: 101 }, 1),
    ).rejects.toThrow(RangeError);
    await expect(
      client.getMatchIds("p", { ...query, count: -1 }, 1),
    ).rejects.toThrow(RangeError);
    await expect(
      client.getMatchIds("p", { ...query, start: -1 }, 1),
    ).rejects.toThrow(RangeError);
    // `startTime` va en segundos: un epoch en ms es un error de programación.
    await expect(
      client.getMatchIds("p", { ...query, startTime: 1_778_544_000_000 }, 1),
    ).rejects.toThrow(/segundos/);
    expect(calls).toHaveLength(0);
  });

  it("acepta count 0 y count 100", async () => {
    const { client, calls } = setup([json([]), json([])]);
    await client.getMatchIds("p", { start: 0, count: 0, queue: 1750 }, 1);
    await client.getMatchIds("p", { start: 0, count: 100, queue: 1750 }, 1);
    expect(calls).toHaveLength(2);
  });
});

describe("createRiotClient: key", () => {
  it("sin key disponible lanza RiotAuthError('no key') y no llama a Riot", async () => {
    const { client, calls } = setup([], { getKey: async () => null });
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotAuthError);
    expect((error as RiotAuthError).message).toContain("no key");
    expect(calls).toHaveLength(0);
  });

  it("relee la key en cada intento (un cambio desde /admin surte efecto al instante)", async () => {
    const keys = [KEY, OTHER_KEY];
    const getKey = vi.fn(async () => ({
      key: keys.shift() as string,
      source: "db" as const,
    }));
    const { client, calls } = setup([empty(503), json([])], { getKey });
    await client.getMatchIds("p", { start: 0, count: 1, queue: 1750 }, 1);
    expect(getKey).toHaveBeenCalledTimes(2);
    expect(calls.map((c) => c.headers["X-Riot-Token"])).toEqual([
      KEY,
      OTHER_KEY,
    ]);
  });

  it("una key con espacios o saltos de línea es un fallo de auth, no un reintento de red", async () => {
    const { client, calls } = setup([], {
      getKey: async () => ({ key: "RGAPI-bad\nkey", source: "env" }),
    });
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotAuthError);
    expect((error as Error).message).not.toContain("RGAPI-bad");
    expect(calls).toHaveLength(0);
  });
});

describe("createRiotClient: 429", () => {
  it("con Retry-After espera ese tiempo, reintenta y cuenta el 429", async () => {
    const { client, clock, calls, metrics, start } = setup([
      empty(429, { "Retry-After": "3" }),
      json(readFixtureJson("account.json")),
    ]);
    const account = await client.getAccountByRiotId("BEJITO MAMBO", "1991", 0);
    expect(account.puuid).toBe("anon-puuid-self");
    expect(calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([3_000]);
    expect(clock.now() - start).toBe(3_000);
    expect(metrics.status429).toBe(1);
    expect(metrics.retries).toBe(1);
    expect(metrics.requests.account).toBe(2);
  });

  it("el Retry-After bloquea el host entero (blockUntil del limitador de ese host)", async () => {
    const blockEurope = vi.fn();
    const blockEuw1 = vi.fn();
    const { client, start } = setup(
      [empty(429, { "Retry-After": "2" }), json([])],
      {
        limiters: {
          europe: { acquire: async () => {}, blockUntil: blockEurope },
          euw1: { acquire: async () => {}, blockUntil: blockEuw1 },
        },
      },
    );
    await client.getMatchIds("a", { start: 0, count: 1, queue: 1750 }, 1);
    expect(blockEurope).toHaveBeenCalledWith(start + 2_000);
    expect(blockEuw1).not.toHaveBeenCalled();
  });

  it("sin Retry-After usa backoff exponencial con jitter", async () => {
    const { client, clock, metrics } = setup([
      empty(429),
      empty(429),
      json(readFixtureJson("account.json")),
    ]);
    await client.getAccountByRiotId("BEJITO MAMBO", "1991", 0);
    // random = 0,5: 750 ms y 1 500 ms.
    expect(clock.sleeps).toEqual([750, 1_500]);
    expect(metrics.status429).toBe(2);
  });

  it("tras 5 intentos lanza RiotRateLimitError", async () => {
    const { client, calls, metrics } = setup(
      Array.from({ length: 5 }, () => empty(429, { "Retry-After": "1" })),
    );
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotRateLimitError);
    expect((error as RiotRateLimitError).status).toBe(429);
    expect((error as Error).message).toContain("europe");
    expect((error as Error).message).toContain("/lol/match/v5/matches/EUW1_1");
    expect(calls).toHaveLength(5);
    expect(metrics.status429).toBe(5);
    expect(metrics.retries).toBe(4);
  });

  it("un Retry-After absurdo se acota", async () => {
    const { client, clock } = setup([
      empty(429, { "Retry-After": "86400" }),
      json([]),
    ]);
    await client.getMatchIds("p", { start: 0, count: 1, queue: 1750 }, 1);
    expect(clock.sleeps).toEqual([300_000]);
  });
});

describe("createRiotClient: 5xx, timeout y red", () => {
  it("reintenta un 5xx con backoff y acaba con éxito", async () => {
    const { client, clock, calls, metrics } = setup([
      empty(503),
      empty(502),
      json([]),
    ]);
    await client.getMatchIds("p", { start: 0, count: 1, queue: 1750 }, 1);
    expect(calls).toHaveLength(3);
    expect(clock.sleeps).toEqual([750, 1_500]);
    expect(metrics.retries).toBe(2);
    expect(metrics.status429).toBe(0);
  });

  it("tras 5 intentos lanza RiotRetryableError", async () => {
    const { client, clock, calls } = setup(
      Array.from({ length: 5 }, () => empty(500)),
    );
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotRetryableError);
    expect((error as RiotRetryableError).status).toBe(500);
    expect(calls).toHaveLength(5);
    expect(clock.sleeps).toEqual([750, 1_500, 3_000, 6_000]);
  });

  it("un error de red se reintenta y se recupera", async () => {
    const { client, calls } = setup([networkError(), json([])]);
    await client.getMatchIds("p", { start: 0, count: 1, queue: 1750 }, 1);
    expect(calls).toHaveLength(2);
  });

  it("un timeout persistente acaba en RiotRetryableError", async () => {
    const { client, calls } = setup(
      Array.from({ length: 5 }, () => timeoutError()),
    );
    const error = await catchError(client.getPlayerData("p", 1));
    expect(error).toBeInstanceOf(RiotRetryableError);
    expect((error as Error).message).toContain("timeout");
    expect((error as Error).message).toContain("euw1");
    expect(calls).toHaveLength(5);
  });

  it("un error de red persistente indica el código, no el mensaje", async () => {
    const { client } = setup(Array.from({ length: 5 }, () => networkError()));
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotRetryableError);
    expect((error as Error).message).toContain("ECONNRESET");
  });
});

describe("createRiotClient: errores sin reintento", () => {
  it("404 lanza RiotNotFoundError con el cuerpo real de match-404.json", async () => {
    const fixture = readFixtureJson<{ status: number; body: unknown }>(
      "match-404.json",
    );
    const { client, calls, clock, metrics } = setup([
      json(fixture.body, fixture.status),
    ]);
    const error = await catchError(client.getMatch("EUW1_7300000001", 2));
    expect(error).toBeInstanceOf(RiotNotFoundError);
    expect(error).toBeInstanceOf(RiotError);
    expect((error as RiotNotFoundError).status).toBe(404);
    expect((error as Error).message).toBe(
      "Riot europe /lol/match/v5/matches/EUW1_7300000001 -> 404",
    );
    expect(calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
    expect(metrics.retries).toBe(0);
  });

  it.each([
    401, 403,
  ])("%i lanza RiotAuthError sin reintentar", async (status) => {
    const { client, calls, clock } = setup([
      json({ status: { message: "Forbidden", status_code: status } }, status),
    ]);
    const error = await catchError(client.getAccountByRiotId("a", "b", 0));
    expect(error).toBeInstanceOf(RiotAuthError);
    expect((error as RiotAuthError).status).toBe(status);
    expect(calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });

  it.each([
    400, 405, 422,
  ])("%i lanza RiotBadRequestError sin reintentar", async (status) => {
    const { client, calls } = setup([empty(status)]);
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotBadRequestError);
    expect((error as RiotBadRequestError).status).toBe(status);
    expect(calls).toHaveLength(1);
  });

  it("un 200 que no cumple el esquema lanza RiotSchemaError sin reintentar", async () => {
    const { client, calls } = setup([json({ puuid: "x" })]);
    const error = await catchError(client.getAccountByRiotId("a", "b", 0));
    expect(error).toBeInstanceOf(RiotSchemaError);
    expect((error as Error).message).toContain("gameName");
    expect(calls).toHaveLength(1);
  });

  it("un 200 con un cuerpo que no es JSON lanza RiotSchemaError", async () => {
    const { client } = setup([new Response("<html>oops</html>")]);
    const error = await catchError(client.getMatch("EUW1_1", 2));
    expect(error).toBeInstanceOf(RiotSchemaError);
  });

  it("el mensaje de un error de ids no incluye el puuid", async () => {
    const { client } = setup([empty(404)]);
    const error = await catchError(
      client.getMatchIds(
        "puuid-secreto-123",
        { start: 0, count: 1, queue: 1750 },
        1,
      ),
    );
    expect((error as Error).message).toBe(
      "Riot europe /lol/match/v5/matches/by-puuid/:puuid/ids -> 404",
    );
  });
});

describe("createRiotClient: validateKey", () => {
  it("usa la key candidata (no getKey) contra Account-V1 del Riot ID de validación", async () => {
    const getKey = vi.fn(async () => ({ key: KEY, source: "db" as const }));
    const { client, calls, metrics } = setup(
      [json(readFixtureJson("account.json"))],
      { getKey },
    );
    expect(await client.validateKey(OTHER_KEY)).toBe("ok");
    expect(getKey).not.toHaveBeenCalled();
    expect(calls).toEqual([
      {
        url: `${EUROPE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(DEFAULT_VALIDATION_RIOT_ID.gameName)}/${DEFAULT_VALIDATION_RIOT_ID.tagLine}`,
        headers: { "X-Riot-Token": OTHER_KEY },
      },
    ]);
    expect(metrics.requests).toMatchObject({ validate: 1, account: 0 });
  });

  it("el Riot ID de validación es configurable", async () => {
    const { client, calls } = setup(
      [json(readFixtureJson("account.json"))],
      {},
      { validationRiotId: { gameName: "Otro Jugador", tagLine: "EUW" } },
    );
    await client.validateKey(KEY);
    expect(calls[0]?.url).toContain("/by-riot-id/Otro%20Jugador/EUW");
  });

  it("quita espacios alrededor de la key pegada", async () => {
    const { client, calls } = setup([json(readFixtureJson("account.json"))]);
    await client.validateKey(`  ${KEY}\n`);
    expect(calls[0]?.headers["X-Riot-Token"]).toBe(KEY);
  });

  it.each([401, 403])("%i -> 'invalid'", async (status) => {
    const { client, calls } = setup([empty(status)]);
    expect(await client.validateKey(KEY)).toBe("invalid");
    expect(calls).toHaveLength(1);
  });

  it("una key mal formada es 'invalid' sin llamar a Riot", async () => {
    const { client, calls } = setup();
    expect(await client.validateKey("")).toBe("invalid");
    expect(await client.validateKey("RGAPI-con espacio")).toBe("invalid");
    expect(await client.validateKey("RGAPI-ñ")).toBe("invalid");
    expect(calls).toHaveLength(0);
  });

  it("un fallo que no prueba que la key sea mala es 'error'", async () => {
    // 5xx persistente (un solo reintento en validación).
    const server = setup([empty(500), empty(500)]);
    expect(await server.client.validateKey(KEY)).toBe("error");
    expect(server.calls).toHaveLength(2);

    const limited = setup([
      empty(429, { "Retry-After": "1" }),
      empty(429, { "Retry-After": "1" }),
    ]);
    expect(await limited.client.validateKey(KEY)).toBe("error");

    const network = setup([networkError(), networkError()]);
    expect(await network.client.validateKey(KEY)).toBe("error");

    const missing = setup([empty(404)]);
    expect(await missing.client.validateKey(KEY)).toBe("error");

    const garbage = setup([json({ nope: true })]);
    expect(await garbage.client.validateKey(KEY)).toBe("error");
  });

  it("pide hueco al limitador de europe con prioridad interactiva (0)", async () => {
    const acquire = vi.fn(async () => {});
    const { client } = setup([json(readFixtureJson("account.json"))], {
      limiters: {
        europe: { acquire, blockUntil: () => {} },
        euw1: { acquire: async () => {}, blockUntil: () => {} },
      },
    });
    await client.validateKey(KEY);
    expect(acquire).toHaveBeenCalledWith(0);
  });
});

describe("createRiotClient: la key no se filtra", () => {
  it("ningún error ni métrica contiene la key, ni siquiera si fetch la cita en su mensaje", async () => {
    const leaky = () =>
      new TypeError(`Headers.append: "${KEY}" is an invalid header value`, {
        cause: { code: "ERR_INVALID_CHAR", detail: KEY },
      });
    type Client = ReturnType<typeof setup>["client"];
    const scenarios: Array<{
      name: string;
      replies: Reply[];
      call: (client: Client) => Promise<unknown>;
    }> = [
      {
        name: "red",
        replies: Array.from({ length: 5 }, leaky),
        call: (c) => c.getMatch("EUW1_1", 2),
      },
      {
        name: "500",
        replies: Array.from({ length: 5 }, () => empty(500)),
        call: (c) => c.getMatch("EUW1_1", 2),
      },
      {
        name: "429",
        replies: Array.from({ length: 5 }, () => empty(429)),
        call: (c) => c.getMatch("EUW1_1", 2),
      },
      {
        name: "401",
        replies: [empty(401)],
        call: (c) => c.getMatch("EUW1_1", 2),
      },
      {
        name: "403",
        replies: [empty(403)],
        call: (c) => c.getPlayerData("p", 2),
      },
      {
        name: "404",
        replies: [empty(404)],
        call: (c) => c.getMatch("EUW1_1", 2),
      },
      {
        name: "400",
        replies: [empty(400)],
        call: (c) => c.getMatch("EUW1_1", 2),
      },
      {
        name: "esquema",
        replies: [json({})],
        call: (c) => c.getAccountByRiotId("a", "b", 0),
      },
    ];
    for (const { name, replies, call } of scenarios) {
      const { client, metrics } = setup(replies);
      const error = await catchError(call(client));
      expect(error, name).toBeInstanceOf(RiotError);
      const serialized = [
        String(error),
        (error as Error).message,
        (error as Error).stack ?? "",
        JSON.stringify(error, Object.getOwnPropertyNames(error)),
        JSON.stringify(metrics),
      ].join("\n");
      expect(serialized, name).not.toContain(KEY);
      expect((error as Error).cause, name).toBeUndefined();
    }
  });

  it("validateKey no devuelve ni conserva la key candidata", async () => {
    const { client, metrics } = setup([empty(403)]);
    const result = await client.validateKey(OTHER_KEY);
    expect(result).toBe("invalid");
    expect(JSON.stringify(metrics)).not.toContain(OTHER_KEY);
  });
});

describe("createRiotClient: métricas", () => {
  it("cuenta las peticiones por endpoint (cada intento cuenta) y la última petición", async () => {
    const { client, metrics, clock } = setup([
      json(readFixtureJson("account.json")), // account
      json([]), // matchIds
      empty(500), // match (intento fallido)
      new Response(readFixtureText(`matches/${listMatchFixtureIds()[0]}.json`)), // match
      json(readFixtureJson("player-data.json")), // playerData
      json({ puuid: "p", profileIconId: 1 }), // summoner
      json(readFixtureJson("account.json")), // validate
    ]);
    expect(metrics.lastRequestAt).toBeNull();
    await client.getAccountByRiotId("a", "b", 0);
    await client.getMatchIds("p", { start: 0, count: 1, queue: 1750 }, 1);
    await client.getMatch(listMatchFixtureIds()[0] as string, 2);
    await client.getPlayerData("p", 1);
    await client.getSummonerByPuuid("p", 1);
    await client.validateKey(KEY);
    expect(metrics.requests).toEqual({
      account: 1,
      matchIds: 1,
      match: 2,
      playerData: 1,
      summoner: 1,
      validate: 1,
    });
    expect(metrics.retries).toBe(1);
    expect(metrics.status429).toBe(0);
    expect(metrics.lastRequestAt).toBe(clock.now());
  });
});

describe("computeBackoffMs", () => {
  it("crece de forma exponencial con jitter entre la mitad y el total", () => {
    expect(computeBackoffMs(1, () => 0)).toBe(500);
    expect(computeBackoffMs(1, () => 0.999999)).toBe(1_000);
    expect(computeBackoffMs(2, () => 0)).toBe(1_000);
    expect(computeBackoffMs(3, () => 0.5)).toBe(3_000);
    expect(computeBackoffMs(5, () => 0)).toBe(8_000);
  });

  it("tiene un tope de 30 s", () => {
    expect(computeBackoffMs(6, () => 0.999999)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoffMs(20, () => 0)).toBe(BACKOFF_MAX_MS / 2);
  });
});
