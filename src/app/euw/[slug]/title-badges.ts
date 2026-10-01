// Vista-modelo de los badges de títulos de la cabecera del perfil (iter-05, T08): mapea los
// `PlayerTitle` vigentes de un miembro (`loadProfileTitles`) a las props de `Badge`, sin React ni
// navegador. Las reglas (qué títulos tiene cada uno, el texto de "por qué") salen del dominio: aquí
// solo se presentan. Un no miembro llega con la lista vacía y no muestra ningún badge.

import type { PlayerTitle } from "@/domain/group-titles";
import { TITLES_ANCHOR, TITLES_LINK_LABEL } from "../../grupo/group-view-model";

/** Enlace al apartado Títulos de `/grupo` (la cabecera del perfil no es la vista del grupo). */
export const TITLES_LINK = {
  href: `/grupo#${TITLES_ANCHOR}`,
  label: TITLES_LINK_LABEL,
} as const;

export interface TitleBadge {
  /** Clave estable: un mismo título en día y semana, o con dos poseedores, son badges distintos. */
  key: string;
  /** Nombre visible con su periodo: "El trol del día". */
  title: string;
  /** El "por qué" del poseedor: métrica, valor y partidas. */
  description: string;
  link: { href: string; label: string };
}

/** Un badge por título vigente, en el orden recibido (día primero, después semana). */
export function titleBadges(titles: readonly PlayerTitle[]): TitleBadge[] {
  return titles.map(({ title, holder }) => ({
    key: `${title.kind}:${title.id}:${holder.puuids.join(",")}`,
    title: title.name,
    description: holder.why,
    link: TITLES_LINK,
  }));
}
