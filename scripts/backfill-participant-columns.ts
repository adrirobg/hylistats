import { closeDb, getDb } from "@/db";
import { backfillParticipantColumns } from "@/domain/backfill-participant-columns";

// Rellena `participants.total_damage_taken` y `largest_killing_spree` de las partidas ya
// guardadas leyendo `matches.raw_gz` (sin llamadas a Riot). Idempotente.
// Uso: `npm run db:backfill-columns`.
try {
  const r = await backfillParticipantColumns(getDb());
  console.log(`Partidas leídas: ${r.matchesRead}`);
  console.log(`Filas actualizadas: ${r.rowsUpdated}`);
  console.log(`Partidas sin raw_gz: ${r.matchesWithoutRaw}`);
  if (r.matchesUnreadable > 0) {
    console.log(`Partidas con raw_gz ilegible: ${r.matchesUnreadable}`);
  }
} catch (error) {
  console.error(
    "Error en el relleno:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
