import Link from "next/link";
import { cn } from "@/lib/utils";
import { LeagueShield } from "./league-shield";
import { VitrinaLabel } from "./vitrina-ui";
import { deltaText, deltaTone, type GroupTodayRow } from "./vitrina-view";

// «El grupo hoy» de la vitrina (revisión v4, propuesta B, `.gt`): la Clasificación del ELO entera,
// en su orden (posiciones compartidas en empate), con lo que ha hecho cada miembro HOY: posición,
// escudo, nombre enlazado a su perfil, rating, cambio de hoy, partidas, 1º, puesto medio y los
// últimos 5 campeones con su puesto (el más reciente primero). Sustituye al trofeo Liga y a la
// escalera. «Hoy» es estricto (`groupTodayRows`): quien no ha jugado hoy sale atenuado y con «—»,
// también en el cambio, que la Clasificación toma del último día con partidas. La fila del dueño va
// destacada. Es de servidor: las filas llegan hechas.
//
// Rangos (container queries sobre `.app`): por debajo de 640 px se ocultan Rating y Últimas. Sin
// desborde horizontal a ningún ancho: el nombre absorbe el sobrante (`w-full max-w-0`) y se recorta.

const DELTA_TONE = {
  up: "text-ok",
  down: "text-danger",
  zero: "text-muted-foreground",
} as const;

const TH =
  "px-1.5 pb-1.5 text-right font-mono text-[10px] leading-none font-medium tracking-[0.08em] whitespace-nowrap text-faint uppercase @max-[640px]:px-1";
const TD =
  "px-1.5 py-[3px] text-right whitespace-nowrap @max-[640px]:px-1 first:rounded-l-[5px] last:rounded-r-[5px]";
const MONO = "num font-mono text-xs font-medium";
const DASH = <span className="text-faint">—</span>;

/** Puesto medio de hoy: verde si es bueno (≤ 3), rosa si es malo (≥ 3,75). */
function avgTone(avg: string): string {
  const value = Number(avg.replace(",", "."));
  if (value <= 3) return "text-ok";
  if (value >= 3.75) return "text-shame";
  return "";
}

export function GroupToday({
  rows,
  games,
}: {
  rows: readonly GroupTodayRow[];
  /** Partidas distintas del día de todo el grupo. */
  games: number;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <VitrinaLabel>
          <span id="vitrina-grupo-hoy">El grupo hoy</span>
        </VitrinaLabel>
        <span className="text-xs text-faint">
          {games === 0
            ? "sin partidas hoy"
            : `${games} ${games === 1 ? "partida" : "partidas"}`}
        </span>
      </div>
      <div className="min-w-0 overflow-hidden">
        <table
          aria-labelledby="vitrina-grupo-hoy"
          className="w-full border-collapse text-[13px]"
        >
          <thead>
            <tr>
              <th scope="col" className={cn(TH, "text-left")}>
                <span className="sr-only">Posición</span>
              </th>
              <th scope="col" className={cn(TH, "text-left")}>
                Miembro
              </th>
              <th scope="col" className={cn(TH, "@max-[640px]:hidden")}>
                Rating
              </th>
              <th scope="col" className={TH}>
                <span aria-hidden="true">Hoy</span>
                <span className="sr-only">Cambio de hoy</span>
              </th>
              <th scope="col" className={TH}>
                <span aria-hidden="true">Part.</span>
                <span className="sr-only">Partidas de hoy</span>
              </th>
              <th scope="col" className={TH}>
                <span aria-hidden="true">1º</span>
                <span className="sr-only">Primeros de hoy</span>
              </th>
              <th scope="col" className={TH}>
                <span aria-hidden="true">Media</span>
                <span className="sr-only">Puesto medio de hoy</span>
              </th>
              <th
                scope="col"
                className={cn(TH, "text-left @max-[640px]:hidden")}
              >
                <span aria-hidden="true">Últimas</span>
                <span className="sr-only">Últimas partidas de hoy</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TodayRow key={row.slug} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TodayRow({ row }: { row: GroupTodayRow }) {
  const idle = row.games === 0;
  return (
    <tr
      aria-current={row.me ? "true" : undefined}
      className={cn(
        row.me && "[&>td]:bg-surface-2",
        idle && "[&>td]:opacity-45",
      )}
    >
      <td className={cn(TD, "text-left font-mono text-[11px] text-faint")}>
        <span className="num">{row.position}</span>
      </td>
      <td className={cn(TD, "w-full max-w-0 text-left")}>
        <span className="flex min-w-0 items-center gap-[7px]">
          <LeagueShield league={row.leagueId} className="h-[15px] w-[13px]" />
          <Link
            href={`/euw/${row.slug}`}
            // Sin prefetch: los perfiles son dinámicos y la tabla lleva un enlace por miembro.
            prefetch={false}
            className={cn(
              "min-w-0 truncate underline decoration-transparent underline-offset-2 hover:decoration-current",
              row.me ? "font-bold text-foreground" : "text-muted-foreground",
            )}
          >
            {row.name}
          </Link>
        </span>
      </td>
      <td
        title={
          row.provisional
            ? "Provisional: pocas partidas en la temporada"
            : undefined
        }
        className={cn(
          TD,
          MONO,
          "@max-[640px]:hidden",
          row.provisional && "text-muted-foreground",
        )}
      >
        {row.rating}
        {row.provisional && <span className="sr-only"> provisional</span>}
      </td>
      <td
        className={cn(
          TD,
          MONO,
          !idle &&
            row.dayChange !== null &&
            DELTA_TONE[deltaTone(row.dayChange)],
        )}
      >
        {/* El cambio es el del último día con partidas de la Clasificación: solo si jugó hoy. */}
        {idle || row.dayChange === null ? DASH : deltaText(row.dayChange)}
      </td>
      <td className={cn(TD, MONO)}>{idle ? DASH : row.games}</td>
      <td
        className={cn(TD, MONO, row.firsts > 0 ? "text-place-1" : "text-faint")}
      >
        {idle ? DASH : row.firsts}
      </td>
      <td
        className={cn(
          TD,
          MONO,
          row.avgPlacement !== null && avgTone(row.avgPlacement),
        )}
      >
        {row.avgPlacement ?? DASH}
      </td>
      <td className={cn(TD, "text-left @max-[640px]:hidden")}>
        {row.last.length === 0 ? (
          DASH
        ) : (
          <ol className="inline-flex gap-[3px] align-middle">
            {row.last.map((game) => (
              <LastGame key={game.matchId} game={game} />
            ))}
          </ol>
        )}
      </td>
    </tr>
  );
}

/** Retrato de 22 px con el puesto en la esquina (el 1º en oro); sin retrato, la inicial. */
function LastGame({ game }: { game: GroupTodayRow["last"][number] }) {
  const label = `${game.championName} · ${game.placement}º`;
  return (
    <li
      title={label}
      className="relative grid size-[22px] place-items-center rounded bg-surface-2 font-display text-[11px] font-extrabold text-faint"
    >
      <span aria-hidden="true">{game.championName.charAt(0)}</span>
      {game.portraitUrl !== null && (
        // Fondo y no `<img>`: si no carga queda la inicial, sin manejador de cliente.
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded bg-cover bg-center"
          style={{
            backgroundImage: `url(${JSON.stringify(game.portraitUrl)})`,
          }}
        />
      )}
      <span className="sr-only">{label}</span>
      <b
        aria-hidden="true"
        className={cn(
          "absolute -right-[3px] -bottom-[3px] h-3 min-w-3 rounded-[3px] border border-(--cabin) px-0.5 text-center font-mono text-[9px] leading-[10px] font-semibold not-italic",
          game.placement === 1
            ? "bg-place-1 text-background"
            : "bg-surface-2 text-muted-foreground",
        )}
      >
        {game.placement}
      </b>
    </li>
  );
}
