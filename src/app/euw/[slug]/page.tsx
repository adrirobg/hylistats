import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Box } from "@/components/hy/box";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { loadStatus } from "@/domain/status";
import { loadGroupSyncState } from "@/domain/sync-status";
import { getSeasonStart } from "@/lib/config";
import { getChampionCatalog } from "@/lib/ddragon";
import { formatDateTime } from "@/lib/format";
import { getGameData } from "@/lib/game-data";
import { parseProfileSlug, profileSlug } from "@/lib/riot-id";
import { GroupFreshness } from "../../grupo/group-freshness";
import { GroupViewPanel } from "../../grupo/group-view";
import { type Periodo, parsePeriodo } from "../../grupo/group-view-model";
import { Album } from "./album";
import { Cabin } from "./cabin";
import { ChampionPanel } from "./champion-panel";
import { CHAMPION_PARAM } from "./champion-panel-view";
import { loadProfilePage, type ProfileView } from "./data";
import { FormStrip } from "./form-strip";
import { GodTrophy } from "./god-trophy";
import { GroupLadder } from "./group-ladder";
import { LeagueTrophy } from "./league-trophy";
import { pickEloMatches, visibleMatchIds } from "./matches-elo";
import { MatchesPanel } from "./matches-panel";
import { parseMatchParams } from "./matches-view";
import { profilePageStatus } from "./page-status";
import { NotFoundCard, UnregisteredCard } from "./profile-states";
import { Scoreboard } from "./scoreboard";
import { StatsPanel } from "./stats-panel";
import { StatusProvider } from "./status-provider";
import { SummaryPanel } from "./summary-panel";
import { SyncBand } from "./sync-band";
import { SyncEmpty } from "./sync-empty";
import { TabPanel, Titled } from "./tab-panel";
import { Tabs } from "./tabs";
import { TeammatesPanel } from "./teammates-panel";
import { RailTeammates } from "./teammates-rail";
import { parseTeammateParams } from "./teammates-view";
import { TitleList } from "./title-list";
import { TopBar } from "./top-bar";
import { parseProfileTab, queryParams, visibleTabs } from "./view-model";
import { Vitrina } from "./vitrina";
import { TrophyCard, TrophyGrid } from "./vitrina-ui";
import type { VitrinaGroup } from "./vitrina-view";

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
  // Hora del servidor del estado inicial (`StatusProvider`): antes de cargar, como las versiones.
  const loadedAt = Date.now();
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
  // Estado con el que se pinta la página (`StatusProvider`, el único mecanismo de relectura). En
  // la vista del grupo (como `?grupo=1`) lleva también el de los miembros. «No encontrado» solo
  // pinta que Riot no lo conoce: manda el `kind` (si el estado dice otro, se repinta), así que su
  // estado se lee aquí, tras cargar.
  const groupView = data.kind === "profile" && data.tab === "grupo";
  const initial =
    data.kind === "profile"
      ? profilePageStatus(
          data,
          loadedAt,
          groupView ? await loadGroupSyncState(getDb()) : null,
        )
      : data.kind === "not_found"
        ? {
            ...(await loadStatus(getDb(), riotId, { group: false })),
            kind: data.kind,
          }
        : null;

  return (
    // `tabIndex={-1}`: a él vuelve el foco al cerrar el panel de campeón abierto por URL.
    <main tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <TopBar />
      {data.kind === "profile" && initial ? (
        <StatusProvider
          key={actionSlug}
          slug={actionSlug}
          group={groupView}
          initial={initial}
        >
          <ProfileCabin
            data={data}
            slug={actionSlug}
            periodo={parsePeriodo(query.periodo)}
          />
          <ChampionSheet data={data} />
        </StatusProvider>
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
            initial && (
              <StatusProvider
                key={actionSlug}
                slug={actionSlug}
                group={false}
                initial={initial}
              >
                <NotFoundCard
                  slug={actionSlug}
                  gameName={data.gameName}
                  tagLine={data.tagLine}
                />
              </StatusProvider>
            )
          )}
        </div>
      )}
    </main>
  );
}

// --- Cabina ------------------------------------------------------------------------------

function ProfileCabin({
  data,
  slug,
  periodo,
}: {
  data: ProfileView;
  slug: string;
  periodo: Periodo;
}) {
  const { elo } = data;
  const { group } = data.vitrina;
  return (
    <Cabin
      header={
        <Vitrina
          slug={slug}
          gameName={data.gameName}
          tagLine={data.tagLine}
          iconUrl={data.profileIconUrl}
          nowMs={Date.now()}
          lastGameAt={data.lastGameAt}
          arenaQuietSince={data.arenaQuiet?.lastArenaGameAt ?? null}
          arenaDeity={data.arenaGod.reached}
          league={
            elo && {
              id: elo.league.id,
              name: elo.league.name,
              rating: elo.roundedRating,
              provisional: elo.provisional,
            }
          }
          splashUrl={data.vitrina.splash?.splashUrl ?? null}
          games={data.summary.games}
          champions={data.verifiedChampions.map((c) => ({
            championId: c.championId,
            championName: c.championName,
          }))}
        >
          <TrophyGrid>
            {elo && group && (
              <TrophyCard>
                <LeagueTrophy elo={elo} facts={group.facts} />
              </TrophyCard>
            )}
            <TrophyCard>
              <GodTrophy
                gameName={data.gameName}
                tagLine={data.tagLine}
                verifiedIds={data.verifiedChampions.map((c) => c.championId)}
                official={data.challenge.value}
                checkedAt={data.challenge.checkedAt?.getTime() ?? null}
                goal={data.arenaGod.goal}
                goalName={data.arenaGod.name}
                nowMs={Date.now()}
              />
            </TrophyCard>
          </TrophyGrid>
        </Vitrina>
      }
      band={<SyncBand />}
      group={group && <VitrinaGroupBlock group={group} />}
      strip={<Scoreboard summary={data.summary} variant="strip" />}
      tabs={<Tabs active={data.tab} tabs={visibleTabs(data.isMember)} />}
      main={<ActivePanel data={data} slug={slug} periodo={periodo} />}
      rail={<RailBoxes data={data} slug={slug} />}
    />
  );
}

/**
 * Títulos y escalera del grupo bajo el banner (propuesta C2, `.c2-body`): dos columnas, la escalera
 * de 300 px a la derecha; por debajo de 980 px de contenedor, una sola, con la escalera debajo.
 */
function VitrinaGroupBlock({ group }: { group: VitrinaGroup }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] @max-[980px]:grid-cols-1">
      <TitleList rows={group.titles} />
      <div className="border-l border-line @max-[980px]:border-t @max-[980px]:border-l-0">
        <GroupLadder rows={group.ladder} facts={group.facts} />
      </div>
    </div>
  );
}

/** Panel de la pestaña activa. */
function ActivePanel({
  data,
  slug,
  periodo,
}: {
  data: ProfileView;
  slug: string;
  periodo: Periodo;
}) {
  switch (data.tab) {
    case "campeones":
      return <ChampionsPanel data={data} />;
    case "companeros":
      return <TeammatesTab data={data} />;
    case "partidas":
      return <MatchesTab data={data} />;
    case "resumen":
      return <SummaryTab data={data} slug={slug} />;
    case "estadisticas":
      return <StatsTab data={data} slug={slug} />;
    case "grupo":
      return <GroupTab data={data} periodo={periodo} />;
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

/**
 * Pestaña sin partidas: esqueleto mientras llega el backfill o el porqué. Lo elige el estado de la
 * página (`SyncEmpty`); `null` si hay partidas y se pinta el contenido.
 */
function NoGamesYet({
  data,
  skeleton,
}: {
  data: ProfileView;
  skeleton: ReactNode;
}) {
  if (data.summary.games > 0) return null;
  return (
    <SyncEmpty
      skeleton={skeleton}
      never={<NoGames empty="never" seasonStart={data.seasonStart} />}
      empty={<NoGames empty="empty" seasonStart={data.seasonStart} />}
    />
  );
}

function ChampionsPanel({ data }: { data: ProfileView }) {
  const empty = data.summary.games === 0;
  return (
    <TabPanel tab="campeones">
      <NoGamesYet data={data} skeleton={<AlbumSkeleton />} />
      {!empty && (
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
  const empty = data.summary.games === 0;
  return (
    <TabPanel tab="companeros">
      <NoGamesYet data={data} skeleton={<TeammatesSkeleton />} />
      {!empty && (
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
  const empty = data.summary.games === 0;
  return (
    <TabPanel tab="partidas">
      <NoGamesYet data={data} skeleton={<MatchesSkeleton />} />
      {!empty && data.matches && (
        // `MatchesPanel` lee `?q`, `?puesto`, `?companero`, `?n` y `?partida` con `useSearchParams`.
        <Suspense fallback={<MatchesSkeleton />}>
          <MatchesPanel
            matches={data.matches}
            detail={data.matchDetail ?? null}
            nowMs={Date.now()}
            // Solo el desglose de lo que el panel puede pintar (filas y partida abierta): el de
            // toda la temporada viajaría en cada `router.refresh()`.
            elo={pickEloMatches(
              data.elo?.matches ?? null,
              visibleMatchIds(data.matches.rows, data.matchDetail),
            )}
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
  const empty = data.summary.games === 0;
  return (
    <TabPanel tab="resumen">
      <NoGamesYet data={data} skeleton={<SummarySkeleton />} />
      {!empty && data.summaryTab && (
        <SummaryPanel
          summary={data.summary}
          form={data.form}
          verifiedChampions={data.verifiedChampions}
          album={data.album}
          tab={data.summaryTab}
          elo={data.elo}
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

// --- Pestaña Estadísticas (main) ---------------------------------------------------------

function StatsTab({ data, slug }: { data: ProfileView; slug: string }) {
  const empty = data.summary.games === 0;
  return (
    <TabPanel tab="estadisticas">
      <NoGamesYet data={data} skeleton={<StatsSkeleton />} />
      {!empty && data.records && (
        <StatsPanel records={data.records} album={data.album} slug={slug} />
      )}
    </TabPanel>
  );
}

/** Los bloques por rellenar mientras llega el backfill (§5: esqueleto, no un vacío). */
function StatsSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-3">
      <Skeleton className="h-56" />
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}

// --- Pestaña Grupo (main) ----------------------------------------------------------------

/** La vista del grupo con la fila del dueño del perfil destacada (`data.group` solo existe en miembros). */
function GroupTab({ data, periodo }: { data: ProfileView; periodo: Periodo }) {
  return (
    <TabPanel tab="grupo">
      {data.group && (
        <GroupViewPanel
          view={data.group.view}
          periodo={periodo}
          highlightKey={data.group.ownerKey}
          freshness={<GroupFreshness />}
        />
      )}
    </TabPanel>
  );
}

// --- Raíl --------------------------------------------------------------------------------

/**
 * Bloques del raíl (D2). A partir de 1100 px de contenedor el marcador vive aquí; por debajo lo
 * sustituye la franja bajo la vitrina (`strip`) y solo queda la forma, que el `Cabin`
 * deja al final del main, seguida de los compañeros con más partidas. Todo sale de `data` en el
 * servidor: sube en vivo durante el backfill con los repintados de `StatusProvider`.
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
