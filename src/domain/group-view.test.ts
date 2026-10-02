import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { groupMembers, matches, profiles } from "@/db/schema";
import type { ChampionCatalog } from "@/lib/ddragon";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  type FixtureJson,
  loadMatchFixtures,
  variantOf,
} from "../../tests/helpers/matches";
import { computeSeasonTable, type SeasonMatchRow } from "./group-season";
import { type AwardedTitle, titlesOf } from "./group-titles";
import {
  loadGroupView,
  loadProfileGroupData,
  memberKey,
  withDisplayNames,
} from "./group-view";
import { storeMatch } from "./ingest";

const db = getTestDb();
const [fixture] = loadMatchFixtures();
const seasonStart = new Date("2026-05-12T00:00:00Z");
// Jueves 2026-10-01, 14:00 Madrid: día de juego 2026-10-01; semana del lunes 2026-09-28.
const now = Date.UTC(2026, 9, 1, 12, 0, 0);

beforeEach(truncateAll);
afterAll(closeDb);

interface Team {
  puuids: string[];
  placement: number;
  /** Daño a campeones por jugador (por defecto 1000). */
  damage?: Record<string, number>;
}

type LooseParticipant = FixtureJson["info"]["participants"][number] & {
  totalDamageDealtToChampions: number;
};

let matchCounter = 0;

/**
 * Guarda una partida de Arena (cola 1750) a partir de una real: `teams` ocupan los subteams 1..n
 * (hasta 3 jugadores por equipo; los huecos los rellenan anónimos únicos) y el resto de equipos
 * recibe los puestos libres. `startMs` es el inicio (y la creación) de la partida.
 */
async function storePlay(startMs: number, teams: Team[]) {
  matchCounter += 1;
  const matchId = `EUW1_GRP_${matchCounter}`;
  const variant = variantOf(fixture, matchId, (json) => {
    json.info.gameCreation = startMs;
    (
      json.info as unknown as { gameStartTimestamp: number }
    ).gameStartTimestamp = startMs;
    const free = [1, 2, 3, 4, 5, 6].filter(
      (p) => !teams.some((t) => t.placement === p),
    );
    for (const [n, participant] of json.info.participants.entries()) {
      participant.puuid = `anon-${matchId}-${n}`;
    }
    for (let sub = 1; sub <= 6; sub += 1) {
      const team = teams[sub - 1];
      const placement = team?.placement ?? (free.shift() as number);
      const players = json.info.participants.filter(
        (p) => p.playerSubteamId === sub,
      ) as LooseParticipant[];
      for (const [i, participant] of players.entries()) {
        participant.placement = placement;
        participant.win = placement <= 3;
        if (participant.subteamPlacement !== undefined) {
          participant.subteamPlacement = placement;
        }
        const puuid = team?.puuids[i];
        if (puuid) participant.puuid = puuid;
        participant.totalDamageDealtToChampions =
          team?.damage?.[participant.puuid] ?? 1000;
      }
    }
  });
  await storeMatch(db, variant.match, variant.raw);
}

async function insertProfile(
  gameName: string,
  puuid: string | null,
  extra: Partial<typeof profiles.$inferInsert> = {},
) {
  const [profile] = await db
    .insert(profiles)
    .values({
      gameName,
      tagLine: "EUW",
      riotIdNorm: `${gameName.toLowerCase()}#euw`,
      puuid,
      status: "active",
      ...extra,
    })
    .returning();
  return profile;
}

/**
 * Miembros A, B, C, D (con partidas) y E (sin resolver), más X (`elruffles`, no miembro).
 *
 * Lunes 28 (3 partidas): trío A-B-D en 3º, 4º, 3º. Hoy, jueves 1 (3 partidas): trío A-B-C en 1º,
 * 1º, 2º con daño A 3000 / B 2000 / C 1000, y D (500 de daño) con X de compañero en 6º, 5º, 6º.
 * X juega las 6 partidas con 90 000 de daño y el peor puesto: si contara, sería «El trol» y «El
 * D-d-d-diablo» y formaría un dúo con D.
 */
async function seed() {
  const a = await insertProfile("Alfa", "puuid-a", {
    challengeValue: 12,
    profileIconId: 7,
    lastSyncedAt: new Date("2026-10-01T10:00:00Z"),
  });
  const b = await insertProfile("Bravo", "puuid-b", {
    lastSyncedAt: new Date("2026-10-01T09:00:00Z"),
  });
  const c = await insertProfile("Charlie", "puuid-c", {
    lastSyncedAt: new Date("2026-10-01T11:00:00Z"),
  });
  const d = await insertProfile("Delta", "puuid-d", {
    lastSyncedAt: new Date("2026-10-01T08:00:00Z"),
  });
  const e = await insertProfile("Echo", null);
  const x = await insertProfile("elruffles", "puuid-x");
  await db
    .insert(groupMembers)
    .values([a, b, c, d, e].map((p) => ({ profileId: p.id })));

  const hugeX = { "puuid-x": 90_000 };
  for (const [i, placement] of [3, 4, 3].entries()) {
    await storePlay(Date.UTC(2026, 8, 28, 12 + i, 0, 0), [
      { puuids: ["puuid-a", "puuid-b", "puuid-d"], placement },
      { puuids: ["puuid-x"], placement: 6, damage: hugeX },
    ]);
  }
  for (const [i, placement] of [1, 1, 2].entries()) {
    await storePlay(Date.UTC(2026, 9, 1, 8 + i, 0, 0), [
      {
        puuids: ["puuid-a", "puuid-b", "puuid-c"],
        placement,
        damage: { "puuid-a": 3000, "puuid-b": 2000, "puuid-c": 1000 },
      },
      {
        puuids: ["puuid-d", "puuid-x"],
        placement: [6, 5, 6][i],
        damage: { "puuid-d": 500, ...hugeX },
      },
    ]);
  }
  return { a, b, c, d, e, x };
}

const catalog: ChampionCatalog = {
  version: "16.1.1",
  champions: [1, 2, 3].map((championId) => ({
    championId,
    ddId: `C${championId}`,
    name: `C${championId}`,
    portraitUrl: null,
  })),
};

/** `id del título -> poseedores` (cada uno, sus claves de miembro unidas con `+`). */
const holdersById = (titles: AwardedTitle[]) =>
  Object.fromEntries(
    titles.map((t) => [t.id, t.holders.map((h) => h.puuids.join("+"))]),
  );

describe("loadGroupView", () => {
  it("sin miembros devuelve una vista vacía", async () => {
    const view = await loadGroupView(db, now, seasonStart);
    expect(view.members).toEqual([]);
    expect(view.oldestSync).toBeNull();
    expect(view.day.ranking).toEqual({ ranked: [], belowMinimum: [] });
    expect(view.day.titles).toEqual([]);
    expect(view.seasonTeams).toEqual({ duos: [], trios: [] });
    expect(view.seasonTable.rows).toEqual([]);
    expect(view.championTotal).toBe(0);
  });

  it("lista los miembros con slug, icono, sincronización y contador oficial", async () => {
    const { a, e } = await seed();
    const view = await loadGroupView(db, now, seasonStart, catalog);

    expect(view.members.map((m) => m.gameName)).toEqual([
      "Alfa",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
    ]);
    expect(view.members[0]).toEqual({
      profileId: a.id,
      key: memberKey(a.id),
      gameName: "Alfa",
      tagLine: "EUW",
      slug: "Alfa-EUW",
      profileIconUrl: expect.stringContaining("/16.1.1/img/profileicon/7.png"),
      lastSyncedAt: new Date("2026-10-01T10:00:00Z"),
      official: 12,
      resolved: true,
    });
    // Sin icono guardado: sin URL. Sin resolver: se lista pero no aporta filas.
    expect(view.members[1].profileIconUrl).toBeNull();
    expect(view.members[4]).toMatchObject({ profileId: e.id, resolved: false });
    expect(view.seasonTable.rows[4].cells.games.value).toBe(0);
    expect(view.championTotal).toBe(3);
  });

  it("la sincronización más antigua es la del miembro menos reciente (sin sincronizar gana)", async () => {
    await seed();
    // Echo nunca se ha sincronizado: es el más antiguo.
    const first = await loadGroupView(db, now, seasonStart);
    expect(first.oldestSync).toMatchObject({
      gameName: "Echo",
      lastSyncedAt: null,
    });

    await db
      .update(profiles)
      .set({ lastSyncedAt: new Date("2026-10-01T12:00:00Z") })
      .where(eq(profiles.riotIdNorm, "echo#euw"));
    const second = await loadGroupView(db, now, seasonStart);
    expect(second.oldestSync).toEqual({
      profileId: expect.any(Number),
      gameName: "Delta",
      tagLine: "EUW",
      lastSyncedAt: new Date("2026-10-01T08:00:00Z"),
    });
  });

  it("periodos, ranking y títulos del día y de la semana de los miembros", async () => {
    const { a, b, c, d } = await seed();
    const [ka, kb, kc, kd] = [a, b, c, d].map((p) => memberKey(p.id));
    const view = await loadGroupView(db, now, seasonStart);

    expect(view.day.period).toMatchObject({
      key: "2026-10-01",
      isCurrent: true,
    });
    expect(view.day.ranking.ranked.map((r) => r.puuid)).toEqual([
      ka,
      kb,
      kc,
      kd,
    ]);
    expect(view.day.ranking.belowMinimum).toEqual([]);
    const day = holdersById(view.day.titles);
    expect(day.troll).toEqual([kd]);
    expect(day.pacifist).toEqual([kd]);
    expect(day.devil).toEqual([ka]);
    // Un solo trío con 3 partidas en el día: no hay competencia, no se otorga.
    expect(day.brokenTrio).toBeUndefined();
    // AB, AC y BC empatan (3 partidas, dos 1º, mismo puesto medio): comparten.
    expect(day.brokenDuo).toEqual([
      `${ka}+${kb}`,
      `${ka}+${kc}`,
      `${kb}+${kc}`,
    ]);

    expect(view.week.period).toMatchObject({
      key: "2026-09-28",
      isCurrent: true,
    });
    expect(view.week.ranking.ranked.map((r) => r.puuid)).toEqual([ka, kb, kd]);
    expect(view.week.ranking.belowMinimum.map((r) => r.puuid)).toEqual([kc]);
    const week = holdersById(view.week.titles);
    expect(week.troll).toEqual([kd]);
    expect(week.brokenTrio).toEqual([`${ka}+${kb}+${kc}`]);
    expect(week.boomTrio).toEqual([`${ka}+${kb}+${kd}`]);
    expect(week.brokenDuo).toEqual([`${ka}+${kc}`, `${kb}+${kc}`]);
    expect(week.boomDuo).toEqual([`${ka}+${kd}`, `${kb}+${kd}`]);
  });

  it("un no miembro (elruffles) no aparece en ninguna cifra", async () => {
    const { a, b, c, d, e, x } = await seed();
    const view = await loadGroupView(db, now, seasonStart);
    const outsider = memberKey(x.id);

    // Equipos de temporada: solo miembros (D+X no es un dúo; A-B-C y A-B-D son los tríos).
    const teamKeys = (teams: { puuids: string[] }[]) =>
      teams.map((t) => t.puuids.join("+")).sort();
    const pair = (...ps: { id: number }[]) =>
      ps.map((p) => memberKey(p.id)).join("+");
    expect(teamKeys(view.seasonTeams.duos)).toEqual(
      [pair(a, b), pair(a, c), pair(a, d), pair(b, c), pair(b, d)].sort(),
    );
    expect(teamKeys(view.seasonTeams.trios)).toEqual(
      [pair(a, b, c), pair(a, b, d)].sort(),
    );

    // Tabla de Temporada: una fila por miembro y nadie más; X no suma partidas a nadie.
    expect(view.seasonTable.rows.map((r) => r.puuid)).toEqual(
      [a, b, c, d, e].map((p) => memberKey(p.id)),
    );
    expect(view.seasonTable.rows.map((r) => r.cells.games.value)).toEqual([
      6, 6, 3, 6, 0,
    ]);

    // Ninguna lista de claves de la vista (ranking, títulos, equipos, tabla) contiene a X.
    const lists: string[][] = [
      view.day.ranking.ranked.map((r) => r.puuid),
      view.day.ranking.belowMinimum.map((r) => r.puuid),
      view.week.ranking.ranked.map((r) => r.puuid),
      view.week.ranking.belowMinimum.map((r) => r.puuid),
      ...[view.day, view.week].flatMap((p) => [
        ...p.titles.flatMap((t) => t.holders.map((h) => h.puuids)),
        ...p.teams.duos.map((t) => t.puuids),
        ...p.teams.trios.map((t) => t.puuids),
      ]),
      ...view.seasonTeams.duos.map((t) => t.puuids),
      ...view.seasonTeams.trios.map((t) => t.puuids),
      view.seasonTable.rows.map((r) => r.puuid),
      ...Object.values(view.seasonTable.leaders),
    ];
    for (const list of lists) expect(list).not.toContain(outsider);
  });

  it("no expone ningún puuid: la salida solo lleva claves de miembro", async () => {
    await seed();
    const json = JSON.stringify(
      await loadGroupView(db, now, seasonStart, catalog),
    );
    for (const puuid of [
      "puuid-a",
      "puuid-b",
      "puuid-c",
      "puuid-d",
      "puuid-x",
    ]) {
      expect(json).not.toContain(puuid);
    }
  });

  it("solo cuentan las partidas de la temporada actual", async () => {
    await seed();
    // Con la temporada empezando hoy, las del lunes 28 no cuentan.
    const view = await loadGroupView(db, now, new Date("2026-10-01T00:00:00Z"));
    expect(view.seasonTable.rows.map((r) => r.cells.games.value)).toEqual([
      3, 3, 3, 3, 0,
    ]);
    expect(view.seasonTeams.trios).toHaveLength(1);
  });
});

/** Títulos del perfil: la parte `titles` de `loadProfileGroupData`. */
const loadProfileTitles = async (
  ...args: Parameters<typeof loadProfileGroupData>
) => (await loadProfileGroupData(...args)).titles;

describe("loadProfileTitles (vía loadProfileGroupData)", () => {
  it("coincide con los títulos de loadGroupView para cada miembro (también dúos y tríos)", async () => {
    const { a, b, c, d, e } = await seed();
    const view = await loadGroupView(db, now, seasonStart);

    const withTeamTitles = new Set<number>();
    for (const member of [a, b, c, d, e]) {
      const key = memberKey(member.id);
      const expected = [
        ...titlesOf(view.day.titles, key),
        ...titlesOf(view.week.titles, key),
      ];
      const actual = await loadProfileTitles(db, member.id, now, seasonStart);
      expect(actual).toEqual(expected);
      if (actual.some((t) => t.title.subject !== "player")) {
        withTeamTitles.add(member.id);
      }
    }
    // Un título de dúo o trío sale en el perfil de CADA uno de sus miembros.
    expect([...withTeamTitles].sort()).toEqual([a.id, b.id, c.id, d.id].sort());
    for (const title of [...view.day.titles, ...view.week.titles]) {
      if (title.subject === "player") continue;
      for (const holder of title.holders) {
        for (const key of holder.puuids) {
          const titles = await loadProfileTitles(
            db,
            Number(key),
            now,
            seasonStart,
          );
          expect(
            titles.filter(
              (t) =>
                t.title.name === title.name &&
                t.holder.puuids.join("+") === holder.puuids.join("+"),
            ),
          ).toHaveLength(1);
        }
      }
    }
  });

  it("devuelve los títulos con su nombre y su porqué", async () => {
    const { c, d } = await seed();
    const titlesD = await loadProfileTitles(db, d.id, now, seasonStart);
    expect(titlesD.map((t) => t.title.name)).toEqual(
      expect.arrayContaining(["El trol del día", "El trol de la semana"]),
    );
    expect(titlesD[0].holder.why).toMatch(/^Peor puesto medio del día/);
    const namesC = (await loadProfileTitles(db, c.id, now, seasonStart)).map(
      (t) => t.title.name,
    );
    expect(namesC).toContain("Equipo roto de la semana");
    // C no llega al mínimo de la semana para los títulos individuales.
    expect(namesC.filter((n) => n.startsWith("El "))).toEqual([]);
  });

  it("no miembro (elruffles) o perfil inexistente: lista vacía", async () => {
    const { x } = await seed();
    expect(await loadProfileTitles(db, x.id, now, seasonStart)).toEqual([]);
    expect(await loadProfileTitles(db, 999_999, now, seasonStart)).toEqual([]);
  });

  it("un miembro sin resolver: lista vacía (sin partidas)", async () => {
    const { e } = await seed();
    expect(await loadProfileTitles(db, e.id, now, seasonStart)).toEqual([]);
  });
});

describe("ELO del grupo", () => {
  /** Partida de Arena de un solo miembro (el resto, anónimos) en el instante `startMs`. */
  const solo = (startMs: number, puuid: string, placement: number) =>
    storePlay(startMs, [{ puuids: [puuid], placement }]);

  it("sin miembros: Clasificación vacía", async () => {
    const view = await loadGroupView(db, now, seasonStart);
    expect(view.elo.standings).toEqual([]);
  });

  it("la Clasificación incluye a todos los miembros (también sin partidas ni resueltos) y ningún no miembro", async () => {
    const { a, b, c, d, e, x } = await seed();
    const view = await loadGroupView(db, now, seasonStart);
    const { standings } = view.elo;

    expect(standings.map((s) => s.key).sort()).toEqual(
      [a, b, c, d, e].map((m) => memberKey(m.id)).sort(),
    );
    expect(standings.map((s) => s.key)).not.toContain(memberKey(x.id));
    // Ordenada por rating, de mayor a menor.
    const ratings = standings.map((s) => s.rating);
    expect(ratings).toEqual([...ratings].sort((p, q) => q - p));
    // Echo (sin resolver) y quien no juega: 1500, provisional, 0 partidas.
    const echo = standings.find((s) => s.key === memberKey(e.id));
    expect(echo).toMatchObject({
      rating: 1500,
      roundedRating: 1500,
      games: 0,
      provisional: true,
      dayChange: null,
      weekChange: null,
    });
    expect(echo?.history).toEqual([]);
    // A, B, C y D juegan 6 partidas cada uno (3 el lunes y 3 hoy): los de hoy son 1º/1º/2º.
    const alfa = standings.find((s) => s.key === memberKey(a.id));
    expect(alfa?.games).toBe(6);
    expect(alfa?.history.map((h) => h.placement)).toEqual([3, 4, 3, 1, 1, 2]);
    expect(view.elo.day.key).toBeDefined();
    // X (no miembro) es un desconocido: hoy D juega con X y un anónimo (2 desconocidos).
    const delta = standings.find((s) => s.key === memberKey(d.id));
    expect(delta?.history.map((h) => h.strangers)).toEqual([0, 0, 0, 2, 2, 2]);
  });

  it("el ELO del perfil de un miembro coincide con su fila de la Clasificación", async () => {
    const { a, b, c, d, e } = await seed();
    const view = await loadGroupView(db, now, seasonStart);
    for (const member of [a, b, c, d, e]) {
      const { elo } = await loadProfileGroupData(
        db,
        member.id,
        now,
        seasonStart,
      );
      const standing = view.elo.standings.find(
        (s) => s.key === memberKey(member.id),
      );
      expect(standing).toBeDefined();
      expect(elo).toMatchObject({
        position: standing?.position,
        rating: standing?.rating,
        roundedRating: standing?.roundedRating,
        league: standing?.league,
        provisional: standing?.provisional,
        games: standing?.games,
        dayChange: standing?.dayChange,
        weekChange: standing?.weekChange,
        day: view.elo.day,
        week: view.elo.week,
      });
      expect(elo).not.toHaveProperty("key");
      // Historial por matchId y serie de la gráfica, en orden cronológico.
      expect(Object.values(elo?.matches ?? {})).toEqual(standing?.history);
      for (const m of standing?.history ?? []) {
        expect(elo?.matches[m.matchId]).toEqual(m);
      }
      expect(elo?.series).toEqual(
        standing?.history.map((h) => ({
          gameStartTimestamp: h.gameStartTimestamp,
          ratingAfter: h.ratingAfter,
        })),
      );
      // Serializable: sin Map ni claves de miembro.
      expect(JSON.parse(JSON.stringify(elo))).toBeDefined();
    }
  });

  it("no miembro o perfil inexistente: ELO null y sin títulos", async () => {
    const { x } = await seed();
    expect(await loadProfileGroupData(db, x.id, now, seasonStart)).toEqual({
      titles: [],
      elo: null,
    });
    expect(await loadProfileGroupData(db, 999_999, now, seasonStart)).toEqual({
      titles: [],
      elo: null,
    });
  });

  it("no cuentan las partidas anteriores a SEASON_START ni las de otras colas", async () => {
    const a = await insertProfile("Alfa", "puuid-a");
    await db.insert(groupMembers).values({ profileId: a.id });
    const inSeason = Date.UTC(2026, 8, 30, 12, 0, 0);
    await solo(inSeason, "puuid-a", 1);
    // Antes de la temporada (11 de mayo, un día antes del inicio): no cuenta.
    await solo(Date.UTC(2026, 4, 11, 12, 0, 0), "puuid-a", 6);
    // Otra cola (no Arena): no cuenta.
    await storePlay(inSeason + 3_600_000, [
      { puuids: ["puuid-a"], placement: 6 },
    ]);
    await db
      .update(matches)
      .set({ queueId: 420 })
      .where(eq(matches.matchId, `EUW1_GRP_${matchCounter}`));

    const view = await loadGroupView(db, now, seasonStart);
    const [alfa] = view.elo.standings;
    expect(alfa.games).toBe(1);
    expect(alfa.history).toHaveLength(1);
    expect(alfa.history[0]).toMatchObject({ placement: 1, ratingBefore: 1500 });
    const { elo } = await loadProfileGroupData(db, a.id, now, seasonStart);
    expect(elo?.games).toBe(1);
    expect(elo?.series).toHaveLength(1);
    expect(elo?.rating).toBe(alfa.rating);
  });
});

describe("withDisplayNames", () => {
  const ts = Date.UTC(2026, 8, 1);
  const row = (placement: number): SeasonMatchRow => ({
    puuid: "A",
    matchId: `EUW1_${placement}`,
    gameCreation: ts + placement,
    gameStartTimestamp: ts + placement,
    championId: 62,
    championName: "MonkeyKing",
    placement,
    playerSubteamId: 1,
    kills: 5,
    deaths: 3,
    totalDamageDealtToChampions: 10_000,
    totalDamageTaken: 8_000,
    largestKillingSpree: 2,
  });
  const table = computeSeasonTable(
    [{ puuid: "A", official: null }],
    [row(1), row(2)],
  );
  const wukong: ChampionCatalog = {
    version: "16.1.1",
    champions: [
      { championId: 62, ddId: "MonkeyKing", name: "Wukong", portraitUrl: null },
    ],
  };

  it("el campeón sale con el nombre del catálogo, como en el perfil", () => {
    const [{ cells }] = withDisplayNames(table, wukong).rows;
    expect(cells.topChampion.championName).toBe("Wukong");
    expect(cells.damage.championName).toBe("Wukong");
    expect(cells.kills.championName).toBe("Wukong");
    // Las celdas sin campeón no cambian.
    expect(cells.games).toEqual(table.rows[0].cells.games);
    expect(cells.winStreak.championName).toBeNull();
  });

  it("sin catálogo (o sin ese campeón) conserva el championName de la partida", () => {
    const empty: ChampionCatalog = { version: null, champions: [] };
    expect(withDisplayNames(table, empty)).toEqual(table);
    const [{ cells }] = withDisplayNames(table, {
      ...wukong,
      champions: [{ ...wukong.champions[0], championId: 1 }],
    }).rows;
    expect(cells.damage.championName).toBe("MonkeyKing");
  });
});
