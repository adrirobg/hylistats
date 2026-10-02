import { sql } from "drizzle-orm";
import { type Db, getDb } from "@/db";
import { settings } from "@/db/schema";
import { resetGroupViewMemo } from "@/domain/group-view-memo";

/**
 * BD de tests: `vitest.config.ts` apunta `DATABASE_URL` a `hylistats_test`.
 * Guarda de seguridad: nunca se opera (ni se trunca) sobre una BD que no sea de tests.
 */
export function getTestDb(): Db {
  if (!/_test(\?.*)?$/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("DATABASE_URL no apunta a una BD de tests (sufijo _test)");
  }
  return getDb();
}

/**
 * Vacía las tablas de datos y devuelve `settings` a sus valores por defecto (la fila id = 1 se
 * conserva). También vacía el memo de `GroupView`: los tests cambian la BD sin subir la versión del
 * grupo, y sin esto un test leería la vista calculada en el anterior.
 */
export async function truncateAll(): Promise<void> {
  resetGroupViewMemo();
  const db = getTestDb();
  await db.execute(
    sql`TRUNCATE participants, matches, match_fetch, sync_jobs, profiles RESTART IDENTITY CASCADE`,
  );
  await db
    .insert(settings)
    .values({ id: 1 })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        riotApiKey: null,
        keyStatus: "unknown",
        keyStatusSince: null,
        keyStatusReason: null,
        updatedAt: new Date(),
      },
    });
}
