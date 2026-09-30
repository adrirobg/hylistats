import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Box } from "@/components/hy/box";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { ARENA_GOD_THRESHOLD, getSeasonStart } from "@/lib/config";
import { getChampionCatalog } from "@/lib/ddragon";
import { formatDateTime } from "@/lib/format";
import { getGameData } from "@/lib/game-data";
import { parseProfileSlug, profileSlug } from "@/lib/riot-id";
import { Album } from "./album";
import { ArenaGodBar } from "./arena-god";
import { AutoRefresh } from "./auto-refresh";
import { Cabin } from "./cabin";
import { ChampionPanel } from "./champion-panel";
import { CHAMPION_PARAM } from "./champion-panel-view";
import { loadProfilePage, type ProfileView } from "./data";
import { FormStrip } from "./form-strip";
import { ProfileHeader } from "./header";
import { MatchesPanel } from "./matches-panel";
import { parseMatchParams } from "./matches-view";
import { NotFoundCard, UnregisteredCard } from "./profile-states";
import { Scoreboard } from "./scoreboard";
import { SummaryPanel } from "./summary-panel";
import { SyncBand } from "./sync-band";
import { TabPanel, Titled } from "./tab-panel";
import { Tabs } from "./tabs";
import { TeammatesPanel } from "./teammates-panel";
import { RailTeammates } from "./teammates-rail";
import { parseTeammateParams } from "./teammates-view";
import { TopBar } from "./top-bar";
import {
  emptyState,
  parseProfileTab,
  queryParams,
  syncBandModel,
} from "./view-model";

// Depende de la BD y cambia con el worker: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
  searchParams,
}: PageProps<"/euw/[slug]">) {
  const { slug } = await params;
  const riotId = parseProfileSlug(slug);
  if (!riotId) notFound();

  // `?tab` decide qué datos se cargan (solo los de la pestaña activa); `?min` y `?orden` cuántos
  // compañeros, y `?q`, `?puesto`, `?companero`, `?n` y `?partida` qué partidas. `?campeon` abre el
  // panel de campeón sobre cualquier pestaña. El catálogo de
  // campeones se pide a la vez que la BD (`getChampionCatalog` nunca lanza: sin Data Dragon el
  // álbum sale sin retratos). Los nombres e iconos de objetos y augments solo se piden con
  // `?partida`, cuando hay un detalle que pintar (`getGameData` tampoco lanza).
  const query = await searchParams;
  const tab = parseProfileTab(query.tab);
  const matches = parseMatchParams(queryParams(query));
  const catalog = getChampionCatalog();
  const data = await loadProfilePage(
    getDb(),
    riotId.gameName,
    riotId.tagLine,
    {
      tab,
      teammates: parseTeammateParams(queryParams(query)),
      matches,
      campeon: queryParams(query).get(CHAMPION_PARAM) ?? undefined,
    },
    getSeasonStart(),
    catalog,
    tab === "partidas" && matches.partida !== null
      ? catalog.then(({ version }) => getGameData(version))
      : undefined,
  );
  // Las actions identifican el perfil por el Riot ID de la URL (`riotIdNorm`), no por el canónico.
  const actionSlug = profileSlug(riotId.gameName, riotId.tagLine);

  return (
    // `tabIndex={-1}`: a él vuelve el foco al cerrar el panel de campeón abierto por URL.
    <main tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <TopBar />
      {data.kind === "profile" ? (
        <>
          <AutoRefresh slug={actionSlug} active={data.sync !== null} />
          <ProfileCabin data={data} slug={actionSlug} />
          <ChampionSheet data={data} />
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
      main={<ActivePanel data={data} slug={slug} />}
      rail={<RailBoxes data={data} slug={slug} />}
    />
  );
}

/** Panel de la pestaña activa. */
function ActivePanel({ data, slug }: { data: ProfileView; slug: string }) {
  switch (data.tab) {
    case "campeones":
      return <ChampionsPanel data={data} />;
    case "companeros":
      return <TeammatesTab data={data} />;
    case "partidas":
      return <MatchesTab data={data} />;
    case "resumen":
      return <SummaryTab data={data} slug={slug} />;
  }
}

// --- Panel de campeón ----------------------------------------------------------------------

/**
 * Panel de campeón (`?campeon=`, sobre cualquier pestaña): se monta una vez, fuera del panel de la
 * pestaña. Solo llega el campeón pedido (`data.champion`) y su entrada del álbum, no el álbum
 * entero. Dentro va en portal sobre `<body>`. `ChampionPanel` lee `?…` con `useSearchParams`.
 */
function ChampionSheet({ data }: { data: ProfileView }) {
  const { champion } = data;
  const entry = champion
    ? data.album.find((e) => e.championId === champion.championId)
    : undefined;
  if (!champion || !entry) return null;
  return (
    <Suspense fallback={null}>
      <ChampionPanel
        // Otro campeón (Atrás, otro cromo) es otra hoja: su estado de «abierta» empieza de cero.
        key={champion.championId}
        gameName={data.gameName}
        tagLine={data.tagLine}
        entry={entry}
        data={champion}
        nowMs={Date.now()}
      />
    </Suspense>
  );
}

// --- Pestaña Campeones (main) ------------------------------------------------------------

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Por qué no hay partidas (§5): nunca un «No matches» mudo, sino el porqué y qué hacer. */
function NoGames({
  empty,
  seasonStart,
}: {
  empty: "never" | "empty";
  seasonStart: Date;
}) {
  return empty === "never" ? (
    <Empty>
      Todavía no hay datos de este perfil: la primera sincronización no ha
      terminado. Pulsa Actualizar para reintentarla.
    </Empty>
  ) : (
    <Empty>
      {`No hay partidas de Arena desde el inicio de la temporada actual (${formatDateTime(seasonStart)}). Cuando juegues alguna, pulsa Actualizar.`}
    </Empty>
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
      {(empty === "never" || empty === "empty") && (
        <NoGames empty={empty} seasonStart={data.seasonStart} />
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

// --- Pestaña Compañeros (main) -----------------------------------------------------------

function TeammatesTab({ data }: { data: ProfileView }) {
  const empty = emptyState({
    games: data.summary.games,
    syncing: data.sync !== null,
    lastSyncedAt: data.lastSyncedAt?.getTime() ?? null,
  });
  return (
    <TabPanel tab="companeros">
      {empty === "syncing" && <TeammatesSkeleton />}
      {(empty === "never" || empty === "empty") && (
        <NoGames empty={empty} seasonStart={data.seasonStart} />
      )}
      {empty === null && (
        // `TeammatesPanel` lee `?min` y `?orden` con `useSearchParams`.
        <Suspense fallback={<TeammatesSkeleton />}>
          <TeammatesPanel teammates={data.teammates ?? []} nowMs={Date.now()} />
        </Suspense>
      )}
    </TabPanel>
  );
}

/** Controles y filas por rellenar mientras llega el backfill (§5: esqueleto, no un vacío). */
function TeammatesSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-3">
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-10" />
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  );
}

// --- Pestaña Partidas (main) -------------------------------------------------------------

function MatchesTab({ data }: { data: ProfileView }) {
  const empty = emptyState({
    games: data.summary.games,
    syncing: data.sync !== null,
    lastSyncedAt: data.lastSyncedAt?.getTime() ?? null,
  });
  return (
    <TabPanel tab="partidas">
      {empty === "syncing" && <MatchesSkeleton />}
      {(empty === "never" || empty === "empty") && (
        <NoGames empty={empty} seasonStart={data.seasonStart} />
      )}
      {empty === null && data.matches && (
        // `MatchesPanel` lee `?q`, `?puesto`, `?companero`, `?n` y `?partida` con `useSearchParams`.
        <Suspense fallback={<MatchesSkeleton />}>
          <MatchesPanel
            matches={data.matches}
            detail={data.matchDetail ?? null}
            nowMs={Date.now()}
          />
        </Suspense>
      )}
    </TabPanel>
  );
}

/** Filtros y filas por rellenar mientras llega el backfill (§5: esqueleto, no un vacío). */
function MatchesSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-3">
      <Skeleton className="h-9" />
      {Array.from({ length: 8 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

// --- Pestaña Resumen (main) --------------------------------------------------------------

function SummaryTab({ data, slug }: { data: ProfileView; slug: string }) {
  const empty = emptyState({
    games: data.summary.games,
    syncing: data.sync !== null,
    lastSyncedAt: data.lastSyncedAt?.getTime() ?? null,
  });
  return (
    <TabPanel tab="resumen">
      {empty === "syncing" && <SummarySkeleton />}
      {(empty === "never" || empty === "empty") && (
        <NoGames empty={empty} seasonStart={data.seasonStart} />
      )}
      {empty === null && data.summaryTab && (
        <SummaryPanel
          summary={data.summary}
          form={data.form}
          verifiedChampions={data.verifiedChampions}
          album={data.album}
          tab={data.summaryTab}
          slug={slug}
          nowMs={Date.now()}
        />
      )}
    </TabPanel>
  );
}

/** Marcador, evolución y destacados por rellenar mientras llega el backfill (§5: esqueleto, no un vacío). */
function SummarySkeleton() {
  return (
    <div aria-busy="true" className="grid gap-3">
      <Skeleton className="h-28" />
      <Skeleton className="h-56" />
      <Skeleton className="h-36" />
    </div>
  );
}

// --- Raíl --------------------------------------------------------------------------------

/**
 * Bloques del raíl (D2). A partir de 1100 px de contenedor el marcador vive aquí; por debajo lo
 * sustituye la franja bajo la barra Arena God (`strip`) y solo queda la forma, que el `Cabin`
 * deja al final del main, seguida de los compañeros con más partidas. Todo sale de `data` en el
 * servidor: sube en vivo con el `AutoRefresh` durante el backfill.
 */
function RailBoxes({ data, slug }: { data: ProfileView; slug: string }) {
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
        <FormStrip games={data.form} slug={slug} nowMs={Date.now()} />
      </Box>
      <Box
        title={<Titled>Compañeros</Titled>}
        hint="partidas juntos"
        titleAs="h2"
      >
        <RailTeammates teammates={data.railTeammates} />
      </Box>
    </>
  );
}
