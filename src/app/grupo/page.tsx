import type { Metadata } from "next";
import { getDb } from "@/db";
import { loadGroupView } from "@/domain/group-view";
import { getChampionCatalog } from "@/lib/ddragon";
import { TopBar } from "../euw/[slug]/top-bar";
import { GroupFreshnessSection } from "./group-freshness-section";
import { GroupViewPanel } from "./group-view";
import { parsePeriodo } from "./group-view-model";

// `noindex` y `X-Robots-Tag` los pone el layout raíz y `next.config.ts` para toda la app.
export const metadata: Metadata = { title: "Grupo · hylistats" };

// Depende de la BD y cambia con el worker: nunca se prerenderiza.
export const dynamic = "force-dynamic";

// `/grupo` (F19, F20, F21): la vista del grupo con Hoy / Semana y Títulos. `?periodo=dia|semana`
// decide qué periodo se muestra. El catálogo de campeones se pide a la vez que la BD
// (`getChampionCatalog` nunca lanza): `championTotal` lo necesita, igual que el perfil.
export default async function GroupPage({ searchParams }: PageProps<"/grupo">) {
  const query = await searchParams;
  const view = await loadGroupView(
    getDb(),
    Date.now(),
    undefined,
    getChampionCatalog(),
  );
  return (
    <main className="flex flex-1 flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-[960px] min-w-0 px-0 pt-2 sm:pt-4">
        <h1 className="mb-4 font-display text-[40px] leading-none font-extrabold uppercase">
          Grupo
        </h1>
        <GroupViewPanel
          view={view}
          periodo={parsePeriodo(query.periodo)}
          freshness={<GroupFreshnessSection view={view} />}
        />
      </div>
    </main>
  );
}
