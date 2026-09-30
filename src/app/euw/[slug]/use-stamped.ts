"use client";

import { useEffect, useState } from "react";
import type { AlbumEntry } from "@/domain/album";
import { newlyWon, wonIds } from "./album-interaction";

/** Lo que dura la clase `stamp` en el cromo (sello: 0,25 s de espera + 0,5 s en `globals.css`). */
const STAMP_MS = 700;
const NO_IDS: ReadonlySet<number> = new Set();

interface Seen {
  key: string;
  album: readonly AlbumEntry[];
  ids: ReadonlySet<number>;
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Campeones que se «sellan» ahora: los que pasan a verificados entre dos renders con `album`
 * nuevo (el polling del backfill o un refresco traen un 1º). El primer render y el cambio de
 * perfil (`profileKey`) no animan nada, y con `prefers-reduced-motion: reduce` tampoco: el cromo
 * cambia de golpe. Se decide durante el render (no en un efecto) para que la clase `stamp` llegue
 * en el mismo pintado en que el cromo cambia de banda, sin un fotograma con el estado final.
 */
export function useStamped(
  album: readonly AlbumEntry[],
  profileKey: string,
): ReadonlySet<number> {
  const [seen, setSeen] = useState<Seen | null>(null);
  const [stamped, setStamped] = useState<ReadonlySet<number>>(NO_IDS);

  if (seen === null || seen.album !== album || seen.key !== profileKey) {
    const fresh = newlyWon(seen?.key === profileKey ? seen.ids : null, album);
    setSeen({ key: profileKey, album, ids: wonIds(album) });
    if (fresh.length > 0 && !prefersReducedMotion()) {
      setStamped((prev) => new Set([...prev, ...fresh]));
    }
  }

  useEffect(() => {
    if (stamped.size === 0) return;
    const timer = setTimeout(() => setStamped(NO_IDS), STAMP_MS);
    return () => clearTimeout(timer);
  }, [stamped]);

  return stamped;
}
