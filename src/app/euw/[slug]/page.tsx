import { notFound } from "next/navigation";
import { Box } from "@/components/hy/box";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import type { ProfileChallenge } from "@/domain/queries";
import { formatDateTime, formatDecimal, formatPercent } from "@/lib/format";
import { parseProfileSlug, profileSlug } from "@/lib/riot-id";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "./auto-refresh";
import { Cabin } from "./cabin";
import { loadProfilePage, type ProfileView } from "./data";
import { ProfileHeader } from "./header";
import { NotFoundCard, UnregisteredCard } from "./profile-states";
import { SyncBand } from "./sync-band";
import { TopBar } from "./top-bar";
import {
  emptyState,
  type ProfileTab,
  parseProfileTab,
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

  const [query, data] = await Promise.all([
    searchParams,
    loadProfilePage(getDb(), riotId.gameName, riotId.tagLine),
  ]);
  // Las actions identifican el perfil por el Riot ID de la URL (`riotIdNorm`), no por el canónico.
  const actionSlug = profileSlug(riotId.gameName, riotId.tagLine);

  return (
    <main className="flex flex-1 flex-col">
      <TopBar />
      {data.kind === "profile" ? (
        <>
          <AutoRefresh slug={actionSlug} active={data.sync !== null} />
          <ProfileCabin
            data={data}
            slug={actionSlug}
            tab={parseProfileTab(query.tab)}
          />
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

function ProfileCabin({
  data,
  slug,
  tab,
}: {
  data: ProfileView;
  slug: string;
  tab: ProfileTab;
}) {
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
      // T07: barra Arena God de tres capas y aviso de descuadre (`data.challenge`,
      // `data.verifiedChampions`); ocupa la franja `arena-god` de `Cabin`.
      god={null}
      tabs={<Tabs active={tab} />}
      main={<ChampionsPanel data={data} />}
      rail={<RailPlaceholders summary={data.summary} />}
    />
  );
}

/** Pestañas del perfil; solo existe Campeones (Resumen, Compañeros y Partidas van en #3). */
function Tabs({ active }: { active: ProfileTab }) {
  return (
    <div
      role="tablist"
      aria-label="Secciones del perfil"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
    >
      <button
        type="button"
        role="tab"
        id="tab-campeones"
        aria-selected={active === "campeones"}
        aria-controls="panel-campeones"
        className="cursor-pointer px-3 pt-3.5 pb-3 font-medium whitespace-nowrap text-muted-foreground aria-selected:text-foreground aria-selected:shadow-[inset_0_-2px_0_var(--place-1)]"
      >
        Campeones
      </button>
    </div>
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

function ChampionsPanel({ data }: { data: ProfileView }) {
  const empty = emptyState({
    games: data.summary.games,
    syncing: data.sync !== null,
    lastSyncedAt: data.lastSyncedAt?.getTime() ?? null,
  });
  return (
    <div
      role="tabpanel"
      id="panel-campeones"
      aria-labelledby="tab-campeones"
      className="grid gap-4"
    >
      {/* T08: el álbum (filtros, bandas de cromos, vista lista) sustituye a lo que hay aquí. */}
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
        <VerifiedChampions
          champions={data.verifiedChampions}
          challenge={data.challenge}
        />
      )}
    </div>
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

/** El contador llega como float (75.0) pero es entero. */
const formatCounter = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

function challengeStatus({ comparison }: ProfileChallenge): string {
  switch (comparison.status) {
    case "match":
      return "cuadra";
    case "diff": {
      const diff = comparison.diff ?? 0;
      return `diferencia de ${diff > 0 ? "+" : ""}${diff}: la lista verificada solo ve el historial Match-V5 de esta temporada`;
    }
    case "unknown":
      return "contador no disponible";
  }
}

/**
 * Lista provisional de campeones verificados (la de iter-01 con los tokens nuevos) para no perder
 * información hasta que T07 (barra + aviso) y T08 (álbum) la sustituyan.
 */
function VerifiedChampions({
  champions,
  challenge,
}: {
  champions: ProfileView["verifiedChampions"];
  challenge: ProfileChallenge;
}) {
  const counter =
    challenge.value === null
      ? "602002"
      : `602002 = ${formatCounter(challenge.value)}${challenge.level ? ` (${challenge.level})` : ""}`;
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-[17px] font-bold tracking-[0.12em] text-place-1 uppercase">
        Campeones ganados verificados
      </h2>
      <p className="text-sm text-muted-foreground">
        {`${champions.length} verificados vs ${counter}: ${challengeStatus(challenge)}`}
      </p>
      {champions.length === 0 ? (
        <Empty>Todavía ninguno.</Empty>
      ) : (
        <ul className="grid gap-1.5">
          {champions.map((champion) => (
            <li
              key={champion.championId}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-md bg-surface-1 px-3 py-2"
            >
              <span className="font-medium [overflow-wrap:anywhere]">
                {champion.championName}
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                {champion.firsts} × 1º
              </span>
              <span className="col-span-2 font-mono text-xs text-faint [overflow-wrap:anywhere]">
                último {formatDateTime(champion.lastWinAt)} ·{" "}
                {champion.lastWinMatchId}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Raíl --------------------------------------------------------------------------------

function Kpi({
  value,
  label,
  gold,
}: {
  value: string;
  label: string;
  gold?: boolean;
}) {
  return (
    <div>
      <b
        className={cn(
          "block font-display text-[30px] leading-none font-extrabold",
          gold && "text-place-1",
        )}
      >
        {value}
      </b>
      <small className="mt-1 block text-[11px] text-muted-foreground">
        {label}
      </small>
    </div>
  );
}

/**
 * Marcadores de posición del raíl (T10): las cifras que ya existían, sin la distribución 1º–6º ni
 * la forma. T10 los sustituye por el marcador completo, la distribución y la tira de 20.
 */
function RailPlaceholders({ summary }: { summary: ProfileView["summary"] }) {
  return (
    <>
      <Box title="Marcador" titleAs="h2" hint="temporada">
        {/* T10: marcador completo (KPIs y distribución 1º–6º). */}
        <div className="grid grid-cols-4 gap-1.5">
          <Kpi value={String(summary.games)} label="partidas" />
          <Kpi value={String(summary.firsts)} label="1º" gold />
          <Kpi value={formatPercent(summary.top3Rate, 0)} label="top 3" />
          <Kpi
            value={
              summary.avgPlacement === null
                ? "-"
                : formatDecimal(summary.avgPlacement)
            }
            label="medio"
          />
        </div>
      </Box>
      <Box title="Forma" titleAs="h2" hint="últimas 20">
        {/* T10: tira de las últimas 20 partidas. */}
        <p className="text-sm text-muted-foreground">
          Las últimas partidas aparecerán aquí.
        </p>
      </Box>
    </>
  );
}
