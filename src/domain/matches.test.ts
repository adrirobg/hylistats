import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { participants, profiles } from "@/db/schema";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  loadMatchFixtures,
  type MatchFixture,
  promoteTrioToFirst,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { storeMatch } from "./ingest";
import {
  getMatchDetail,
  getMatchList,
  getProfileMatches,
  type MatchListFilters,
} from "./matches";

// Contra `hylistats_test` con las 10 partidas reales de `tests/fixtures/matches/` (todas de la cola
// 1750; el jugador de prueba es `BEJITO MAMBO` y sus compañeros habituales Player013 y Player115).

const db = getTestDb();
const fixtures = loadMatchFixtures();
const seasonStart = new Date("2026-05-12T00:00:00Z");
const [FIRST, SECOND, THIRD] = fixtures;

beforeEach(truncateAll);
afterAll(closeDb);

async function storeAll() {
  for (const f of fixtures) await storeMatch(db, f.match, f.raw);
}

async function storeVariant(
  fixture: MatchFixture,
  matchId: string,
  mutate: Parameters<typeof variantOf>[2],
) {
  const v = variantOf(fixture, matchId, mutate);
  await storeMatch(db, v.match, v.raw);
}

const list = (filters: Partial<MatchListFilters> = {}) =>
  getMatchList(db, SELF_PUUID, seasonStart, { limit: 50, ...filters });

const ids = (rows: { matchId: string }[]) => rows.map((r) => r.matchId);

/** Los `matchId` del jugador de prueba con ese puesto, en las 10 partidas reales. */
const placements = new Map(
  fixtures.map((f) => [
    f.id,
    f.match.info.participants.find((p) => p.puuid === SELF_PUUID)?.placement ??
      0,
  ]),
);

const gameTag = (gameName: string) => ({ gameName, tagLine: "ANON" });

/** El `puuid` de un participante de una fixture, por su nombre. */
function puuidOf(fixture: MatchFixture, gameName: string): string {
  const found = fixture.match.info.participants.find(
    (p) => p.riotIdGameName === gameName,
  );
  if (!found) throw new Error(`${gameName} no juega ${fixture.id}`);
  return found.puuid;
}

/** Cambia el nombre de un participante en una partida ya guardada. */
function rename(matchId: string, puuid: string, gameName: string) {
  return db
    .update(participants)
    .set({ riotIdGameName: gameName })
    .where(
      and(eq(participants.matchId, matchId), eq(participants.puuid, puuid)),
    );
}

describe("getMatchList", () => {
  it("todas las partidas del jugador, la más reciente primero, con puesto, duración y campeón", async () => {
    await storeAll();
    const { rows, total } = await list();

    const expected = [...fixtures]
      .sort((a, b) => b.match.info.gameCreation - a.match.info.gameCreation)
      .map((f) => f.id);
    expect(ids(rows)).toEqual(expected);
    expect(total).toBe(10);
    // Una fila real: EUW1_7997909147 (Rakan, 5º, 1504 s).
    expect(rows.find((r) => r.matchId === FIRST.id)).toMatchObject({
      gameCreation: 1790618903881,
      gameDuration: 1504,
      championId: 497,
      championName: "Rakan",
      placement: 5,
    });
    // Orden estrictamente descendente en el tiempo.
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].gameCreation).toBeGreaterThan(rows[i].gameCreation);
    }
  });

  it("cada partida trae sus dos compañeros de trío (Riot ID), nunca al propio jugador ni a otro equipo", async () => {
    await storeAll();
    const { rows } = await list();
    for (const row of rows) {
      expect(row.trio).toHaveLength(2);
      expect(row.trio.map((m) => m.gameName)).not.toContain("BEJITO MAMBO");
    }
    // En la primera partida el trío es Player013 y Player152 (subteam 2), por orden de participante.
    expect(rows.find((r) => r.matchId === FIRST.id)?.trio).toEqual([
      { gameName: "Player013", tagLine: "ANON" },
      { gameName: "Player152", tagLine: "ANON" },
    ]);
  });

  it("limit acota las filas más recientes y total sigue contando todas", async () => {
    await storeAll();
    const { rows, total } = await list({ limit: 3 });
    expect(rows).toHaveLength(3);
    expect(total).toBe(10);
    const all = await list();
    expect(ids(rows)).toEqual(ids(all.rows).slice(0, 3));
  });

  it("solo cuenta la temporada y las colas de Arena tríos", async () => {
    await storeAll();
    await storeVariant(SECOND, "EUW1_TEST_Q1740", (j) => {
      j.info.queueId = 1740;
      j.info.gameCreation = 1_790_700_000_000;
    });
    await storeVariant(SECOND, "EUW1_TEST_Q400", (j) => {
      j.info.queueId = 400; // no es Arena
      j.info.gameCreation = 1_790_700_100_000;
    });
    // Antes del inicio de la temporada.
    await storeVariant(SECOND, "EUW1_TEST_OLD", (j) => {
      j.info.gameCreation = new Date("2026-05-01T00:00:00Z").getTime();
    });

    const { rows, total } = await list();
    expect(total).toBe(11);
    expect(rows[0].matchId).toBe("EUW1_TEST_Q1740");
    expect(ids(rows)).not.toContain("EUW1_TEST_Q400");
    expect(ids(rows)).not.toContain("EUW1_TEST_OLD");
  });

  it("sin partidas: lista vacía y total 0; un limit no positivo tampoco consulta", async () => {
    expect(await list()).toEqual({ rows: [], total: 0 });
    await storeAll();
    expect(await list({ limit: 0 })).toEqual({ rows: [], total: 0 });
  });

  describe("filtros", () => {
    it("puesto=1 deja los 1º y top3 los tres primeros puestos", async () => {
      await storeAll();
      await storeVariant(SECOND, "EUW1_TEST_FIRST", (j) => {
        j.info.gameCreation = 1_790_700_000_000;
        promoteTrioToFirst(j, SELF_PUUID);
      });

      const firsts = await list({ puesto: "1" });
      expect(ids(firsts.rows)).toEqual(["EUW1_TEST_FIRST"]);
      expect(firsts.total).toBe(1);

      const top3 = await list({ puesto: "top3" });
      const expected =
        1 + [...placements.values()].filter((p) => p <= 3).length;
      expect(top3.total).toBe(expected);
      expect(top3.rows.every((r) => r.placement <= 3)).toBe(true);
      expect(top3.rows[0].matchId).toBe("EUW1_TEST_FIRST");
    });

    it("championIds filtra por campeón; una lista vacía no devuelve nada", async () => {
      await storeAll();
      const blitz = await list({ championIds: [53] });
      expect(blitz.total).toBeGreaterThan(0);
      expect(blitz.rows.every((r) => r.championId === 53)).toBe(true);
      expect(await list({ championIds: [] })).toEqual({ rows: [], total: 0 });
      expect(await list({ championIds: [999999] })).toEqual({
        rows: [],
        total: 0,
      });
    });

    it("companero: solo las partidas en las que jugó en el mismo equipo (sin mayúsculas ni espacios)", async () => {
      await storeAll();
      // Player013 juega las 10; Player046 cinco; Player152 una (la primera, EUW1_7997909147).
      expect((await list({ companero: gameTag("Player013") })).total).toBe(10);
      const with046 = await list({ companero: gameTag("Player046") });
      expect(with046.total).toBe(5);
      const with152 = await list({
        companero: { gameName: "  player152 ", tagLine: "anon" },
      });
      expect(ids(with152.rows)).toEqual([FIRST.id]);
    });

    it("companero: un jugador que estuvo en otro equipo, o que no existe, no cuenta", async () => {
      await storeAll();
      // Player141 juega en la primera partida, pero en el equipo 6, no en el del jugador.
      expect(await list({ companero: gameTag("Player141") })).toEqual({
        rows: [],
        total: 0,
      });
      expect(await list({ companero: gameTag("Nadie") })).toEqual({
        rows: [],
        total: 0,
      });
    });

    it("companero: casa también las partidas de antes de cambiarse el nombre (mismo puuid)", async () => {
      await storeAll();
      // Player046 (cinco partidas) se renombra solo en su partida más antigua: es el mismo puuid.
      const before = await list({ companero: gameTag("Player046") });
      const oldest = before.rows.at(-1)?.matchId as string;
      const fixture = fixtures.find((f) => f.id === oldest) as MatchFixture;
      await rename(oldest, puuidOf(fixture, "Player046"), "AntiguoNombre");

      // Con el nombre nuevo (las otras cuatro) o el antiguo, salen las cinco: el filtro coincide con
      // los 5 que cuenta la pestaña Compañeros.
      expect((await list({ companero: gameTag("Player046") })).total).toBe(5);
      expect((await list({ companero: gameTag("AntiguoNombre") })).total).toBe(
        5,
      );
    });

    it("companero con acentos y mayúsculas: lower() de Postgres y el de JS coinciden", async () => {
      await storeAll();
      await rename(FIRST.id, puuidOf(FIRST, "Player152"), "Ñandú Épico");
      const found = await list({
        companero: { gameName: "ñANDÚ épico", tagLine: "ANON" },
      });
      expect(ids(found.rows)).toEqual([FIRST.id]);
    });

    it("los filtros se combinan (y total cuenta con todos ellos)", async () => {
      await storeAll();
      const both = await list({
        puesto: "top3",
        companero: gameTag("Player046"),
      });
      expect(both.total).toBe(
        (await list({ companero: gameTag("Player046") })).rows.filter(
          (r) => r.placement <= 3,
        ).length,
      );
    });
  });
});

describe("getMatchDetail", () => {
  it("los 6 equipos por puesto con 3 jugadores, el propio resaltado y el jugador marcado", async () => {
    await storeAll();
    const detail = await getMatchDetail(db, SELF_PUUID, FIRST.id, seasonStart);
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail).toMatchObject({
      matchId: FIRST.id,
      gameCreation: 1790618903881,
      gameDuration: 1504,
      championId: 497,
      championName: "Rakan",
      placement: 5,
    });
    expect(detail.teams.map((t) => t.placement)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(detail.teams.every((t) => t.players.length === 3)).toBe(true);
    // El propio equipo es el 5º y es el único resaltado.
    expect(
      detail.teams.filter((t) => t.isOwnTeam).map((t) => t.placement),
    ).toEqual([5]);
    const selves = detail.teams
      .flatMap((t) => t.players)
      .filter((p) => p.isSelf);
    expect(selves).toHaveLength(1);
    expect(selves[0]).toMatchObject({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
      championName: "Rakan",
      kills: 5,
      deaths: 9,
      assists: 10,
      damage: 9451,
      gold: 10026,
      level: 15,
    });
    // Todos los jugadores del equipo propio están en él.
    const own = detail.teams.find((t) => t.isOwnTeam);
    expect(own?.players.map((p) => p.gameName)).toEqual([
      "Player013",
      "BEJITO MAMBO",
      "Player152",
    ]);
  });

  it("augments e items sin los huecos (0), en el orden de la partida; el amuleto va el último", async () => {
    await storeAll();
    const detail = await getMatchDetail(db, SELF_PUUID, FIRST.id, seasonStart);
    const self = detail?.teams.flatMap((t) => t.players).find((p) => p.isSelf);
    // playerAugment1..6 = 181, 177, 313, 18, 0, 0 e item0..item6 = ..., 0 (item5), 3348 (amuleto).
    expect(self?.augments).toEqual([181, 177, 313, 18]);
    expect(self?.items).toEqual([447123, 223158, 223084, 226665, 447109, 3348]);
  });

  it("null si la partida no existe, no es del jugador, es de otra cola o está fuera de temporada", async () => {
    await storeAll();
    await storeVariant(SECOND, "EUW1_TEST_Q400", (j) => {
      j.info.queueId = 400;
    });
    await storeVariant(SECOND, "EUW1_TEST_OLD", (j) => {
      j.info.gameCreation = new Date("2026-05-01T00:00:00Z").getTime();
    });
    const detail = (matchId: string, puuid = SELF_PUUID) =>
      getMatchDetail(db, puuid, matchId, seasonStart);

    expect(await detail("EUW1_NO_EXISTE")).toBeNull();
    expect(await detail("EUW1_TEST_Q400")).toBeNull();
    expect(await detail("EUW1_TEST_OLD")).toBeNull();
    // Player141 juega la primera partida, pero el detalle es de "su" jugador: otro puuid = otro perfil.
    expect(await detail(THIRD.id, "anon-puuid-de-otro")).toBeNull();
    expect(await detail(THIRD.id)).not.toBeNull();
  });

  it("la partida del jugador de la 1740 también tiene detalle", async () => {
    await storeAll();
    await storeVariant(SECOND, "EUW1_TEST_Q1740", (j) => {
      j.info.queueId = 1740;
      j.info.gameCreation = 1_790_700_000_000;
    });
    expect(
      await getMatchDetail(db, SELF_PUUID, "EUW1_TEST_Q1740", seasonStart),
    ).not.toBeNull();
  });

  it("no contiene la clave puuid ni su valor", async () => {
    await storeAll();
    const detail = await getMatchDetail(db, SELF_PUUID, FIRST.id, seasonStart);
    const found = await list();
    for (const value of [detail, found]) {
      const json = JSON.stringify(value);
      expect(json).not.toContain("puuid");
      expect(json).not.toContain("anon-puuid");
    }
  });
});

describe("getProfileMatches", () => {
  async function insertProfile(
    overrides: Partial<typeof profiles.$inferInsert> = {},
  ) {
    const [profile] = await db
      .insert(profiles)
      .values({
        gameName: "BEJITO MAMBO",
        tagLine: "1991",
        riotIdNorm: "bejito mambo#1991",
        puuid: SELF_PUUID,
        status: "active",
        ...overrides,
      })
      .returning();
    return profile;
  }

  it("resuelve el puuid del perfil y devuelve la lista y el detalle pedido", async () => {
    await storeAll();
    const profile = await insertProfile();
    const result = await getProfileMatches(db, profile.id, seasonStart, {
      filters: { limit: 5 },
      matchId: FIRST.id,
    });
    expect(result.list.rows).toHaveLength(5);
    expect(result.list.total).toBe(10);
    expect(result.detail?.matchId).toBe(FIRST.id);
    expect(JSON.stringify(result)).not.toContain("anon-puuid");
  });

  it("sin matchId no hay detalle; sin puuid o con un perfil inexistente, todo vacío", async () => {
    await storeAll();
    const profile = await insertProfile();
    expect(
      (
        await getProfileMatches(db, profile.id, seasonStart, {
          filters: { limit: 5 },
          matchId: null,
        })
      ).detail,
    ).toBeNull();

    const empty = { list: { rows: [], total: 0 }, detail: null };
    const request = { filters: { limit: 5 }, matchId: FIRST.id };
    expect(await getProfileMatches(db, 9999, seasonStart, request)).toEqual(
      empty,
    );
    await db.update(profiles).set({ puuid: null });
    expect(
      await getProfileMatches(db, profile.id, seasonStart, request),
    ).toEqual(empty);
  });
});
