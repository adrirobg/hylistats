import { Suspense } from "react";
import { Chip } from "@/components/hy/chip";
import { Logo } from "@/components/hy/logo";
import { ProfileLists } from "@/components/landing/profile-lists";
import { RedirectToMyProfile } from "@/components/landing/redirect-to-my-profile";
import { RiotIdSearch } from "@/components/landing/riot-id-search";

// Landing (brief §3.1). Es estática: los datos del navegador (recientes, favoritos, «mi perfil») y
// `?inicio` los resuelven los componentes cliente, que el servidor pinta vacíos.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between py-4">
        <h1 className="inline-flex items-center gap-2.5 font-display text-[28px] leading-none font-extrabold tracking-[0.02em] uppercase">
          <Logo />
          hylistats
        </h1>
        {/* Región fija (F10): etiqueta, sin selector. */}
        <Chip>EUW</Chip>
      </header>
      <div className="mx-auto grid w-full max-w-[640px] gap-3.5 px-1.5 pt-8 sm:pt-16">
        {/* `useSearchParams` exige `Suspense`; sin fallback: no hay nada que mostrar mientras tanto. */}
        <Suspense fallback={null}>
          <RedirectToMyProfile />
        </Suspense>
        <h2 className="font-display text-[40px] leading-none font-extrabold uppercase">
          ¿Quién eres?
        </h2>
        <RiotIdSearch />
        <p className="font-mono text-xs text-muted-foreground">
          Victoria = 1º puesto · temporada actual de Arena
        </p>
        <ProfileLists />
      </div>
    </main>
  );
}
