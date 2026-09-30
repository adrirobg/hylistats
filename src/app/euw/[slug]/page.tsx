import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Box } from "@/components/hy/box";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { ARENA_GOD_THRESHOLD, getSeasonStart } from "@/lib/config";
import { getChampionCatalog } from "@/lib/ddragon";
import { formatDateTime } from "@/lib/format";
import { parseProfileSlug, profileSlug } from "@/lib/riot-id";
import { Album } from "./album";
import { ArenaGodBar } from "./arena-god";
import { AutoRefresh } from "./auto-refresh";
import { Cabin } from "./cabin";
import { loadProfilePage, type ProfileView } from "./data";
import { FormStrip } from "./form-strip";
import { ProfileHeader } from "./header";
import { NotFoundCard, UnregisteredCard } from "./profile-states";
import { Scoreboard } from "./scoreboard";
import { SyncBand } from "./sync-band";
import { PendingPanel, TabPanel } from "./tab-panel";
import { Tabs } from "./tabs";
import { TopBar } from "./top-bar";
import { emptyState, parseProfileTab, syncBandModel } from "./view-model";

// Depende de la BD y cambia con el worker: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
  searchParams,
}: PageProps<"/euw/[slug]">) {
  const { slug } = await params;
  const riotId = parseProfileSlug(slug);
  if (!riotId) notFound();

  // `?tab` decide qué datos se cargan (solo los de la pestaña activa). El catálogo de campeones se
  // pide a la vez que la BD (`getChampionCatalog` nunca lanza: sin Data Dragon el álbum sale sin
  // retratos).
  const tab = parseProfileTab((await searchParams).tab);
  const data = await loadProfilePage(
    getDb(),
    riotId.gameName,
    riotId.tagLine,
    { tab },
    getSeasonStart(),
    getChampionCatalog(),
  );
  // Las actions identifican el perfil por el Riot ID de la URL (`riotIdNorm`), no por el canónico.
  const actionSlug = profileSlug(riotId.gameName, riotId.tagLine);

  return (
    <main className="flex flex-1 flex-col">
      <TopBar />
      {data.kind === "profile" ? (
        <>
          <AutoRefresh slug={actionSlug} active={data.sync !== null} />
          <ProfileCabin data={data} slug={actionSlug} />
        </>
      ) : (
        <div className="mx-auto w-full max-w-[640px] px-1.5 pt-4 sm:pt-10">
          <h1 className="mb-4 font-display text-[40px] leading-none font-extrabold uppercase [overflow-wrap:anywhere]">
            {data.gameName}
            <span className="text-faint">#{data.tagLine}</span>
          </h1>
          {data.kind === "unregistered" ? (
            <UnregisteredCard
              slug={actionSlug}
              gameName={data.gameName}
              tagLine={data.tagLine}
            />
          ) : (
            <NotFoundCard
              slug={actionSlug}
              gameName={data.gameName}
              tagLine={data.tagLine}
            />
          )}
        </div>
      )}
    </main>
  );
}

// --- Cabina ------------------------------------------------------------------------------

function ProfileCabin({ data, slug }: { data: ProfileView; slug: string }) {
  const band = syncBandModel(data.sync, data.paused);
  return (
    <Cabin
      header={
        <ProfileHeader
          slug={slug}
          gameName={data.gameName}
          tagLine={data.tagLine}
          nowMs={Date.now()}
          lastGameAt={data.lastGameAt}
          lastSyncedAt={data.lastSyncedAt?.getTime() ?? null}
          sync={data.sync}
          lastJobErrorAt={data.lastJobError?.at.getTime() ?? null}
          paused={data.paused}
          games={data.summary.games}
          champions={data.verifiedChampions.map((c) => ({
            championId: c.championId,
            championName: c.championName,
          }))}
        />
      }
      band={band && <SyncBand model={band} />}
      god={
        <ArenaGodBar
          gameName={data.gameName}
          tagLine={data.tagLine}
          verifiedIds={data.verifiedChampions.map((c) => c.championId)}
          official={data.challenge.value}
          checkedAt={data.challenge.checkedAt?.getTime() ?? null}
          goal={ARENA_GOD_THRESHOLD}
          nowMs={Date.now()}
        />
      }
      strip={<Scoreboard summary={data.summary} variant="strip" />}
      tabs={<Tabs active={data.tab} />}
      main={<ActivePanel data={data} />}
      rail={<RailBoxes data={data} />}
    />
  );
}

/** Panel de la pestaña activa. Resumen, Compañeros y Partidas son esqueletos hasta T07, T04 y T05. */
function ActivePanel({ data }: { data: ProfileView }) {
  switch (data.tab) {
    case "campeones":
      return <ChampionsPanel data={data} />;
    case "resumen":
    case "companeros":
    case "partidas":
      return <PendingPanel tab={data.tab} />;
  }
}

// --- Pestaña Campeones (main) ------------------------------------------------------------

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function ChampionsPanel({ data }: { data: ProfileView }) {
  const empty = emptyState({
    games: data.summary.games,
    syncing: data.sync !== null,
    lastSyncedAt: data.lastSyncedAt?.getTime() ?? null,
  });
  return (
    <TabPanel tab="campeones">
      {empty === "syncing" && <AlbumSkeleton />}
      {empty === "never" && (
        <Empty>
          Todavía no hay datos de este perfil: la primera sincronización no ha
          terminado. Pulsa Actualizar para reintentarla.
        </Empty>
      )}
      {/* Nunca un «No matches» mudo (§5): el porqué y qué hacer. */}
      {empty === "empty" && (
        <Empty>
          {`No hay partidas de Arena desde el inicio de la temporada actual (${formatDateTime(data.seasonStart)}). Cuando juegues alguna, pulsa Actualizar.`}
        </Empty>
      )}
      {empty === null && (
        // `Album` lee `?vista`, `?filtro`, `?q` y `?orden` con `useSearchParams`.
        <Suspense fallback={<AlbumSkeleton />}>
          <Album
            gameName={data.gameName}
            tagLine={data.tagLine}
            album={data.album}
            nowMs={Date.now()}
          />
        </Suspense>
      )}
    </TabPanel>
  );
}

/** Cromos por procesar mientras llega el backfill (§5: esqueleto, no un vacío). */
function AlbumSkeleton() {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2.5 gap-y-3"
    >
      {Array.from({ length: 12 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}

// --- Raíl --------------------------------------------------------------------------------

/**
 * Título de una `Box` con nota (`hint`): a la vista son dos textos separados, como en la maqueta;
 * el « · » oculto hace que el encabezado se lea entero («Marcador · 1º = victoria»).
 */
function Titled({ children }: { children: string }) {
  return (
    <>
      {children}
      <span className="sr-only"> · </span>
    </>
  );
}

/**
 * Bloques del raíl (D2). A partir de 1100 px de contenedor el marcador vive aquí; por debajo lo
 * sustituye la franja bajo la barra Arena God (`strip`) y solo queda la forma, que el `Cabin`
 * deja al final del main. Todo sale de `data` en el servidor: sube en vivo con el `AutoRefresh`
 * durante el backfill.
 */
function RailBoxes({ data }: { data: ProfileView }) {
  return (
    <>
      <Box
        title={<Titled>Marcador</Titled>}
        hint="1º = victoria"
        titleAs="h2"
        className="@max-[1100px]:hidden"
      >
        <Scoreboard summary={data.summary} variant="rail" />
      </Box>
      <Box
        title={<Titled>Forma</Titled>}
        hint="últimas 20 · más reciente a la izquierda"
        titleAs="h2"
      >
        <FormStrip games={data.form} nowMs={Date.now()} />
      </Box>
    </>
  );
}
