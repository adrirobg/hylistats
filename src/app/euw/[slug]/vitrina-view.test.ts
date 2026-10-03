import { describe, expect, it } from "vitest";
import { type EloStanding, eloLeague, type GroupElo } from "@/domain/elo";
import {
  type AwardedTitle,
  type PeriodKind,
  type PlayerTitle,
  TITLE_DEFINITIONS,
  type TitleHolder,
  type TitleId,
  titleName,
  titlesOf,
} from "@/domain/group-titles";
import type { GroupViewMember } from "@/domain/group-view";
import type { VerifiedChampion } from "@/domain/stats";
import type { Champion, ChampionCatalog } from "@/lib/ddragon";
import {
  aboveText,
  deltaText,
  deltaTone,
  type EloFacts,
  eloFacts,
  ladderRows,
  nextLeagueText,
  profileVitrina,
  splashChampion,
  TITLES_LINK,
  titleCounts,
  titleLineText,
  titleRows,
  titlesMinimumText,
} from "./vitrina-view";

// --- Fixtures ---------------------------------------------------------------------------------

const member = (key: string, gameName: string): GroupViewMember => ({
  profileId: 0,
  key,
  gameName,
  tagLine: "EUW",
  slug: gameName.toLowerCase(),
  profileIconUrl: null,
  lastSyncedAt: null,
  official: null,
  resolved: true,
});

const MEMBERS = [
  member("a", "Hylimichi"),
  member("b", "Azpekaa"),
  member("c", "zapas14"),
  member("d", "Krill1nt"),
];

const holder = (puuids: string[], why: string): TitleHolder => ({
  puuids,
  value: 0,
  games: 4,
  firsts: 0,
  avgPlacement: 3,
  avgDamage: null,
  why,
});

const SUBJECT = {
  troll: "player",
  pacifist: "player",
  devil: "player",
  brokenTrio: "trio",
  boomTrio: "trio",
  brokenDuo: "duo",
  boomDuo: "duo",
} as const;

function award(
  id: TitleId,
  kind: PeriodKind,
  holders: TitleHolder[],
): AwardedTitle {
  const def = TITLE_DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(id);
  return {
    id,
    kind,
    subject: SUBJECT[id],
    metric: def.metric,
    name: titleName(id, kind),
    holders,
  };
}

const owned = (titles: AwardedTitle[], key = "a"): PlayerTitle[] =>
  titlesOf(titles, key);

// --- titleRows --------------------------------------------------------------------------------

describe("titleRows", () => {
  it("sin títulos: ninguna fila", () => {
    expect(titleRows([], "a", MEMBERS)).toEqual([]);
  });

  it("título solo de día: semana vacía", () => {
    const rows = titleRows(
      owned([award("troll", "day", [holder(["a"], "Hoy peor")])]),
      "a",
      MEMBERS,
    );
    expect(rows).toEqual([
      {
        id: "troll",
        name: "El trol",
        tone: "shame",
        day: [{ why: "Hoy peor", partners: [] }],
        week: [],
      },
    ]);
  });

  it("título solo de semana: día vacío", () => {
    const [row] = titleRows(
      owned([award("devil", "week", [holder(["a"], "Semana daño")])]),
      "a",
      MEMBERS,
    );
    expect(row.day).toEqual([]);
    expect(row.week).toEqual([{ why: "Semana daño", partners: [] }]);
    expect(row.tone).toBe("honor");
  });

  it("título de día y semana: una sola fila con ambos periodos", () => {
    const rows = titleRows(
      owned([
        award("troll", "day", [holder(["a"], "d")]),
        award("troll", "week", [holder(["a"], "s")]),
      ]),
      "a",
      MEMBERS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].day[0].why).toBe("d");
    expect(rows[0].week[0].why).toBe("s");
  });

  it("dúo y trío: compañeros sin el dueño, en el orden de members", () => {
    const rows = titleRows(
      owned([
        award("brokenDuo", "day", [holder(["a", "c"], "duo")]),
        // Los puuids llegan ordenados por clave; los compañeros salen en el orden de members.
        award("boomTrio", "week", [holder(["a", "b", "d"], "trio")]),
      ]),
      "a",
      MEMBERS,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.brokenDuo.day[0].partners).toEqual(["zapas14"]);
    expect(byId.boomTrio.week[0].partners).toEqual(["Azpekaa", "Krill1nt"]);
  });

  it("dueño que no es el primero de la lista: se excluye igual", () => {
    const [row] = titleRows(
      owned([award("brokenDuo", "day", [holder(["a", "b"], "duo")])], "b"),
      "b",
      MEMBERS,
    );
    expect(row.day[0].partners).toEqual(["Hylimichi"]);
  });

  it("empate con dos dúos del dueño: una fila, una línea por poseedor", () => {
    const rows = titleRows(
      owned([
        award("boomDuo", "day", [
          holder(["a", "b"], "con b"),
          holder(["a", "c"], "con c"),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toEqual([
      { why: "con b", partners: ["Azpekaa"] },
      { why: "con c", partners: ["zapas14"] },
    ]);
    expect(rows[0].week).toEqual([]);
  });

  it("sigue el orden de TITLE_DEFINITIONS, no el de entrada", () => {
    const rows = titleRows(
      owned([
        award("boomDuo", "day", [holder(["a", "b"], "x")]),
        award("devil", "day", [holder(["a"], "x")]),
        award("troll", "week", [holder(["a"], "x")]),
        award("brokenTrio", "day", [holder(["a", "b", "c"], "x")]),
      ]),
      "a",
      MEMBERS,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "troll",
      "devil",
      "brokenTrio",
      "boomDuo",
    ]);
    const order = TITLE_DEFINITIONS.map((d) => d.id);
    const idx = rows.map((r) => order.indexOf(r.id));
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
  });

  it("tonos: honor en devil y equipos rotos; vergüenza en el resto", () => {
    const all = TITLE_DEFINITIONS.flatMap((d) =>
      (["day"] as const).map((kind) =>
        award(d.id, kind, [holder(["a", "b", "c"], "x")]),
      ),
    );
    const tones = Object.fromEntries(
      titleRows(owned(all), "a", MEMBERS).map((r) => [r.id, r.tone]),
    );
    expect(tones).toEqual({
      troll: "shame",
      pacifist: "shame",
      devil: "honor",
      brokenTrio: "honor",
      boomTrio: "shame",
      brokenDuo: "honor",
      boomDuo: "shame",
    });
  });

  it("Hylimichi 2026-10-03: 4 títulos × día y semana -> 4 filas (2 honor, 2 vergüenza)", () => {
    const trio = ["a", "b", "c"];
    const duo = ["a", "b"];
    const titles = [
      award("brokenTrio", "day", [
        holder(
          trio,
          "Más 1º juntos del día: 0 en 4 partidas (puesto medio 3,00)",
        ),
      ]),
      award("brokenTrio", "week", [
        holder(
          trio,
          "Más 1º juntos de la semana: 2 en 17 partidas (puesto medio 3,59)",
        ),
      ]),
      award("boomTrio", "day", [
        holder(trio, "Peor puesto medio juntos del día: 4,25 en 4 partidas"),
      ]),
      award("boomTrio", "week", [
        holder(
          trio,
          "Peor puesto medio juntos de la semana: 4,54 en 13 partidas",
        ),
      ]),
      award("brokenDuo", "day", [
        holder(
          duo,
          "Más 1º juntos del día: 2 en 6 partidas (puesto medio 2,33)",
        ),
      ]),
      award("brokenDuo", "week", [
        holder(
          duo,
          "Más 1º juntos de la semana: 5 en 27 partidas (puesto medio 3,41)",
        ),
      ]),
      award("boomDuo", "day", [
        holder(duo, "Peor puesto medio juntos del día: 4,25 en 4 partidas"),
      ]),
      award("boomDuo", "week", [
        holder(
          duo,
          "Peor puesto medio juntos de la semana: 4,06 en 18 partidas",
        ),
      ]),
    ];
    const rows = titleRows(owned(titles), "a", MEMBERS);
    expect(rows.map((r) => r.name)).toEqual([
      "Equipo roto",
      "Equipo mental boom",
      "Pareja rota",
      "Pareja mental boom",
    ]);
    expect(rows.every((r) => r.day.length === 1 && r.week.length === 1)).toBe(
      true,
    );
    expect(rows[0].day[0].partners).toEqual(["Azpekaa", "zapas14"]);
    expect(rows[2].week[0].partners).toEqual(["Azpekaa"]);
    expect(titleCounts(rows)).toEqual({ honor: 2, shame: 2 });
  });
});

describe("titleCounts", () => {
  it("sin filas: ceros", () => {
    expect(titleCounts([])).toEqual({ honor: 0, shame: 0 });
  });
});

describe("TITLES_LINK", () => {
  it("lleva al apartado Títulos de la pestaña Grupo del mismo perfil", () => {
    expect(TITLES_LINK.href).toBe("?tab=grupo#titulos");
    expect(TITLES_LINK.label).toBeTruthy();
  });
});

// --- Escalera y trofeo de Liga ----------------------------------------------------------------

const standing = (
  key: string,
  position: number,
  roundedRating: number,
  extra: Partial<EloStanding> = {},
): EloStanding => ({
  key,
  position,
  rating: roundedRating,
  roundedRating,
  games: 20,
  provisional: false,
  league: eloLeague(roundedRating),
  history: [],
  dayChange: null,
  weekChange: null,
  ...extra,
});

const elo = (standings: EloStanding[]): GroupElo => ({
  standings,
  day: { kind: "day", key: "d", label: "d" } as GroupElo["day"],
  week: { kind: "week", key: "w", label: "w" } as GroupElo["week"],
});

describe("ladderRows", () => {
  const standings = [
    standing("d", 1, 1578, { dayChange: 52 }),
    standing("b", 2, 1517, { dayChange: 64 }),
    standing("c", 2, 1517, { dayChange: -15 }),
    standing("a", 4, 1492, { dayChange: null, provisional: true }),
  ];

  it("todos en su orden, con posiciones compartidas y la fila propia", () => {
    const rows = ladderRows(elo(standings), MEMBERS, "a");
    expect(rows.map((r) => [r.name, r.position, r.me])).toEqual([
      ["Krill1nt", 1, false],
      ["Azpekaa", 2, false],
      ["zapas14", 2, false],
      ["Hylimichi", 4, true],
    ]);
    expect(rows[0]).toEqual({
      position: 1,
      name: "Krill1nt",
      slug: "krill1nt",
      leagueId: "diamante",
      rating: 1578,
      dayChange: 52,
      provisional: false,
      me: false,
    });
    expect(rows[3].dayChange).toBeNull();
    expect(rows[3].provisional).toBe(true);
    expect(rows[3].leagueId).toBe("plata");
  });
});

describe("eloFacts", () => {
  it("posición, total, distancia al de arriba y siguiente liga", () => {
    const standings = [
      standing("d", 1, 1578),
      standing("b", 2, 1517),
      standing("a", 3, 1492),
      standing("c", 4, 1489),
    ];
    expect(eloFacts(standings, MEMBERS, "a")).toEqual({
      position: 3,
      total: 4,
      above: { name: "Azpekaa", diff: 25 },
      leadBy: null,
      nextLeague: { name: "Oro", diff: 18 },
    });
  });

  it("empate en el de arriba: el primero en standings", () => {
    const standings = [
      standing("b", 1, 1517),
      standing("c", 1, 1517),
      standing("a", 3, 1492),
    ];
    expect(eloFacts(standings, MEMBERS, "a")?.above).toEqual({
      name: "Azpekaa",
      diff: 25,
    });
  });

  it("con otros más arriba, `above` es el más cercano estrictamente mayor", () => {
    const standings = [
      standing("d", 1, 1600),
      standing("b", 2, 1500),
      standing("a", 3, 1490),
      standing("c", 3, 1490),
    ];
    expect(eloFacts(standings, MEMBERS, "a")?.above).toEqual({
      name: "Azpekaa",
      diff: 10,
    });
    // El empatado con él no cuenta como "por encima".
    expect(eloFacts(standings, MEMBERS, "c")?.above?.name).toBe("Azpekaa");
  });

  it("líder: leadBy sobre el siguiente y above null", () => {
    const standings = [
      standing("d", 1, 1578),
      standing("b", 2, 1570),
      standing("a", 3, 1492),
    ];
    const facts = eloFacts(standings, MEMBERS, "d");
    expect(facts?.above).toBeNull();
    expect(facts?.leadBy).toBe(8);
    expect(facts?.position).toBe(1);
  });

  it("líder empatado en cabeza: leadBy 0", () => {
    const standings = [standing("d", 1, 1500), standing("b", 1, 1500)];
    const facts = eloFacts(standings, MEMBERS, "d");
    expect(facts?.above).toBeNull();
    expect(facts?.leadBy).toBe(0);
  });

  it("miembro único: sin above ni leadBy", () => {
    const facts = eloFacts([standing("a", 1, 1500)], MEMBERS, "a");
    expect(facts).toMatchObject({
      position: 1,
      total: 1,
      above: null,
      leadBy: null,
    });
  });

  it("no miembro: null", () => {
    expect(eloFacts([standing("a", 1, 1500)], MEMBERS, "zzz")).toBeNull();
  });

  it("siguiente liga en cada tramo", () => {
    const next = (rating: number) =>
      eloFacts([standing("a", 1, rating)], MEMBERS, "a")?.nextLeague;
    expect(next(1400)).toEqual({ name: "Bronce", diff: 50 });
    expect(next(1449)).toEqual({ name: "Bronce", diff: 1 });
    expect(next(1450)).toEqual({ name: "Plata", diff: 30 });
    expect(next(1492)).toEqual({ name: "Oro", diff: 18 });
    expect(next(1510)).toEqual({ name: "Platino", diff: 30 });
    expect(next(1569)).toEqual({ name: "Diamante", diff: 1 });
  });

  it("Diamante: sin siguiente liga", () => {
    expect(
      eloFacts([standing("a", 1, 1570)], MEMBERS, "a")?.nextLeague,
    ).toBeNull();
    expect(
      eloFacts([standing("a", 1, 1700)], MEMBERS, "a")?.nextLeague,
    ).toBeNull();
  });
});

describe("deltaText", () => {
  it("signo + , menos tipográfico (U+2212) y 0", () => {
    expect(deltaText(12)).toBe("+12");
    expect(deltaText(-7)).toBe("−7");
    expect(deltaText(0)).toBe("0");
  });

  it("redondea como la Clasificación", () => {
    expect(deltaText(14.5)).toBe("+15");
    expect(deltaText(-14.5)).toBe("−15");
    expect(deltaText(0.2)).toBe("0");
  });
});

// --- Splash -----------------------------------------------------------------------------------

const verified = (championId: number, lastWinAt: number): VerifiedChampion => ({
  championId,
  championName: `c${championId}`,
  firsts: 1,
  firstWinMatchId: "m",
  firstWinAt: lastWinAt,
  lastWinMatchId: "m",
  lastWinAt,
});

const champ = (championId: number, ddId: string, name: string): Champion => ({
  championId,
  ddId,
  name,
  portraitUrl: null,
});

const CATALOG: ChampionCatalog = {
  version: "16.19.1",
  champions: [
    champ(56, "Nocturne", "Nocturne"),
    champ(9, "FiddleSticks", "Fiddlesticks"),
    champ(11, "MasterYi", "Maestro Yi"),
  ],
};

describe("splashChampion", () => {
  it("sin verificados: null", () => {
    expect(splashChampion([], CATALOG)).toBeNull();
  });

  it("con varios: el de mayor lastWinAt, con su splash sin versión", () => {
    expect(
      splashChampion(
        [verified(9, 100), verified(56, 300), verified(11, 200)],
        CATALOG,
      ),
    ).toEqual({
      name: "Nocturne",
      splashUrl:
        "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Nocturne_0.jpg",
    });
  });

  it("usa el ddId del catálogo y el nombre de visualización", () => {
    expect(splashChampion([verified(11, 5)], CATALOG)).toEqual({
      name: "Maestro Yi",
      splashUrl:
        "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MasterYi_0.jpg",
    });
  });

  it("empate en lastWinAt: el championId mayor, sea cual sea el orden", () => {
    const a = [verified(9, 100), verified(56, 100)];
    expect(splashChampion(a, CATALOG)?.name).toBe("Nocturne");
    expect(splashChampion([...a].reverse(), CATALOG)?.name).toBe("Nocturne");
  });

  it("el más reciente fuera del catálogo: null (no se cae al siguiente)", () => {
    expect(
      splashChampion([verified(9, 100), verified(999, 500)], CATALOG),
    ).toBeNull();
  });

  it("catálogo vacío: null", () => {
    expect(
      splashChampion([verified(56, 1)], { version: null, champions: [] }),
    ).toBeNull();
  });
});

// --- Textos de la vitrina ---------------------------------------------------------------------

describe("titleLineText", () => {
  it("individual: el «por qué» tal cual (ya trae el periodo)", () => {
    expect(
      titleLineText({
        why: "Peor puesto medio del día: 3,20 en 4 partidas",
        partners: [],
      }),
    ).toBe("Peor puesto medio del día: 3,20 en 4 partidas");
  });

  it("dúo y trío: «con X» y «con X y Y»", () => {
    expect(titleLineText({ why: "x", partners: ["Azpekaa"] })).toBe(
      "x · con Azpekaa",
    );
    expect(titleLineText({ why: "x", partners: ["Azpekaa", "zapas14"] })).toBe(
      "x · con Azpekaa y zapas14",
    );
  });
});

describe("titlesMinimumText", () => {
  it("los mínimos individuales y de equipo del dominio", () => {
    const player = TITLE_DEFINITIONS.find((d) => d.id === "troll");
    const team = TITLE_DEFINITIONS.find((d) => d.id === "boomDuo");
    expect(titlesMinimumText()).toBe(
      `Los individuales piden ${player?.minimumText}; los de dúo y trío, ${team?.minimumText}.`,
    );
  });
});

describe("deltaTone", () => {
  it("según el valor redondeado", () => {
    expect(deltaTone(12)).toBe("up");
    expect(deltaTone(-7)).toBe("down");
    expect(deltaTone(0)).toBe("zero");
    expect(deltaTone(0.4)).toBe("zero");
    expect(deltaTone(-0.4)).toBe("zero");
    expect(deltaTone(-0.5)).toBe("down");
  });
});

describe("aboveText y nextLeagueText", () => {
  const facts = (extra: Partial<EloFacts>): EloFacts => ({
    position: 1,
    total: 4,
    above: null,
    leadBy: null,
    nextLeague: null,
    ...extra,
  });

  it("con alguien encima: la distancia y su nombre", () => {
    expect(aboveText(facts({ above: { name: "Azpekaa", diff: 3 } }))).toBe(
      "a 3 de Azpekaa",
    );
  });

  it("líder: la ventaja; empatado: «empatado en cabeza»; único: nada", () => {
    expect(aboveText(facts({ leadBy: 12 }))).toBe("líder por 12");
    expect(aboveText(facts({ leadBy: 0 }))).toBe("empatado en cabeza");
    expect(aboveText(facts({}))).toBeNull();
  });

  it("siguiente liga; en Diamante, nada", () => {
    expect(
      nextLeagueText(facts({ nextLeague: { name: "Oro", diff: 18 } })),
    ).toBe("a 18 de Oro");
    expect(nextLeagueText(facts({}))).toBeNull();
  });
});

describe("profileVitrina", () => {
  const view = {
    elo: elo([standing("b", 1, 1517), standing("a", 2, 1492)]),
    members: MEMBERS,
  };

  it("no miembro (sin vista): solo el splash", () => {
    expect(
      profileVitrina({
        verified: [verified(56, 1)],
        catalog: CATALOG,
        titles: [],
        view: null,
        ownerKey: "a",
      }),
    ).toEqual({
      splash: splashChampion([verified(56, 1)], CATALOG),
      group: null,
    });
  });

  it("miembro: títulos, escalera y distancias de las funciones de la vitrina", () => {
    const titles = owned([award("troll", "day", [holder(["a"], "Hoy peor")])]);
    const vitrina = profileVitrina({
      verified: [],
      catalog: CATALOG,
      titles,
      view,
      ownerKey: "a",
    });
    expect(vitrina).toEqual({
      splash: null,
      group: {
        titles: titleRows(titles, "a", MEMBERS),
        ladder: ladderRows(view.elo, MEMBERS, "a"),
        facts: eloFacts(view.elo.standings, MEMBERS, "a"),
      },
    });
  });

  it("miembro sin fila en la Clasificación: sin bloque del grupo", () => {
    expect(
      profileVitrina({
        verified: [],
        catalog: CATALOG,
        titles: [],
        view,
        ownerKey: "zzz",
      }).group,
    ).toBeNull();
  });
});
