import type { Metadata } from "next";
import { getDb } from "@/db";
import { listGroupMembers } from "@/domain/group";
import { TopBar } from "../euw/[slug]/top-bar";
import { TeamDraw } from "./team-draw";

// `noindex` y `X-Robots-Tag` los pone el layout raíz y `next.config.ts` para toda la app.
export const metadata: Metadata = { title: "Sorteo · hylistats" };

// Lee los miembros del grupo de la BD: nunca se prerenderiza.
export const dynamic = "force-dynamic";

// `/sorteo` (#19): sorteo de equipos para cuando se juega con 4 o más. Solo pide a la BD los nombres
// de los miembros (para las casillas); el sorteo ocurre entero en el navegador de quien sortea.
export default async function DrawPage() {
  const members = await listGroupMembers(getDb());
  return (
    <main className="flex flex-1 flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-[720px] min-w-0 px-0 pt-2 sm:pt-4">
        <h1 className="mb-1 font-display text-[40px] leading-none font-extrabold uppercase">
          Sorteo
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Los 3 primeros que salen forman el primer equipo; los demás van
          después, con desconocidos si faltan.
        </p>
        <TeamDraw members={members.map((member) => member.gameName)} />
      </div>
    </main>
  );
}
