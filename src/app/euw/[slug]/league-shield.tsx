import type { EloStanding } from "@/domain/elo";
import { cn } from "@/lib/utils";

// Escudo de liga del ELO del grupo (`symbol#i-shield` de la maqueta de la vitrina): contorno con
// relleno tenue y escudo interior macizo, en el color de la liga (`--league-*`). Decorativo: la
// liga va siempre escrita al lado. El tamaño lo pone quien lo usa (alto = 28/24 del ancho).

export type LeagueId = EloStanding["league"]["id"];

/** Color de la liga como valor CSS (`var(--league-oro)`), para `color` o un `--lg` del banner. */
export function leagueColor(league: LeagueId): string {
  return `var(--league-${league})`;
}

export function LeagueShield({
  league,
  className,
}: {
  league: LeagueId;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 28"
      aria-hidden="true"
      className={cn("flex-none", className)}
      style={{ color: leagueColor(league) }}
    >
      <path
        d="M12 1.5 22.5 5v8.5c0 6.3-4.4 10.9-10.5 13-6.1-2.1-10.5-6.7-10.5-13V5z"
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <path
        d="M12 6.5 18 8.6v5c0 3.6-2.5 6.4-6 7.7-3.5-1.3-6-4.1-6-7.7v-5z"
        fill="currentColor"
      />
    </svg>
  );
}
