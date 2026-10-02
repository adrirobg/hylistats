import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { groupMembers, profiles } from "@/db/schema";
import { addGroupMemberByRiotId, removeGroupMember } from "@/domain/group";
import { groupVersion, profileVersion } from "@/lib/data-version";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import { createFakeRiot, type FakeRiot } from "../../tests/helpers/fake-riot";
import {
  loadMatchFixtures,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { createFakeClock } from "../../tests/helpers/riot";
import { createWorker, type Worker } from "./main";
import { REFRESH_COOLDOWN_MS, registerProfile, requestRefresh } from "./queue";

// AC1 (iter-10): qué sube la versión de datos al sincronizar, contra la BD de tests y el `RiotApi`
// falso. Las versiones viven en memoria del proceso de tests: se comparan antes y después.

const db = getTestDb();
const fixtures = loadMatchFixtures();
const seasonStart = new Date("2026-05-12T00:00:00Z");
const HOUR_MS = 3_600_000;
/** Jugador de la partida más reciente del fixture (solo aparece en esa). */
const OUTSIDER = { gameName: "Player001", tagLine: "ANON" };

beforeEach(truncateAll);
afterAll(closeDb);

function setup(fake: FakeRiot = createFakeRiot()) {
  const clock = createFakeClock();
  const worker = createWorker({
    db,
    riot: fake,
    now: clock.now,
    sleep: clock.sleep,
    seasonStart,
    log: () => {},
  });
  return { fake, clock, worker };
}

async function drain(worker: Worker) {
  for (let i = 0; i < 500; i++) {
    if ((await worker.tick()) !== "worked") return;
  }
  throw new Error("el worker no termina");
}

/** Copia de la partida más reciente `hours` horas después, con otro id y `mutate` opcional. */
function laterMatch(
  matchId: string,
  hours: number,
  mutate?: Parameters<typeof variantOf>[2],
) {
  const newest = fixtures.at(-1);
  if (!newest) throw new Error("sin fixtures");
  return variantOf(newest, matchId, (json) => {
    const info = json.info as unknown as Record<string, number>;
    for (const key of [
      "gameCreation",
      "gameStartTimestamp",
      "gameEndTimestamp",
    ]) {
      info[key] += hours * HOUR_MS;
    }
    mutate?.(json);
  });
}

/** El jugador de prueba registrado, en el grupo y con su backfill hecho. */
async function syncedMember(worker: Worker) {
  const member = await registerProfile(db, "BEJITO MAMBO", "1991");
  await db.insert(groupMembers).values({ profileId: member.id });
  await drain(worker);
  return member;
}

/** Versiones del perfil y del grupo en este instante. */
const snapshot = (profileId: number) => ({
  profile: profileVersion(profileId),
  group: groupVersion(),
});

async function incremental(
  worker: Worker,
  clock: ReturnType<typeof createFakeClock>,
  profileId: number,
) {
  clock.advance(REFRESH_COOLDOWN_MS);
  expect(
    await requestRefresh(db, profileId, {
      interactive: true,
      now: new Date(clock.now()),
    }),
  ).toBe("queued");
  await drain(worker);
}

describe("versión de datos al sincronizar (AC1)", () => {
  it("el backfill de un miembro sube su versión y la del grupo (perfil resuelto y partidas)", async () => {
    const { worker } = setup();
    const member = await registerProfile(db, "BEJITO MAMBO", "1991");
    await db.insert(groupMembers).values({ profileId: member.id });
    const before = snapshot(member.id);
    await drain(worker);
    const after = snapshot(member.id);
    expect(after.profile).not.toBe(before.profile);
    expect(after.group).not.toBe(before.group);
  });

  it("un incremental sin partidas nuevas no sube nada, aunque cambie lastSyncedAt", async () => {
    const { worker, clock } = setup();
    const member = await syncedMember(worker);
    const [{ lastSyncedAt }] = await db
      .select({ lastSyncedAt: profiles.lastSyncedAt })
      .from(profiles)
      .where(eq(profiles.id, member.id));
    const before = snapshot(member.id);

    await incremental(worker, clock, member.id);

    const [profile] = await db
      .select({ lastSyncedAt: profiles.lastSyncedAt })
      .from(profiles)
      .where(eq(profiles.id, member.id));
    expect(profile.lastSyncedAt).not.toEqual(lastSyncedAt);
    expect(snapshot(member.id)).toEqual(before);
  });

  it("un incremental con una partida nueva sube la versión del perfil y la del grupo", async () => {
    const { fake, worker, clock } = setup();
    const member = await syncedMember(worker);
    const before = snapshot(member.id);
    fake.addMatch(laterMatch("EUW1_7999000001", 1));

    await incremental(worker, clock, member.id);

    const after = snapshot(member.id);
    expect(fake.count("match", "EUW1_7999000001")).toBe(1);
    expect(after.profile).not.toBe(before.profile);
    expect(after.group).not.toBe(before.group);
  });

  it("sube si cambia el 602002 o el icono; con los mismos valores, no", async () => {
    const { worker, clock } = setup();
    const member = await syncedMember(worker);

    // El contador guardado difiere del que devolverá Riot: el incremental lo cambia.
    await db
      .update(profiles)
      .set({ challengeValue: 1 })
      .where(eq(profiles.id, member.id));
    let before = snapshot(member.id);
    await incremental(worker, clock, member.id);
    expect(snapshot(member.id).profile).not.toBe(before.profile);
    expect(snapshot(member.id).group).not.toBe(before.group);

    // Ídem con el icono.
    await db
      .update(profiles)
      .set({ profileIconId: 1 })
      .where(eq(profiles.id, member.id));
    before = snapshot(member.id);
    await incremental(worker, clock, member.id);
    expect(snapshot(member.id).profile).not.toBe(before.profile);

    // Mismos valores que ya hay: nada.
    before = snapshot(member.id);
    await incremental(worker, clock, member.id);
    expect(snapshot(member.id)).toEqual(before);
  });

  it("una partida guardada por el job de otro perfil sube la de cada registrado que juega en ella", async () => {
    const { fake, worker } = setup();
    const member = await syncedMember(worker);
    // Partida nueva del miembro con OUTSIDER; la descarga el backfill de OUTSIDER.
    fake.addMatch(laterMatch("EUW1_7999000002", 1));
    const before = snapshot(member.id);

    const outsider = await registerProfile(
      db,
      OUTSIDER.gameName,
      OUTSIDER.tagLine,
    );
    const outsiderBefore = profileVersion(outsider.id);
    await drain(worker);

    expect(fake.count("match", "EUW1_7999000002")).toBe(1);
    expect(profileVersion(outsider.id)).not.toBe(outsiderBefore);
    const after = snapshot(member.id);
    expect(after.profile).not.toBe(before.profile);
    expect(after.group).not.toBe(before.group);
  });

  it("el backfill de un perfil ajeno al grupo sin partidas compartidas nuevas no toca a los miembros ni al grupo", async () => {
    const { fake, worker } = setup();
    const member = await syncedMember(worker);
    // Partida nueva de OUTSIDER sin el miembro (su puuid lo ocupa otro jugador).
    fake.addMatch(
      laterMatch("EUW1_7999000003", 1, (json) => {
        for (const p of json.info.participants) {
          if (p.puuid === SELF_PUUID) p.puuid = "anon-puuid-999";
        }
      }),
    );
    const before = snapshot(member.id);

    const outsider = await registerProfile(
      db,
      OUTSIDER.gameName,
      OUTSIDER.tagLine,
    );
    const outsiderBefore = profileVersion(outsider.id);
    await drain(worker);

    // Descargó la partida nueva; la compartida con el miembro ya estaba guardada.
    expect(fake.count("match", "EUW1_7999000003")).toBe(1);
    expect(fake.matchCalls()).toHaveLength(fixtures.length + 1);
    expect(profileVersion(outsider.id)).not.toBe(outsiderBefore);
    expect(snapshot(member.id)).toEqual(before);
  });

  it("un Riot ID inexistente (not_found) sube la versión de su perfil y no la del grupo", async () => {
    const { worker } = setup();
    const profile = await registerProfile(db, "Nadie", "0000");
    const before = snapshot(profile.id);
    await drain(worker);
    const [row] = await db
      .select({ status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, profile.id));
    expect(row.status).toBe("not_found");
    expect(profileVersion(profile.id)).not.toBe(before.profile);
    expect(groupVersion()).toBe(before.group);
  });
});

describe("versión del grupo al cambiar la lista (/admin)", () => {
  it("añadir o quitar un miembro la sube; repetir lo que no cambia nada, no", async () => {
    const profile = await registerProfile(db, "BEJITO MAMBO", "1991");
    const profileBefore = profileVersion(profile.id);

    let before = groupVersion();
    expect(await addGroupMemberByRiotId(db, "BEJITO MAMBO#1991")).toMatchObject(
      { ok: true, added: true },
    );
    expect(groupVersion()).not.toBe(before);

    before = groupVersion();
    expect(await addGroupMemberByRiotId(db, "BEJITO MAMBO#1991")).toMatchObject(
      { ok: true, added: false },
    );
    expect(await addGroupMemberByRiotId(db, "Nadie#0000")).toMatchObject({
      ok: false,
    });
    expect(groupVersion()).toBe(before);

    expect(await removeGroupMember(db, profile.id)).toBe(true);
    expect(groupVersion()).not.toBe(before);
    before = groupVersion();
    expect(await removeGroupMember(db, profile.id)).toBe(false);
    expect(groupVersion()).toBe(before);

    // La lista del grupo no toca la versión del perfil (la página la ve por `groupVersion`).
    expect(profileVersion(profile.id)).toBe(profileBefore);
  });
});
