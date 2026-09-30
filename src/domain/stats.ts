// Dominio de stats de Arena: funciones puras (sin BD ni red) sobre filas ya filtradas por
// temporada y cola (ver `queries.ts`). `placement === 1` es el 1º puesto; `win` NO lo es
// (es `true` para los puestos 1-3): nada de aquí lo usa.

/** Puestos posibles en Arena tríos (6 equipos). */
export const PLACEMENTS = [1, 2, 3, 4, 5, 6] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Una partida del jugador (una fila de `participants` unida a `matches`). */
export interface PlayerMatchRow {
  matchId: string;
  /** Epoch en ms. */
  gameCreation: number;
  championId: number;
  championName: string;
  placement: number;
  playerSubteamId: number;
}

const isPlacement = (value: number): value is Placement =>
  (PLACEMENTS as readonly number[]).includes(value);

export interface StatsSummary {
  games: number;
  /** Partidas en 1º puesto (`placement === 1`). */
  firsts: number;
  /** `firsts / games`, en 0–1 (0 sin partidas). */
  firstRate: number;
  /** Partidas con `placement <= 3`. */
  top3: number;
  /** `top3 / games`, en 0–1 (0 sin partidas). */
  top3Rate: number;
  /** Puesto medio; `null` si no hay partidas. */
  avgPlacement: number | null;
  /** Partidas por puesto (siempre las seis claves). */
  distribution: Record<Placement, number>;
}

/**
 * Resumen del jugador. Solo cuentan filas con `placement` 1..6 (el rango de Arena tríos): una
 * fila con un puesto fuera de rango (no observado en la API) se ignora en todas las cifras para
 * que `games` y `distribution` siempre cuadren.
 */
export function computeSummary(rows: readonly PlayerMatchRow[]): StatsSummary {
  const distribution: Record<Placement, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };
  let games = 0;
  let placementSum = 0;
  for (const { placement } of rows) {
    if (!isPlacement(placement)) continue;
    games += 1;
    placementSum += placement;
    distribution[placement] += 1;
  }
  const firsts = distribution[1];
  const top3 = distribution[1] + distribution[2] + distribution[3];
  return {
    games,
    firsts,
    firstRate: games > 0 ? firsts / games : 0,
    top3,
    top3Rate: games > 0 ? top3 / games : 0,
    avgPlacement: games > 0 ? placementSum / games : null,
    distribution,
  };
}

export interface VerifiedChampion {
  championId: number;
  /** Nombre en la partida más reciente ganada con el campeón (puede diferir del de Data Dragon). */
  championName: string;
  /** Veces que el jugador quedó 1º con este campeón (>= 1). */
  firsts: number;
  firstWinMatchId: string;
  /** Epoch en ms del primer 1º con este campeón. */
  firstWinAt: number;
  lastWinMatchId: string;
  /** Epoch en ms del último 1º con este campeón. */
  lastWinAt: number;
}

// Orden cronológico total y determinista (`gameCreation`, después `matchId`).
const byTime = (a: PlayerMatchRow, b: PlayerMatchRow) =>
  a.gameCreation - b.gameCreation || a.matchId.localeCompare(b.matchId);

/**
 * Campeones "verificados": aquellos con al menos un 1º puesto. Un campeón cuenta una sola vez
 * aunque haya ganado varias partidas (el recuento es `distinct championId`, como el challenge
 * 602002), y `firsts` guarda cuántas. Orden: último 1º más reciente primero.
 */
export function verifiedChampions(
  rows: readonly PlayerMatchRow[],
): VerifiedChampion[] {
  const wins = new Map<number, PlayerMatchRow[]>();
  for (const row of rows) {
    if (row.placement !== 1) continue;
    const list = wins.get(row.championId);
    if (list) list.push(row);
    else wins.set(row.championId, [row]);
  }

  const champions: VerifiedChampion[] = [];
  for (const [championId, list] of wins) {
    list.sort(byTime);
    const first = list[0];
    const last = list[list.length - 1];
    champions.push({
      championId,
      championName: last.championName,
      firsts: list.length,
      firstWinMatchId: first.matchId,
      firstWinAt: first.gameCreation,
      lastWinMatchId: last.matchId,
      lastWinAt: last.gameCreation,
    });
  }
  return champions.sort(
    (a, b) => b.lastWinAt - a.lastWinAt || a.championId - b.championId,
  );
}

/**
 * Participante de una partida del jugador. Se necesitan las filas de **todas** las partidas del
 * jugador (incluida la suya) para saber en qué `playerSubteamId` estaba en cada una.
 * `puuid` es un identificador interno: no se muestra en la UI ni va en URLs.
 */
export interface TeammateRow {
  matchId: string;
  /** Epoch en ms de la partida. */
  gameCreation: number;
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  placement: number;
  playerSubteamId: number;
}

export interface TeammateStats {
  /** Interno: solo sirve para agrupar. No exponer en UI, URLs ni respuestas públicas. */
  puuid: string;
  gameName: string;
  tagLine: string;
  /** Partidas jugadas juntos. */
  games: number;
  /** Partidas juntos en 1º puesto (`placement === 1`). */
  firsts: number;
  /** Partidas juntos con `placement <= 3`. */
  top3: number;
  /** Puesto medio en las partidas jugadas juntos (el puesto es común al trío). */
  avgPlacement: number;
  /** Epoch en ms de la última partida juntos (el máximo de `gameCreation`). */
  lastPlayedAt: number;
}

/**
 * Compañeros de trío del jugador `selfPuuid`: en cada partida, los participantes con el mismo
 * `playerSubteamId` que él y distinto `puuid` (siempre 2). Las partidas donde no aparece
 * `selfPuuid` se ignoran. Como en `computeSummary`, solo cuentan filas con `placement` 1..6: una
 * fila con un puesto fuera de rango se ignora entera (cifras y nombre). El nombre es el de la fila
 * más reciente por `gameCreation` de cada compañero (Riot IDs pueden cambiar; a igualdad gana la
 * última fila vista) y `lastPlayedAt` su máximo, sin depender del orden de entrada.
 * Orden: más partidas juntos primero (desempate: más 1º, nombre, puuid).
 */
export function computeTeammates(
  rows: readonly TeammateRow[],
  selfPuuid: string,
): TeammateStats[] {
  const byMatch = new Map<string, TeammateRow[]>();
  for (const row of rows) {
    const list = byMatch.get(row.matchId);
    if (list) list.push(row);
    else byMatch.set(row.matchId, [row]);
  }

  const acc = new Map<
    string,
    {
      gameName: string;
      tagLine: string;
      games: number;
      firsts: number;
      top3: number;
      placementSum: number;
      lastPlayedAt: number;
    }
  >();
  for (const matchRows of byMatch.values()) {
    const self = matchRows.find((row) => row.puuid === selfPuuid);
    if (!self) continue;
    for (const row of matchRows) {
      if (row.puuid === selfPuuid) continue;
      if (row.playerSubteamId !== self.playerSubteamId) continue;
      if (!isPlacement(row.placement)) continue;
      const entry = acc.get(row.puuid) ?? {
        gameName: row.riotIdGameName,
        tagLine: row.riotIdTagline,
        games: 0,
        firsts: 0,
        top3: 0,
        placementSum: 0,
        lastPlayedAt: row.gameCreation,
      };
      if (row.gameCreation >= entry.lastPlayedAt) {
        entry.gameName = row.riotIdGameName;
        entry.tagLine = row.riotIdTagline;
        entry.lastPlayedAt = row.gameCreation;
      }
      entry.games += 1;
      if (row.placement === 1) entry.firsts += 1;
      if (row.placement <= 3) entry.top3 += 1;
      entry.placementSum += row.placement;
      acc.set(row.puuid, entry);
    }
  }

  return [...acc.entries()]
    .map(([puuid, e]) => ({
      puuid,
      gameName: e.gameName,
      tagLine: e.tagLine,
      games: e.games,
      firsts: e.firsts,
      top3: e.top3,
      avgPlacement: e.placementSum / e.games,
      lastPlayedAt: e.lastPlayedAt,
    }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.firsts - a.firsts ||
        a.gameName.toLowerCase().localeCompare(b.gameName.toLowerCase()) ||
        a.puuid.localeCompare(b.puuid),
    );
}

/** Entrada mínima de `Challenges-V1 player-data` (compatible con `PlayerDataDto`). */
export interface ChallengePlayerData {
  challenges: ReadonlyArray<{
    challengeId: number;
    value: number;
    level: string;
    achievedTime?: number;
  }>;
}

export interface ChallengeInfo {
  value: number;
  level: string;
  /** Epoch en ms; `null` si Riot no lo envía. */
  achievedTime: number | null;
}

/** Valor, nivel y `achievedTime` de un challenge en `player-data`; `null` si no aparece. */
export function extractChallenge(
  playerData: ChallengePlayerData,
  challengeId: number,
): ChallengeInfo | null {
  const found = playerData.challenges.find(
    (challenge) => challenge.challengeId === challengeId,
  );
  if (!found) return null;
  return {
    value: found.value,
    level: found.level,
    achievedTime: found.achievedTime ?? null,
  };
}

export type ChallengeStatus = "match" | "diff" | "unknown";

export interface ChallengeComparison {
  /**
   * `match`: el recuento propio y el challenge coinciden; `diff`: no coinciden;
   * `unknown`: aún no hay valor del challenge con el que comparar.
   */
  status: ChallengeStatus;
  /** `verifiedCount - challengeValue` (positivo: hay más campeones propios que en el challenge); `null` si `unknown`. */
  diff: number | null;
}

/**
 * Control del recuento propio de campeones verificados contra el valor del challenge 602002.
 * El challenge es un control, no la fuente de verdad: un `diff` avisa, no corrige nada.
 */
export function compareWithChallenge(
  verifiedCount: number,
  challengeValue: number | null,
): ChallengeComparison {
  if (challengeValue === null) return { status: "unknown", diff: null };
  // El valor llega como float (75.0) pero es entero: la comparación exacta es válida.
  const diff = verifiedCount - challengeValue;
  return { status: diff === 0 ? "match" : "diff", diff };
}
