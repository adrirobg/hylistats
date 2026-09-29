import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema> & { $client: Pool };

// Pool pequeño: web + worker comparten BD y el plan de Postgres limita las conexiones.
const POOL_MAX = 5;

// Singleton en `globalThis`: sobrevive a HMR y a bundles distintos de Next.
const globalForDb = globalThis as typeof globalThis & {
  __hylistatsDb?: Db;
};

/**
 * Cliente de BD perezoso: no conecta al importar (así `next build` no necesita BD);
 * el pool se crea en la primera llamada.
 */
export function getDb(): Db {
  if (!globalForDb.__hylistatsDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no está definida");
    }
    const pool = new Pool({ connectionString, max: POOL_MAX });
    globalForDb.__hylistatsDb = drizzle(pool, { schema });
  }
  return globalForDb.__hylistatsDb;
}

/** Cierra el pool y libera el singleton (scripts y tests que necesitan terminar el proceso). */
export async function closeDb(): Promise<void> {
  const db = globalForDb.__hylistatsDb;
  globalForDb.__hylistatsDb = undefined;
  await db?.$client.end();
}
