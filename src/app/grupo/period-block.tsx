import { Badge } from "@/components/hy/badge";
import { type GroupPeriodView, playerMinGames } from "@/domain/group-titles";
import { cn } from "@/lib/utils";
import {
  type BelowMinimumRow,
  type MemberRef,
  minimumLabel,
  periodCaption,
  periodNotice,
  type RankingRow,
  rankingModel,
  type TeamRow,
  TITLES_LINK_LABEL,
  type TitleRow,
  teamRows,
  titleRows,
} from "./group-view-model";
import { MemberName, MemberNames } from "./member-name";
import { HIGHLIGHT, involves, TD, TH, Th } from "./table-parts";

// Bloque Hoy / Semana (F20): periodo mostrado con su fecha, ranking por puesto medio con "sin
// mínimo" aparte, títulos del periodo (cada uno con su explicación en un `Badge`) y los dúos y
// tríos del periodo, donde aparecen los valores de los títulos de equipo. Componente de servidor
// sin JS propio: el selector que cambia el periodo es `PeriodSelector`, que monta quien lo usa.
// Todo el texto sale de `group-view-model.ts`.

interface PeriodBlockProps {
  view: GroupPeriodView;
  members: ReadonlyMap<string, MemberRef>;
  /** Clave del miembro de cuya fila se destaca (`GroupViewMember.key`). */
  highlightKey?: string;
  /** Destino del enlace de la explicación de cada título. */
  titlesHref: string;
}

export function PeriodBlock({
  view,
  members,
  highlightKey,
  titlesHref,
}: PeriodBlockProps) {
  const { period } = view;
  const notice = periodNotice(period);
  const ranking = rankingModel(view.ranking, members);
  const titles = titleRows(view.titles, members);
  const teams = teamRows(view.teams, members);
  const minGames = playerMinGames(period.kind);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">{periodCaption(period)}</p>
        {notice && (
          <p className="rounded-full border border-trust/35 bg-trust-bg px-2.5 py-0.5 text-xs text-foreground">
            {notice}
          </p>
        )}
      </div>

      {ranking.empty ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
          Nadie del grupo ha jugado todavía en la temporada actual.
        </p>
      ) : (
        <>
          <RankingTable
            rows={ranking.rows}
            highlightKey={highlightKey}
            minGames={minGames}
          />
          <BelowMinimum
            rows={ranking.belowMinimum}
            highlightKey={highlightKey}
            minGames={minGames}
          />
        </>
      )}

      <div>
        <h3 className="mb-1.5 text-[13px] text-muted-foreground">
          {period.kind === "day" ? "Títulos del día" : "Títulos de la semana"}
        </h3>
        <Titles
          rows={titles}
          titlesHref={titlesHref}
          highlightKey={highlightKey}
        />
      </div>

      {teams.length > 0 && (
        <TeamsTable
          rows={teams}
          highlightKey={highlightKey}
          caption={
            period.kind === "day"
              ? "Dúos y tríos del día"
              : "Dúos y tríos de la semana"
          }
        />
      )}
    </div>
  );
}

// --- Ranking -----------------------------------------------------------------------------

function RankingTable({
  rows,
  highlightKey,
  minGames,
}: {
  rows: RankingRow[];
  highlightKey?: string;
  minGames: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
        Nadie llega todavía al mínimo de {minimumLabel(minGames)} para entrar en
        el ranking.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table
        aria-label="Ranking por puesto medio"
        className="w-full border-collapse text-sm"
      >
        <thead>
          <tr>
            <th scope="col" className={cn(TH, "w-8 text-left")}>
              <span className="sr-only">Posición</span>
              <span aria-hidden="true">#</span>
            </th>
            <th scope="col" className={cn(TH, "text-left")}>
              Jugador
            </th>
            <Th label="Partidas" short="Part." />
            <Th label="1º" />
            <Th label="Puesto medio" short="Medio" />
            <Th label="Daño medio" short="Daño" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              aria-current={row.key === highlightKey ? "true" : undefined}
              className={cn(
                "border-b border-line last:border-b-0",
                row.key === highlightKey && HIGHLIGHT,
              )}
            >
              <td className={cn(TD, "num text-left text-muted-foreground")}>
                {row.position}
              </td>
              {/* `w-full max-w-0`: la columna absorbe el ancho que sobra y el nombre se recorta. */}
              <td className={cn(TD, "w-full max-w-0 text-left")}>
                <MemberName member={row.member} className="block" />
              </td>
              <td className={cn(TD, "num")}>{row.games}</td>
              <td className={cn(TD, "num")}>{row.firsts}</td>
              <td className={cn(TD, "num")}>{row.avgPlacement}</td>
              <td className={cn(TD, "num")}>{row.avgDamage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BelowMinimum({
  rows,
  highlightKey,
  minGames,
}: {
  rows: BelowMinimumRow[];
  highlightKey?: string;
  minGames: number;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] text-muted-foreground">
        Sin mínimo{" "}
        <span className="text-faint">
          (menos de {minimumLabel(minGames)} en el periodo)
        </span>
      </h3>
      <ul className="grid gap-1 text-sm">
        {rows.map((row) => (
          <li
            key={row.key}
            className={cn(
              "flex min-w-0 items-baseline justify-between gap-3 rounded-md px-3 py-1.5 text-muted-foreground",
              row.key === highlightKey && HIGHLIGHT,
            )}
          >
            <MemberName member={row.member} />
            <span className="num shrink-0">{row.gamesText}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Títulos -----------------------------------------------------------------------------

function Titles({
  rows,
  titlesHref,
  highlightKey,
}: {
  rows: TitleRow[];
  titlesHref: string;
  highlightKey?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay títulos en este periodo: hacen falta al menos 2
        clasificados para que se otorgue uno.{" "}
        <a
          href={titlesHref}
          className="underline decoration-line underline-offset-2 hover:text-foreground"
        >
          {TITLES_LINK_LABEL}
        </a>
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {rows.flatMap((title) =>
        title.holders.map((holder) => (
          <li
            key={holder.key}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1.5 py-1",
              involves(holder.members, highlightKey) && HIGHLIGHT,
            )}
          >
            <Badge
              title={title.name}
              description={holder.why}
              link={{ href: titlesHref, label: TITLES_LINK_LABEL }}
            />
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <MemberNames members={holder.members} />
              <span className="num text-xs text-muted-foreground">
                {holder.valueText} · {holder.gamesText}
              </span>
            </span>
          </li>
        )),
      )}
    </ul>
  );
}

// --- Dúos y tríos del periodo ------------------------------------------------------------

function TeamsTable({
  rows,
  highlightKey,
  caption,
}: {
  rows: TeamRow[];
  highlightKey?: string;
  caption: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] text-muted-foreground">{caption}</h3>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table aria-label={caption} className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={cn(TH, "text-left")}>
                Equipo
              </th>
              <Th label="Partidas" short="Part." />
              <Th label="1º" />
              <Th label="Puesto medio" short="Medio" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-line last:border-b-0",
                  involves(row.members, highlightKey) && HIGHLIGHT,
                )}
              >
                <td className={cn(TD, "w-full max-w-0 text-left")}>
                  <MemberNames members={row.members} />
                </td>
                <td className={cn(TD, "num")}>{row.games}</td>
                <td className={cn(TD, "num")}>{row.firsts}</td>
                <td className={cn(TD, "num")}>{row.avgPlacement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
