"use client";

import { useCallback, useMemo } from "react";
import { type LocalState, shownProfileData } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { useLocalStore } from "@/lib/use-local-store";

// La capa de navegador de un perfil (brief §4.4 y D12): si es «mi perfil» y, solo entonces, sus
// objetivos y marcas manuales. La usan el álbum y el panel de campeón, que deben coincidir.

export interface ProfileLocal {
  /** `riotIdNorm` del perfil (`normalizeRiotId`): la clave de sus datos locales. */
  norm: string;
  /** ¿Es «mi perfil»? Antes de leer `localStorage` (y en el servidor) siempre `false`. */
  mine: boolean;
  /** `championId` marcados como objetivo; vacío fuera de «mi perfil». */
  targets: ReadonlySet<number>;
  /** `championId` marcados como ganados a mano; vacío fuera de «mi perfil». */
  manual: ReadonlySet<number>;
}

/**
 * «Mi perfil» se decide igual que en el header. Antes de leer `localStorage` (y en el servidor) el
 * estado local es el vacío, así que ahí no hay ni objetivos ni marcas. Objetivos y marcas de un
 * perfil ajeno no se leen aunque existan (D12): lo decide `shownProfileData`, que es puro y está
 * probado.
 */
export function useProfileLocal(
  gameName: string,
  tagLine: string,
): ProfileLocal {
  const norm = normalizeRiotId(gameName, tagLine);
  const selectShown = useCallback(
    (state: LocalState) => shownProfileData(state, { gameName, tagLine }),
    [gameName, tagLine],
  );
  const shown = useLocalStore(selectShown);
  const targets = useMemo(() => new Set(shown.targets), [shown.targets]);
  const manual = useMemo(() => new Set(shown.manual), [shown.manual]);
  return { norm, mine: shown.mine, targets, manual };
}
