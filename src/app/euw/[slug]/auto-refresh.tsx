"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";
import { ensureFreshOnViewAction } from "./actions";

/** Con un job activo el progreso se relee cada 3 s; sin él, cada 30 s (polling a la BD propia). */
const POLL_ACTIVE_MS = 3_000;
const POLL_IDLE_MS = 30_000;

/**
 * No pinta nada: mantiene la página al día. Al montarse pide (una vez por visita) refrescar el
 * perfil si sus datos son viejos, y después relee la página cada 3 s o 30 s según `active`.
 */
export function AutoRefresh({
  slug,
  active,
}: {
  slug: string;
  active: boolean;
}) {
  const router = useRouter();
  // Guarda por slug: en desarrollo (StrictMode) los efectos se ejecutan dos veces.
  const checkedSlug = useRef<string | null>(null);

  useEffect(() => {
    if (checkedSlug.current === slug) return;
    checkedSlug.current = slug;
    startTransition(async () => {
      try {
        const result = await ensureFreshOnViewAction(slug);
        // Si se encoló un job (o ya había uno), la página pasa a mostrar su progreso.
        if (result === "queued" || result === "active") router.refresh();
      } catch {
        // Mejor esfuerzo: si falla, la página sigue mostrando los datos y el polling continúa.
      }
    });
  }, [slug, router]);

  useEffect(() => {
    const timer = setInterval(
      () => router.refresh(),
      active ? POLL_ACTIVE_MS : POLL_IDLE_MS,
    );
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
