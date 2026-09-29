import { describe, expect, it } from "vitest";
import { type MatchDto, PlayerDataDto } from "@/lib/riot/schemas";
import {
  loadMatchFixtures,
  promoteTrioToFirst,
  SELF_PUUID,
  variantOf,
} from "../../tests/helpers/matches";
import { readFixtureJson } from "../../tests/helpers/riot";
import {
  compareWithChallenge,
  computeSummary,
  computeTeammates,
  extractChallenge,
  type PlayerMatchRow,
  type TeammateRow,
  verifiedChampions,
} from "./stats";

// Las filas salen de las 10 partidas reales de `tests/fixtures/matches/` (ordenadas por id, que
// es cronológico ascendente). Las cifras esperadas están escritas a mano leyendo esos JSON; los
// comentarios dicen de dónde sale cada una. La muestra NO contiene ningún 1º del jugador
// (`anon-puuid-self`, puestos 2..6), así que los casos con 1º se sintetizan en memoria
// cambiando `placement`, o se usa el trío ganador real de cada partida.
//
//   #  matchId           gameCreation   campeón (id)      placement  subteam  compañeros (anon-puuid-…)
//   0  EUW1_7997909147   1790618903881  Rakan (497)       5          2        013, 152
//   1  EUW1_7997941195   1790620352785  Blitzcrank (53)   3          2        115, 013
//   2  EUW1_7997977102   1790621786516  Zaahen (904)      3          3        115, 013
//   3  EUW1_7998150879   1790628583866  Rakan (497)       3          2        046, 013
//   4  EUW1_7998171444   1790629969753  Teemo (17)        5          3        046, 013
//   5  EUW1_7998206870   1790631203401  Yuumi (350)       6          1        046, 013
//   6  EUW1_7998227781   1790632403267  Varus (110)       4          1        046, 013
//   7  EUW1_7998254564   1790633861469  Thresh (412)      4          1        046, 013
//   8  EUW1_7998494554   1790680293890  Thresh (412)      2          2        022, 013
//   9  EUW1_7998513907   1790682703953  Thresh (412)      2          1        012, 013

const fixtures = loadMatchFixtures();

function selfRow(match: MatchDto): PlayerMatchRow {
  const me = match.info.participants.find((p) => p.puuid === SELF_PUUID);
  if (!me) throw new Error(`${match.metadata.matchId}: sin jugador de prueba`);
  return {
    matchId: match.metadata.matchId,
    gameCreation: match.info.gameCreation,
    championId: me.championId,
    championName: me.championName,
    placement: me.placement,
    playerSubteamId: me.playerSubteamId,
  };
}

function allRows(match: MatchDto): TeammateRow[] {
  return match.info.participants.map((p) => ({
    matchId: match.metadata.matchId,
    puuid: p.puuid,
    riotIdGameName: p.riotIdGameName,
    riotIdTagline: p.riotIdTagline,
    placement: p.placement,
    playerSubteamId: p.playerSubteamId,
  }));
}

const playerRows = fixtures.map((f) => selfRow(f.match));

/** Copia de las filas del jugador con los puestos indicados por índice de partida. */
function withPlacements(overrides: Record<number, number>): PlayerMatchRow[] {
  return playerRows.map((row, index) => ({
    ...row,
    placement: overrides[index] ?? row.placement,
  }));
}

describe("muestra de partida (ancla de las cifras esperadas)", () => {
  it("son las 10 partidas de la tabla de arriba", () => {
    expect(playerRows.map((r) => r.matchId)).toEqual([
      "EUW1_7997909147",
      "EUW1_7997941195",
      "EUW1_7997977102",
      "EUW1_7998150879",
      "EUW1_7998171444",
      "EUW1_7998206870",
      "EUW1_7998227781",
      "EUW1_7998254564",
      "EUW1_7998494554",
      "EUW1_7998513907",
    ]);
    expect(playerRows.map((r) => r.placement)).toEqual([
      5, 3, 3, 3, 5, 6, 4, 4, 2, 2,
    ]);
    expect(playerRows.map((r) => r.championId)).toEqual([
      497, 53, 904, 497, 17, 350, 110, 412, 412, 412,
    ]);
  });
});

describe("computeSummary", () => {
  it("resume las 10 partidas reales", () => {
    // Puestos [5,3,3,3,5,6,4,4,2,2]: ningún 1º; 2º x2 (#8, #9); 3º x3 (#1, #2, #3);
    // 4º x2 (#6, #7); 5º x2 (#0, #4); 6º x1 (#5). top3 = 2+3 = 5. Suma = 37 -> media 3,7.
    expect(computeSummary(playerRows)).toEqual({
      games: 10,
      firsts: 0,
      firstRate: 0,
      top3: 5,
      top3Rate: 0.5,
      avgPlacement: 3.7,
      distribution: { 1: 0, 2: 2, 3: 3, 4: 2, 5: 2, 6: 1 },
    });
  });

  it("cuenta 1º sintéticos (placement 1 en #0, #3 y #8)", () => {
    // Puestos [1,3,3,1,5,6,4,4,1,2]: 1º x3; 2º x1; 3º x2; 4º x2; 5º x1; 6º x1 (suma 10).
    // top3 = 3+1+2 = 6; suma = 30 -> media 3,0.
    expect(computeSummary(withPlacements({ 0: 1, 3: 1, 8: 1 }))).toEqual({
      games: 10,
      firsts: 3,
      firstRate: 0.3,
      top3: 6,
      top3Rate: 0.6,
      avgPlacement: 3,
      distribution: { 1: 3, 2: 1, 3: 2, 4: 2, 5: 1, 6: 1 },
    });
  });

  it("sin partidas: todo a cero y puesto medio null", () => {
    expect(computeSummary([])).toEqual({
      games: 0,
      firsts: 0,
      firstRate: 0,
      top3: 0,
      top3Rate: 0,
      avgPlacement: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    });
  });

  it("ignora puestos fuera de 1..6 para que games y distribution cuadren", () => {
    // Dos filas reales (puestos 5 y 3) y dos inválidas (0 y 7): solo cuentan las reales.
    const rows = [
      playerRows[0],
      playerRows[1],
      { ...playerRows[2], placement: 0 },
      { ...playerRows[3], placement: 7 },
    ];
    const summary = computeSummary(rows);
    expect(summary.games).toBe(2);
    expect(summary.avgPlacement).toBe(4); // (5 + 3) / 2
    expect(Object.values(summary.distribution).reduce((a, b) => a + b, 0)).toBe(
      2,
    );
  });
});

describe("verifiedChampions", () => {
  it("la muestra real no tiene ningún 1º del jugador", () => {
    expect(verifiedChampions(playerRows)).toEqual([]);
    expect(verifiedChampions([])).toEqual([]);
  });

  it("varios 1º del mismo campeón cuentan como uno (trío ganador real)", () => {
    // Un jugador hipotético que fuese siempre del trío ganador real: de cada partida se toma un
    // participante con `placement === 1`. `participantId` elegido a mano leyendo los JSON:
    //   #0 3 Malzahar(90)    #1 3 Ekko(245)   #2 9 Alistar(12)   #3 4 JarvanIV(59)
    //   #4 5 Skarner(72)     #5 1 XinZhao(5)  #6 2 Vex(711)      #7 2 Viego(234)
    //   #8 6 Lulu(117)       #9 8 Lulu(117)   <- mismo campeón en dos partidas distintas
    // Son 10 primeros con 9 campeones distintos.
    const winnerIds = [3, 3, 9, 4, 5, 1, 2, 2, 6, 8];
    const rows = fixtures.map((f, index): PlayerMatchRow => {
      const winner = f.match.info.participants.find(
        (p) => p.participantId === winnerIds[index],
      );
      if (!winner || winner.placement !== 1) {
        throw new Error(`${f.id}: participantId ${winnerIds[index]} no es 1º`);
      }
      return {
        matchId: f.id,
        gameCreation: f.match.info.gameCreation,
        championId: winner.championId,
        championName: winner.championName,
        placement: winner.placement,
        playerSubteamId: winner.playerSubteamId,
      };
    });

    const result = verifiedChampions(rows);
    expect(result).toHaveLength(9);
    // Último 1º más reciente primero: Lulu (#9 y #8), luego Viego (#7)...
    expect(result.map((c) => c.championId)).toEqual([
      117, 234, 711, 5, 72, 59, 12, 245, 90,
    ]);
    expect(result[0]).toEqual({
      championId: 117,
      championName: "Lulu",
      firsts: 2,
      firstWinMatchId: "EUW1_7998494554",
      firstWinAt: 1790680293890,
      lastWinMatchId: "EUW1_7998513907",
      lastWinAt: 1790682703953,
    });
    expect(result[1]).toMatchObject({
      championId: 234,
      championName: "Viego",
      firsts: 1,
      firstWinMatchId: "EUW1_7998254564",
      lastWinMatchId: "EUW1_7998254564",
    });
    expect(result.reduce((total, c) => total + c.firsts, 0)).toBe(10);
  });

  it("con 1º sintéticos del jugador: distinct por campeón, primer y último 1º", () => {
    // 1º en #0 y #3 (Rakan, 497) y en #7 y #9 (Thresh, 412) => 2 campeones distintos, 2 1º cada uno.
    //   Rakan:  primero #0 (1790618903881), último #3 (1790628583866)
    //   Thresh: primero #7 (1790633861469), último #9 (1790682703953)
    // Orden por último 1º descendente: Thresh, Rakan.
    const rows = withPlacements({ 0: 1, 3: 1, 7: 1, 9: 1 });
    expect(verifiedChampions(rows)).toEqual([
      {
        championId: 412,
        championName: "Thresh",
        firsts: 2,
        firstWinMatchId: "EUW1_7998254564",
        firstWinAt: 1790633861469,
        lastWinMatchId: "EUW1_7998513907",
        lastWinAt: 1790682703953,
      },
      {
        championId: 497,
        championName: "Rakan",
        firsts: 2,
        firstWinMatchId: "EUW1_7997909147",
        firstWinAt: 1790618903881,
        lastWinMatchId: "EUW1_7998150879",
        lastWinAt: 1790628583866,
      },
    ]);
  });

  it("no depende del orden de entrada ni modifica las filas", () => {
    const rows = withPlacements({ 0: 1, 3: 1, 7: 1, 9: 1 });
    const snapshot = structuredClone(rows);
    expect(verifiedChampions([...rows].reverse())).toEqual(
      verifiedChampions(rows),
    );
    expect(rows).toEqual(snapshot);
  });

  it("el recuento distinct coincide con el número de campeones", () => {
    // 1º en las 3 partidas de Thresh (#7, #8, #9) => 1 solo campeón verificado con 3 1º.
    const result = verifiedChampions(withPlacements({ 7: 1, 8: 1, 9: 1 }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ championId: 412, firsts: 3 });
  });
});

describe("computeTeammates", () => {
  const rows = fixtures.flatMap((f) => allRows(f.match));

  it("agrupa los compañeros de trío de las 10 partidas reales", () => {
    // Cada partida aporta exactamente 2 compañeros (mismo playerSubteamId, distinto puuid), así
    // que la suma de `games` es 20. Recuento por compañero (tabla de arriba):
    //   013 en las 10 partidas -> puestos [5,3,3,3,5,6,4,4,2,2] -> media 37/10 = 3,7
    //   046 en #3..#7 -> puestos [3,5,6,4,4] -> media 22/5 = 4,4
    //   115 en #1 y #2 -> puestos [3,3] -> media 3
    //   012 en #9 -> [2];  022 en #8 -> [2];  152 en #0 -> [5]
    // El trío es común, así que ningún compañero tiene 1º (la muestra no tiene ninguno).
    const teammates = computeTeammates(rows, SELF_PUUID);
    expect(teammates).toEqual([
      {
        puuid: "anon-puuid-013",
        gameName: "Player013",
        tagLine: "ANON",
        games: 10,
        firsts: 0,
        avgPlacement: 3.7,
      },
      {
        puuid: "anon-puuid-046",
        gameName: "Player046",
        tagLine: "ANON",
        games: 5,
        firsts: 0,
        avgPlacement: 4.4,
      },
      {
        puuid: "anon-puuid-115",
        gameName: "Player115",
        tagLine: "ANON",
        games: 2,
        firsts: 0,
        avgPlacement: 3,
      },
      // Empate a 1 partida: desempata el nombre.
      {
        puuid: "anon-puuid-012",
        gameName: "Player012",
        tagLine: "ANON",
        games: 1,
        firsts: 0,
        avgPlacement: 2,
      },
      {
        puuid: "anon-puuid-022",
        gameName: "Player022",
        tagLine: "ANON",
        games: 1,
        firsts: 0,
        avgPlacement: 2,
      },
      {
        puuid: "anon-puuid-152",
        gameName: "Player152",
        tagLine: "ANON",
        games: 1,
        firsts: 0,
        avgPlacement: 5,
      },
    ]);
    expect(teammates.reduce((total, t) => total + t.games, 0)).toBe(20);
    expect(teammates.some((t) => t.puuid === SELF_PUUID)).toBe(false);
  });

  it("funciona igual con solo las filas del trío (3 por partida)", () => {
    const trioOnly = fixtures.flatMap((f) => {
      const subteam = selfRow(f.match).playerSubteamId;
      return allRows(f.match).filter((r) => r.playerSubteamId === subteam);
    });
    expect(trioOnly).toHaveLength(30);
    expect(computeTeammates(trioOnly, SELF_PUUID)).toEqual(
      computeTeammates(rows, SELF_PUUID),
    );
  });

  it("cuenta los 1º compartidos (1º sintético del trío en #5 y #9)", () => {
    // Trío del jugador en 1º en #5 (con 046 y 013) y #9 (con 012 y 013):
    //   013 -> puestos [5,3,3,3,5,1,4,4,2,1] -> 2 1º, media 31/10 = 3,1
    //   046 -> puestos [3,5,1,4,4] -> 1 1º, media 17/5 = 3,4
    //   012 -> puestos [1] -> 1 1º, media 1
    const promoted = fixtures.flatMap((f, index) => {
      const match =
        index === 5 || index === 9
          ? variantOf(f, f.id, (json) => promoteTrioToFirst(json, SELF_PUUID))
              .match
          : f.match;
      return allRows(match);
    });
    const byPuuid = new Map(
      computeTeammates(promoted, SELF_PUUID).map((t) => [t.puuid, t]),
    );
    expect(byPuuid.get("anon-puuid-013")).toMatchObject({
      games: 10,
      firsts: 2,
      avgPlacement: 3.1,
    });
    expect(byPuuid.get("anon-puuid-046")).toMatchObject({
      games: 5,
      firsts: 1,
      avgPlacement: 3.4,
    });
    expect(byPuuid.get("anon-puuid-012")).toMatchObject({
      games: 1,
      firsts: 1,
      avgPlacement: 1,
    });
    // Un compañero de otra partida no se ve afectado.
    expect(byPuuid.get("anon-puuid-115")).toMatchObject({
      firsts: 0,
      avgPlacement: 3,
    });
  });

  it("ignora las partidas donde no aparece el jugador", () => {
    // Sin la fila del jugador en #0 no se sabe su subteam: 152 desaparece y 013 pasa a 9 partidas.
    const withoutSelfInFirst = rows.filter(
      (r) => !(r.matchId === fixtures[0].id && r.puuid === SELF_PUUID),
    );
    const teammates = computeTeammates(withoutSelfInFirst, SELF_PUUID);
    expect(teammates.find((t) => t.puuid === "anon-puuid-152")).toBeUndefined();
    expect(teammates.find((t) => t.puuid === "anon-puuid-013")?.games).toBe(9);
    expect(computeTeammates(rows, "anon-puuid-no-existe")).toEqual([]);
    expect(computeTeammates([], SELF_PUUID)).toEqual([]);
  });

  it("usa el Riot ID de la última fila de cada compañero", () => {
    const row = (
      matchId: string,
      name: string,
      puuid = "mate",
    ): TeammateRow => ({
      matchId,
      puuid,
      riotIdGameName: name,
      riotIdTagline: "EUW",
      placement: 1,
      playerSubteamId: 4,
    });
    const rowsWithRename = [
      row("m1", "Self", SELF_PUUID),
      row("m1", "Antiguo"),
      row("m2", "Self", SELF_PUUID),
      row("m2", "Nuevo"),
    ];
    expect(computeTeammates(rowsWithRename, SELF_PUUID)).toEqual([
      {
        puuid: "mate",
        gameName: "Nuevo",
        tagLine: "EUW",
        games: 2,
        firsts: 2,
        avgPlacement: 1,
      },
    ]);
  });
});

describe("extractChallenge", () => {
  const playerData = PlayerDataDto.parse(readFixtureJson("player-data.json"));

  it("lee 602002 de player-data.json", () => {
    // `player-data.json`: challengeId 602002 -> value 75, level MASTER, achievedTime 1789853414530.
    expect(extractChallenge(playerData, 602002)).toEqual({
      value: 75,
      level: "MASTER",
      achievedTime: 1789853414530,
    });
  });

  it("lee otro challenge del mismo fichero (602001: campeones jugados)", () => {
    expect(extractChallenge(playerData, 602001)).toEqual({
      value: 133,
      level: "PLATINUM",
      achievedTime: 1788387413480,
    });
  });

  it("null si el challenge no aparece", () => {
    expect(extractChallenge(playerData, 999999)).toBeNull();
    expect(extractChallenge({ challenges: [] }, 602002)).toBeNull();
  });

  it("achievedTime null si Riot no lo envía", () => {
    expect(
      extractChallenge(
        { challenges: [{ challengeId: 602002, value: 3, level: "IRON" }] },
        602002,
      ),
    ).toEqual({ value: 3, level: "IRON", achievedTime: null });
  });
});

describe("compareWithChallenge", () => {
  it("match cuando coinciden", () => {
    expect(compareWithChallenge(75, 75)).toEqual({ status: "match", diff: 0 });
    expect(compareWithChallenge(0, 0)).toEqual({ status: "match", diff: 0 });
  });

  it("diff con signo: propio menos challenge", () => {
    expect(compareWithChallenge(74, 75)).toEqual({ status: "diff", diff: -1 });
    expect(compareWithChallenge(77, 75)).toEqual({ status: "diff", diff: 2 });
  });

  it("unknown sin valor del challenge", () => {
    expect(compareWithChallenge(12, null)).toEqual({
      status: "unknown",
      diff: null,
    });
  });
});
