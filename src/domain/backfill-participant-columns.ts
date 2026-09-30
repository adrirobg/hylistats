import { gunzipSync } from "node:zlib";
import { and, asc, count, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { matches } from "@/db/schema";

// Relleno de `participants.total_damage_taken` y `largest_killing_spree` para las partidas
// guardadas antes de que existieran esas columnas. Lee `matches.raw_gz`: no llama a Riot.

const BATCH_SIZE = 100;

// Solo lo que se rellena; el resto del JSON crudo se ignora.
const RawMatch = z.object({
  info: z.object({
    participants: z.array(
      z.object({
        puuid: z.string().min(1),
        totalDamageTaken: z.number().int(),
        largestKillingSpree: z.number().int(),
      }),
    ),
  }),
});

export interface BackfillResult {
  /** Partidas con `raw_gz` que se han leído y parseado. */
  matchesRead: number;
  /** Filas de `participants` actualizadas (solo las que tenían alguna columna a null). */
  rowsUpdated: number;
  /** Partidas sin `raw_gz`: no se pueden rellenar. */
  matchesWithoutRaw: number;
  /** Partidas con `raw_gz` ilegible o sin los campos esperados. */
  matchesUnreadable: number;
}

/**
 * Rellena las dos columnas nuevas de `participants` desde `matches.raw_gz`, por lotes y por
 * `(match_id, puuid)`. Idempotente: solo toca filas donde alguna de las dos es null, así que una
 * segunda ejecución no actualiza nada.
 */
export async function backfillParticipantColumns(
  db: Db,
  batchSize: number = BATCH_SIZE,
): Promise<BackfillResult> {
  const result: BackfillResult = {
    matchesRead: 0,
    rowsUpdated: 0,
    matchesWithoutRaw: 0,
    matchesUnreadable: 0,
  };

  const [{ n: withoutRaw }] = await db
    .select({ n: count() })
    .from(matches)
    .where(isNull(matches.rawGz));
  result.matchesWithoutRaw = withoutRaw;

  let after = "";
  for (;;) {
    const batch = await db
      .select({ matchId: matches.matchId, rawGz: matches.rawGz })
      .from(matches)
      .where(and(isNotNull(matches.rawGz), gt(matches.matchId, after)))
      .orderBy(asc(matches.matchId))
      .limit(batchSize);
    if (batch.length === 0) break;
    after = batch[batch.length - 1].matchId;

    for (const { matchId, rawGz } of batch) {
      let parsed: z.infer<typeof RawMatch>;
      try {
        parsed = RawMatch.parse(
          JSON.parse(gunzipSync(rawGz as Buffer).toString("utf8")),
        );
      } catch {
        result.matchesUnreadable++;
        continue;
      }
      result.matchesRead++;

      const ps = parsed.info.participants;
      if (ps.length === 0) continue;
      const updated = await db.execute(sql`
        UPDATE participants AS p
        SET total_damage_taken = v."totalDamageTaken",
            largest_killing_spree = v."largestKillingSpree"
        FROM jsonb_to_recordset(${JSON.stringify(ps)}::jsonb)
          AS v(puuid text, "totalDamageTaken" integer, "largestKillingSpree" integer)
        WHERE p.match_id = ${matchId}
          AND p.puuid = v.puuid
          AND (p.total_damage_taken IS NULL OR p.largest_killing_spree IS NULL)
      `);
      result.rowsUpdated += updated.rowCount ?? 0;
    }
  }
  return result;
}
