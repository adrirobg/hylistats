import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";
import { getRiotClient, type KeyValidation } from "@/lib/riot/client";
import { wakeWorker } from "@/worker/queue";
import type { KeyStatus } from "@/worker/steps";

// Rotación de la key de Riot desde `/admin` y `POST /api/admin/key` (stack.md §7.1): se valida
// contra Riot ANTES de guardarla, se guarda en `settings` (fila `id = 1`) y se despierta al
// worker. La key no sale de este módulo salvo hacia `validateKey`/`settings`: no se loguea ni
// se devuelve.

/** Una key de desarrollo caduca a las 24 h de generarse (aviso "caduca ~última key + 24 h"). */
export const KEY_TTL_MS = 24 * 60 * 60 * 1000;

// Formato mínimo: prefijo `RGAPI-` y ASCII imprimible sin espacios (como el cliente Riot).
const KEY_FORMAT = /^RGAPI-[\x21-\x7e]+$/;

export type SaveKeyResult = "ok" | "invalid" | "invalid_format" | "error";

export interface SaveKeyDeps {
  /** Comprueba la key contra Riot (una llamada barata; no guarda nada). */
  validateKey: (candidate: string) => Promise<KeyValidation>;
  /** Despierta al worker para que reanude sin esperar a su sondeo. */
  wakeWorker: () => void;
  now: () => Date;
}

const defaultDeps: SaveKeyDeps = {
  validateKey: (candidate) => getRiotClient().validateKey(candidate),
  wakeWorker,
  now: () => new Date(),
};

/**
 * Valida y guarda una key de Riot:
 * - `invalid_format`: no empieza por `RGAPI-` o tiene caracteres no válidos (no se llama a Riot);
 * - `invalid`: Riot la rechaza (401/403): no se guarda;
 * - `error`: no se pudo comprobar (red, 5xx, 429): no se guarda;
 * - `ok`: se guarda con `keyStatus = 'ok'` y se despierta al worker.
 *
 * `updatedAt` se fija a mano: el worker en pausa lo vigila para saber que la key cambió.
 */
export async function saveRiotKey(
  db: Db,
  candidate: string,
  deps: Partial<SaveKeyDeps> = {},
): Promise<SaveKeyResult> {
  const { validateKey, wakeWorker, now } = { ...defaultDeps, ...deps };

  const key = candidate.trim();
  if (!KEY_FORMAT.test(key)) return "invalid_format";

  const validation = await validateKey(key);
  if (validation !== "ok") return validation;

  const at = now();
  const values = {
    riotApiKey: key,
    keyStatus: "ok" as const,
    keyStatusSince: at,
    keyStatusReason: null,
    updatedAt: at,
  };
  await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: settings.id, set: values });
  wakeWorker();
  return "ok";
}

export type KeySource = "db" | "env" | "none";

/** Estado de la key para `/admin` y `/api/health`. Nunca incluye la key. */
export interface KeyStatusInfo {
  status: KeyStatus;
  since: Date | null;
  reason: string | null;
  /** De dónde sale la key vigente: `settings` (`db`), `RIOT_API_KEY` (`env`) o ninguna. */
  source: KeySource;
  /** Cuándo se guardó la key por última vez (`settings.updatedAt`); `null` sin fila. */
  updatedAt: Date | null;
  /** Caducidad estimada de una key de desarrollo: `updatedAt` + 24 h, solo con `source = 'db'`. */
  expiresHint: Date | null;
}

export async function getKeyStatus(db: Db): Promise<KeyStatusInfo> {
  // Se pregunta SI hay key en BD, sin traerla a memoria.
  const [row] = await db
    .select({
      status: settings.keyStatus,
      since: settings.keyStatusSince,
      reason: settings.keyStatusReason,
      updatedAt: settings.updatedAt,
      hasDbKey: sql<boolean>`nullif(btrim(${settings.riotApiKey}), '') is not null`,
    })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);

  const hasEnvKey = Boolean(process.env.RIOT_API_KEY?.trim());
  const source: KeySource = row?.hasDbKey ? "db" : hasEnvKey ? "env" : "none";
  const updatedAt = row?.updatedAt ?? null;
  return {
    status: row?.status ?? "unknown",
    since: row?.since ?? null,
    reason: row?.reason ?? null,
    source,
    updatedAt,
    expiresHint:
      source === "db" && updatedAt
        ? new Date(updatedAt.getTime() + KEY_TTL_MS)
        : null,
  };
}
