import type { SeasonTeams } from "@/domain/group-season";
import { GROUP_TEAM_MIN_GAMES } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { MemberRef } from "./group-view-model";
import { MemberNames } from "./member-name";
import { type SeasonTeamRow, seasonTeamRows } from "./season-view-model";
import { HIGHLIGHT, involves, TD, TH, Th } from "./table-parts";

// Bloque Equipos (P6, P7): las tablas de Dúos y de Tríos de toda la temporada, con partidas, 1º,
// % de 1º y puesto medio. Componente de servidor sin JS propio. Las filas llegan del dominio
// (`view.seasonTeams`, ya con el mínimo de partidas juntos y por partidas) y se pintan en ese
// mismo orden. En Tríos solo hay tríos formados enteramente por miembros.

interface TeamsBlockProps {
  teams: SeasonTeams;
  members: ReadonlyMap<string, MemberRef>;
  highlightKey?: string;
}

export function TeamsBlock({ teams, members, highlightKey }: TeamsBlockProps) {
  return (
    <div className="grid gap-3">
      <TeamsTable
        title="Dúos"
        empty={`Ningún dúo del grupo suma todavía ${GROUP_TEAM_MIN_GAMES} partidas juntos.`}
        rows={seasonTeamRows(teams.duos, members)}
        highlightKey={highlightKey}
      />
      <TeamsTable
        title="Tríos"
        empty={`Ningún trío formado por miembros del grupo suma todavía ${GROUP_TEAM_MIN_GAMES} partidas juntos.`}
        rows={seasonTeamRows(teams.trios, members)}
        highlightKey={highlightKey}
      />
    </div>
  );
}

function TeamsTable({
  title,
  empty,
  rows,
  highlightKey,
}: {
  title: string;
  empty: string;
  rows: SeasonTeamRow[];
  highlightKey?: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] text-muted-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table
            aria-label={`${title} de la temporada`}
            className="w-full border-collapse text-sm"
          >
            <thead>
              <tr>
                <th scope="col" className={cn(TH, "text-left")}>
                  Equipo
                </th>
                <Th label="Partidas" short="Part." />
                <Th label="1º" />
                <Th label="% de 1º" short="% 1º" />
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
                  <td className={cn(TD, "num")}>{row.firstRate}</td>
                  <td className={cn(TD, "num")}>{row.avgPlacement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
