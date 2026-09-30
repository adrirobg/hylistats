import { eq, isNull, or, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { matches, participants } from "@/db/schema";
import { getTestDb, truncateAll } from "../../tests/helpers/db";
import { loadMatchFixtures } from "../../tests/helpers/matches";
import { backfillParticipantColumns } from "./backfill-participant-columns";
import { storeMatch } from "./ingest";

const db = getTestDb();
const fixtures = loadMatchFixtures();
const [first, second] = fixtures;

beforeEach(truncateAll);
afterAll(closeDb);

async function storeAll() {
  for (const f of [first, second]) await storeMatch(db, f.match, f.raw);
}

/** Simula filas anteriores a las columnas nuevas. */
async function nullOutColumns() {
  await db
    .update(participants)
    .set({ totalDamageTaken: null, largestKillingSpree: null });
}

describe("backfillParticipantColumns", () => {
  it("rellena las dos columnas desde raw_gz y una segunda pasada no cambia nada", async () => {
    await storeAll();
    await nullOutColumns();

    const r1 = await backfillParticipantColumns(db);
    expect(r1).toEqual({
      matchesRead: 2,
      rowsUpdated: 36,
      matchesWithoutRaw: 0,
      matchesUnreadable: 0,
    });

    const nulls = await db
      .select()
      .from(participants)
      .where(
        or(
          isNull(participants.totalDamageTaken),
          isNull(participants.largestKillingSpree),
        ),
      );
    expect(nulls).toHaveLength(0);

    // Los valores salen del JSON crudo.
    const json = JSON.parse(first.raw) as {
      info: {
        participants: Array<{
          puuid: string;
          totalDamageTaken: number;
          largestKillingSpree: number;
        }>;
      };
    };
    const rows = await db
      .select()
      .from(participants)
      .where(eq(participants.matchId, first.id));
    for (const p of json.info.participants) {
      const row = rows.find((x) => x.puuid === p.puuid);
      expect(row?.totalDamageTaken).toBe(p.totalDamageTaken);
      expect(row?.largestKillingSpree).toBe(p.largestKillingSpree);
    }

    const r2 = await backfillParticipantColumns(db);
    expect(r2.rowsUpdated).toBe(0);
    expect(r2.matchesRead).toBe(2);
  });

  it("recorre varios lotes", async () => {
    await storeAll();
    await nullOutColumns();
    const r = await backfillParticipantColumns(db, 1);
    expect(r.matchesRead).toBe(2);
    expect(r.rowsUpdated).toBe(36);
  });

  it("solo actualiza filas con alguna columna a null", async () => {
    await storeAll();
    await nullOutColumns();
    // Una fila con solo una columna a null y otra con valores propios que no se deben pisar.
    const [a, b] = await db
      .select()
      .from(participants)
      .where(eq(participants.matchId, first.id))
      .limit(2);
    await db
      .update(participants)
      .set({ totalDamageTaken: 1, largestKillingSpree: 2 })
      .where(
        sql`${participants.matchId} = ${a.matchId} AND ${participants.puuid} = ${a.puuid}`,
      );
    await db
      .update(participants)
      .set({ totalDamageTaken: 7 })
      .where(
        sql`${participants.matchId} = ${b.matchId} AND ${participants.puuid} = ${b.puuid}`,
      );

    const r = await backfillParticipantColumns(db);
    expect(r.rowsUpdated).toBe(35);

    const [keptA] = await db
      .select()
      .from(participants)
      .where(
        sql`${participants.matchId} = ${a.matchId} AND ${participants.puuid} = ${a.puuid}`,
      );
    expect(keptA.totalDamageTaken).toBe(1);
    expect(keptA.largestKillingSpree).toBe(2);
  });

  it("informa de las partidas sin raw_gz y no las toca", async () => {
    await storeAll();
    await nullOutColumns();
    await db
      .update(matches)
      .set({ rawGz: null })
      .where(eq(matches.matchId, second.id));

    const r = await backfillParticipantColumns(db);
    expect(r).toEqual({
      matchesRead: 1,
      rowsUpdated: 18,
      matchesWithoutRaw: 1,
      matchesUnreadable: 0,
    });
    const pending = await db
      .select()
      .from(participants)
      .where(isNull(participants.totalDamageTaken));
    expect(pending).toHaveLength(18);
  });

  it("cuenta como ilegible un raw_gz corrupto", async () => {
    await storeAll();
    await nullOutColumns();
    await db
      .update(matches)
      .set({ rawGz: Buffer.from("no es gzip") })
      .where(eq(matches.matchId, second.id));
    const r = await backfillParticipantColumns(db);
    expect(r.matchesRead).toBe(1);
    expect(r.matchesUnreadable).toBe(1);
  });
});
