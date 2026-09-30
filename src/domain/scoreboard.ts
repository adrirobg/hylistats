// Dominio del raíl (brief §4.6 y §4.7): las cifras del marcador, los segmentos de la distribución
// 1º–6º y el rótulo de cada partida de la forma reciente. Funciones puras (sin BD, sin red y sin
// React) sobre `StatsSummary` y `RecentGame`; los números salen en `es-ES` con `lib/format.ts`.

import { formatDecimal, formatPercent, formatRelative } from "@/lib/format";
import type { RecentGame } from "./album";
import { PLACEMENTS, type Placement, type StatsSummary } from "./stats";

/** Cifra derivada sin partidas: una raya, nunca `NaN` ni un «0 %» que parezca un dato. */
export const NO_FIGURE = "—";

/** Familia de color de un puesto (brief §6.1): 1º oro, 2º–3º verde agua, 4º–6º pizarra (nunca rojo). */
export type PlaceTone = "p1" | "p23" | "p46";

export function placeTone(placement: number): PlaceTone {
  if (placement === 1) return "p1";
  return placement <= 3 ? "p23" : "p46";
}

/** Fondo de cada familia de puesto (§6.1); lo comparten el marcador, la forma y las partidas. */
export const TONE_BG: Record<PlaceTone, string> = {
  p1: "bg-place-1",
  p23: "bg-place-top",
  p46: "bg-place-low",
};

/** Color del número sobre `TONE_BG`: sobre oro y verde agua va oscuro; sobre pizarra, claro. */
export const CHIP_TEXT: Record<PlaceTone, string> = {
  p1: "text-background",
  p23: "text-background",
  p46: "text-foreground",
};

export interface ScoreboardFigure {
  key: "games" | "firsts" | "firstRate" | "top3Rate" | "avgPlacement";
  /** Rótulo bajo la cifra (`.kpi small` de la maqueta). */
  label: string;
  /** Cifra ya formateada (`es-ES`), o `NO_FIGURE`. */
  value: string;
  /** 1º y % 1º van en oro (`.kpi.gold`): son las dos medidas de «victoria». */
  gold: boolean;
}

/**
 * Las cinco cifras del marcador, en orden: partidas, 1º, % 1º (1 decimal), top 3 (0 decimales,
 * Top-N fijo en 3) y puesto medio (2 decimales). Sin partidas solo «partidas» (`0`) es una cifra:
 * el resto es `NO_FIGURE`.
 */
export function scoreboardFigures(summary: StatsSummary): ScoreboardFigure[] {
  const played = summary.games > 0;
  const derived = (format: () => string) => (played ? format() : NO_FIGURE);
  return [
    {
      key: "games",
      label: "partidas",
      value: formatDecimal(summary.games, 0),
      gold: false,
    },
    {
      key: "firsts",
      label: "1º",
      value: derived(() => formatDecimal(summary.firsts, 0)),
      gold: true,
    },
    {
      key: "firstRate",
      label: "% 1º",
      value: derived(() => formatPercent(summary.firstRate)),
      gold: true,
    },
    {
      key: "top3Rate",
      label: "top 3",
      value: derived(() => formatPercent(summary.top3Rate, 0)),
      gold: false,
    },
    {
      key: "avgPlacement",
      label: "puesto medio",
      value:
        summary.avgPlacement === null
          ? NO_FIGURE
          : formatDecimal(summary.avgPlacement),
      gold: false,
    },
  ];
}

export interface DistributionSegment {
  placement: Placement;
  /** Partidas en ese puesto. */
  count: number;
  /** Porcentaje 0–100 sin redondear: es el peso del segmento y los seis suman 100. */
  percent: number;
  /** «2º: 17,3 %»: lo que dicen el `title` y el `aria-label` del segmento. */
  label: string;
  tone: PlaceTone;
}

/**
 * Los seis segmentos de la barra apilada, del 1º al 6º; vacío si no hay partidas. Solo necesita la
 * distribución: vale para el resumen del perfil y para el de un campeón.
 */
export function distributionSegments(
  summary: Pick<StatsSummary, "distribution">,
): DistributionSegment[] {
  const total = PLACEMENTS.reduce((sum, p) => sum + summary.distribution[p], 0);
  if (total === 0) return [];
  return PLACEMENTS.map((placement) => {
    const count = summary.distribution[placement];
    return {
      placement,
      count,
      percent: (count / total) * 100,
      label: `${placement}º: ${formatPercent(count / total)}`,
      tone: placeTone(placement),
    };
  });
}

/** Rótulo de un chip de la forma (`title` y `aria-label`): «Ahri · 1º · hace 2 h». */
export function formChipLabel(game: RecentGame, nowMs: number): string {
  return `${game.championName} · ${game.placement}º · ${formatRelative(game.gameCreation, nowMs)}`;
}
