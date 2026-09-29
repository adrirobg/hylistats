import { notFound } from "next/navigation";
import { getDb } from "@/db";
import type { ProfileChallenge } from "@/domain/queries";
import { PLACEMENTS, type StatsSummary } from "@/domain/stats";
import { formatDateTime, formatDecimal, formatPercent } from "@/lib/format";
import { parseProfileSlug, profileSlug } from "@/lib/riot-id";
import { REFRESH_COOLDOWN_MS } from "@/worker/queue";
import { registerProfileAction } from "./actions";
import { AutoRefresh } from "./auto-refresh";
import {
  loadProfilePage,
  type ProfilePageData,
  type ProfileView,
  type SyncProgress,
} from "./data";
import { RefreshButton } from "./refresh-button";

// Depende de la BD y cambia con el worker: nunca se prerenderiza.
export const dynamic = "force-dynamic";

const CELL = "border-b border-gray-200 px-2 py-1";
const H2 = "mb-2 text-xl font-semibold";

export default async function ProfilePage({
  params,
}: PageProps<"/euw/[slug]">) {
  const { slug } = await params;
  const riotId = parseProfileSlug(slug);
  if (!riotId) notFound();

  const data = await loadProfilePage(getDb(), riotId.gameName, riotId.tagLine);
  // Las actions identifican el perfil por el Riot ID de la URL (`riotIdNorm`), no por el canónico.
  const actionSlug = profileSlug(riotId.gameName, riotId.tagLine);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <Header data={data} />
      {data.kind === "unregistered" && <Unregistered slug={actionSlug} />}
      {data.kind === "not_found" && <p>Ese Riot ID no existe en EUW.</p>}
      {data.kind === "profile" && (
        <>
          <AutoRefresh slug={actionSlug} active={data.sync !== null} />
          <SyncBlock data={data} slug={actionSlug} />
          <Summary summary={data.summary} />
          <Champions
            champions={data.verifiedChampions}
            challenge={data.challenge}
          />
        </>
      )}
    </main>
  );
}

function Header({ data }: { data: ProfilePageData }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold">
        {data.gameName}#{data.tagLine}
      </h1>
      <p className="text-sm text-gray-600">EUW</p>
      {data.kind === "profile" && (
        <p className="text-sm">
          Temporada desde {formatDateTime(data.seasonStart)}
        </p>
      )}
    </header>
  );
}

function Unregistered({ slug }: { slug: string }) {
  return (
    <section>
      <p className="mb-3">Este Riot ID todavía no está registrado.</p>
      <form action={registerProfileAction}>
        <input type="hidden" name="slug" value={slug} />
        <button
          type="submit"
          className="rounded border border-gray-400 px-3 py-1"
        >
          Registrar y sincronizar
        </button>
      </form>
    </section>
  );
}

function SyncBlock({ data, slug }: { data: ProfileView; slug: string }) {
  return (
    <section className="space-y-3">
      <h2 className={H2}>Sincronización</h2>
      {data.paused && (
        <p role="alert" className="rounded border border-amber-500 px-3 py-2">
          Actualización pausada: key caducada. Los datos son los de la última
          sincronización
        </p>
      )}
      <p>Última sincronización: {formatDateTime(data.lastSyncedAt)}</p>
      {data.sync && <SyncStatus sync={data.sync} />}
      <RefreshButton slug={slug} cooldownSeconds={REFRESH_COOLDOWN_MS / 1000} />
    </section>
  );
}

function SyncStatus({ sync }: { sync: SyncProgress }) {
  const what =
    sync.kind === "backfill" ? "Sincronización inicial" : "Actualización";
  switch (sync.phase) {
    case "resolving":
      return <p>{`${what}: resolviendo Riot ID…`}</p>;
    case "listing":
      return <p>{`${what}: listando… ${sync.listedIds} ids`}</p>;
    case "fetching":
      return (
        <p>
          {`${what}: descargando ${sync.fetched}/${sync.total} partidas `}
          {sync.total > 0 && <progress value={sync.fetched} max={sync.total} />}
        </p>
      );
  }
}

function Summary({ summary }: { summary: StatsSummary }) {
  return (
    <section>
      <h2 className={H2}>Cifras de la temporada</h2>
      <ul className="mb-4 list-disc pl-5">
        <li>Partidas: {summary.games}</li>
        <li>
          1º: {summary.firsts} ({formatPercent(summary.firstRate)})
        </li>
        <li>
          Top 3: {summary.top3} ({formatPercent(summary.top3Rate)})
        </li>
        <li>
          Puesto medio:{" "}
          {summary.avgPlacement === null
            ? "-"
            : formatDecimal(summary.avgPlacement)}
        </li>
      </ul>
      <table className="border-collapse text-left text-sm">
        <caption className="mb-1 text-left font-medium">
          Distribución de puestos
        </caption>
        <thead>
          <tr>
            <th className={CELL}>Puesto</th>
            <th className={CELL}>Partidas</th>
          </tr>
        </thead>
        <tbody>
          {PLACEMENTS.map((placement) => (
            <tr key={placement}>
              <td className={CELL}>{placement}º</td>
              <td className={CELL}>{summary.distribution[placement]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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

function Champions({
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
    <section>
      <h2 className={H2}>Campeones ganados verificados</h2>
      <p className="mb-3">
        {`${champions.length} verificados vs ${counter}: ${challengeStatus(challenge)}`}
      </p>
      {champions.length === 0 ? (
        <p>Todavía ninguno.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={CELL}>Campeón</th>
              <th className={CELL}>Nº de 1º</th>
              <th className={CELL}>Último 1º</th>
              <th className={CELL}>Partida</th>
            </tr>
          </thead>
          <tbody>
            {champions.map((champion) => (
              <tr key={champion.championId}>
                <td className={CELL}>{champion.championName}</td>
                <td className={CELL}>{champion.firsts}</td>
                <td className={CELL}>{formatDateTime(champion.lastWinAt)}</td>
                <td className={CELL}>{champion.lastWinMatchId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
