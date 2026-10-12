import type { ProfileElo } from "@/domain/group-view";
import { cn } from "@/lib/utils";
import { LeagueShield, leagueColor } from "./league-shield";
import { aboveText, deltaText, deltaTone, type EloFacts } from "./vitrina-view";

// Línea de liga de la identidad de la vitrina (revisión v4, propuesta B, `.leagueline`): sustituye
// al trofeo Liga. Escudo y nombre de la liga en su color, rating («provisional» si toca), cambio de
// hoy y de la semana (ocultos sin partidas en el periodo), «Nº de N» y la distancia al de arriba (o
// la ventaja del líder). Los valores son los de la fila del miembro en la Clasificación
// (`ProfileElo`) y `eloFacts`. Solo miembros. Es de servidor: llega a la vitrina por `leagueLine`.

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
        "num rounded px-[5px] py-px font-mono text-xs font-medium whitespace-nowrap",
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

export function LeagueLine({
  elo,
  facts,
}: {
  elo: Pick<
    ProfileElo,
    "league" | "roundedRating" | "provisional" | "dayChange" | "weekChange"
  >;
  facts: EloFacts;
}) {
  const above = aboveText(facts);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
      <LeagueShield league={elo.league.id} className="h-[30px] w-[26px]" />
      <span
        className="font-display text-[17px] leading-none font-extrabold tracking-[0.08em] uppercase"
        style={{ color: leagueColor(elo.league.id) }}
      >
        {elo.league.name}
      </span>
      <span className="num font-display text-[26px] leading-none font-extrabold text-foreground">
        {elo.roundedRating}
      </span>
      {elo.provisional && (
        <span className="text-xs text-faint">provisional</span>
      )}
      {elo.dayChange !== null && <Delta label="hoy" value={elo.dayChange} />}
      {elo.weekChange !== null && (
        <Delta label="sem" long="semana" value={elo.weekChange} />
      )}
      <span>
        <span className="font-medium text-foreground">
          {facts.position}º de {facts.total}
        </span>
        {above && ` · ${above}`}
      </span>
    </div>
  );
}
