import { profileSlug, type RiotId } from "@/lib/riot-id";

// Decisión de la landing (`/`), aparte del componente para poder probarla sin navegador.

/**
 * Slug del perfil al que `/` debe redirigir, o `null` si se muestra la landing. Solo redirige con
 * "mi perfil" guardado y sin `?inicio` (el parámetro fuerza la landing, sea cual sea su valor).
 */
export function landingTarget(
  myProfile: RiotId | null,
  hasInicio: boolean,
): string | null {
  if (!myProfile || hasInicio) return null;
  return profileSlug(myProfile.gameName, myProfile.tagLine);
}
