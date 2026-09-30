// Dominio de la pestaña Resumen (brief §3.3): la curva de campeones ganados acumulados (D4), los
// destacados del álbum y el texto que la describe. Funciones puras (sin BD, sin red y sin React)
// sobre los campeones verificados, el álbum y las filas del jugador; las fechas y los números
// salen en `es-ES` con `lib/format.ts`.

import { formatDecimal, formatPercent, formatShortDate } from "@/lib/format";
import { type AlbumEntry, championSlug, compareTime } from "./album";
import {
  PLACEMENTS,
  type PlayerMatchRow,
  type VerifiedChampion,
} from "./stats";

// --- Curva de campeones ganados (D4) -----------------------------------------------------

/** Un punto de la línea escalonada: cuántos campeones llevaba ganados el jugador en `at`. */
export interface CurvePoint {
  /** Epoch en ms. */
  at: number;
  count: number;
}

/**
 * La curva de campeones ganados acumulados. Cuenta los verificados de dominio (sin marcas
 * manuales), cada uno en la fecha de su **primer** 1º. Devuelve el inicio de temporada (0), un
 * punto por instante en que sube el recuento (en orden cronológico) y «ahora» con el último
 * valor, para que la línea escalonada llegue hasta el borde derecho. Dos campeones cuyo primer 1º
 * cae en el mismo instante suben el recuento de dos en un único punto. Sin verificados no hay
 * curva: `[]`.
 */
export function wonCurve(
  verified: readonly Pick<VerifiedChampion, "firstWinAt">[],
  seasonStartMs: number,
  nowMs: number,
): CurvePoint[] {
  if (verified.length === 0) return [];
  const times = verified.map((champion) => champion.firstWinAt);
  times.sort((a, b) => a - b);

  // Las filas ya vienen filtradas por temporada; el `min` solo evita una curva hacia atrás si no.
  const curve: CurvePoint[] = [
    { at: Math.min(seasonStartMs, times[0]), count: 0 },
  ];
  for (let i = 0; i < times.length; ) {
    const at = times[i];
    let next = i;
    while (next < times.length && times[next] === at) next += 1;
    curve.push({ at, count: next });
    i = next;
  }
  const last = curve[curve.length - 1];
  // Un reloj por detrás del último 1º no acorta la curva; y si coinciden, no se repite el punto.
  if (nowMs > last.at) curve.push({ at: nowMs, count: last.count });
  return curve;
}

/**
 * El texto que describe la curva sin depender del dibujo: «23 de 60 campeones ganados; el
 * último, Ahri, el 12 sep.». El «último» es el campeón verificado más reciente (el escalón final
 * de la curva) y se nombra como el álbum. Sin verificados solo dice que aún no hay ninguno.
 */
export function wonSummary(
  verified: readonly Pick<
    VerifiedChampion,
    "championId" | "championName" | "firstWinAt"
  >[],
  album: readonly Pick<AlbumEntry, "championId" | "name">[],
  threshold: number,
  nowMs: number,
): string {
  const goal = formatDecimal(threshold, 0);
  if (verified.length === 0) {
    return `Aún ningún campeón ganado (0 de ${goal}).`;
  }
  // El último en entrar; si dos entran a la vez, el de id mayor (orden estable).
  let latest = verified[0];
  for (const champion of verified) {
    if (
      champion.firstWinAt > latest.firstWinAt ||
      (champion.firstWinAt === latest.firstWinAt &&
        champion.championId > latest.championId)
    ) {
      latest = champion;
    }
  }
  const name =
    album.find((entry) => entry.championId === latest.championId)?.name ??
    latest.championName;
  const count = formatDecimal(verified.length, 0);
  const progress =
    verified.length >= threshold
      ? `${count} campeones ganados, umbral de ${goal} alcanzado`
      : `${count} de ${goal} campeones ganados`;
  return `${progress}; el último, ${name}, el ${formatShortDate(latest.firstWinAt, nowMs)}.`;
}

// --- Destacados --------------------------------------------------------------------------

/** Chips por grupo de destacados. */
export const HIGHLIGHT_LIMIT = 8;

/** Partidas mínimas de un campeón para entrar en «Mejor % 1º»: con menos, un 1/1 lo encabeza. */
export const BEST_RATE_MIN_GAMES = 3;

/** Un campeón destacado: lo que necesita el chip que abre su panel (`?campeon={slug}`). */
export interface HighlightChip {
  championId: number;
  name: string;
  /** Slug de la URL del panel (`championSlug`). */
  slug: string;
  games: number;
  /** Lo que se lee junto al nombre: «1º a la primera», «9 partidas» o «3/5 · 60 %». */
  detail: string;
  portraitUrl: string | null;
}

export interface Highlights {
  /** Ganados a la primera: el primer 1º fue en la primera partida con el campeón. */
  firstTry: HighlightChip[];
  /** Más intentados sin ganar: jugados y sin ningún 1º, los de más partidas primero. */
  mostTriedUnwon: HighlightChip[];
  /** Mejor % de 1º con `BEST_RATE_MIN_GAMES` partidas o más. */
  bestFirstRate: HighlightChip[];
}

const chipOf = (entry: AlbumEntry, detail: string): HighlightChip => ({
  championId: entry.championId,
  name: entry.name,
  slug: championSlug(entry),
  games: entry.games,
  detail,
  portraitUrl: entry.portraitUrl,
});

// Orden estable entre empates: por nombre y, si aun así coinciden, por id.
const byName = (a: AlbumEntry, b: AlbumEntry) =>
  a.name.localeCompare(b.name, "es") || a.championId - b.championId;

type FirstGameRow = Pick<
  PlayerMatchRow,
  "matchId" | "gameCreation" | "championId" | "placement"
>;

/** La primera partida de cada campeón (mismo orden y mismos puestos que cuenta el álbum). */
function firstGames<T extends FirstGameRow>(
  rows: readonly T[],
): Map<number, T> {
  const first = new Map<number, T>();
  for (const row of rows) {
    if (!(PLACEMENTS as readonly number[]).includes(row.placement)) continue;
    const current = first.get(row.championId);
    if (!current || compareTime(row, current) < 0)
      first.set(row.championId, row);
  }
  return first;
}

/**
 * Definición única de «ganado a la primera» (la comparten los destacados del Resumen y la pestaña
 * Estadísticas): campeones cuya **primera partida** fue un 1º. Devuelve `championId` → `matchId`
 * de esa partida. Se comparan partidas, no instantes: dos partidas en el mismo milisegundo no
 * confunden el resultado.
 */
export function firstTryMatches<T extends FirstGameRow>(
  rows: readonly T[],
): Map<number, string> {
  const wins = new Map<number, string>();
  for (const [championId, game] of firstGames(rows)) {
    if (game.placement === 1) wins.set(championId, game.matchId);
  }
  return wins;
}

/**
 * Los tres grupos de destacados, de hasta `HIGHLIGHT_LIMIT` campeones cada uno:
 * - `firstTry`: los ganados a la primera, por fecha de ese 1º (el más reciente primero). Se
 *   comparan **partidas** (la primera del campeón y su primer 1º), no instantes: dos partidas
 *   en el mismo milisegundo no confunden el resultado.
 * - `mostTriedUnwon`: `state === "played"`, por partidas descendente.
 * - `bestFirstRate`: con `BEST_RATE_MIN_GAMES`+ partidas y al menos un 1º, por `firsts / games`
 *   descendente y, a igual porcentaje, más partidas primero. Sin 1º no hay «mejor porcentaje»
 *   que destacar: el 0 % de un campeón sin ganar ya lo cuenta «Más intentados sin ganar».
 */
export function highlights(
  album: readonly AlbumEntry[],
  rows: readonly PlayerMatchRow[],
): Highlights {
  const firstTryWins = firstTryMatches(rows);

  const firstTry = album
    .filter(
      (entry) =>
        entry.firstWinMatchId !== null &&
        firstTryWins.get(entry.championId) === entry.firstWinMatchId,
    )
    .sort((a, b) => (b.firstWinAt ?? 0) - (a.firstWinAt ?? 0) || byName(a, b))
    .slice(0, HIGHLIGHT_LIMIT)
    .map((entry) => chipOf(entry, "1º a la primera"));

  const mostTriedUnwon = album
    .filter((entry) => entry.state === "played")
    .sort((a, b) => b.games - a.games || byName(a, b))
    .slice(0, HIGHLIGHT_LIMIT)
    .map((entry) =>
      chipOf(
        entry,
        `${formatDecimal(entry.games, 0)} ${entry.games === 1 ? "partida" : "partidas"}`,
      ),
    );

  const bestFirstRate = album
    .filter((entry) => entry.games >= BEST_RATE_MIN_GAMES && entry.firsts > 0)
    .sort(
      (a, b) =>
        // Comparar `a/b` con `c/d` como `a·d` con `c·b`: sin decimales de por medio.
        b.firsts * a.games - a.firsts * b.games ||
        b.games - a.games ||
        byName(a, b),
    )
    .slice(0, HIGHLIGHT_LIMIT)
    .map((entry) =>
      chipOf(
        entry,
        `${entry.firsts}/${entry.games} · ${formatPercent(entry.firsts / entry.games, 0)}`,
      ),
    );

  return { firstTry, mostTriedUnwon, bestFirstRate };
}
