import type { ReactNode } from "react";
import type { GroupElo } from "@/domain/elo";
import { cn } from "@/lib/utils";
import {
  type ChangeCell,
  type ChangeHeader,
  type ChangeTone,
  changeHeader,
  clasificacionNote,
  clasificacionRows,
} from "./clasificacion-model";
import type { MemberRef } from "./group-view-model";
import { MemberName } from "./member-name";
import { HIGHLIGHT, TD, TH, Th } from "./table-parts";

// Bloque Clasificación (iter-09, F24, F25): la tabla del ELO del grupo y una nota breve con la
// regla. El orden, las posiciones compartidas y el *provisional* vienen del dominio; el texto, de
// `clasificacion-model.ts`. Componente de servidor sin JS propio. Con `highlightKey` (pestaña Grupo
// del perfil) la fila del dueño va destacada, como en los otros bloques.

interface ClasificacionBlockProps {
  elo: GroupElo;
  members: ReadonlyMap<string, MemberRef>;
  /** Clave del miembro cuya fila se destaca (`GroupViewMember.key`). */
  highlightKey?: string;
}

const TONE: Record<ChangeTone, string> = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-muted-foreground",
  none: "text-faint",
};

/**
 * Cabecera de un cambio: corta en contenedores estrechos si el periodo es el actual; si lleva
 * fecha ("Sem. 21 sept – 27 sept") se parte en líneas en vez de ensanchar la tabla.
 */
function ChangeTh({ header }: { header: ChangeHeader }) {
  if (!header.dated) return <Th label={header.label} short={header.short} />;
  return (
    <th
      scope="col"
      className={cn(TH, "max-w-[6.5rem] leading-tight whitespace-normal")}
    >
      {header.label}
    </th>
  );
}

function ChangeTd({ cell }: { cell: ChangeCell }) {
  return <td className={cn(TD, "num", TONE[cell.tone])}>{cell.text}</td>;
}

export function ClasificacionBlock({
  elo,
  members,
  highlightKey,
}: ClasificacionBlockProps): ReactNode {
  const rows = clasificacionRows(elo.standings, members);
  const note = clasificacionNote();
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table
          aria-label="Clasificación por ELO"
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
              <th scope="col" className={cn(TH, "text-left")}>
                Liga
              </th>
              <Th label="Rating" short="ELO" />
              <ChangeTh header={changeHeader(elo.day)} />
              <ChangeTh header={changeHeader(elo.week)} />
              <Th label="Partidas" short="Part." />
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
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <MemberName member={row.member} />
                    {row.provisional && (
                      <span
                        title="Provisional: pocas partidas en la temporada"
                        className="shrink-0 rounded-full border border-line px-1.5 text-[10px] leading-4 tracking-[0.06em] text-muted-foreground uppercase"
                      >
                        <span className="@max-[480px]:sr-only">
                          provisional
                        </span>
                        <span
                          aria-hidden="true"
                          className="hidden @max-[480px]:inline"
                        >
                          prov.
                        </span>
                      </span>
                    )}
                  </span>
                </td>
                <td className={cn(TD, "text-left text-muted-foreground")}>
                  {row.leagueName}
                </td>
                <td className={cn(TD, "num font-medium")}>{row.rating}</td>
                <ChangeTd cell={row.day} />
                <ChangeTd cell={row.week} />
                <td className={cn(TD, "num")}>{row.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-1.5 text-sm text-muted-foreground">
        {note.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
