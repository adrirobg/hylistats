import Link from "next/link";
import { Box } from "@/components/hy/box";
import { Chip } from "@/components/hy/chip";
import type { AlbumEntry } from "@/domain/album";
import type { RecordGame, Records } from "@/domain/records";
import { cn } from "@/lib/utils";
import { ChampionThumb } from "./match-parts";
import {
  type ChampionRef,
  championRef,
  DAYS_NOTE,
  dayModel,
  deathlessEmpty,
  firstTryModel,
  foldedLabel,
  formatCount,
  formatGameDate,
  type RecordCardModel,
  recordCards,
  STATS_EMPTY,
  splitDeathless,
  statsChampionHref,
  statsMatchHref,
  streakModel,
  topChampionDetail,
} from "./stats-panel-view";
import { Titled } from "./tab-panel";

// Pestaña Estadísticas (spec «Pestaña Estadísticas»): cinco bloques a ancho de pestaña —récords de
// una partida, victorias especiales, rachas, días y campeones—. Es un componente de servidor sin
// JS de cliente: los enlaces (a la partida y al panel de campeón) se calculan desde el `slug` del
// perfil, como la forma del raíl, y la lista plegable es un `<details>`. Las cifras y los textos
// salen de `stats-panel-view.ts`; aquí solo se pinta.

interface StatsPanelProps {
  records: Records;
  /** Nombre, retrato y slug de cada campeón (`ProfileView.album`). */
  album: readonly AlbumEntry[];
  /** Segmento de la URL del perfil: de ahí salen los enlaces. */
  slug: string;
}

/** Columnas que bajan a una sola a 375 px sin depender del ancho de la ventana. */
const GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-3";

/** Rótulo de cada cifra, como los de los grupos de Destacados. */
const LABEL = "text-[13px] text-muted-foreground";
const BIG =
  "font-display text-[40px] leading-none font-extrabold tracking-tight tabular-nums";
const EMPTY = "text-sm text-muted-foreground";
/** Enlace de texto dentro de una frase (fechas de las rachas). */
const TEXT_LINK =
  "underline decoration-line underline-offset-2 hover:text-foreground";

export function StatsPanel({ records, album, slug }: StatsPanelProps) {
  const hasWins = records.longestWinStreak !== null;
  return (
    <>
      <Box
        title={<Titled>Récords</Titled>}
        hint="de una sola partida"
        titleAs="h2"
      >
        <ul className={GRID}>
          {recordCards(records.records).map((card) => (
            <li key={card.key} className="flex">
              <RecordCard card={card} album={album} slug={slug} />
            </li>
          ))}
        </ul>
      </Box>

      <Box title="Victorias especiales" titleAs="h2">
        <div className={GRID}>
          <DeathlessWins
            wins={records.deathlessWins}
            hasWins={hasWins}
            album={album}
            slug={slug}
          />
          <RecordCard
            card={{
              key: "deaths",
              label: "Victoria con más muertes",
              value: records.mostDeathsWin
                ? formatCount(records.mostDeathsWin.value)
                : null,
              game: records.mostDeathsWin,
            }}
            emptyText={STATS_EMPTY.noFirsts}
            unit="muertes"
            album={album}
            slug={slug}
          />
        </div>
      </Box>

      <Box title="Rachas" titleAs="h2">
        <div className={GRID}>
          <Streak
            label="Más 1º seguidos"
            streak={records.longestWinStreak}
            empty={STATS_EMPTY.winStreak}
            gold
            slug={slug}
          />
          <Streak
            label="Más partidas seguidas sin 1º"
            streak={records.longestDrought}
            empty={STATS_EMPTY.drought}
            slug={slug}
          />
        </div>
      </Box>

      <Box title={<Titled>Días</Titled>} hint="por puesto medio" titleAs="h2">
        {records.bestDay && records.worstDay ? (
          <div className={GRID}>
            <Day label="Mejor día" day={records.bestDay} gold />
            <Day label="Peor día" day={records.worstDay} />
          </div>
        ) : (
          <p className={EMPTY}>{STATS_EMPTY.days}</p>
        )}
        <p className="mt-2.5 text-[13px] text-faint">{DAYS_NOTE}</p>
      </Box>

      <Box title="Campeones" titleAs="h2">
        <div className={GRID}>
          <FirstTry stats={records.firstTry} />
          <TopChampion
            champion={records.topChampion}
            album={album}
            slug={slug}
          />
        </div>
      </Box>
    </>
  );
}

// --- Piezas --------------------------------------------------------------------------------

/** Retrato, nombre y fecha de una partida: el pie de cada récord. El nombre ya está en el texto. */
function GameLine({
  game,
  champion,
}: {
  game: RecordGame;
  champion: ChampionRef;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="flex">
        <ChampionThumb
          championId={champion.championId}
          name={champion.name}
          portraitUrl={champion.portraitUrl}
          size="row"
        />
      </span>
      <span className="min-w-0">
        <span className="block font-medium [overflow-wrap:anywhere]">
          {champion.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {formatGameDate(game.gameCreation)}
        </span>
      </span>
    </span>
  );
}

/**
 * Un récord: la cifra grande, el campeón y la fecha. Todo el bloque es un enlace a la partida
 * (`?tab=partidas&partida=…`). Sin partida (ningún dato) es una caja discontinua con el motivo.
 */
function RecordCard({
  card,
  album,
  slug,
  unit,
  emptyText = STATS_EMPTY.noValue,
}: {
  card: RecordCardModel;
  album: readonly AlbumEntry[];
  slug: string;
  /** Unidad pequeña junto a la cifra (`muertes`); los récords de una cifra no la llevan. */
  unit?: string;
  emptyText?: string;
}) {
  const { game } = card;
  if (!game || card.value === null) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-md border border-dashed border-line p-3">
        <h3 className={LABEL}>{card.label}</h3>
        <p className={EMPTY}>{emptyText}</p>
      </div>
    );
  }
  const champion = championRef(album, game.championId, game.championName);
  return (
    <Link
      // Sin prefetch: Partidas es dinámica y hay hasta ocho enlaces a partida en la pestaña.
      prefetch={false}
      scroll={false}
      href={statsMatchHref(slug, game.matchId)}
      className="flex w-full min-w-0 flex-col gap-2 rounded-md bg-surface-2 p-3 hover:bg-line"
    >
      <span className={LABEL}>{card.label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={BIG}>{card.value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </span>
      <GameLine game={game} champion={champion} />
      <span className="sr-only"> · abrir partida</span>
    </Link>
  );
}

/** Enlace pequeño a una partida (retrato, nombre y fecha), como los chips de Destacados. */
function GameChip({
  game,
  album,
  slug,
}: {
  game: RecordGame;
  album: readonly AlbumEntry[];
  slug: string;
}) {
  const champion = championRef(album, game.championId, game.championName);
  return (
    <Link
      prefetch={false}
      scroll={false}
      href={statsMatchHref(slug, game.matchId)}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-2.5 pl-1 text-[13px] hover:bg-line"
    >
      <span aria-hidden="true" className="flex">
        <ChampionThumb
          championId={champion.championId}
          name={champion.name}
          portraitUrl={champion.portraitUrl}
          size="chip"
        />
      </span>
      <span>{champion.name}</span>
      <span className="text-muted-foreground">
        {formatGameDate(game.gameCreation)}
      </span>
    </Link>
  );
}

/** Victorias sin morir: el total y la lista de partidas, plegada a partir de la quinta. */
function DeathlessWins({
  wins,
  hasWins,
  album,
  slug,
}: {
  wins: Records["deathlessWins"];
  hasWins: boolean;
  album: readonly AlbumEntry[];
  slug: string;
}) {
  const { visible, folded } = splitDeathless(wins.matches);
  return (
    <section className="min-w-0 rounded-md bg-surface-2 p-3">
      <h3 className={cn(LABEL, "mb-2")}>Victorias sin morir</h3>
      {wins.count === 0 ? (
        <p className={EMPTY}>{deathlessEmpty(hasWins)}</p>
      ) : (
        <>
          <p className={cn(BIG, "mb-3 text-place-1")}>{wins.count}</p>
          <ul className="flex flex-wrap gap-2">
            {visible.map((game) => (
              <li key={game.matchId}>
                <GameChip game={game} album={album} slug={slug} />
              </li>
            ))}
          </ul>
          {folded.length > 0 && (
            <details className="group/fold mt-2">
              <summary className="w-fit cursor-pointer rounded text-[13px] text-muted-foreground hover:text-foreground">
                <span className="group-open/fold:hidden">
                  {foldedLabel(folded.length)}
                </span>
                <span className="hidden group-open/fold:inline">Ver menos</span>
              </summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {folded.map((game) => (
                  <li key={game.matchId}>
                    <GameChip game={game} album={album} slug={slug} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** Una racha: nº de partidas, rango de fechas (cada extremo enlaza a su partida) y «en curso». */
function Streak({
  label,
  streak,
  empty,
  gold = false,
  slug,
}: {
  label: string;
  streak: Records["longestWinStreak"];
  empty: string;
  gold?: boolean;
  slug: string;
}) {
  const model = streak ? streakModel(streak) : null;
  return (
    <section className="min-w-0 rounded-md bg-surface-2 p-3">
      <h3 className={cn(LABEL, "mb-2")}>{label}</h3>
      {model ? (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className={cn(BIG, gold && "text-place-1")}>
              {model.length}
            </span>
            <span className="text-sm text-muted-foreground">{model.unit}</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {model.single ? (
              <>
                el{" "}
                <Link
                  prefetch={false}
                  scroll={false}
                  href={statsMatchHref(slug, model.from.matchId)}
                  className={TEXT_LINK}
                >
                  {model.from.date}
                </Link>
              </>
            ) : model.sameDay ? (
              <>
                el {model.from.date}:{" "}
                <Link
                  prefetch={false}
                  scroll={false}
                  href={statsMatchHref(slug, model.from.matchId)}
                  className={TEXT_LINK}
                >
                  primera partida
                </Link>{" "}
                ·{" "}
                <Link
                  prefetch={false}
                  scroll={false}
                  href={statsMatchHref(slug, model.to.matchId)}
                  className={TEXT_LINK}
                >
                  última
                </Link>
              </>
            ) : (
              <>
                del{" "}
                <Link
                  prefetch={false}
                  scroll={false}
                  href={statsMatchHref(slug, model.from.matchId)}
                  className={TEXT_LINK}
                >
                  {model.from.date}
                </Link>{" "}
                al{" "}
                <Link
                  prefetch={false}
                  scroll={false}
                  href={statsMatchHref(slug, model.to.matchId)}
                  className={TEXT_LINK}
                >
                  {model.to.date}
                </Link>
              </>
            )}
          </p>
          {model.ongoing && (
            <Chip variant="me" className="mt-2 inline-block">
              en curso
            </Chip>
          )}
        </>
      ) : (
        <p className={EMPTY}>{empty}</p>
      )}
    </section>
  );
}

/** Mejor o peor día: puesto medio con 2 decimales, fecha y nº de partidas. */
function Day({
  label,
  day,
  gold = false,
}: {
  label: string;
  day: NonNullable<Records["bestDay"]>;
  gold?: boolean;
}) {
  const model = dayModel(day);
  return (
    <section className="min-w-0 rounded-md bg-surface-2 p-3">
      <h3 className={cn(LABEL, "mb-2")}>{label}</h3>
      <p className="flex items-baseline gap-1.5">
        <span className={cn(BIG, gold && "text-place-1")}>{model.avg}</span>
        <span className="text-sm text-muted-foreground">puesto medio</span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {model.date} · {model.games}
      </p>
    </section>
  );
}

/** Victorias a la primera: cuántos campeones ganados lo fueron en su primera partida, y el %. */
function FirstTry({ stats }: { stats: Records["firstTry"] }) {
  const model = firstTryModel(stats);
  return (
    <section className="min-w-0 rounded-md bg-surface-2 p-3">
      <h3 className={cn(LABEL, "mb-2")}>Victorias a la primera</h3>
      {model ? (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className={cn(BIG, "text-place-1")}>{model.count}</span>
            <span className="text-sm text-muted-foreground">{model.of}</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {model.rate} ganados en su primera partida con el campeón.
          </p>
        </>
      ) : (
        <p className={EMPTY}>{STATS_EMPTY.firstTry}</p>
      )}
    </section>
  );
}

/** Campeón con más 1º: enlace a su panel (`?campeon`), sin salir de Estadísticas. */
function TopChampion({
  champion,
  album,
  slug,
}: {
  champion: Records["topChampion"];
  album: readonly AlbumEntry[];
  slug: string;
}) {
  if (!champion) {
    return (
      <section className="min-w-0 rounded-md border border-dashed border-line p-3">
        <h3 className={cn(LABEL, "mb-2")}>Campeón con más 1º</h3>
        <p className={EMPTY}>{STATS_EMPTY.noFirsts}</p>
      </section>
    );
  }
  const ref = championRef(album, champion.championId, champion.championName);
  const body = (
    <>
      <span className={LABEL}>Campeón con más 1º</span>
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="flex">
          <ChampionThumb
            championId={ref.championId}
            name={ref.name}
            portraitUrl={ref.portraitUrl}
            size="row"
          />
        </span>
        <span className="min-w-0">
          <span className="block font-medium [overflow-wrap:anywhere]">
            {ref.name}
          </span>
          <span className="block text-sm text-muted-foreground">
            {topChampionDetail(champion.firsts, champion.games)}
          </span>
        </span>
      </span>
    </>
  );
  const cls = "flex min-w-0 flex-col gap-2 rounded-md bg-surface-2 p-3";
  // Un campeón fuera del álbum no tiene panel: se pinta sin enlace.
  return ref.slug === null ? (
    <section className={cls}>{body}</section>
  ) : (
    <Link
      prefetch={false}
      scroll={false}
      href={statsChampionHref(slug, ref.slug)}
      className={cn(cls, "hover:bg-line")}
    >
      {body}
      <span className="sr-only"> · abrir panel del campeón</span>
    </Link>
  );
}
