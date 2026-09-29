import { gunzipSync } from "node:zlib";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { matches, participants } from "@/db/schema";
import { getSeasonStart } from "@/lib/config";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  loadMatchFixtures,
  type MatchFixture,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { matchToRows, storeMatch } from "./ingest";
import { getPlayerRows } from "./queries";

const db = getTestDb();
const fixtures = loadMatchFixtures();
const [first] = fixtures;

beforeEach(truncateAll);
afterAll(closeDb);

async function countRows() {
  const [m] = await db.select({ n: count() }).from(matches);
  const [p] = await db.select({ n: count() }).from(participants);
  return { matches: m.n, participants: p.n };
}

async function storeFixture(fixture: MatchFixture) {
  return storeMatch(db, fixture.match, fixture.raw);
}

describe("matchToRows", () => {
  const rows = matchToRows(first.match);
  // Lo que se compara sale del JSON crudo, no del DTO ya mapeado.
  const json = JSON.parse(first.raw) as {
    metadata: { matchId: string };
    info: Record<string, unknown> & {
      participants: Array<Record<string, number | string | boolean>>;
    };
  };

  it("mapea la partida", () => {
    expect(rows.match).toEqual({
      matchId: "EUW1_7997909147",
      queueId: 1750,
      gameCreation: json.info.gameCreation,
      gameStartTimestamp: json.info.gameStartTimestamp,
      gameEndTimestamp: json.info.gameEndTimestamp,
      gameDuration: json.info.gameDuration,
      gameVersion: json.info.gameVersion,
      endOfGameResult: "GameComplete",
    });
    // Sin `rawGz`: lo añade `storeMatch`, que es quien tiene el JSON original.
    expect(rows.match).not.toHaveProperty("rawGz");
  });

  it("devuelve los 18 participantes con augments (6) e items (7)", () => {
    expect(rows.participants).toHaveLength(18);
    expect(new Set(rows.participants.map((p) => p.puuid)).size).toBe(18);
    for (const p of rows.participants) {
      expect(p.matchId).toBe("EUW1_7997909147");
      expect(p.augments).toHaveLength(6);
      expect(p.items).toHaveLength(7);
    }
  });

  it("copia los campos del participante en el orden de Riot", () => {
    const raw = json.info.participants.find((p) => p.puuid === SELF_PUUID);
    const me = rows.participants.find((p) => p.puuid === SELF_PUUID);
    expect(raw).toBeDefined();
    expect(me).toMatchObject({
      participantId: raw?.participantId,
      riotIdGameName: "BEJITO MAMBO",
      riotIdTagline: "1991",
      championId: 497,
      championName: "Rakan",
      placement: 5,
      playerSubteamId: 2,
      win: false,
      kills: raw?.kills,
      deaths: raw?.deaths,
      assists: raw?.assists,
      totalDamageDealtToChampions: raw?.totalDamageDealtToChampions,
      goldEarned: raw?.goldEarned,
      champLevel: raw?.champLevel,
    });
    expect(me?.augments).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => raw?.[`playerAugment${n}`]),
    );
    expect(me?.items).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((n) => raw?.[`item${n}`]),
    );
  });

  it("endOfGameResult ausente -> null", () => {
    const { match } = variantOf(first, "EUW1_X", (j) => {
      delete (j.info as Record<string, unknown>).endOfGameResult;
    });
    expect(matchToRows(match).match.endOfGameResult).toBeNull();
  });
});

describe("storeMatch", () => {
  it("guarda la partida y sus 18 participantes", async () => {
    expect(await storeFixture(first)).toEqual({ inserted: true });
    expect(await countRows()).toEqual({ matches: 1, participants: 18 });
  });

  it("es idempotente: guardar dos veces el mismo fixture deja 1 partida y 18 participantes", async () => {
    expect(await storeFixture(first)).toEqual({ inserted: true });
    expect(await storeFixture(first)).toEqual({ inserted: false });
    expect(await countRows()).toEqual({ matches: 1, participants: 18 });
  });

  it("guardar en paralelo la misma partida también deja una sola copia", async () => {
    const results = await Promise.all([
      storeFixture(first),
      storeFixture(first),
      storeFixture(first),
    ]);
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(await countRows()).toEqual({ matches: 1, participants: 18 });
  });

  it("rawGz descomprime al JSON original", async () => {
    await storeFixture(first);
    const [row] = await db
      .select({ rawGz: matches.rawGz })
      .from(matches)
      .where(eq(matches.matchId, first.id));
    expect(row.rawGz).toBeInstanceOf(Buffer);
    // Magic number de gzip.
    expect(row.rawGz?.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
    expect(gunzipSync(row.rawGz as Buffer).toString("utf8")).toBe(first.raw);
  });

  it("guarda las 10 partidas reales", async () => {
    for (const fixture of fixtures) await storeFixture(fixture);
    expect(await countRows()).toEqual({ matches: 10, participants: 180 });
  });

  it("no toca la partida ya guardada aunque llegue otro contenido", async () => {
    await storeFixture(first);
    const changed = variantOf(first, first.id, (j) => {
      j.info.gameCreation = 1;
    });
    expect(await storeMatch(db, changed.match, changed.raw)).toEqual({
      inserted: false,
    });
    const [row] = await db
      .select({ gameCreation: matches.gameCreation })
      .from(matches)
      .where(eq(matches.matchId, first.id));
    expect(row.gameCreation).toBe(first.match.info.gameCreation);
  });
});

describe("getPlayerRows", () => {
  const seasonStart = getSeasonStart("2026-05-12T00:00:00Z");

  it("devuelve las partidas del jugador en orden cronológico", async () => {
    for (const fixture of fixtures) await storeFixture(fixture);
    const rows = await getPlayerRows(db, SELF_PUUID, seasonStart);
    expect(rows.map((r) => r.matchId)).toEqual(fixtures.map((f) => f.id));
    expect(rows.map((r) => r.placement)).toEqual([
      5, 3, 3, 3, 5, 6, 4, 4, 2, 2,
    ]);
    expect(rows[0]).toEqual({
      matchId: "EUW1_7997909147",
      gameCreation: 1790618903881,
      championId: 497,
      championName: "Rakan",
      placement: 5,
      playerSubteamId: 2,
    });
    // gameCreation llega como number (columna bigint en modo number).
    expect(typeof rows[0].gameCreation).toBe("number");
  });

  it("filtra por cola y por inicio de temporada", async () => {
    for (const fixture of fixtures) await storeFixture(fixture);
    const store = (id: string, mutate: Parameters<typeof variantOf>[2]) => {
      const v = variantOf(first, id, mutate);
      return storeMatch(db, v.match, v.raw);
    };
    // Otra cola (Arena antigua 1700): no cuenta aunque sea reciente.
    await store("EUW1_TEST_OTHER_QUEUE", (j) => {
      j.info.queueId = 1700;
    });
    // Un ms antes del inicio de temporada: no cuenta.
    await store("EUW1_TEST_PRE_SEASON", (j) => {
      j.info.gameCreation = seasonStart.getTime() - 1;
    });
    // Justo en el inicio de temporada: cuenta (`>=`).
    await store("EUW1_TEST_SEASON_START", (j) => {
      j.info.gameCreation = seasonStart.getTime();
    });

    const rows = await getPlayerRows(db, SELF_PUUID, seasonStart);
    const ids = rows.map((r) => r.matchId);
    expect(ids).toHaveLength(11);
    expect(ids[0]).toBe("EUW1_TEST_SEASON_START");
    expect(ids.slice(1)).toEqual(fixtures.map((f) => f.id));
    expect(ids).not.toContain("EUW1_TEST_OTHER_QUEUE");
    expect(ids).not.toContain("EUW1_TEST_PRE_SEASON");
  });

  it("un inicio de temporada posterior recorta las partidas (inclusivo)", async () => {
    for (const fixture of fixtures) await storeFixture(fixture);
    // Desde el gameCreation de la partida #5: cuentan #5..#9 (5 partidas).
    const from = new Date(fixtures[5].match.info.gameCreation);
    const rows = await getPlayerRows(db, SELF_PUUID, from);
    expect(rows.map((r) => r.matchId)).toEqual(
      fixtures.slice(5).map((f) => f.id),
    );
    // Desde justo después de la última: ninguna.
    const after = new Date(fixtures[9].match.info.gameCreation + 1);
    expect(await getPlayerRows(db, SELF_PUUID, after)).toEqual([]);
  });

  it("solo devuelve al jugador pedido", async () => {
    for (const fixture of fixtures) await storeFixture(fixture);
    // 013 juega las 10 partidas; 152 solo la #0; un puuid desconocido, ninguna.
    expect(await getPlayerRows(db, "anon-puuid-013", seasonStart)).toHaveLength(
      10,
    );
    expect(await getPlayerRows(db, "anon-puuid-152", seasonStart)).toHaveLength(
      1,
    );
    expect(await getPlayerRows(db, "anon-puuid-nadie", seasonStart)).toEqual(
      [],
    );
  });
});
