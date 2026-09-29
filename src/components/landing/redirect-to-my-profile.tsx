"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { landingTarget } from "@/lib/landing";
import type { LocalState } from "@/lib/local-store";
import { profileSlug } from "@/lib/riot-id";
import { useLocalReady, useLocalStore } from "@/lib/use-local-store";

const selectMyProfile = (state: LocalState) => state.myProfile;

/**
 * Sin `?inicio` y con «mi perfil» guardado en el navegador, sustituye `/` por su perfil
 * (`router.replace`: la landing no queda en el historial). Con `?inicio` no redirige y ofrece el
 * enlace a «mi perfil».
 *
 * La decisión espera a `useLocalReady()`: en el servidor y al hidratar el estado local está vacío,
 * y «sin mi perfil» todavía no es un dato. Mientras tanto la landing se ve entera (el buscador no
 * depende de este componente) y no se pinta nada aquí. Usa `useSearchParams`, así que la página
 * lo monta dentro de un `Suspense`.
 */
export function RedirectToMyProfile() {
  const router = useRouter();
  const hasInicio = useSearchParams().has("inicio");
  const ready = useLocalReady();
  const myProfile = useLocalStore(selectMyProfile);

  const target = ready ? landingTarget(myProfile, hasInicio) : null;
  useEffect(() => {
    if (target) router.replace(`/euw/${target}`);
  }, [target, router]);

  if (!ready || !hasInicio || !myProfile) return null;
  return (
    <Link
      // Sin prefetch: el perfil es dinámico y consulta la BD (y puede lanzar una sincronización).
      prefetch={false}
      href={`/euw/${profileSlug(myProfile.gameName, myProfile.tagLine)}`}
      className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2 hover:border-faint"
    >
      Ir a mi perfil ({myProfile.gameName}#{myProfile.tagLine})
      <ArrowRight aria-hidden="true" size={16} />
    </Link>
  );
}
