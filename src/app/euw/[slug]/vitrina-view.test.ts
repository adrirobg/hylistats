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
import type { GroupToday, MemberToday } from "@/domain/group-today";
import type { GroupViewMember } from "@/domain/group-view";
import type { VerifiedChampion } from "@/domain/stats";
import type { Champion, ChampionCatalog } from "@/lib/ddragon";
import {
  aboveText,
  deltaText,
  deltaTone,
  type EloFacts,
  eloFacts,
  type GroupTodayRow,
  groupTodayRows,
  newThisWeek,
  nextLeagueText,
  profileVitrina,
  recentConquests,
  splashChampion,
  TITLES_LINK,
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
  profileIconUrl: `https://icons.test/${gameName}.png`,
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

const holder = (
  puuids: string[],
  why: string,
  extra: Partial<TitleHolder> = {},
): TitleHolder => ({
  puuids,
  value: 0,
  games: 4,
  firsts: 0,
  avgPlacement: 3,
  avgDamage: null,
  why,
  ...extra,
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
  const icon = (name: string) => `https://icons.test/${name}.png`;

  it("sin títulos: ninguna fila", () => {
    expect(titleRows([], "a", MEMBERS)).toEqual([]);
  });

  it("individual: sin chips, un periodo", () => {
    const rows = titleRows(
      owned([
        award("troll", "day", [
          holder(["a"], "Hoy peor", {
            value: 4.7,
            games: 10,
            avgPlacement: 4.7,
          }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(rows).toEqual([
      {
        id: "troll",
        name: "El trol",
        tone: "shame",
        metric: "peor puesto medio",
        lines: [
          {
            mates: [],
            periods: [
              { kind: "day", text: "media 4,70 en 10", why: "Hoy peor" },
            ],
          },
        ],
      },
    ]);
  });

  it("título solo de semana: un solo periodo, el de la semana", () => {
    const [row] = titleRows(
      owned([
        award("devil", "week", [
          holder(["a"], "Semana daño", {
            value: 12345.6,
            avgDamage: 12345.6,
            games: 5,
          }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(row.tone).toBe("honor");
    expect(row.metric).toBe("más daño medio");
    expect(row.lines).toEqual([
      {
        mates: [],
        periods: [
          { kind: "week", text: "12.346 de daño en 5", why: "Semana daño" },
        ],
      },
    ]);
  });

  it("menos daño medio: usa el daño del poseedor", () => {
    const [row] = titleRows(
      owned([
        award("pacifist", "day", [
          holder(["a"], "x", { value: 800, avgDamage: 800, games: 1_200 }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(row.metric).toBe("menos daño medio");
    expect(row.lines[0].periods[0].text).toBe("800 de daño en 1.200");
  });

  it("el mismo dúo hoy y en la semana: una línea con dos periodos, día primero", () => {
    const rows = titleRows(
      owned([
        // La semana llega antes que el día: la línea sale igual con el día primero.
        award("brokenDuo", "week", [
          holder(["a", "b"], "sem", {
            firsts: 5,
            games: 27,
            avgPlacement: 3.41,
          }),
        ]),
        award("brokenDuo", "day", [
          holder(["a", "b"], "dia", {
            firsts: 2,
            games: 6,
            avgPlacement: 2.33,
          }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe("más 1º juntos");
    expect(rows[0].lines).toEqual([
      {
        mates: [{ name: "Azpekaa", slug: "azpekaa", iconUrl: icon("Azpekaa") }],
        periods: [
          { kind: "day", text: "2 primeros en 6 · 2,33", why: "dia" },
          { kind: "week", text: "5 primeros en 27 · 3,41", why: "sem" },
        ],
      },
    ]);
  });

  it("singular: «1 primero»", () => {
    const [row] = titleRows(
      owned([
        award("brokenDuo", "day", [
          holder(["a", "b"], "x", { firsts: 1, games: 4, avgPlacement: 3 }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(row.lines[0].periods[0].text).toBe("1 primero en 4 · 3,00");
  });

  it("empate con dos dúos del dueño: dos líneas, una por compañero", () => {
    const [row] = titleRows(
      owned([
        award("boomDuo", "day", [
          holder(["a", "b"], "con b", { value: 3.33, games: 6 }),
          holder(["a", "c"], "con c", { value: 3.33, games: 6 }),
        ]),
        award("boomDuo", "week", [
          holder(["a", "b"], "sem b", { value: 4.07, games: 15 }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(row.metric).toBe("peor puesto medio juntos");
    expect(
      row.lines.map((l) => [
        l.mates.map((m) => m.name),
        l.periods.map((p) => [p.kind, p.text]),
      ]),
    ).toEqual([
      [
        ["Azpekaa"],
        [
          ["day", "media 3,33 en 6"],
          ["week", "media 4,07 en 15"],
        ],
      ],
      [["zapas14"], [["day", "media 3,33 en 6"]]],
    ]);
  });

  it("trío: dos chips sin el dueño, en el orden de members", () => {
    const [row] = titleRows(
      owned([
        // Los puuids llegan ordenados por clave; los compañeros salen en el orden de members.
        award("boomTrio", "week", [
          holder(["a", "b", "d"], "trio", { value: 4.54, games: 13 }),
        ]),
      ]),
      "a",
      MEMBERS,
    );
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0].mates.map((m) => m.name)).toEqual([
      "Azpekaa",
      "Krill1nt",
    ]);
    expect(row.lines[0].periods).toEqual([
      { kind: "week", text: "media 4,54 en 13", why: "trio" },
    ]);
  });

  it("dueño que no es el primero de la lista: se excluye igual", () => {
    const [row] = titleRows(
      owned([award("brokenDuo", "day", [holder(["a", "b"], "duo")])], "b"),
      "b",
      MEMBERS,
    );
    expect(row.lines[0].mates.map((m) => m.name)).toEqual(["Hylimichi"]);
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

  it("Hylimichi (maqueta v4): cuatro títulos agrupados por compañero", () => {
    const members = [
      member("a", "Hylimichi"),
      member("b", "Azpekaa"),
      member("c", "zapas14"),
      member("e", "TheCIutch"),
      member("f", "BEJITO MAMBO"),
    ];
    const titles = [
      award("brokenTrio", "week", [
        holder(["a", "c", "e"], "w", {
          firsts: 2,
          games: 17,
          avgPlacement: 3.59,
        }),
      ]),
      award("boomTrio", "week", [
        holder(["a", "b", "f"], "w", { value: 4.7, games: 10 }),
      ]),
      award("brokenDuo", "day", [
        holder(["a", "e"], "d", { firsts: 2, games: 6, avgPlacement: 2.33 }),
      ]),
      award("brokenDuo", "week", [
        holder(["a", "e"], "w", { firsts: 5, games: 27, avgPlacement: 3.41 }),
      ]),
      award("boomDuo", "day", [
        holder(["a", "c"], "d", { value: 3.33, games: 6 }),
        holder(["a", "f"], "d", { value: 3.33, games: 6 }),
      ]),
      award("boomDuo", "week", [
        holder(["a", "b"], "w", { value: 4.07, games: 15 }),
      ]),
    ];
    const rows = titleRows(owned(titles), "a", members).map((r) => ({
      name: r.name,
      metric: r.metric,
      lines: r.lines.map((l) => ({
        who: l.mates.map((m) => m.name),
        per: l.periods.map((p) => `${p.kind} ${p.text}`),
      })),
    }));
    expect(rows).toEqual([
      {
        name: "Equipo roto",
        metric: "más 1º juntos",
        lines: [
          {
            who: ["zapas14", "TheCIutch"],
            per: ["week 2 primeros en 17 · 3,59"],
          },
        ],
      },
      {
        name: "Equipo mental boom",
        metric: "peor puesto medio juntos",
        lines: [
          { who: ["Azpekaa", "BEJITO MAMBO"], per: ["week media 4,70 en 10"] },
        ],
      },
      {
        name: "Pareja rota",
        metric: "más 1º juntos",
        lines: [
          {
            who: ["TheCIutch"],
            per: ["day 2 primeros en 6 · 2,33", "week 5 primeros en 27 · 3,41"],
          },
        ],
      },
      {
        name: "Pareja mental boom",
        metric: "peor puesto medio juntos",
        lines: [
          { who: ["zapas14"], per: ["day media 3,33 en 6"] },
          { who: ["BEJITO MAMBO"], per: ["day media 3,33 en 6"] },
          { who: ["Azpekaa"], per: ["week media 4,07 en 15"] },
        ],
      },
    ]);
  });
});

describe("TITLES_LINK", () => {
  it("lleva al apartado Títulos de la pestaña Grupo del mismo perfil", () => {
    expect(TITLES_LINK.href).toBe("?tab=grupo#titulos");
    expect(TITLES_LINK.label).toBeTruthy();
  });
});

// --- El grupo hoy y distancias del ELO --------------------------------------------------------------

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

const todayOf = (extra: Partial<MemberToday> = {}): MemberToday => ({
  games: 0,
  firsts: 0,
  avgPlacement: null,
  last: [],
  ...extra,
});

describe("groupTodayRows", () => {
  const standings = [
    standing("d", 1, 1578, { dayChange: 52 }),
    standing("b", 2, 1517, { dayChange: 64 }),
    standing("c", 2, 1517, { dayChange: -15 }),
    standing("a", 4, 1492, { dayChange: null, provisional: true }),
  ];
  const game = (matchId: string, championId: number, placement: number) => ({
    matchId,
    championId,
    championName: `Raw${championId}`,
    placement,
  });
  const today: GroupToday = {
    dayKey: "2026-10-06",
    games: 12,
    members: {
      d: todayOf({
        games: 2,
        firsts: 2,
        avgPlacement: 1,
        last: [game("m2", 1, 1), game("m1", 99, 1)],
      }),
      b: todayOf({ games: 7, firsts: 2, avgPlacement: 2.5714 }),
      // c y a no han jugado hoy.
    },
  };
  const view = { elo: elo(standings), members: MEMBERS, today };
  // El campeón 1 está en el catálogo (con retrato y nombre de visualización); el 99, no.
  const catalog: ChampionCatalog = {
    version: "16.19.1",
    champions: [
      {
        championId: 1,
        ddId: "Annie",
        name: "Annie",
        portraitUrl: "https://ddragon.test/Annie.png",
      },
    ],
  };
  const rows = (owner = "a") => groupTodayRows(view, owner, catalog);

  it("todos en el orden de la Clasificación, con posiciones compartidas y la fila propia", () => {
    expect(rows().map((r) => [r.name, r.position, r.me])).toEqual([
      ["Krill1nt", 1, false],
      ["Azpekaa", 2, false],
      ["zapas14", 2, false],
      ["Hylimichi", 4, true],
    ]);
    expect(rows("c").map((r) => r.me)).toEqual([false, false, true, false]);
  });

  it("lo de la Clasificación y lo de hoy en cada fila", () => {
    const [krill, azp] = rows();
    expect(krill).toEqual({
      position: 1,
      name: "Krill1nt",
      slug: "krill1nt",
      leagueId: "diamante",
      rating: 1578,
      provisional: false,
      dayChange: 52,
      me: false,
      games: 2,
      firsts: 2,
      avgPlacement: "1,00",
      last: [
        {
          matchId: "m2",
          championName: "Annie",
          portraitUrl: "https://ddragon.test/Annie.png",
          placement: 1,
        },
        // Campeón fuera del catálogo: el nombre de la partida y sin retrato.
        {
          matchId: "m1",
          championName: "Raw99",
          portraitUrl: null,
          placement: 1,
        },
      ],
    });
    expect(azp.avgPlacement).toBe("2,57");
  });

  it("sin partidas hoy: ceros, puesto medio null y sin campeones; sin cambio de ELO, null", () => {
    const [, , zapas, me]: GroupTodayRow[] = rows();
    expect(zapas).toMatchObject({
      games: 0,
      firsts: 0,
      avgPlacement: null,
      last: [],
    });
    expect(me).toMatchObject({
      games: 0,
      avgPlacement: null,
      dayChange: null,
      provisional: true,
    });
  });

  it("un miembro sin entrada en today se trata como sin partidas", () => {
    const empty = groupTodayRows(
      { ...view, today: { dayKey: "x", games: 0, members: {} } },
      "a",
      catalog,
    );
    expect(empty.every((r) => r.games === 0 && r.last.length === 0)).toBe(true);
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

// --- Dios de Arena ---------------------------------------------------------------------------

/** Verificado con su primer 1º en `firstWinAt` (el último, después). */
const conquered = (
  championId: number,
  firstWinAt: number,
  championName = `c${championId}`,
): VerifiedChampion => ({
  ...verified(championId, firstWinAt + 1_000),
  championName,
  firstWinAt,
});

const NOW_OCT = Date.UTC(2026, 9, 7, 12); // miércoles 7-oct-2026, 14:00 en Madrid

describe("recentConquests", () => {
  const PORTRAITS: ChampionCatalog = {
    version: "16.19.1",
    champions: [
      { ...champ(56, "Nocturne", "Nocturne"), portraitUrl: "https://p/56.png" },
      champ(9, "FiddleSticks", "Fiddlesticks"),
      champ(11, "MasterYi", "Maestro Yi"),
    ],
  };

  it("por primer 1º, el más reciente primero, con nombre, slug, retrato y fecha", () => {
    expect(
      recentConquests(
        [
          conquered(9, Date.UTC(2026, 8, 30)),
          conquered(56, Date.UTC(2026, 9, 2)),
          conquered(11, Date.UTC(2026, 9, 1)),
        ],
        PORTRAITS,
        NOW_OCT,
      ),
    ).toEqual([
      {
        championId: 56,
        name: "Nocturne",
        slug: "nocturne",
        portraitUrl: "https://p/56.png",
        firstWinAt: Date.UTC(2026, 9, 2),
        dateText: "2 oct",
      },
      {
        championId: 11,
        name: "Maestro Yi",
        slug: "masteryi",
        portraitUrl: null,
        firstWinAt: Date.UTC(2026, 9, 1),
        dateText: "1 oct",
      },
      {
        championId: 9,
        name: "Fiddlesticks",
        slug: "fiddlesticks",
        portraitUrl: null,
        firstWinAt: Date.UTC(2026, 8, 30),
        dateText: "30 sept",
      },
    ]);
  });

  it("ordena por el primer 1º, no por el último", () => {
    const early = { ...conquered(9, 100), lastWinAt: 9_999 };
    const late = { ...conquered(56, 200), lastWinAt: 300 };
    expect(
      recentConquests([early, late], PORTRAITS, NOW_OCT).map(
        (c) => c.championId,
      ),
    ).toEqual([56, 9]);
  });

  it("solo los n primeros (5 por defecto)", () => {
    const many = Array.from({ length: 8 }, (_, i) => conquered(i + 1, i));
    expect(
      recentConquests(many, PORTRAITS, NOW_OCT).map((c) => c.championId),
    ).toEqual([8, 7, 6, 5, 4]);
    expect(recentConquests(many, PORTRAITS, NOW_OCT, 2)).toHaveLength(2);
  });

  it("empate en el primer 1º: el championId mayor, sea cual sea el orden", () => {
    const a = [conquered(9, 100), conquered(56, 100), conquered(11, 100)];
    const order = (list: VerifiedChampion[]) =>
      recentConquests(list, PORTRAITS, NOW_OCT).map((c) => c.championId);
    expect(order(a)).toEqual([56, 11, 9]);
    expect(order([...a].reverse())).toEqual([56, 11, 9]);
  });

  it("fuera del catálogo: el nombre de la partida, su slug y sin retrato", () => {
    expect(
      recentConquests(
        [conquered(999, Date.UTC(2026, 9, 1), "Zaahen")],
        PORTRAITS,
        NOW_OCT,
      )[0],
    ).toMatchObject({ name: "Zaahen", slug: "zaahen", portraitUrl: null });
  });

  it("de otro año: la fecha lleva el año", () => {
    expect(
      recentConquests(
        [conquered(56, Date.UTC(2025, 11, 30))],
        PORTRAITS,
        NOW_OCT,
      )[0]?.dateText,
    ).toBe("30 dic 2025");
  });

  it("sin verificados: vacío", () => {
    expect(recentConquests([], PORTRAITS, NOW_OCT)).toEqual([]);
  });
});

describe("newThisWeek", () => {
  it("cuenta los primeros 1º de la semana de juego de now (lunes 06:00 de Madrid)", () => {
    const list = [
      conquered(1, Date.UTC(2026, 9, 5, 4)), // lunes 06:00 en Madrid: ya es esta semana
      conquered(2, Date.UTC(2026, 9, 5, 3, 59)), // lunes 05:59: aún es el domingo anterior
      conquered(3, Date.UTC(2026, 9, 7, 10)),
      conquered(4, Date.UTC(2026, 9, 11, 23)), // lunes 01:00 en Madrid: domingo de juego
      conquered(5, Date.UTC(2026, 8, 30)),
    ];
    expect(newThisWeek(list, NOW_OCT)).toBe(3);
  });

  it("se fija en el primer 1º: un campeón que solo repite esta semana no cuenta", () => {
    const old = { ...conquered(1, Date.UTC(2026, 8, 1)), lastWinAt: NOW_OCT };
    expect(newThisWeek([old], NOW_OCT)).toBe(0);
  });

  it("sin verificados: 0", () => {
    expect(newThisWeek([], NOW_OCT)).toBe(0);
  });
});

// --- Textos de la vitrina ---------------------------------------------------------------------

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
    today: {
      dayKey: "2026-10-06",
      games: 3,
      members: { b: todayOf({ games: 3, firsts: 1, avgPlacement: 2 }) },
    } satisfies GroupToday,
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

  it("miembro: títulos, el grupo hoy y distancias de las funciones de la vitrina", () => {
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
        today: groupTodayRows(view, "a", CATALOG),
        todayGames: 3,
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
