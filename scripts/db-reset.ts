import { Pool } from "pg";

// Vacía las tablas de datos y conserva `settings` (key de Riot) y las migraciones.
// Se usa al cambiar de key/proyecto de Riot (los PUUID dejan de casar) o para limpiar la BD dev.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const { host, pathname } = new URL(url);
const target = `${host}${pathname}`;

if (!process.argv.includes("--yes")) {
  console.error(
    `Esto borra profiles, matches, participants, sync_jobs y match_fetch de ${target}.\nRepite con --yes para confirmar: npm run db:reset -- --yes`,
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  await pool.query(
    "TRUNCATE participants, matches, match_fetch, sync_jobs, profiles RESTART IDENTITY CASCADE",
  );
  console.log(
    `BD reseteada en ${target} (settings y migraciones conservadas).`,
  );
} catch (error) {
  console.error(
    `Error reseteando ${target}:`,
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
