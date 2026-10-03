import type { ProfileElo } from "@/domain/group-view";
import { cn } from "@/lib/utils";
import { LeagueShield, leagueColor } from "./league-shield";
import { VitrinaLabel } from "./vitrina-ui";
import {
  aboveText,
  deltaText,
  deltaTone,
  type EloFacts,
  nextLeagueText,
} from "./vitrina-view";

// Trofeo Liga del grupo de la vitrina (propuesta C2, tarjeta `.tw.e`): escudo y nombre de la liga
// en su color, rating, «provisional», posición, cambio de hoy y de la semana (ocultos sin partidas
// en el periodo) y las distancias (al de arriba o la ventaja del líder, y a la siguiente liga). Los
// valores son los de la fila del miembro en la Clasificación (`ProfileElo`) y `eloFacts`. Solo
// miembros. Es de servidor: no tiene estado.
//
// Rangos (container queries sobre `.app`): por debajo de 640 px escudo de 58 px y cifra de 48.

const DELTA_TONE = {
  up: "text-ok bg-[color-mix(in_srgb,var(--ok)_13%,transparent)]",
  down: "text-danger bg-[color-mix(in_srgb,var(--danger)_13%,transparent)]",
  zero: "text-muted-foreground bg-surface-2",
} as const;

function Delta({
  label,
  long,
  value,
}: {
  label: string;
  /** Lo que lee el lector de pantalla si `label` va abreviado ("sem" → "semana"). */
  long?: string;
  value: number;
}) {
  return (
    <span
      className={cn(
        "num rounded px-1.5 py-0.5 font-mono text-[13px] font-medium whitespace-nowrap",
        DELTA_TONE[deltaTone(value)],
      )}
    >
      {long ? (
        <>
          <span aria-hidden="true">{label}</span>
          <span className="sr-only">{long}</span>
        </>
      ) : (
        label
      )}{" "}
      {deltaText(value)}
    </span>
  );
}

export function LeagueTrophy({
  elo,
  facts,
}: {
  elo: Pick<
    ProfileElo,
    "league" | "roundedRating" | "provisional" | "dayChange" | "weekChange"
  >;
  facts: EloFacts;
}) {
  const distances = [aboveText(facts), nextLeagueText(facts)].filter(
    (text) => text !== null,
  );
  return (
    <div className="grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <VitrinaLabel>Liga del grupo</VitrinaLabel>
        <span className="text-xs text-faint">
          {facts.position}º de {facts.total}
        </span>
      </div>
      <div className="flex items-center gap-[18px] @max-[640px]:gap-3.5">
        <LeagueShield
          league={elo.league.id}
          className="h-[98px] w-[84px] drop-shadow-[0_6px_18px_rgba(0,0,0,.5)] @max-[640px]:h-[68px] @max-[640px]:w-[58px]"
        />
        <div className="min-w-0">
          <p
            className="font-display text-[22px] leading-none font-extrabold tracking-[0.1em] uppercase"
            style={{ color: leagueColor(elo.league.id) }}
          >
            {elo.league.name}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
            <span className="num font-display text-[66px] leading-none font-extrabold @max-[640px]:text-[48px]">
              {elo.roundedRating}
            </span>
            {elo.provisional && (
              <span className="text-xs text-faint">provisional</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground">
        {(elo.dayChange !== null || elo.weekChange !== null) && (
          <span className="inline-flex gap-1.5">
            {elo.dayChange !== null && (
              <Delta label="hoy" value={elo.dayChange} />
            )}
            {elo.weekChange !== null && (
              <Delta label="sem" long="semana" value={elo.weekChange} />
            )}
          </span>
        )}
        {distances.length > 0 && <span>{distances.join(" · ")}</span>}
      </div>
    </div>
  );
}
