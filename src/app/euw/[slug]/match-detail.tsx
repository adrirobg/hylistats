import { Link2 } from "lucide-react";
import Image from "next/image";
import { Btn } from "@/components/hy/btn";
import { CHIP_TEXT, placeTone, TONE_BG } from "@/domain/scoreboard";
import type { GameIcon } from "@/lib/game-data";
import { cn } from "@/lib/utils";
import { ChampionThumb } from "./match-parts";
import {
  compactNumber,
  hasIcons,
  kdaText,
  type MatchDetailView,
  type MatchPlayerView,
  type MatchTeamView,
  teamLabel,
} from "./matches-view";
import { TeammateName } from "./teammate-parts";
import { profileHref } from "./teammates-view";

// Detalle de una partida (brief §3.5, `.mdet` y `.team` de la maqueta): los 6 equipos de 3 en
// rejilla, del 1º al 6º, con el propio resaltado aunque quede 5º o 6º (corrige a OPGG). Por jugador:
// campeón, Riot ID (enlace a su perfil), K/D/A, daño, oro, nivel y, solo si hay datos, sus augments
// y objetos (§5: ocultar y decir «sin datos», nunca iconos vacíos ni ids sueltos).
//
// Columnas (container queries sobre `.app`, como la cabina): 3; 2 por debajo de 960 px; 1 por
// debajo de 640 px. Todo se recorta o se parte: nada hace scroll horizontal.

/** Icono de un objeto o un augment; si la imagen no llega, se oculta (sin hueco ni icono roto). */
function IconRow({ label, icons }: { label: string; icons: GameIcon[] }) {
  // Un mismo objeto puede repetirse: la clave lleva cuántas veces se ha visto ya.
  const seen = new Map<number, number>();
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1">
      {icons.map((icon) => {
        const times = seen.get(icon.id) ?? 0;
        seen.set(icon.id, times + 1);
        return (
          <li key={`${icon.id}#${times}`} className="flex">
            <Image
              src={icon.iconUrl}
              alt={icon.name}
              title={icon.name}
              width={44}
              height={44}
              loading="lazy"
              draggable={false}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
              className="size-[22px] rounded-[4px] border border-line bg-surface-2"
            />
          </li>
        );
      })}
    </ul>
  );
}

function PlayerRow({ player }: { player: MatchPlayerView }) {
  const named = player.gameName.trim() !== "";
  return (
    <li className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <ChampionThumb
          championId={player.championId}
          name={player.championName}
          portraitUrl={player.portraitUrl}
          size="player"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            {named ? (
              <TeammateName
                gameName={player.gameName}
                tagLine={player.tagLine}
                // El propio jugador está en su perfil: sin enlace.
                href={
                  player.isSelf
                    ? null
                    : profileHref(player.gameName, player.tagLine)
                }
                className={cn("min-w-0", player.isSelf && "font-medium")}
              />
            ) : (
              <span className="min-w-0 truncate text-faint">sin nombre</span>
            )}
            <span className="num ml-auto flex-none font-mono text-xs">
              {kdaText(player)}
            </span>
          </div>
          <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>{player.championName}</span>
            <span className="whitespace-nowrap">nv {player.level}</span>
            <span className="num whitespace-nowrap">
              {compactNumber(player.damage)} daño
            </span>
            <span className="num whitespace-nowrap">
              {compactNumber(player.gold)} oro
            </span>
          </p>
        </div>
      </div>
      {player.augments.length > 0 && (
        <IconRow label="Augments" icons={player.augments} />
      )}
      {player.items.length > 0 && (
        <IconRow label="Objetos" icons={player.items} />
      )}
    </li>
  );
}

function Team({ team }: { team: MatchTeamView }) {
  const tone = placeTone(team.placement);
  return (
    <article
      aria-label={teamLabel(team)}
      className={cn(
        "min-w-0 rounded-md border border-line p-2.5 text-[13px]",
        team.isOwnTeam && "border-place-1 bg-place-1/[.07]",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        {/* El tono del puesto, como el chip de la forma; el número va en texto además del color. */}
        <span
          className={cn(
            "grid h-6 min-w-9 place-items-center rounded-full px-2 font-display text-sm leading-none font-extrabold",
            TONE_BG[tone],
            CHIP_TEXT[tone],
          )}
        >
          {team.placement}º
        </span>
        {team.isOwnTeam && (
          <span className="text-xs font-medium text-place-1">tu equipo</span>
        )}
      </header>
      <ul className="grid gap-2.5">
        {team.players.map((player) => (
          <PlayerRow
            key={`${player.gameName}#${player.tagLine}#${player.championId}`}
            player={player}
          />
        ))}
      </ul>
    </article>
  );
}

export function MatchDetail({
  id,
  detail,
  onCopyLink,
}: {
  /** `id` del bloque: la fila que lo abre lo referencia con `aria-controls`. */
  id: string;
  detail: MatchDetailView;
  onCopyLink: () => void;
}) {
  const augments = hasIcons(detail, "augments");
  const items = hasIcons(detail, "items");
  return (
    <div id={id} className="border-t border-line p-3">
      <div className="grid grid-cols-3 gap-2 @max-[960px]:grid-cols-2 @max-[640px]:grid-cols-1">
        {detail.teams.map((team) => (
          <Team key={team.placement} team={team} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-faint">
        <span>K/D/A · daño a campeones · oro</span>
        {!augments && <span>sin datos de augments</span>}
        {!items && <span>sin datos de objetos</span>}
        <Btn size="small" onClick={onCopyLink} className="ml-auto">
          <Link2 aria-hidden="true" size={14} />
          Copiar enlace
        </Btn>
      </div>
    </div>
  );
}
