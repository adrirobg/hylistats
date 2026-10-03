import { describe, expect, it } from "vitest";
import {
  computeGroupPeriod,
  type GroupMatchRow,
  TITLE_DEFINITIONS,
} from "@/domain/group-titles";
import {
  GROUP_TEAM_MIN_GAMES,
  GROUP_WEEK_MIN_GAMES,
  RECORD_DAY_MIN_GAMES,
} from "@/lib/config";
import {
  DEFAULT_PERIODO,
  type MemberRef,
  memberMap,
  metricValue,
  metricValueText,
  parsePeriodo,
  periodCaption,
  periodNotice,
  periodoHref,
  rankingModel,
  teamRows,
  titleRows,
  titlesGuide,
} from "./group-view-model";

const at = (iso: string) => Date.parse(iso);
/** Miércoles 2026-09-30, 20:00 en Madrid. */
const DAY_TS = at("2026-09-30T18:00:00Z");
const NOW = at("2026-09-30T22:00:00Z");
/** Jueves 2026-10-01 a las 12:00 en Madrid: el día de juego de `DAY_TS` ya pasó. */
const NEXT_DAY = at("2026-10-01T10:00:00Z");

const member = (key: string, gameName: string): MemberRef => ({
  key,
  gameName,
  tagLine: "EUW",
  slug: `${gameName}-EUW`,
});
const MEMBERS = memberMap([
  member("1", "Ana"),
  member("2", "Beto"),
  member("3", "Cris"),
  member("4", "Dani"),
]);

let seq = 0;
function game(
  placement: number,
  keys: string[],
  damage = 10_000,
  ts = DAY_TS,
): GroupMatchRow[] {
  seq += 1;
  return keys.map((puuid) => ({
    puuid,
    matchId: `EUW1_${seq}`,
    gameStartTimestamp: ts + seq * 60_000,
    gameCreation: ts + seq * 60_000,
    playerSubteamId: 1,
    placement,
    totalDamageDealtToChampions: damage,
  }));
}

describe("parámetro ?periodo", () => {
  it("lee dia y semana; todo lo demás es el día", () => {
    expect(parsePeriodo("semana")).toBe("semana");
    expect(parsePeriodo("dia")).toBe("dia");
    expect(parsePeriodo(undefined)).toBe(DEFAULT_PERIODO);
    expect(parsePeriodo(null)).toBe(DEFAULT_PERIODO);
    expect(parsePeriodo("mes")).toBe(DEFAULT_PERIODO);
    expect(parsePeriodo(["semana", "dia"])).toBe(DEFAULT_PERIODO);
  });

  it("el enlace cambia solo ?periodo y conserva el resto (convive con ?tab)", () => {
    expect(periodoHref("/grupo", "", "semana")).toBe("/grupo?periodo=semana");
    expect(periodoHref("/euw/Ana-EUW", "tab=grupo", "semana")).toBe(
      "/euw/Ana-EUW?tab=grupo&periodo=semana",
    );
    expect(periodoHref("/euw/Ana-EUW", "tab=grupo&periodo=semana", "dia")).toBe(
      "/euw/Ana-EUW?tab=grupo",
    );
    expect(periodoHref("/grupo", "periodo=semana", "dia")).toBe("/grupo");
  });
});

describe("textos del periodo (AC2)", () => {
  it("el periodo actual no lleva aviso y siempre lleva fecha", () => {
    const view = computeGroupPeriod(game(1, ["1"]), NOW, "day");
    expect(periodNotice(view.period)).toBeNull();
    expect(periodCaption(view.period)).toBe(`Día: ${view.period.label}`);
  });

  it("con el día actual vacío avisa del último día jugado con su fecha", () => {
    const view = computeGroupPeriod(game(1, ["1"]), NEXT_DAY, "day");
    expect(view.period.isCurrent).toBe(false);
    expect(periodNotice(view.period)).toBe(
      `Último día jugado: ${view.period.label}`,
    );
    expect(view.period.label).toBe("30 sept");
  });

  it("con la semana actual vacía avisa de la última semana jugada con su rango", () => {
    const later = at("2026-10-07T10:00:00Z");
    const view = computeGroupPeriod(game(1, ["1"]), later, "week");
    expect(periodNotice(view.period)).toBe(
      `Última semana jugada: ${view.period.label}`,
    );
    expect(view.period.label).toBe("28 sept – 4 oct");
  });
});

describe("ranking", () => {
  it("formatea con los formateadores de los títulos y comparte posición en los empates", () => {
    const rows = [
      ...game(2, ["1"], 12_346),
      ...game(2, ["1"], 12_346),
      ...game(2, ["1"], 12_346),
      ...game(2, ["2"]),
      ...game(2, ["2"]),
      ...game(2, ["2"]),
      ...game(5, ["3"]),
      ...game(5, ["3"]),
      ...game(5, ["3"]),
    ];
    const model = rankingModel(
      computeGroupPeriod(rows, NOW, "day").ranking,
      MEMBERS,
    );
    expect(model.empty).toBe(false);
    expect(model.rows.map((r) => [r.key, r.position])).toEqual([
      ["1", 1],
      ["2", 1],
      ["3", 3],
    ]);
    expect(model.rows[0]).toMatchObject({
      member: { gameName: "Ana" },
      games: 3,
      firsts: 0,
      avgPlacement: "2,00",
      avgDamage: "12.346",
    });
  });

  it("separa «sin mínimo» y señala el periodo sin partidas", () => {
    const rows = [
      ...game(1, ["1"]),
      ...game(1, ["1"]),
      ...game(1, ["1"]),
      ...game(3, ["2"]),
    ];
    const model = rankingModel(
      computeGroupPeriod(rows, NOW, "day").ranking,
      MEMBERS,
    );
    expect(model.rows.map((r) => r.key)).toEqual(["1"]);
    expect(model.belowMinimum).toEqual([
      { key: "2", member: MEMBERS.get("2"), games: 1, gamesText: "1 partida" },
    ]);
    const empty = rankingModel(
      computeGroupPeriod([], NOW, "day").ranking,
      MEMBERS,
    );
    expect(empty.empty).toBe(true);
  });

  it("el mínimo del ranking es el del periodo (constantes de config)", () => {
    const day = computeGroupPeriod(game(1, ["1"]), NOW, "day");
    const week = computeGroupPeriod(game(1, ["1"]), NOW, "week");
    expect(RECORD_DAY_MIN_GAMES).toBeGreaterThan(1);
    expect(rankingModel(day.ranking, MEMBERS).belowMinimum).toHaveLength(1);
    expect(rankingModel(week.ranking, MEMBERS).belowMinimum).toHaveLength(1);
  });
});

describe("títulos del periodo y valores (AC5)", () => {
  // Ana: 3 partidas, puesto medio 5, daño 5.000. Beto: 3 partidas, puesto medio 2, daño 20.000.
  const rows = [
    ...game(5, ["1"], 5_000),
    ...game(5, ["1"], 5_000),
    ...game(5, ["1"], 5_000),
    ...game(2, ["2"], 20_000),
    ...game(2, ["2"], 20_000),
    ...game(2, ["2"], 20_000),
  ];
  const period = computeGroupPeriod(rows, NOW, "day");

  it("cada poseedor lleva nombres de miembro, el valor y la explicación del dominio", () => {
    const titles = titleRows(period.titles, MEMBERS);
    const troll = titles.find((t) => t.id === "troll");
    expect(troll?.name).toBe("El trol del día");
    expect(troll?.holders).toHaveLength(1);
    expect(troll?.holders[0].members.map((m) => m?.gameName)).toEqual(["Ana"]);
    expect(troll?.holders[0].value).toBe("5,00");
    expect(troll?.holders[0].why).toBe(
      period.titles.find((t) => t.id === "troll")?.holders[0].why,
    );
  });

  it("el valor de un título individual coincide con su fila del ranking", () => {
    const ranking = rankingModel(period.ranking, MEMBERS);
    const titles = titleRows(period.titles, MEMBERS);
    const byKey = (key: string) => ranking.rows.find((r) => r.key === key);
    const holderKey = (id: string) =>
      titles.find((t) => t.id === id)?.holders[0].members[0]?.key ?? "";
    const value = (id: string) => titles.find((t) => t.id === id)?.holders[0];
    expect(value("troll")?.value).toBe(byKey(holderKey("troll"))?.avgPlacement);
    expect(value("pacifist")?.value).toBe(
      byKey(holderKey("pacifist"))?.avgDamage,
    );
    expect(value("devil")?.value).toBe(byKey(holderKey("devil"))?.avgDamage);
    expect(value("devil")?.why).toContain(value("devil")?.value);
    expect(value("troll")?.why).toContain(value("troll")?.value);
  });

  it("un empate lleva un poseedor por cada empatado", () => {
    const tied = computeGroupPeriod(
      [
        ...game(4, ["1"]),
        ...game(4, ["1"]),
        ...game(4, ["1"]),
        ...game(4, ["2"]),
        ...game(4, ["2"]),
        ...game(4, ["2"]),
      ],
      NOW,
      "day",
    );
    const troll = titleRows(tied.titles, MEMBERS).find((t) => t.id === "troll");
    expect(troll?.holders.map((h) => h.members[0]?.gameName)).toEqual([
      "Ana",
      "Beto",
    ]);
  });

  it("el valor de un título de equipo coincide con su fila de dúos y tríos del periodo", () => {
    // Dos tríos (1+2+3 gana siempre, 1+2+4 queda 6º) para que haya competencia.
    const rows = Array.from({ length: GROUP_TEAM_MIN_GAMES }, () => [
      ...game(1, ["1", "2", "3"]),
      ...game(6, ["1", "2", "4"]),
    ]).flat();
    const view = computeGroupPeriod(rows, NOW, "day");
    const titles = titleRows(view.titles, MEMBERS);
    const teams = teamRows(view.teams, MEMBERS);
    const rowOf = (...keys: string[]) =>
      teams.find(
        (r) => r.members.map((m) => m?.key).join(",") === keys.join(","),
      );

    const broken = titles.find((t) => t.id === "brokenTrio")?.holders[0];
    expect(broken?.members.map((m) => m?.gameName)).toEqual([
      "Ana",
      "Beto",
      "Cris",
    ]);
    expect(broken?.value).toBe(String(rowOf("1", "2", "3")?.firsts));

    const boom = titles.find((t) => t.id === "boomTrio")?.holders[0];
    expect(boom?.members.map((m) => m?.key)).toEqual(["1", "2", "4"]);
    expect(boom?.value).toBe(rowOf("1", "2", "4")?.avgPlacement);

    // Un dúo que forma parte de un trío tiene su propia fila (y su título).
    const boomDuo = titles.find((t) => t.id === "boomDuo")?.holders[0];
    expect(boomDuo?.value).toBe(
      rowOf(...(boomDuo?.members.map((m) => m?.key ?? "") ?? []))?.avgPlacement,
    );
  });

  it("metricValue formatea cada métrica", () => {
    expect(metricValue("avgPlacement", 4.6)).toBe("4,60");
    expect(metricValue("avgDamage", 12_345.6)).toBe("12.346");
    expect(metricValue("firsts", 3)).toBe("3");
    expect(metricValueText("firsts", 1)).toBe("1 primero");
    expect(metricValueText("firsts", 3)).toBe("3 primeros");
    expect(metricValueText("avgPlacement", 4.6)).toBe("4,60");
  });
});

describe("dúos y tríos del periodo", () => {
  it("solo con el mínimo de partidas juntos, por partidas y con los tríos antes", () => {
    const rows = [
      ...Array.from({ length: GROUP_TEAM_MIN_GAMES }, () =>
        game(3, ["1", "2", "3"]),
      ).flat(),
      ...Array.from({ length: GROUP_TEAM_MIN_GAMES + 1 }, () =>
        game(2, ["1", "2"]),
      ).flat(),
    ];
    const view = computeGroupPeriod(rows, NOW, "day");
    const result = teamRows(view.teams, MEMBERS);
    expect(result.every((r) => r.games >= GROUP_TEAM_MIN_GAMES)).toBe(true);
    // El dúo 1+2 suma las partidas del trío y las suyas; es el que más partidas tiene.
    expect(result[0]).toMatchObject({
      kind: "duo",
      games: 2 * GROUP_TEAM_MIN_GAMES + 1,
    });
    expect(result.some((r) => r.kind === "trio")).toBe(true);
  });

  it("sin equipos con el mínimo no hay filas", () => {
    const view = computeGroupPeriod(game(1, ["1", "2"]), NOW, "day");
    expect(teamRows(view.teams, MEMBERS)).toEqual([]);
  });
});

describe("apartado Títulos", () => {
  const guide = titlesGuide();

  it("lista los 7 títulos con métrica, periodos con su nombre y mínimo", () => {
    expect(guide.titles).toHaveLength(7);
    expect(guide.titles.map((t) => t.id)).toEqual(
      TITLE_DEFINITIONS.map((d) => d.id),
    );
    const troll = guide.titles.find((t) => t.id === "troll");
    expect(troll).toMatchObject({
      name: "El trol",
      measures: "Peor puesto medio.",
      periods: ["El trol del día", "El trol de la semana"],
    });
  });

  it("los mínimos salen de las constantes de config", () => {
    const text = (id: string) =>
      guide.titles.find((t) => t.id === id)?.minimum ?? "";
    expect(text("troll")).toContain(
      `${RECORD_DAY_MIN_GAMES} partidas en el día`,
    );
    expect(text("troll")).toContain(`${GROUP_WEEK_MIN_GAMES} en la semana`);
    expect(text("brokenDuo")).toContain(
      `${GROUP_TEAM_MIN_GAMES} partidas juntos`,
    );
  });

  it("incluye las reglas comunes: competencia, desempate, empates y cortes", () => {
    const joined = guide.rules.join(" ");
    expect(joined).toMatch(/al menos 2 clasificados/);
    expect(joined).toMatch(/más partidas/);
    expect(joined).toMatch(/empatados comparten el título/i);
    expect(joined).toMatch(/06:00/);
    expect(joined).toMatch(/lunes/);
  });
});
