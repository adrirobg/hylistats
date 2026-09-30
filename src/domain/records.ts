// Dominio de la pestaña Estadísticas: récords de una partida, victorias especiales, rachas, mejor y
// peor día, victorias a la primera y campeón con más 1º. Funciones puras (sin BD, sin red y sin
// React) sobre las filas de `getRecordRows`, ya filtradas por temporada y cola. Solo cuentan los
// puestos 1..6 (mismo criterio que `computeSummary`): una fila con un puesto fuera de rango se
// ignora en todas las cifras.

import { RECORD_DAY_MIN_GAMES } from "@/lib/config";
import { compareTime } from "./album";
import { PLACEMENTS } from "./stats";
import { firstTryMatches } from "./summary";

/** Una partida del jugador con lo que necesitan los récords (una fila de `getRecordRows`). */
export interface RecordRow {
  matchId: string;
  /** Epoch en ms. */
  gameCreation: number;
  /** Epoch en ms del inicio de la partida (F17: decide el día de juego). */
  gameStartTimestamp: number;
  championId: number;
  championName: string;
  placement: number;
  kills: number;
  deaths: number;
  totalDamageDealtToChampions: number;
  /** `null` en partidas sin el dato: se excluye solo de su récord. */
  totalDamageTaken: number | null;
  /** `null` en partidas sin el dato: se excluye solo de su récord. */
  largestKillingSpree: number | null;
}

/** La partida que marca un récord. */
export interface RecordGame {
  matchId: string;
  championId: number;
  championName: string;
  /** Epoch en ms. */
  gameCreation: number;
}

export interface RecordEntry extends RecordGame {
  value: number;
}

export interface DeathlessWins {
  count: number;
  /** 1º con 0 muertes, el más reciente primero. */
  matches: RecordGame[];
}

export interface StreakRecord {
  /** Nº de partidas de la racha (siempre ≥ 1). */
  length: number;
  fromMatchId: string;
  toMatchId: string;
  /** Epoch en ms (`gameCreation`) de la primera y de la última partida de la racha. */
  from: number;
  to: number;
  /** La racha incluye la última partida del jugador: sigue abierta. */
  ongoing: boolean;
}

export interface DayRecord {
  /** Día de juego, `YYYY-MM-DD` (F17). */
  day: string;
  avgPlacement: number;
  games: number;
}

export interface FirstTryStats {
  /** Campeones cuya primera partida fue un 1º. */
  count: number;
  /** Campeones con algún 1º. */
  wonChampions: number;
  /** `count / wonChampions`, en 0–1 (0 sin campeones ganados). */
  rate: number;
}

export interface TopChampion {
  championId: number;
  championName: string;
  firsts: number;
  games: number;
}

export interface Records {
  records: {
    damage: RecordEntry | null;
    damageTaken: RecordEntry | null;
    kills: RecordEntry | null;
    killingSpree: RecordEntry | null;
    deaths: RecordEntry | null;
  };
  deathlessWins: DeathlessWins;
  mostDeathsWin: RecordEntry | null;
  longestWinStreak: StreakRecord | null;
  longestDrought: StreakRecord | null;
  bestDay: DayRecord | null;
  worstDay: DayRecord | null;
  firstTry: FirstTryStats;
  topChampion: TopChampion | null;
}

const isPlacement = (value: number) =>
  (PLACEMENTS as readonly number[]).includes(value);

const gameOf = (row: RecordRow): RecordGame => ({
  matchId: row.matchId,
  championId: row.championId,
  championName: row.championName,
  gameCreation: row.gameCreation,
});

/**
 * El máximo de `pick` entre las filas (cronológicas) con dato. Empate: gana la partida más
 * antigua, la que lo marcó primero (comparación estricta sobre el orden cronológico).
 */
function maxRecord(
  rows: readonly RecordRow[],
  pick: (row: RecordRow) => number | null,
  filter: (row: RecordRow) => boolean = () => true,
): RecordEntry | null {
  let best: RecordEntry | null = null;
  for (const row of rows) {
    if (!filter(row)) continue;
    const value = pick(row);
    if (value === null) continue;
    if (best === null || value > best.value) best = { value, ...gameOf(row) };
  }
  return best;
}

/**
 * La racha más larga de partidas consecutivas (en orden cronológico) que cumplen `inRun`.
 * Empate: la más reciente (comparación `>=`). `ongoing` si incluye la última partida.
 */
function longestRun(
  rows: readonly RecordRow[],
  inRun: (row: RecordRow) => boolean,
): StreakRecord | null {
  let best: StreakRecord | null = null;
  let start = -1;
  // Un centinela (`rows.length`) cierra la racha abierta al final.
  for (let i = 0; i <= rows.length; i++) {
    if (i < rows.length && inRun(rows[i])) {
      if (start === -1) start = i;
      continue;
    }
    if (start !== -1) {
      const length = i - start;
      if (best === null || length >= best.length) {
        best = {
          length,
          fromMatchId: rows[start].matchId,
          toMatchId: rows[i - 1].matchId,
          from: rows[start].gameCreation,
          to: rows[i - 1].gameCreation,
          ongoing: i === rows.length,
        };
      }
      start = -1;
    }
  }
  return best;
}

const MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Hora a la que empieza el día de juego, hora local de Madrid (F17). */
const DAY_START_HOUR = 6;

/**
 * Día de juego (`YYYY-MM-DD`) de una partida (F17): el día va de 06:00 a 06:00 en Europe/Madrid y
 * la partida cuenta en el día en que empezó. Se toma la fecha y la hora **locales** de Madrid del
 * instante y, si son anteriores a las 06:00, se cuenta el día natural anterior. No se resta 6 h
 * al instante: en los días de cambio de hora (2026-03-29 y 2026-10-25) el día local mide 23 o 25 h
 * y esa resta deja 1 h de partidas en el día equivocado.
 */
export function gameDay(gameStartTimestamp: number): string {
  const parts: Record<string, string> = {};
  for (const { type, value } of MADRID.formatToParts(gameStartTimestamp)) {
    parts[type] = value;
  }
  const date = Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  const day = new Date(+parts.hour < DAY_START_HOUR ? date - 86_400_000 : date);
  return day.toISOString().slice(0, 10);
}

interface DayAcc {
  day: string;
  games: number;
  placementSum: number;
}

/** Mejor y peor día por puesto medio; empate: el día más reciente. `null` si ninguno llega. */
function bestAndWorstDay(rows: readonly RecordRow[]): {
  bestDay: DayRecord | null;
  worstDay: DayRecord | null;
} {
  const byDay = new Map<string, DayAcc>();
  for (const row of rows) {
    const day = gameDay(row.gameStartTimestamp);
    const acc = byDay.get(day);
    if (acc) {
      acc.games += 1;
      acc.placementSum += row.placement;
    } else {
      byDay.set(day, { day, games: 1, placementSum: row.placement });
    }
  }
  const eligible = [...byDay.values()]
    .filter((acc) => acc.games >= RECORD_DAY_MIN_GAMES)
    .map(
      (acc): DayRecord => ({
        day: acc.day,
        avgPlacement: acc.placementSum / acc.games,
        games: acc.games,
      }),
    );
  // `YYYY-MM-DD` ordena cronológicamente como texto: a igual media, el día mayor es el más reciente.
  const recentFirst = (a: DayRecord, b: DayRecord) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : 0;
  eligible.sort(recentFirst);
  let bestDay: DayRecord | null = null;
  let worstDay: DayRecord | null = null;
  for (const day of eligible) {
    if (bestDay === null || day.avgPlacement < bestDay.avgPlacement)
      bestDay = day;
    if (worstDay === null || day.avgPlacement > worstDay.avgPlacement)
      worstDay = day;
  }
  return { bestDay, worstDay };
}

/**
 * Todo lo que pinta la pestaña Estadísticas. Las filas pueden venir en cualquier orden: se
 * ordenan por `gameCreation` (desempate `matchId`), como el resto del dominio.
 *
 * Desempates: en un récord gana la partida más antigua; en rachas y días, la más reciente; en el
 * campeón con más 1º, el de más partidas y después el nombre.
 */
export function computeRecords(rows: readonly RecordRow[]): Records {
  const valid = rows.filter((row) => isPlacement(row.placement));
  valid.sort(compareTime);

  const wins = valid.filter((row) => row.placement === 1);
  const deathless = wins.filter((row) => row.deaths === 0);

  // Campeón -> partidas y 1º; `firstTry` sale de la definición compartida con el Resumen.
  const perChampion = new Map<number, TopChampion>();
  for (const row of valid) {
    const acc = perChampion.get(row.championId);
    if (acc) {
      acc.games += 1;
      if (row.placement === 1) acc.firsts += 1;
      acc.championName = row.championName; // el nombre más reciente
    } else {
      perChampion.set(row.championId, {
        championId: row.championId,
        championName: row.championName,
        firsts: row.placement === 1 ? 1 : 0,
        games: 1,
      });
    }
  }
  const champions = [...perChampion.values()];
  const won = champions.filter((champion) => champion.firsts > 0);
  const firstTryCount = firstTryMatches(valid).size;

  const topChampion =
    won.sort(
      (a, b) =>
        b.firsts - a.firsts ||
        b.games - a.games ||
        a.championName.localeCompare(b.championName, "es") ||
        a.championId - b.championId,
    )[0] ?? null;

  return {
    records: {
      damage: maxRecord(valid, (r) => r.totalDamageDealtToChampions),
      damageTaken: maxRecord(valid, (r) => r.totalDamageTaken),
      kills: maxRecord(valid, (r) => r.kills),
      killingSpree: maxRecord(valid, (r) => r.largestKillingSpree),
      deaths: maxRecord(valid, (r) => r.deaths),
    },
    deathlessWins: {
      count: deathless.length,
      matches: deathless.map(gameOf).reverse(),
    },
    mostDeathsWin: maxRecord(
      valid,
      (r) => r.deaths,
      (r) => r.placement === 1,
    ),
    longestWinStreak: longestRun(valid, (r) => r.placement === 1),
    longestDrought: longestRun(valid, (r) => r.placement !== 1),
    ...bestAndWorstDay(valid),
    firstTry: {
      count: firstTryCount,
      wonChampions: won.length,
      rate: won.length === 0 ? 0 : firstTryCount / won.length,
    },
    topChampion: topChampion ? { ...topChampion } : null,
  };
}
