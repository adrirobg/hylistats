import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { groupMembers, profiles } from "@/db/schema";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import {
  addGroupMemberByRiotId,
  isGroupMember,
  listGroupMembers,
  NOT_REGISTERED_MESSAGE,
  removeGroupMember,
} from "./group";

const db = getTestDb();

beforeEach(truncateAll);
afterAll(closeDb);

async function insertProfile(
  gameName: string,
  tagLine: string,
  puuid?: string,
) {
  const [profile] = await db
    .insert(profiles)
    .values({
      gameName,
      tagLine,
      riotIdNorm: `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`,
      puuid: puuid ?? null,
      status: "active",
    })
    .returning();
  return profile;
}

describe("addGroupMemberByRiotId", () => {
  it("añade un perfil registrado (sin distinguir mayúsculas) y lo lista", async () => {
    const p = await insertProfile("Hylimichi", "EUW", "puuid-hyli");

    const result = await addGroupMemberByRiotId(db, "hylimichi#euw");

    expect(result).toEqual({ ok: true, added: true, profileId: p.id });
    expect(await isGroupMember(db, p.id)).toBe(true);
    expect(await listGroupMembers(db)).toEqual([
      {
        profileId: p.id,
        gameName: "Hylimichi",
        tagLine: "EUW",
        puuid: "puuid-hyli",
        lastSyncedAt: null,
      },
    ]);
  });

  it("duplicado: no hace nada y no falla", async () => {
    const p = await insertProfile("Hylimichi", "EUW");
    await addGroupMemberByRiotId(db, "Hylimichi#EUW");

    const again = await addGroupMemberByRiotId(db, "Hylimichi#EUW");

    expect(again).toEqual({ ok: true, added: false, profileId: p.id });
    expect(await db.select().from(groupMembers)).toHaveLength(1);
  });

  it("Riot ID no registrado: error claro y no crea nada", async () => {
    await insertProfile("Hylimichi", "EUW");

    const result = await addGroupMemberByRiotId(db, "Desconocido#EUW");

    expect(result).toEqual({
      ok: false,
      reason: "not_registered",
      message: "Ese Riot ID no está registrado: búscalo primero en la app",
    });
    expect(NOT_REGISTERED_MESSAGE).toContain("no está registrado");
    expect(await db.select().from(groupMembers)).toHaveLength(0);
    expect(await db.select().from(profiles)).toHaveLength(1);
  });

  it("entrada que no es un Riot ID: invalid", async () => {
    const result = await addGroupMemberByRiotId(db, "sin tag");
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("removeGroupMember", () => {
  it("quita al miembro y deja el perfil; quitar a quien no está devuelve false", async () => {
    const a = await insertProfile("Hylimichi", "EUW");
    const b = await insertProfile("Azpekaa", "EUW");
    await addGroupMemberByRiotId(db, "Hylimichi#EUW");
    await addGroupMemberByRiotId(db, "Azpekaa#EUW");

    expect(await removeGroupMember(db, a.id)).toBe(true);
    expect(await removeGroupMember(db, a.id)).toBe(false);

    expect(await isGroupMember(db, a.id)).toBe(false);
    expect((await listGroupMembers(db)).map((m) => m.profileId)).toEqual([
      b.id,
    ]);
    expect(await db.select().from(profiles)).toHaveLength(2);
  });
});
