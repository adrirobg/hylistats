import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const DEFAULT_TEST_URL =
  "postgres://hylistats:hylistats@localhost:5433/hylistats_test";

/** Uso: `migrate.ts [--url <postgres-url>] [--test]`. Sin flags: `DATABASE_URL`. */
function resolveUrl(args: string[]): string | undefined {
  const i = args.indexOf("--url");
  if (i !== -1) return args[i + 1];
  if (args.includes("--test")) {
    return process.env.DATABASE_URL_TEST ?? DEFAULT_TEST_URL;
  }
  return process.env.DATABASE_URL;
}

/** Destino legible sin credenciales (la URL lleva la contraseña). */
function describeTarget(url: string): string {
  const { host, pathname } = new URL(url);
  return `${host}${pathname}`;
}

const url = resolveUrl(process.argv.slice(2));
if (!url) {
  console.error(
    "Falta la URL de la BD: define DATABASE_URL o pasa --url / --test.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log(`Migraciones aplicadas en ${describeTarget(url)}`);
} catch (error) {
  console.error(
    `Error migrando ${describeTarget(url)}:`,
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
