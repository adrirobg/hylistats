import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export type RiotKeySource = "db" | "env";

export interface RiotKey {
  key: string;
  source: RiotKeySource;
}

/**
 * Key de Riot vigente: `settings.riotApiKey` (fila `id = 1`, la que se pega en `/admin`) y,
 * si no hay, `RIOT_API_KEY` del entorno. `null` si no hay ninguna.
 *
 * Se lee en CADA llamada (sin caché) para que un cambio desde `/admin` surta efecto sin
 * reiniciar. La key no sale de este módulo salvo hacia la cabecera `X-Riot-Token`: no se
 * loguea ni se serializa.
 */
export async function getRiotApiKey(db: Db): Promise<RiotKey | null> {
  const [row] = await db
    .select({ riotApiKey: settings.riotApiKey })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);

  const fromDb = row?.riotApiKey?.trim();
  if (fromDb) return { key: fromDb, source: "db" };

  const fromEnv = process.env.RIOT_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env" };

  return null;
}
