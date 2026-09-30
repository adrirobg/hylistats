// Decisiones de presentación de la pestaña Estadísticas como funciones puras, sin React ni
// navegador: fechas en español, cifras, textos de los estados vacíos y los enlaces. El panel
// (`stats-panel.tsx`) solo las pinta. Los números vienen ya calculados de `computeRecords`.

import type { AlbumEntry } from "@/domain/album";
import type {
  DayRecord,
  FirstTryStats,
  RecordEntry,
  RecordGame,
  Records,
  StreakRecord,
} from "@/domain/records";
import { RECORD_DAY_MIN_GAMES } from "@/lib/config";
import { formatDecimal, formatPercent } from "@/lib/format";
import { championHref, championSlug } from "./champion-panel-view";
import { matchHref, tabHref } from "./view-model";

// --- Fechas y cifras ---------------------------------------------------------------------

const UTC_DATE = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const COUNT = new Intl.NumberFormat("es-ES", {
  useGrouping: "always",
  maximumFractionDigits: 0,
});

/**
 * Fecha de una partida (`gameCreation`, epoch ms) con año: "29 sept 2026". En UTC, como el resto de
 * la app (`@/lib/format`): el récord y la fila de Partidas a la que enlaza muestran el mismo día.
 */
export function formatGameDate(ms: number): string {
  return UTC_DATE.format(ms);
}

/**
 * Día de juego `YYYY-MM-DD` (`DayRecord.day`) como fecha legible: "29 sept 2026". Ya es una fecha
 * de calendario y no un instante, así que se pinta a las 12:00 UTC: ninguna zona horaria la mueve
 * de día. Un texto que no sea `YYYY-MM-DD` se devuelve tal cual.
 */
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const [, year, month, date] = match;
  return UTC_DATE.format(Date.UTC(+year, +month - 1, +date, 12));
}

/** Entero con separador de miles `es-ES`, también a partir de 4 cifras: `123456` -> `123.456`. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** Puesto medio con 2 decimales y coma: `2.3333` -> `2,33`. */
export function formatAvgPlacement(avg: number): string {
  return formatDecimal(avg, 2);
}

/** `partida` / `partidas`. */
export function gamesUnit(count: number): string {
  return count === 1 ? "partida" : "partidas";
}

/** `1 partida` / `7 partidas`. */
export function gamesLabel(count: number): string {
  return `${count} ${gamesUnit(count)}`;
}

// --- Textos vacíos -----------------------------------------------------------------------

const NO_FIRSTS = "Aún no has quedado 1º en ninguna partida.";

/** Por qué un bloque no tiene cifras (cada texto dice el motivo, no solo «sin datos»). */
export const STATS_EMPTY = {
  /** Récord sin valor: ninguna partida guardada trae la columna (falta el relleno o el sync). */
  noValue: "Ninguna de tus partidas guardadas trae este dato todavía.",
  noFirsts: NO_FIRSTS,
  /** Hay 1º, pero todos con alguna muerte. */
  noDeathless:
    "Ningún 1º sin morir todavía: todas tus victorias tienen al menos una muerte.",
  winStreak: "Aún no has quedado 1º: la racha empieza con el primero.",
  /** Sin racha sin 1º: todas las partidas fueron 1º. */
  drought: "Todas tus partidas han sido 1º: no hay ninguna racha sin ganar.",
  days: `Ningún día tiene ${RECORD_DAY_MIN_GAMES} partidas todavía: el mejor y el peor día necesitan al menos ${RECORD_DAY_MIN_GAMES} en un mismo día.`,
  firstTry:
    "Aún no has ganado con ningún campeón: no hay primeras partidas que contar.",
} as const;

/** Nota de cómo se cuentan los días, bajo el bloque Días. */
export const DAYS_NOTE = `Días de 06:00 a 06:00 (hora de Madrid), mínimo ${RECORD_DAY_MIN_GAMES} partidas.`;

// --- Campeones y enlaces -----------------------------------------------------------------

/** Campeón tal como se pinta: nombre, retrato y slug de su panel (`?campeon`). */
export interface ChampionRef {
  championId: number;
  name: string;
  portraitUrl: string | null;
  /** Slug del panel de campeón; `null` si el campeón no está en el álbum (no hay panel). */
  slug: string | null;
}

/**
 * Resuelve un campeón contra el álbum (nombre de visualización, retrato y slug). Sin él (un
 * campeón fuera del catálogo y del álbum) queda el nombre guardado en la partida y sin retrato ni
 * panel.
 */
export function championRef(
  album: readonly AlbumEntry[],
  championId: number,
  fallbackName: string,
): ChampionRef {
  const entry = album.find((e) => e.championId === championId);
  return entry
    ? {
        championId,
        name: entry.name,
        portraitUrl: entry.portraitUrl,
        slug: championSlug(entry),
      }
    : { championId, name: fallbackName, portraitUrl: null, slug: null };
}

/** Enlace a una partida desde la pestaña: Partidas con esa partida abierta, sin filtros. */
export function statsMatchHref(slug: string, matchId: string): string {
  return matchHref(`/euw/${slug}`, "", matchId);
}

/** Enlace al panel de un campeón sobre Estadísticas (se queda en la pestaña). */
export function statsChampionHref(
  slug: string,
  championSlugValue: string,
): string {
  const path = `/euw/${slug}`;
  const [, search = ""] = tabHref(path, "", "estadisticas").split("?");
  return championHref(path, search, championSlugValue);
}

// --- Récords de una partida --------------------------------------------------------------

export type RecordKey = keyof Records["records"];

/** Un récord listo para pintar: rótulo, cifra y la partida que lo marca (o `null` sin dato). */
export interface RecordCardModel {
  key: RecordKey;
  label: string;
  /** Cifra formateada (`123.456`); `null` si no hay dato. */
  value: string | null;
  game: RecordGame | null;
}

const RECORD_LABEL: Record<RecordKey, string> = {
  damage: "Más daño",
  damageTaken: "Más daño recibido",
  kills: "Más kills",
  killingSpree: "Mayor racha de kills",
  deaths: "Más muertes",
};

const RECORD_ORDER: readonly RecordKey[] = [
  "damage",
  "damageTaken",
  "kills",
  "killingSpree",
  "deaths",
];

/** Los cinco récords en el orden de la pestaña. */
export function recordCards(records: Records["records"]): RecordCardModel[] {
  return RECORD_ORDER.map((key) => {
    const entry: RecordEntry | null = records[key];
    return {
      key,
      label: RECORD_LABEL[key],
      value: entry ? formatCount(entry.value) : null,
      game: entry,
    };
  });
}

// --- Victorias especiales ----------------------------------------------------------------

/** Cuántas victorias sin morir se ven antes del desplegable. */
export const DEATHLESS_VISIBLE = 5;

/** La lista de victorias sin morir partida en lo visible y lo plegado (`<details>`). */
export function splitDeathless(matches: readonly RecordGame[]): {
  visible: RecordGame[];
  folded: RecordGame[];
} {
  return {
    visible: matches.slice(0, DEATHLESS_VISIBLE),
    folded: matches.slice(DEATHLESS_VISIBLE),
  };
}

/** Texto del desplegable: `Ver 3 más`. */
export function foldedLabel(folded: number): string {
  return `Ver ${folded} más`;
}

/**
 * Por qué no hay victorias sin morir: sin ningún 1º, o con 1º pero todos con muertes. `hasWins` es
 * «algún 1º» (`longestWinStreak !== null`).
 */
export function deathlessEmpty(hasWins: boolean): string {
  return hasWins ? STATS_EMPTY.noDeathless : STATS_EMPTY.noFirsts;
}

// --- Rachas ------------------------------------------------------------------------------

/** Una racha lista para pintar: cuántas partidas y el rango, con los enlaces a sus extremos. */
export interface StreakModel {
  /** Nº de partidas y su unidad (`partida` / `partidas`), para pintar la cifra grande aparte. */
  length: number;
  unit: string;
  from: { matchId: string; date: string };
  to: { matchId: string; date: string };
  /** La racha es una sola partida: un solo extremo («el 3 sept 2026»). */
  single: boolean;
  /** Empieza y acaba el mismo día (con varias partidas): «el 3 sept 2026: primera · última». */
  sameDay: boolean;
  ongoing: boolean;
}

export function streakModel(streak: StreakRecord): StreakModel {
  const from = formatGameDate(streak.from);
  const to = formatGameDate(streak.to);
  return {
    length: streak.length,
    unit: gamesUnit(streak.length),
    from: { matchId: streak.fromMatchId, date: from },
    to: { matchId: streak.toMatchId, date: to },
    single: streak.fromMatchId === streak.toMatchId,
    sameDay: from === to,
    ongoing: streak.ongoing,
  };
}

// --- Días --------------------------------------------------------------------------------

/** Un día listo para pintar: fecha legible, puesto medio (2 decimales) y partidas. */
export interface DayModel {
  date: string;
  avg: string;
  games: string;
}

export function dayModel(day: DayRecord): DayModel {
  return {
    date: formatDay(day.day),
    avg: formatAvgPlacement(day.avgPlacement),
    games: gamesLabel(day.games),
  };
}

// --- Campeones ---------------------------------------------------------------------------

/** Victorias a la primera: la cifra, el % y el denominador con su explicación. */
export interface FirstTryModel {
  count: string;
  /** `18,4 %` de los campeones ganados. */
  rate: string;
  /** `de 12 campeones ganados` */
  of: string;
}

/** `null` sin campeones ganados (no hay tasa que calcular): se pinta `STATS_EMPTY.firstTry`. */
export function firstTryModel(stats: FirstTryStats): FirstTryModel | null {
  if (stats.wonChampions === 0) return null;
  return {
    count: formatCount(stats.count),
    rate: formatPercent(stats.rate),
    of: `de ${stats.wonChampions} ${stats.wonChampions === 1 ? "campeón ganado" : "campeones ganados"}`,
  };
}

/** `4 × 1º en 9 partidas`: los 1º del campeón con más y sus partidas. */
export function topChampionDetail(firsts: number, games: number): string {
  return `${firsts} × 1º en ${gamesLabel(games)}`;
}
