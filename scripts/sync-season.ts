import { closeDb, getDb } from "@/db";
import { parseRiotId } from "@/lib/riot-id";
import { enqueueSeasonBackfill, normalizeRiotId } from "@/worker/queue";
import { safeErrorMessage } from "@/worker/steps";

// Re-backfill de temporada de un perfil ya registrado: encola un job `backfill` que el worker
// recoge por sondeo (no hace falta reiniciarlo). Las partidas ya guardadas no se piden de nuevo,
// así que solo se descargan las que falten (p. ej. las de una cola añadida después).
// Uso: `npm run sync:season -- "Nombre#TAG"`. Nunca imprime el puuid.
const riotId = parseRiotId(process.argv[2] ?? "");
if (!riotId) {
  console.error('Uso: npm run sync:season -- "Nombre#TAG"');
  process.exit(1);
}
const shown = `${riotId.gameName}#${riotId.tagLine}`;

try {
  const result = await enqueueSeasonBackfill(
    getDb(),
    normalizeRiotId(riotId.gameName, riotId.tagLine),
  );
  switch (result.outcome) {
    case "queued":
      console.log(
        `Backfill encolado para ${shown}: job ${result.jobId}. El worker lo recogerá en unos segundos.`,
      );
      break;
    case "active":
      console.log(`${shown} ya tiene un job en curso: no se hace nada.`);
      break;
    case "unknown":
      console.error(`${shown} no está registrado: ábrelo primero en la web.`);
      process.exitCode = 1;
      break;
    case "inactive":
      console.error(
        `${shown} no está activo (estado: ${result.status}): no se encola nada.`,
      );
      process.exitCode = 1;
      break;
  }
} catch (error) {
  console.error(`Error encolando el backfill: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
