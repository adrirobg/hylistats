import Link from "next/link";
import { cn } from "@/lib/utils";
import { LeagueShield } from "./league-shield";
import { VitrinaLabel } from "./vitrina-ui";
import {
  aboveText,
  deltaText,
  deltaTone,
  type EloFacts,
  type LadderRow,
} from "./vitrina-view";

// Escalera del grupo de la vitrina (propuesta C2, `.ladder`/`.lad`): la Clasificación del ELO
// entera, como en la pestaña Grupo (posiciones compartidas en empate): posición, escudo de liga,
// nombre enlazado a su perfil (I7), rating y cambio del día. La fila del dueño va destacada y el
// pie dice la distancia al de arriba. Es de servidor: las filas llegan hechas (`ladderRows`).

const DELTA_TONE = {
  up: "text-ok",
  down: "text-danger",
  zero: "text-muted-foreground",
} as const;

export function GroupLadder({
  rows,
  facts,
}: {
  rows: readonly LadderRow[];
  facts: EloFacts;
}) {
  const above = aboveText(facts);
  return (
    <section
      aria-labelledby="vitrina-escalera"
      className="grid content-start gap-2 px-5 py-[18px] @max-[640px]:p-3.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <VitrinaLabel>
          <span id="vitrina-escalera">Escalera del grupo</span>
        </VitrinaLabel>
        <span className="text-xs text-faint">cambio de hoy</span>
      </div>
      <ol className="grid gap-0.5">
        {rows.map((row) => (
          <li
            key={row.slug}
            aria-current={row.me ? "true" : undefined}
            className={cn(
              "grid grid-cols-[18px_16px_minmax(0,1fr)_auto_40px] items-center gap-2 rounded-md px-2 py-[5px] text-[13px]",
              row.me && "bg-surface-2 outline outline-line",
            )}
          >
            <span className="num font-mono text-xs font-medium text-faint">
              {row.position}
            </span>
            <LeagueShield league={row.leagueId} className="h-4 w-3.5" />
            <Link
              href={`/euw/${row.slug}`}
              // Sin prefetch: los perfiles son dinámicos y la escalera lleva un enlace por miembro.
              prefetch={false}
              className={cn(
                "min-w-0 truncate underline decoration-transparent underline-offset-2 hover:decoration-current",
                row.me ? "font-bold text-foreground" : "text-muted-foreground",
              )}
            >
              {row.name}
            </Link>
            <span
              title={
                row.provisional
                  ? "Provisional: pocas partidas en la temporada"
                  : undefined
              }
              className={cn(
                "num font-mono text-[13px] font-medium",
                row.provisional && "text-muted-foreground",
              )}
            >
              {row.rating}
              {row.provisional && <span className="sr-only"> provisional</span>}
            </span>
            <span
              className={cn(
                "num text-right font-mono text-[11px] font-medium",
                row.dayChange !== null && DELTA_TONE[deltaTone(row.dayChange)],
              )}
            >
              {row.dayChange !== null && deltaText(row.dayChange)}
            </span>
          </li>
        ))}
      </ol>
      {above && (
        <p className="text-xs text-faint first-letter:uppercase">{above}</p>
      )}
    </section>
  );
}
