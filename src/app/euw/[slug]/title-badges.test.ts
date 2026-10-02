import { describe, expect, it } from "vitest";
import {
  type AwardedTitle,
  type TitleHolder,
  titleName,
  titlesOf,
} from "@/domain/group-titles";
import { TITLES_LINK, titleBadges } from "./title-badges";

function holder(puuids: string[], why: string): TitleHolder {
  return {
    puuids,
    value: 4.6,
    games: 5,
    firsts: 0,
    avgPlacement: 4.6,
    avgDamage: null,
    why,
  };
}

const TROL_DAY: AwardedTitle = {
  id: "troll",
  kind: "day",
  subject: "player",
  metric: "avgPlacement",
  name: titleName("troll", "day"),
  holders: [holder(["a"], "Peor puesto medio del día: 4,60 en 5 partidas")],
};
const TROL_WEEK: AwardedTitle = {
  id: "troll",
  kind: "week",
  subject: "player",
  metric: "avgPlacement",
  name: titleName("troll", "week"),
  holders: [
    holder(["a"], "Peor puesto medio de la semana: 4,60 en 9 partidas"),
  ],
};
const DUO_DAY: AwardedTitle = {
  id: "brokenDuo",
  kind: "day",
  subject: "duo",
  metric: "firsts",
  name: titleName("brokenDuo", "day"),
  holders: [holder(["a", "b"], "Más 1º juntos del día: 2 en 3 partidas")],
};
const TIED_TRIOS: AwardedTitle = {
  id: "brokenTrio",
  kind: "week",
  subject: "trio",
  metric: "firsts",
  name: titleName("brokenTrio", "week"),
  holders: [
    holder(["a", "b", "c"], "Más 1º juntos de la semana: 3 en 4 partidas"),
    holder(["a", "c", "d"], "Más 1º juntos de la semana: 3 en 4 partidas"),
  ],
};

describe("titleBadges", () => {
  it("un perfil sin títulos (o que no es miembro) no tiene ningún badge", () => {
    expect(titleBadges([])).toEqual([]);
    // Un no miembro no es poseedor de nada: `titlesOf` ya lo deja vacío.
    expect(titleBadges(titlesOf([TROL_DAY, DUO_DAY], "externo"))).toEqual([]);
  });

  it("un badge por título, con el nombre con periodo, el por qué y el enlace a Títulos", () => {
    const badges = titleBadges(titlesOf([TROL_DAY], "a"));
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({
      title: "El trol del día",
      description: "Peor puesto medio del día: 4,60 en 5 partidas",
      link: { href: "?tab=grupo#titulos", label: TITLES_LINK.label },
    });
    expect(TITLES_LINK.href).toBe("?tab=grupo#titulos");
  });

  it("el mismo título en día y semana son dos badges distintos, en el orden recibido", () => {
    const badges = titleBadges(titlesOf([TROL_DAY, TROL_WEEK], "a"));
    expect(badges.map((b) => b.title)).toEqual([
      "El trol del día",
      "El trol de la semana",
    ]);
    expect(new Set(badges.map((b) => b.key)).size).toBe(2);
  });

  it("un título de dúo sale en el perfil de cada uno de sus miembros y de nadie más", () => {
    for (const member of ["a", "b"]) {
      expect(
        titleBadges(titlesOf([DUO_DAY], member)).map((b) => b.title),
      ).toEqual(["Pareja rota del día"]);
    }
    expect(titleBadges(titlesOf([DUO_DAY], "c"))).toEqual([]);
  });

  it("un título de trío con empate da un badge por cada trío del miembro, con claves únicas", () => {
    const forA = titleBadges(titlesOf([TIED_TRIOS], "a"));
    expect(forA).toHaveLength(2);
    expect(new Set(forA.map((b) => b.key)).size).toBe(2);
    expect(titleBadges(titlesOf([TIED_TRIOS], "b"))).toHaveLength(1);
    expect(titleBadges(titlesOf([TIED_TRIOS], "d"))).toHaveLength(1);
  });
});
