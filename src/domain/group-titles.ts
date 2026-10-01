// Dominio del bloque Hoy / Semana de la vista del grupo (iter-05): semana de juego, periodo
// mostrado, ranking del periodo, dúos y tríos de miembros y los 7 títulos (F20, F21) con su texto
// de "por qué". Funciones puras (sin BD, sin red y sin React) sobre las partidas de los miembros,
// ya filtradas por temporada y cola. Como en el resto del dominio, solo cuentan los puestos 1..6:
// una fila con un puesto fuera de rango se ignora en todas las cifras.
//
// Nada de lo que sale de aquí se guarda: rankings y títulos se calculan al leer (P9). Los `puuid`
// son identificadores internos: no se muestran en la UI ni van en URLs.

import {
  GROUP_TEAM_MIN_GAMES,
  GROUP_WEEK_MIN_GAMES,
  RECORD_DAY_MIN_GAMES,
} from "@/lib/config";
import { formatCount, formatDecimal, formatShortDate } from "@/lib/format";
import { gameDay } from "./records";
import { PLACEMENTS } from "./stats";

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

/**
 * Una partida de un miembro del grupo (una fila de `participants` unida a `matches`). Las filas
 * son **solo de miembros**: dos filas con la misma `matchId` y el mismo `playerSubteamId` son dos
 * miembros en el mismo equipo.
 */
export interface GroupMatchRow {
  /** Miembro del grupo. Interno: no exponer en UI ni URLs. */
  puuid: string;
  matchId: string;
  /** Epoch en ms del inicio de la partida (F17: decide el día y la semana de juego). */
  gameStartTimestamp: number;
  /** Epoch en ms. */
  gameCreation: number;
  /** Etiqueta del equipo en la partida: mismo valor en la misma partida = mismo equipo. */
  playerSubteamId: number;
  placement: number;
  totalDamageDealtToChampions: number;
}

const isPlacement = (value: number) =>
  (PLACEMENTS as readonly number[]).includes(value);

// ---------------------------------------------------------------------------------------------
// Periodos (F17, F20)
// ---------------------------------------------------------------------------------------------

export type PeriodKind = "day" | "week";

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` -> epoch en ms de su medianoche UTC (solo como fecha de calendario). */
const dateMs = (date: string) =>
  Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

const addDays = (date: string, days: number) =>
  new Date(dateMs(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Semana de juego (F20) de una partida, identificada por su lunes (`YYYY-MM-DD`). La semana va del
 * lunes a las 06:00 al lunes siguiente a las 06:00, hora de Madrid: son los siete días de juego
 * (F17) de lunes a domingo. Se construye sobre `gameDay`, así que hereda su corrección en los
 * cambios de hora (no se resta ninguna duración fija al instante).
 */
export function gameWeek(gameStartTimestamp: number): string {
  const day = gameDay(gameStartTimestamp);
  // getUTCDay: 0 = domingo … 6 = sábado. Días desde el lunes: (dow + 6) % 7.
  const sinceMonday = (new Date(dateMs(day)).getUTCDay() + 6) % 7;
  return addDays(day, -sinceMonday);
}

/** Clave del periodo de un instante: el día de juego o el lunes de su semana de juego. */
export function periodKey(kind: PeriodKind, timestamp: number): string {
  return kind === "day" ? gameDay(timestamp) : gameWeek(timestamp);
}

/**
 * Instante (epoch en ms) en que empieza el día de juego `date` (`YYYY-MM-DD`): las 06:00 de ese
 * día en Madrid. Madrid está a UTC+1 o UTC+2 y a las 06:00 nunca hay cambio de hora, así que se
 * prueban los dos desfases y se valida con `gameDay` (la única definición del día).
 */
export function gameDayStart(date: string): number {
  for (const offsetHours of [1, 2]) {
    const candidate = dateMs(date) + (6 - offsetHours) * 3_600_000;
    if (gameDay(candidate) === date && gameDay(candidate - 1) !== date) {
      return candidate;
    }
  }
  throw new Error(`Día de juego inválido: "${date}"`);
}

export interface Period {
  kind: PeriodKind;
  /** Día de juego (`YYYY-MM-DD`) o lunes de la semana de juego. */
  key: string;
  /** Epoch en ms del inicio (incluido): 06:00 de Madrid del día o del lunes. */
  start: number;
  /** Epoch en ms del final (excluido): 06:00 de Madrid del día siguiente o del lunes siguiente. */
  end: number;
  /** Primer y último día de juego del periodo (`YYYY-MM-DD`; iguales en un día). */
  firstDay: string;
  lastDay: string;
}

/** El periodo `kind` identificado por `key` (día de juego o lunes de la semana). */
export function periodOf(kind: PeriodKind, key: string): Period {
  const lastDay = kind === "day" ? key : addDays(key, 6);
  return {
    kind,
    key,
    start: gameDayStart(key),
    end: gameDayStart(addDays(lastDay, 1)),
    firstDay: key,
    lastDay,
  };
}

export interface DisplayedPeriod extends Period {
  /** Fecha del periodo: "1 oct" o, en la semana, "28 sept – 4 oct" (con el año si no es el de `now`). */
  label: string;
  /** `true` si es el periodo actual; `false` si es el último con partidas (el actual está vacío). */
  isCurrent: boolean;
}

/** Etiqueta de fecha de un periodo con `formatShortDate` (fechas de calendario, sin hora). */
export function periodLabel(period: Period, now: number): string {
  const first = formatShortDate(dateMs(period.firstDay), now);
  if (period.kind === "day") return first;
  return `${first} – ${formatShortDate(dateMs(period.lastDay), now)}`;
}

/**
 * Periodo que muestra el bloque Hoy / Semana (F20): el actual (el que contiene `now`) si algún
 * miembro tiene partidas en él; si no, el último día (o semana) con partidas de algún miembro. Sin
 * ninguna partida, el actual (vacío). Solo cuentan filas con puesto 1..6 y los periodos que no son
 * posteriores al actual.
 */
export function displayedPeriod(
  rows: readonly GroupMatchRow[],
  now: number,
  kind: PeriodKind,
): DisplayedPeriod {
  const currentKey = periodKey(kind, now);
  let key: string | null = null;
  for (const row of rows) {
    if (!isPlacement(row.placement)) continue;
    const rowKey = periodKey(kind, row.gameStartTimestamp);
    // `YYYY-MM-DD` ordena cronológicamente como texto.
    if (rowKey > currentKey) continue;
    if (key === null || rowKey > key) key = rowKey;
  }
  const period = periodOf(kind, key ?? currentKey);
  return {
    ...period,
    label: periodLabel(period, now),
    isCurrent: period.key === currentKey,
  };
}

/** Las filas (con puesto 1..6) del periodo. */
export function rowsInPeriod(
  rows: readonly GroupMatchRow[],
  period: Pick<Period, "kind" | "key">,
): GroupMatchRow[] {
  return rows.filter(
    (row) =>
      isPlacement(row.placement) &&
      periodKey(period.kind, row.gameStartTimestamp) === period.key,
  );
}

// ---------------------------------------------------------------------------------------------
// Ranking del periodo
// ---------------------------------------------------------------------------------------------

/** Mínimo de partidas de un miembro en el periodo para el ranking y los títulos individuales. */
export function playerMinGames(kind: PeriodKind): number {
  return kind === "day" ? RECORD_DAY_MIN_GAMES : GROUP_WEEK_MIN_GAMES;
}

export interface PlayerPeriodStats {
  puuid: string;
  games: number;
  /** Partidas en 1º puesto (`placement === 1`). */
  firsts: number;
  avgPlacement: number;
  /** Daño medio a campeones por partida (`totalDamageDealtToChampions`). */
  avgDamage: number;
}

export interface RankingEntry extends PlayerPeriodStats {
  /** Posición 1..n; los empates de puesto medio la comparten (1, 1, 3). */
  position: number;
}

export interface PeriodRanking {
  /** Miembros con el mínimo, por puesto medio ascendente. */
  ranked: RankingEntry[];
  /** Miembros con partidas en el periodo que no llegan al mínimo ("sin mínimo"). */
  belowMinimum: PlayerPeriodStats[];
}

/** Cifras por miembro de las filas dadas (se ignoran las filas con puesto fuera de 1..6). */
export function computePlayerStats(
  rows: readonly GroupMatchRow[],
): PlayerPeriodStats[] {
  const acc = new Map<
    string,
    { games: number; firsts: number; placementSum: number; damageSum: number }
  >();
  for (const row of rows) {
    if (!isPlacement(row.placement)) continue;
    const entry = acc.get(row.puuid) ?? {
      games: 0,
      firsts: 0,
      placementSum: 0,
      damageSum: 0,
    };
    entry.games += 1;
    if (row.placement === 1) entry.firsts += 1;
    entry.placementSum += row.placement;
    entry.damageSum += row.totalDamageDealtToChampions;
    acc.set(row.puuid, entry);
  }
  return [...acc.entries()].map(([puuid, e]) => ({
    puuid,
    games: e.games,
    firsts: e.firsts,
    avgPlacement: e.placementSum / e.games,
    avgDamage: e.damageSum / e.games,
  }));
}

/**
 * Ranking del periodo (a partir de las cifras de `computePlayerStats` de sus filas). Orden: puesto
 * medio ascendente; a igual puesto medio comparten posición y se listan por más partidas y después
 * por `puuid` (solo para que el orden sea estable). "Sin mínimo": más partidas primero, después
 * `puuid`.
 */
export function rankPlayers(
  players: readonly PlayerPeriodStats[],
  minGames: number,
): PeriodRanking {
  const qualified = players
    .filter((p) => p.games >= minGames)
    .sort(
      (a, b) =>
        a.avgPlacement - b.avgPlacement ||
        b.games - a.games ||
        a.puuid.localeCompare(b.puuid),
    );
  const ranked: RankingEntry[] = [];
  qualified.forEach((player, index) => {
    const previous = ranked[index - 1];
    // Mismo racional -> mismo double (la división IEEE redondea correctamente): `===` es exacto.
    const position =
      previous && previous.avgPlacement === player.avgPlacement
        ? previous.position
        : index + 1;
    ranked.push({ ...player, position });
  });
  const belowMinimum = players
    .filter((p) => p.games < minGames)
    .sort((a, b) => b.games - a.games || a.puuid.localeCompare(b.puuid));
  return { ranked, belowMinimum };
}

// ---------------------------------------------------------------------------------------------
// Dúos y tríos de miembros
// ---------------------------------------------------------------------------------------------

export interface TeamStats {
  /** Miembros del equipo (2 en un dúo, 3 en un trío), ordenados. */
  puuids: string[];
  /** `puuids.join(",")`: identifica el equipo. */
  key: string;
  /** Partidas juntos (en el mismo equipo). */
  games: number;
  /** Partidas juntos en 1º puesto. */
  firsts: number;
  /** `firsts / games`, en 0–1. */
  firstRate: number;
  /** Puesto medio juntos (el puesto es común al equipo). */
  avgPlacement: number;
  /** Epoch en ms (`gameCreation`) de la última partida juntos. */
  lastPlayedAt: number;
}

export interface Teams {
  duos: TeamStats[];
  trios: TeamStats[];
}

interface TeamAcc {
  puuids: string[];
  games: number;
  firsts: number;
  placementSum: number;
  lastPlayedAt: number;
}

function addTeamGame(
  acc: Map<string, TeamAcc>,
  puuids: string[],
  placement: number,
  gameCreation: number,
) {
  const key = puuids.join(",");
  const entry = acc.get(key) ?? {
    puuids,
    games: 0,
    firsts: 0,
    placementSum: 0,
    lastPlayedAt: gameCreation,
  };
  entry.games += 1;
  if (placement === 1) entry.firsts += 1;
  entry.placementSum += placement;
  entry.lastPlayedAt = Math.max(entry.lastPlayedAt, gameCreation);
  acc.set(key, entry);
}

const toTeamStats = (acc: Map<string, TeamAcc>): TeamStats[] =>
  [...acc.values()]
    .map((e) => ({
      puuids: e.puuids,
      key: e.puuids.join(","),
      games: e.games,
      firsts: e.firsts,
      firstRate: e.firsts / e.games,
      avgPlacement: e.placementSum / e.games,
      lastPlayedAt: e.lastPlayedAt,
    }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.firsts - a.firsts ||
        a.avgPlacement - b.avgPlacement ||
        a.key.localeCompare(b.key),
    );

/**
 * Dúos y tríos de miembros en las filas dadas (sirve para un periodo o para toda la temporada). En
 * cada partida, los miembros con la misma `playerSubteamId` forman un equipo:
 * - **trío**: tres miembros en el mismo equipo;
 * - **dúo**: cada par de miembros en el mismo equipo, sea el tercero miembro o no (un trío de
 *   miembros aporta sus tres dúos).
 * Un miembro solo en su equipo no genera nada. El puesto del equipo es el de su fila (común al
 * equipo). Sin mínimo de partidas: se filtra después (`GROUP_TEAM_MIN_GAMES`). Orden: más
 * partidas, más 1º, mejor puesto medio y la clave (estable).
 */
export function computeTeams(rows: readonly GroupMatchRow[]): Teams {
  const byTeam = new Map<string, GroupMatchRow[]>();
  for (const row of rows) {
    if (!isPlacement(row.placement)) continue;
    const teamKey = `${row.matchId}\u0000${row.playerSubteamId}`;
    const list = byTeam.get(teamKey);
    if (list) list.push(row);
    else byTeam.set(teamKey, [row]);
  }

  const duos = new Map<string, TeamAcc>();
  const trios = new Map<string, TeamAcc>();
  for (const teamRows of byTeam.values()) {
    const members = [...new Set(teamRows.map((row) => row.puuid))].sort();
    if (members.length < 2) continue;
    const { placement, gameCreation } = teamRows[0];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        addTeamGame(duos, [members[i], members[j]], placement, gameCreation);
      }
    }
    if (members.length === 3) {
      addTeamGame(trios, members, placement, gameCreation);
    }
  }
  return { duos: toTeamStats(duos), trios: toTeamStats(trios) };
}

// ---------------------------------------------------------------------------------------------
// Títulos (F21)
// ---------------------------------------------------------------------------------------------

export type TitleId =
  | "troll"
  | "pacifist"
  | "devil"
  | "brokenTrio"
  | "boomTrio"
  | "brokenDuo"
  | "boomDuo";

/** Quién puede llevar el título: un jugador, un dúo o un trío de miembros. */
export type TitleSubject = "player" | "duo" | "trio";

/** Métrica que decide el título. */
export type TitleMetric = "avgPlacement" | "avgDamage" | "firsts";

export interface TitleDefinition {
  id: TitleId;
  /** Nombre sin periodo ("El trol"). */
  name: string;
  subject: TitleSubject;
  metric: TitleMetric;
  /** Qué mide, para el apartado Títulos. */
  description: string;
  periods: readonly PeriodKind[];
  /** Partidas mínimas por periodo (del jugador o juntos, según `subject`). */
  minGames: Readonly<Record<PeriodKind, number>>;
  /** El mínimo en texto, para el apartado Títulos. */
  minimumText: string;
}

const PERIODS: readonly PeriodKind[] = ["day", "week"];

const PLAYER_MIN = {
  day: RECORD_DAY_MIN_GAMES,
  week: GROUP_WEEK_MIN_GAMES,
} as const;
const TEAM_MIN = {
  day: GROUP_TEAM_MIN_GAMES,
  week: GROUP_TEAM_MIN_GAMES,
} as const;

const PLAYER_MIN_TEXT = `${PLAYER_MIN.day} partidas en el día y ${PLAYER_MIN.week} en la semana`;
const TEAM_MIN_TEXT = `${GROUP_TEAM_MIN_GAMES} partidas juntos en el periodo`;

/** Los 7 títulos de F21, en el orden en que se muestran. */
export const TITLE_DEFINITIONS: readonly TitleDefinition[] = [
  {
    id: "troll",
    name: "El trol",
    subject: "player",
    metric: "avgPlacement",
    description: "Peor puesto medio.",
    periods: PERIODS,
    minGames: PLAYER_MIN,
    minimumText: PLAYER_MIN_TEXT,
  },
  {
    id: "pacifist",
    name: "El pacifista",
    subject: "player",
    metric: "avgDamage",
    description: "Menos daño medio a campeones por partida.",
    periods: PERIODS,
    minGames: PLAYER_MIN,
    minimumText: PLAYER_MIN_TEXT,
  },
  {
    id: "devil",
    name: "El D-d-d-diablo",
    subject: "player",
    metric: "avgDamage",
    description: "Más daño medio a campeones por partida.",
    periods: PERIODS,
    minGames: PLAYER_MIN,
    minimumText: PLAYER_MIN_TEXT,
  },
  {
    id: "brokenTrio",
    name: "Equipo roto",
    subject: "trio",
    metric: "firsts",
    description:
      "Trío de miembros con más 1º juntos; desempata el mejor puesto medio.",
    periods: PERIODS,
    minGames: TEAM_MIN,
    minimumText: TEAM_MIN_TEXT,
  },
  {
    id: "boomTrio",
    name: "Equipo mental boom",
    subject: "trio",
    metric: "avgPlacement",
    description: "Trío de miembros con peor puesto medio juntos.",
    periods: PERIODS,
    minGames: TEAM_MIN,
    minimumText: TEAM_MIN_TEXT,
  },
  {
    id: "brokenDuo",
    name: "Pareja rota",
    subject: "duo",
    metric: "firsts",
    description:
      "Dúo de miembros con más 1º juntos; desempata el mejor puesto medio.",
    periods: PERIODS,
    minGames: TEAM_MIN,
    minimumText: TEAM_MIN_TEXT,
  },
  {
    id: "boomDuo",
    name: "Pareja mental boom",
    subject: "duo",
    metric: "avgPlacement",
    description: "Dúo de miembros con peor puesto medio juntos.",
    periods: PERIODS,
    minGames: TEAM_MIN,
    minimumText: TEAM_MIN_TEXT,
  },
];

/** Mínimo de clasificados (jugadores, dúos o tríos) para otorgar un título (F21). */
export const TITLE_MIN_CONTENDERS = 2;

/** Reglas comunes de los títulos, para el apartado Títulos. */
export const TITLE_RULES: readonly string[] = [
  `Un título solo se otorga si hay al menos ${TITLE_MIN_CONTENDERS} clasificados (jugadores, dúos o tríos, según el título).`,
  "Los empates comparten el título.",
  "Un dúo son dos miembros en el mismo equipo, sea el tercero miembro o no; un trío son tres miembros en el mismo equipo.",
  "El día va de las 06:00 a las 06:00, hora de Madrid; cada partida cuenta en el día en que empezó.",
  "La semana va del lunes a las 06:00 al lunes siguiente a las 06:00, hora de Madrid.",
];

const PERIOD_SUFFIX: Record<PeriodKind, string> = {
  day: "del día",
  week: "de la semana",
};

/** Nombre visible del título con su periodo: "El trol del día", "Pareja rota de la semana". */
export function titleName(id: TitleId, kind: PeriodKind): string {
  return `${definitionOf(id).name} ${PERIOD_SUFFIX[kind]}`;
}

function definitionOf(id: TitleId): TitleDefinition {
  const found = TITLE_DEFINITIONS.find((d) => d.id === id);
  if (!found) throw new Error(`Título desconocido: ${id}`);
  return found;
}

/** Puesto medio como se muestra en las tablas y en los títulos: `4,60`. */
export const formatAvgPlacement = (value: number) => formatDecimal(value);

/** Daño medio por partida como se muestra en las tablas y en los títulos: `12.346`. */
export const formatAvgDamage = (value: number) =>
  formatCount(Math.round(value));

const gamesText = (games: number) =>
  `${formatCount(games)} ${games === 1 ? "partida" : "partidas"}`;

export interface TitleHolder {
  /** El jugador (1), el dúo (2) o el trío (3) que lleva el título. */
  puuids: string[];
  /** Valor de la métrica del título (`TitleMetric`): igual en todos los poseedores de un título. */
  value: number;
  /** Partidas del jugador, o juntos, en el periodo. */
  games: number;
  firsts: number;
  avgPlacement: number;
  /** Solo en los títulos individuales: daño medio a campeones por partida. */
  avgDamage: number | null;
  /** Por qué lo tiene: "Peor puesto medio del día: 4,60 en 5 partidas". */
  why: string;
}

export interface AwardedTitle {
  id: TitleId;
  kind: PeriodKind;
  subject: TitleSubject;
  metric: TitleMetric;
  /** Nombre visible con el periodo ("El trol del día"). */
  name: string;
  /** Uno o varios (empate: el título se comparte), ordenados por `puuids`. */
  holders: TitleHolder[];
}

/**
 * Los que se llevan el título: los clasificados empatados en cabeza según `compare` (negativo si
 * `a` lo merece más que `b`). Vacío si hay menos de `TITLE_MIN_CONTENDERS` clasificados.
 */
function winners<T>(
  contenders: readonly T[],
  compare: (a: T, b: T) => number,
): T[] {
  if (contenders.length < TITLE_MIN_CONTENDERS) return [];
  const sorted = [...contenders].sort(compare);
  return sorted.filter((c) => compare(c, sorted[0]) === 0);
}

const worstPlacement = (
  a: { avgPlacement: number },
  b: { avgPlacement: number },
) => b.avgPlacement - a.avgPlacement;
const mostFirsts = (
  a: { firsts: number; avgPlacement: number },
  b: { firsts: number; avgPlacement: number },
) => b.firsts - a.firsts || a.avgPlacement - b.avgPlacement;

function playerWhy(id: TitleId, kind: PeriodKind, p: PlayerPeriodStats) {
  const period = PERIOD_SUFFIX[kind];
  const games = gamesText(p.games);
  switch (id) {
    case "troll":
      return `Peor puesto medio ${period}: ${formatAvgPlacement(p.avgPlacement)} en ${games}`;
    case "pacifist":
      return `Menos daño medio a campeones ${period}: ${formatAvgDamage(p.avgDamage)} por partida en ${games}`;
    default:
      return `Más daño medio a campeones ${period}: ${formatAvgDamage(p.avgDamage)} por partida en ${games}`;
  }
}

function teamWhy(broken: boolean, kind: PeriodKind, t: TeamStats) {
  const period = PERIOD_SUFFIX[kind];
  const games = gamesText(t.games);
  const avg = formatAvgPlacement(t.avgPlacement);
  return broken
    ? `Más 1º juntos ${period}: ${formatCount(t.firsts)} en ${games} (puesto medio ${avg})`
    : `Peor puesto medio juntos ${period}: ${avg} en ${games}`;
}

const byPuuids = (a: TitleHolder, b: TitleHolder) =>
  a.puuids.join(",").localeCompare(b.puuids.join(","));

/**
 * Los títulos del periodo `kind` (F21), en el orden de `TITLE_DEFINITIONS`; solo los otorgados.
 * `players` y `teams` son las cifras de las filas del periodo. Se aplica la regla literal:
 * - individuales: entre los miembros con `playerMinGames(kind)` partidas;
 * - dúo y trío: entre los equipos con `GROUP_TEAM_MIN_GAMES` partidas juntos;
 * - al menos `TITLE_MIN_CONTENDERS` clasificados del tipo del título; los empates lo comparten.
 * No hay más condiciones: "Equipo roto" se otorga aunque ningún trío tenga un 1º (decide el puesto
 * medio) y un mismo equipo puede ser "roto" y "mental boom" a la vez.
 */
export function awardTitles(
  kind: PeriodKind,
  players: readonly PlayerPeriodStats[],
  teams: Teams,
): AwardedTitle[] {
  const qualifiedPlayers = players.filter(
    (p) => p.games >= playerMinGames(kind),
  );
  const qualifiedTeams = {
    duo: teams.duos.filter((t) => t.games >= GROUP_TEAM_MIN_GAMES),
    trio: teams.trios.filter((t) => t.games >= GROUP_TEAM_MIN_GAMES),
  };

  const titles: AwardedTitle[] = [];
  for (const def of TITLE_DEFINITIONS) {
    let holders: TitleHolder[];
    if (def.subject === "player") {
      const compare =
        def.id === "troll"
          ? worstPlacement
          : def.id === "pacifist"
            ? (a: PlayerPeriodStats, b: PlayerPeriodStats) =>
                a.avgDamage - b.avgDamage
            : (a: PlayerPeriodStats, b: PlayerPeriodStats) =>
                b.avgDamage - a.avgDamage;
      holders = winners(qualifiedPlayers, compare).map((p) => ({
        puuids: [p.puuid],
        value: def.metric === "avgPlacement" ? p.avgPlacement : p.avgDamage,
        games: p.games,
        firsts: p.firsts,
        avgPlacement: p.avgPlacement,
        avgDamage: p.avgDamage,
        why: playerWhy(def.id, kind, p),
      }));
    } else {
      const broken = def.metric === "firsts";
      holders = winners(
        qualifiedTeams[def.subject],
        broken ? mostFirsts : worstPlacement,
      ).map((t) => ({
        puuids: t.puuids,
        value: broken ? t.firsts : t.avgPlacement,
        games: t.games,
        firsts: t.firsts,
        avgPlacement: t.avgPlacement,
        avgDamage: null,
        why: teamWhy(broken, kind, t),
      }));
    }
    if (holders.length === 0) continue;
    titles.push({
      id: def.id,
      kind,
      subject: def.subject,
      metric: def.metric,
      name: titleName(def.id, kind),
      holders: holders.sort(byPuuids),
    });
  }
  return titles;
}

/** Un título que lleva un miembro (él solo o como parte de un dúo o un trío). */
export interface PlayerTitle {
  title: AwardedTitle;
  /** El poseedor en el que aparece el miembro (su dúo o trío en los títulos de equipo). */
  holder: TitleHolder;
}

/**
 * Los títulos que lleva `puuid`: los individuales suyos y los de cada dúo o trío del que forma
 * parte (un título de dúo o trío sale en el perfil de cada uno de sus miembros).
 */
export function titlesOf(
  titles: readonly AwardedTitle[],
  puuid: string,
): PlayerTitle[] {
  const result: PlayerTitle[] = [];
  for (const title of titles) {
    for (const holder of title.holders) {
      if (holder.puuids.includes(puuid)) result.push({ title, holder });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Bloque Hoy / Semana
// ---------------------------------------------------------------------------------------------

export interface GroupPeriodView {
  period: DisplayedPeriod;
  ranking: PeriodRanking;
  /** Todos los dúos y tríos del periodo (sin mínimo), para quien quiera enseñarlos. */
  teams: Teams;
  titles: AwardedTitle[];
}

/**
 * Todo lo del bloque Hoy / Semana para `kind`: el periodo mostrado (el actual o, si está vacío, el
 * último con partidas), su ranking y sus títulos. `rows`: partidas de los miembros en la temporada
 * (cualquier orden).
 */
export function computeGroupPeriod(
  rows: readonly GroupMatchRow[],
  now: number,
  kind: PeriodKind,
): GroupPeriodView {
  const period = displayedPeriod(rows, now, kind);
  const periodRows = rowsInPeriod(rows, period);
  const players = computePlayerStats(periodRows);
  const teams = computeTeams(periodRows);
  return {
    period,
    ranking: rankPlayers(players, playerMinGames(kind)),
    teams,
    titles: awardTitles(kind, players, teams),
  };
}
