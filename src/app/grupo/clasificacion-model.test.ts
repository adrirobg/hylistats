import { describe, expect, it } from "vitest";
import { computeGroupElo } from "@/domain/elo";
import type { GroupMatchRow } from "@/domain/group-titles";
import { ELO_PROVISIONAL_GAMES } from "@/lib/config";
import {
  changeCell,
  changeHeader,
  clasificacionNote,
  clasificacionRows,
  leaguesText,
  placementPointsText,
  strangerMultipliersText,
  streakBadge,
  streakMultipliersText,
} from "./clasificacion-model";
import { type MemberRef, memberMap } from "./group-view-model";

const at = (iso: string) => Date.parse(iso);
/** Miércoles 2026-09-30, 20:00 en Madrid. */
const DAY_TS = at("2026-09-30T18:00:00Z");
const NOW = at("2026-09-30T22:00:00Z");

const member = (key: string, gameName: string): MemberRef => ({
  key,
  gameName,
  tagLine: "EUW",
  slug: `${gameName}-EUW`,
});
const MEMBERS = memberMap([member("1", "Ana"), member("2", "Beto")]);

let seq = 0;
function game(
  placement: number,
  keys: string[],
  ts = DAY_TS,
  subteam = 1,
): GroupMatchRow[] {
  seq += 1;
  return keys.map((puuid) => ({
    puuid,
    matchId: `EUW1_${seq}`,
    gameStartTimestamp: ts + seq * 60_000,
    gameCreation: ts + seq * 60_000,
    playerSubteamId: subteam,
    placement,
    totalDamageDealtToChampions: 10_000,
  }));
}

describe("changeCell", () => {
  it("da signo y tono al cambio, y guion si no jugó", () => {
    expect(changeCell(28.6)).toEqual({ text: "+29", tone: "up" });
    expect(changeCell(-14.2)).toEqual({ text: "-14", tone: "down" });
    expect(changeCell(0.2)).toEqual({ text: "0", tone: "flat" });
    expect(changeCell(null)).toEqual({ text: "—", tone: "none" });
  });
});

describe("clasificacionRows", () => {
  it("respeta el orden y las posiciones compartidas del dominio, y marca el provisional", () => {
    // Ana y Beto empatan a 1515 (un 1º cada uno, con desconocidos iguales); Cris no tiene partidas.
    // 1515: Oro (la liga sale directamente del rating, #32).
    const rows = [...game(1, ["1"]), ...game(1, ["2"])];
    const elo = computeGroupElo(rows, ["1", "2", "3"], NOW);
    const model = clasificacionRows(
      elo.standings,
      memberMap([...MEMBERS.values(), member("3", "Cris")]),
    );
    expect(model.map((r) => r.member?.gameName)).toEqual([
      "Ana",
      "Beto",
      "Cris",
    ]);
    expect(model.map((r) => r.position)).toEqual([1, 1, 3]);
    expect(model[0]).toMatchObject({
      leagueName: "Oro",
      rating: String(elo.standings[0].roundedRating),
      games: "1",
      provisional: true,
    });
    expect(model[0].day.tone).toBe("up");
    expect(model[0].week.tone).toBe("up");
    // Sin partidas: 1500, Plata, cambio "—" en los dos periodos.
    expect(model[2]).toMatchObject({
      rating: "1500",
      leagueName: "Plata",
      games: "0",
      provisional: true,
      day: { text: "—", tone: "none" },
      week: { text: "—", tone: "none" },
    });
  });

  it("deja de ser provisional con el mínimo de partidas", () => {
    const rows = Array.from({ length: ELO_PROVISIONAL_GAMES }, () =>
      game(4, ["1"]),
    ).flat();
    const elo = computeGroupElo(rows, ["1"], NOW);
    const [row] = clasificacionRows(elo.standings, MEMBERS);
    expect(row.provisional).toBe(false);
    expect(row.games).toBe("10");
  });

  it("deja el miembro en null si la clave no está en el mapa", () => {
    const elo = computeGroupElo(game(1, ["9"]), ["9"], NOW);
    expect(clasificacionRows(elo.standings, MEMBERS)[0].member).toBeNull();
  });
});

describe("streakBadge", () => {
  it("nada con 0 o 1 seguidos", () => {
    expect(streakBadge(0)).toBeNull();
    expect(streakBadge(1)).toBeNull();
  });

  it("con 2 o más, 🔥 con el número y el texto en el title", () => {
    expect(streakBadge(2)).toEqual({
      text: "🔥2",
      title: "2 primeros seguidos",
    });
    expect(streakBadge(4)).toEqual({
      text: "🔥4",
      title: "4 primeros seguidos",
    });
  });

  it("las filas de la Clasificación llevan la racha en curso del dominio", () => {
    // Ana: dos 1º seguidos; Beto: 1º y luego un 4º, que la corta.
    const rows = [...game(1, ["1", "2"]), ...game(1, ["1"]), ...game(4, ["2"])];
    const elo = computeGroupElo(rows, ["1", "2"], NOW);
    const model = clasificacionRows(elo.standings, MEMBERS);
    const byName = Object.fromEntries(
      model.map((r) => [r.member?.gameName, r.streak]),
    );
    expect(byName).toEqual({
      Ana: { text: "🔥2", title: "2 primeros seguidos" },
      Beto: null,
    });
  });
});

describe("changeHeader", () => {
  it("usa Hoy / Semana en el periodo actual", () => {
    const elo = computeGroupElo(game(1, ["1"]), ["1"], NOW);
    expect(elo.day.isCurrent).toBe(true);
    expect(changeHeader(elo.day)).toEqual({ label: "Hoy", dated: false });
    expect(changeHeader(elo.week)).toEqual({
      label: "Semana",
      short: "Sem.",
      dated: false,
    });
  });

  it("lleva la fecha del periodo mostrado si no es el actual", () => {
    // Una semana después de la partida: el día y la semana actuales están vacíos.
    const later = at("2026-10-08T10:00:00Z");
    const elo = computeGroupElo(game(1, ["1"]), ["1"], later);
    expect(elo.day.isCurrent).toBe(false);
    expect(changeHeader(elo.day)).toEqual({
      label: `Día ${elo.day.label}`,
      dated: true,
    });
    expect(changeHeader(elo.week)).toEqual({
      label: `Sem. ${elo.week.label}`,
      dated: true,
    });
    expect(elo.day.label).toBe("30 sept");
  });
});

describe("nota de la regla", () => {
  it("saca los puntos por puesto de config.ts", () => {
    expect(placementPointsText()).toBe(
      "1º +12,5 · 2º +6 · 3º +1 · 4º −2,5 · 5º −7,5 · 6º −9,5",
    );
  });

  it("describe los multiplicadores por desconocidos", () => {
    expect(strangerMultipliersText()).toBe(
      "1 desconocido: ×1,1 al ganar y ×0,85 al perder; 2 desconocidos: ×1,2 al ganar y ×0,8 al perder",
    );
  });

  it("describe los cortes de liga", () => {
    expect(leaguesText()).toBe(
      "Hierro < 1450 · Bronce 1450–1479 · Plata 1480–1509 · Oro 1510–1539 · Platino 1540–1569 · Diamante ≥ 1570",
    );
  });

  it("describe la racha de 1º seguidos (F28)", () => {
    expect(streakMultipliersText()).toBe(
      "2 primeros seguidos: ×1,5; 3 o más: ×2",
    );
  });

  it("junta todo en párrafos, con el mínimo provisional y la temporada", () => {
    const text = clasificacionNote().paragraphs.join(" ");
    expect(text).toContain("1500");
    expect(text).toContain("un poco menos ganas y un poco más pierdes");
    expect(text).toContain("menos de 10 partidas");
    expect(text).toContain("temporada actual");
    expect(text).toContain(streakMultipliersText());
    expect(text).toContain("solo en las partidas que suman");
    expect(text).toContain("aunque cambie el día");
    expect(text).toContain(leaguesText());
    expect(text).not.toContain("margen");
  });
});
