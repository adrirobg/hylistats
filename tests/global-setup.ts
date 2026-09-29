import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Aplica las migraciones a la BD de tests antes de cualquier test (nunca toca la BD dev).
export default async function setup() {
  const url =
    process.env.DATABASE_URL_TEST ??
    "postgres://hylistats:hylistats@localhost:5433/hylistats_test";
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
