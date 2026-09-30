import Link from "next/link";
import type { RecentGame } from "@/domain/album";
import {
  CHIP_TEXT,
  formChipLabel,
  placeTone,
  TONE_BG,
} from "@/domain/scoreboard";
import { cn } from "@/lib/utils";
import { matchHref } from "./view-model";

// Forma reciente (brief §4.7, `.form` y `.fc` de la maqueta): un chip redondo por partida con el
// puesto dentro, la más reciente a la izquierda. Componente de servidor: el «hace cuánto» de cada
// chip se calcula con la hora del servidor (`nowMs`) y se renueva con el `router.refresh()`. Cada
// chip es un enlace a su partida abierta en la pestaña Partidas (`?tab=partidas&partida=…`).

interface FormStripProps {
  /** Las últimas partidas, la más reciente primero (`ProfileView.form`). */
  games: readonly RecentGame[];
  /** Segmento de la URL del perfil (`{nombre}-{tag}` codificado): de ahí sale el enlace. */
  slug: string;
  /** Hora del servidor (ms) para el «hace cuánto». */
  nowMs: number;
}

export function FormStrip({ games, slug, nowMs }: FormStripProps) {
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
          <li key={game.matchId}>
            <Link
              // Sin prefetch: la pestaña Partidas es dinámica y son 20 enlaces.
              prefetch={false}
              // Sin `search`: un enlace limpio, sin filtros que dejen la partida fuera de la lista.
              href={matchHref(`/euw/${slug}`, "", game.matchId)}
              scroll={false}
              title={label}
              aria-label={`${label} · abrir partida`}
              className={cn(
                "grid size-6 place-items-center rounded-full font-display text-[13px] leading-none font-extrabold tabular-nums",
                TONE_BG[tone],
                CHIP_TEXT[tone],
              )}
            >
              {game.placement}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
