"use client";

import { useCallback, useMemo } from "react";
import { type LocalState, profileData } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { useLocalStore } from "@/lib/use-local-store";

// La capa de navegador de un perfil (brief §4.4 y D12): si es «mi perfil» y, solo entonces, sus
// objetivos y marcas manuales. La usan el álbum y el panel de campeón, que deben coincidir.

const selectMyProfile = (state: LocalState) => state.myProfile;
/** Sin marcas: el mismo conjunto siempre, para que los `useMemo` no se invaliden. */
const NO_IDS: ReadonlySet<number> = new Set();

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
 * perfil ajeno no se leen aunque existan (D12).
 */
export function useProfileLocal(
  gameName: string,
  tagLine: string,
): ProfileLocal {
  const norm = normalizeRiotId(gameName, tagLine);
  const myProfile = useLocalStore(selectMyProfile);
  const mine =
    myProfile !== null &&
    normalizeRiotId(myProfile.gameName, myProfile.tagLine) === norm;
  const selectData = useCallback(
    (state: LocalState) => profileData(state, norm),
    [norm],
  );
  const localData = useLocalStore(selectData);
  const targets = useMemo(
    () => (mine ? new Set(localData.targets) : NO_IDS),
    [mine, localData.targets],
  );
  const manual = useMemo(
    () => (mine ? new Set(localData.manual) : NO_IDS),
    [mine, localData.manual],
  );
  return { norm, mine, targets, manual };
}
