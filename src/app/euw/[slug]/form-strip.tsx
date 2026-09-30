import type { RecentGame } from "@/domain/album";
import { formChipLabel, type PlaceTone, placeTone } from "@/domain/scoreboard";
import { cn } from "@/lib/utils";
import { TONE_BG } from "./scoreboard";

// Forma reciente (brief §4.7, `.form` y `.fc` de la maqueta): un chip redondo por partida con el
// puesto dentro, la más reciente a la izquierda. Componente de servidor: el «hace cuánto» de cada
// chip se calcula con la hora del servidor (`nowMs`) y se renueva con el `router.refresh()`. En #2
// el chip no es un enlace: abrir la partida es de #3.

/** Color del número: sobre oro y verde agua va oscuro; sobre pizarra, claro. */
const CHIP_TEXT: Record<PlaceTone, string> = {
  p1: "text-background",
  p23: "text-background",
  p46: "text-foreground",
};

interface FormStripProps {
  /** Las últimas partidas, la más reciente primero (`ProfileView.form`). */
  games: readonly RecentGame[];
  /** Hora del servidor (ms) para el «hace cuánto». */
  nowMs: number;
}

export function FormStrip({ games, nowMs }: FormStripProps) {
  if (games.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay partidas: aquí aparecerán las últimas 20, la más reciente a
        la izquierda.
      </p>
    );
  }
  return (
    <ol
      aria-label="Forma: últimas 20 partidas, la más reciente primero"
      className="flex flex-wrap gap-[5px]"
    >
      {games.map((game) => {
        const label = formChipLabel(game, nowMs);
        const tone = placeTone(game.placement);
        return (
          <li
            key={game.matchId}
            title={label}
            aria-label={label}
            className={cn(
              "grid size-6 place-items-center rounded-full font-display text-[13px] leading-none font-extrabold tabular-nums",
              TONE_BG[tone],
              CHIP_TEXT[tone],
            )}
          >
            {game.placement}
          </li>
        );
      })}
    </ol>
  );
}
