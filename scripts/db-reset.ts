import { closeDb, getDb } from "@/db";
import { type ResetSummary, resetData, summarizeReset } from "@/db/reset";
import { safeErrorMessage } from "@/worker/steps";

// Reseteo de datos al cambiar de key/proyecto de Riot (los PUUID dejan de casar) o para limpiar
// la BD dev. Lógica y garantías en `src/db/reset.ts`.
//
// Uso: `npm run db:reset -- [--keep-profiles] [--url <postgres-url>] [--yes]`
//   (sin flags)       vacía perfiles, grupo, partidas y cola; conserva `settings` y migraciones.
//   --keep-profiles   conserva perfiles, grupo y `settings`; vacía partidas y cola y encola un
//                     backfill por perfil (migración de key: docs/deploy.md).
//   --url             BD destino; por defecto `DATABASE_URL`.
//   --yes             ejecuta. Sin él solo imprime el resumen.
// Nunca imprime la URL completa (lleva la contraseña) ni PUUID.
const args = process.argv.slice(2);
const keepProfiles = args.includes("--keep-profiles");
const confirmed = args.includes("--yes");
const urlIndex = args.indexOf("--url");
const url = urlIndex === -1 ? process.env.DATABASE_URL : args[urlIndex + 1];

if (!url) {
  console.error("Falta la URL de la BD: define DATABASE_URL o pasa --url.");
  process.exit(1);
}
// `getDb` lee `DATABASE_URL`: así `--url` no depende de lo que haya en `.env.local`.
process.env.DATABASE_URL = url;
const { host, pathname } = new URL(url);
const target = `${host}${pathname}`;

function printSummary(summary: ResetSummary): void {
  console.log(`BD: ${target}`);
  console.log(
    `${summary.profiles.length} perfiles (${summary.members} en el grupo), ${summary.matches} partidas, ${summary.syncJobs} jobs.`,
  );
  for (const p of summary.profiles) {
    const challenge = p.challengeValue === null ? "—" : p.challengeValue;
    console.log(
      `  #${p.id} ${p.riotId}${p.member ? " [grupo]" : ""}: ${p.matches} partidas, 602002 = ${challenge}, ${p.status}`,
    );
  }
  if (!keepProfiles) return;
  for (const change of summary.riotIdChanges) {
    console.log(
      `  Riot ID #${change.profileId}: ${change.from} -> ${change.to} (según su última partida)`,
    );
  }
}

const db = getDb();
try {
  printSummary(await summarizeReset(db));
  const what = keepProfiles
    ? "Borra partidas, participantes, match_fetch y jobs; conserva perfiles, grupo y settings, y encola un backfill por perfil."
    : "Borra perfiles, grupo, partidas, participantes, match_fetch y jobs; conserva settings.";

  if (!confirmed) {
    const flags = keepProfiles ? "--keep-profiles --yes" : "--yes";
    console.error(
      `\n${what}\nRepite con --yes para confirmar: npm run db:reset -- ${flags}`,
    );
    process.exitCode = 1;
  } else {
    const result = await resetData(db, { keepProfiles });
    console.log(
      keepProfiles
        ? `\nBD reseteada en ${target}: ${result.riotIdChanges.length} Riot ID corregidos, ${result.backfillJobs} backfills encolados. El worker los recoge por sondeo con la key vigente.`
        : `\nBD reseteada en ${target} (settings y migraciones conservadas).`,
    );
  }
} catch (error) {
  console.error(`Error reseteando ${target}: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
