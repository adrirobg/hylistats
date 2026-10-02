"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { type GroupSyncSummary, refreshGroup } from "@/domain/group-sync";

// Server Actions del grupo (P9). Como `refreshAction` del perfil, no piden sesión de admin: las
// puede llamar cualquier visitante por POST directo, así que NO aceptan nada del cliente (ni una
// lista de perfiles ni un Riot ID): los miembros se leen del servidor y todo pasa por las reglas
// de la cola existente (`requestRefresh`), sin llamadas a Riot. La frescura automática de los
// miembros va en la petición de estado (`GET /api/estado?grupo=1`).

export type GroupRefreshState = { summary: GroupSyncSummary } | null;

/**
 * Botón «Actualizar grupo»: incremental interactivo por cada miembro, con el mismo límite que el
 * botón Actualizar del perfil (`active` si ya tiene job, `cooldown` si el último terminó hace
 * menos de 60 s).
 */
export async function refreshGroupAction(
  _previous: GroupRefreshState,
): Promise<GroupRefreshState> {
  const summary = await refreshGroup(getDb());
  revalidatePath("/euw/[slug]", "page");
  return { summary };
}
