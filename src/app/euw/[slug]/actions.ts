"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { type Db, getDb } from "@/db";
import { profiles } from "@/db/schema";
import { parseProfileSlug, type RiotId } from "@/lib/riot-id";
import {
  normalizeRiotId,
  type RefreshResult,
  registerProfile,
  requestRefresh,
  wakeWorker,
} from "@/worker/queue";

// Server Actions de `/euw/{nombre}-{tag}`. Son alcanzables por POST directo: el `slug` es entrada
// no confiable, se valida con `parseProfileSlug` y solo se opera sobre el perfil que resuelve
// (por `riotIdNorm`; el `puuid` no interviene). Reciben el slug de la URL, no el Riot ID
// canónico de Riot, que puede diferir del tecleado.

/** Ruta de la página, como patrón: casa con el slug tal como llegue codificado en la URL. */
const PROFILE_PAGE = "/euw/[slug]";

export type RefreshState = { result: RefreshResult | "not_found" } | null;

function riotIdOf(slug: unknown): RiotId | null {
  return typeof slug === "string" ? parseProfileSlug(slug) : null;
}

async function findProfileId(db: Db, riotId: RiotId): Promise<number | null> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      eq(profiles.riotIdNorm, normalizeRiotId(riotId.gameName, riotId.tagLine)),
    )
    .limit(1);
  return row?.id ?? null;
}

/** "Registrar y sincronizar": alta del perfil (con su backfill) y despertar al worker. */
export async function registerProfileAction(formData: FormData): Promise<void> {
  const riotId = riotIdOf(formData.get("slug"));
  if (!riotId) notFound();
  await registerProfile(getDb(), riotId.gameName, riotId.tagLine);
  wakeWorker();
  revalidatePath(PROFILE_PAGE, "page");
}

/**
 * Botón "Actualizar": refresco interactivo (el worker lo atiende antes que el resto). Devuelve
 * `queued`, `active` (ya hay un job en curso) o `cooldown` (el último terminó hace < 60 s).
 */
export async function refreshAction(
  _previous: RefreshState,
  formData: FormData,
): Promise<RefreshState> {
  const riotId = riotIdOf(formData.get("slug"));
  if (!riotId) return { result: "not_found" };
  const db = getDb();
  const profileId = await findProfileId(db, riotId);
  if (profileId === null) return { result: "not_found" };
  const result = await requestRefresh(db, profileId, { interactive: true });
  wakeWorker();
  revalidatePath(PROFILE_PAGE, "page");
  return { result };
}
