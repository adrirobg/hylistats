import { describe, expect, it } from "vitest";
import type { AlbumEntry } from "@/domain/album";
import type { PlayerMatchRow } from "@/domain/stats";
import {
  CHAMPION_PARAM,
  championFigures,
  championHref,
  championPanelData,
  championSlug,
  championStatus,
  closeChampionHref,
  findChampionBySlug,
  panelMatchHref,
  RECENT_GAMES,
} from "./champion-panel-view";

const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const DAY = 24 * 60 * 60_000;

function entry(overrides: Partial<AlbumEntry> = {}): AlbumEntry {
  return {
    championId: 103,
    ddId: "Ahri",
    name: "Ahri",
    portraitUrl: null,
    state: "none",
    games: 0,
    firsts: 0,
    top3: 0,
    bestPlacement: null,
    avgPlacement: null,
    lastPlayedAt: null,
    firstWinAt: null,
    firstWinMatchId: null,
    ...overrides,
  };
}

const AHRI = entry();
const WUKONG = entry({ championId: 62, ddId: "MonkeyKing", name: "Wukong" });
const NUNU = entry({ championId: 20, ddId: "Nunu", name: "Nunu y Willump" });
// Jugado, pero fuera del catálogo de Data Dragon: sin `ddId`.
const NUEVO = entry({ championId: 999, ddId: null, name: "Nuevo Campeón" });
const ALBUM = [AHRI, NUNU, NUEVO, WUKONG];

describe("championSlug", () => {
  it("es el id de Data Dragon en minúsculas", () => {
    expect(championSlug(AHRI)).toBe("ahri");
    expect(championSlug(WUKONG)).toBe("monkeyking");
    expect(championSlug(NUNU)).toBe("nunu");
  });

  it("sin ddId, el nombre en minúsculas", () => {
    expect(championSlug(NUEVO)).toBe("nuevo campeón");
  });
});

describe("findChampionBySlug", () => {
  it("encuentra el campeón por su slug, sin distinguir mayúsculas", () => {
    expect(findChampionBySlug(ALBUM, "ahri")).toBe(AHRI);
    expect(findChampionBySlug(ALBUM, "AHRI")).toBe(AHRI);
    expect(findChampionBySlug(ALBUM, "MonkeyKing")).toBe(WUKONG);
  });

  it("un campeón fuera del catálogo se busca por su nombre", () => {
    expect(findChampionBySlug(ALBUM, "Nuevo Campeón")).toBe(NUEVO);
  });

  it("el nombre de visualización no es el slug de uno con ddId", () => {
    expect(findChampionBySlug(ALBUM, "wukong")).toBeNull();
  });

  it("null si no existe o viene vacío: no se abre el panel", () => {
    expect(findChampionBySlug(ALBUM, "teemo")).toBeNull();
    expect(findChampionBySlug(ALBUM, "")).toBeNull();
    expect(findChampionBySlug(ALBUM, "   ")).toBeNull();
    expect(findChampionBySlug([], "ahri")).toBeNull();
  });
});

describe("enlaces internos", () => {
  it("championHref pone ?campeon conservando la query", () => {
    expect(championHref("/euw/Foo-EUW", "", championSlug(AHRI))).toBe(
      "/euw/Foo-EUW?campeon=ahri",
    );
    expect(
      championHref("/euw/Foo-EUW", "tab=partidas&q=a", championSlug(WUKONG)),
    ).toBe("/euw/Foo-EUW?tab=partidas&q=a&campeon=monkeyking");
    // Otro campeón sustituye al abierto, sin duplicar el parámetro.
    expect(
      championHref("/p", "campeon=ahri&vista=lista", championSlug(NUNU)),
    ).toBe("/p?campeon=nunu&vista=lista");
  });

  it("championHref codifica un nombre con caracteres especiales", () => {
    const href = championHref("/p", "", championSlug(NUEVO));
    expect(href).toBe(`/p?${CHAMPION_PARAM}=nuevo+campe%C3%B3n`);
    // Y vuelve a resolverse a su campeón.
    const slug = new URLSearchParams(href.split("?")[1]).get(CHAMPION_PARAM);
    expect(findChampionBySlug(ALBUM, slug ?? "")).toBe(NUEVO);
  });

  it("closeChampionHref quita solo ?campeon", () => {
    expect(closeChampionHref("/p", "tab=partidas&campeon=ahri&n=2")).toBe(
      "/p?tab=partidas&n=2",
    );
    expect(closeChampionHref("/p", "campeon=ahri")).toBe("/p");
  });

  it("panelMatchHref va a Partidas con esa partida y sin ?campeon", () => {
    expect(panelMatchHref("/euw/Foo-EUW", "campeon=ahri", "EUW1_9")).toBe(
      "/euw/Foo-EUW?tab=partidas&partida=EUW1_9",
    );
    // Desde otra pestaña quita además los filtros de esa pestaña (del álbum).
    expect(
      panelMatchHref("/euw/Foo-EUW", "vista=lista&q=ah&campeon=ahri", "M1"),
    ).toBe("/euw/Foo-EUW?tab=partidas&partida=M1");
  });
});

describe("championPanelData", () => {
  const row = (
    matchId: string,
    championId: number,
    placement: number,
    gameCreation: number,
  ): PlayerMatchRow => ({
    matchId,
    gameCreation,
    championId,
    championName: championId === 103 ? "Ahri-partida" : "Otro",
    placement,
    playerSubteamId: 1,
  });

  it("solo cuenta las partidas del campeón: distribución y recientes", () => {
    const rows = [
      row("M1", 103, 1, 1000),
      row("M2", 103, 4, 3000),
      row("M3", 62, 1, 2000),
      row("M4", 103, 4, 2500),
      row("M5", 103, 2, 500),
    ];
    const data = championPanelData(AHRI, rows);
    expect(data.championId).toBe(103);
    expect(data.distribution).toEqual({ 1: 1, 2: 1, 3: 0, 4: 2, 5: 0, 6: 0 });
    // La más reciente primero, y sin las partidas de otro campeón.
    expect(data.recent.map((g) => g.matchId)).toEqual(["M2", "M4", "M1", "M5"]);
  });

  it("nombra al campeón como el álbum y no como la partida", () => {
    const data = championPanelData(AHRI, [row("M1", 103, 3, 1000)]);
    expect(data.recent[0]).toEqual({
      matchId: "M1",
      placement: 3,
      championId: 103,
      championName: "Ahri",
      gameCreation: 1000,
    });
  });

  it("recientes: como mucho RECENT_GAMES (10), pero la distribución cuenta todas", () => {
    const rows = Array.from({ length: 13 }, (_, i) =>
      row(`M${i}`, 103, 1 + (i % 6), 1000 + i),
    );
    const data = championPanelData(AHRI, rows);
    expect(RECENT_GAMES).toBe(10);
    expect(data.recent).toHaveLength(10);
    expect(data.recent[0].matchId).toBe("M12");
    expect(Object.values(data.distribution).reduce((a, b) => a + b)).toBe(13);
  });

  it("ignora los puestos fuera de 1..6, como el álbum", () => {
    const data = championPanelData(AHRI, [
      row("M1", 103, 0, 1000),
      row("M2", 103, 7, 2000),
      row("M3", 103, 2, 3000),
    ]);
    expect(data.recent.map((g) => g.matchId)).toEqual(["M3"]);
    expect(data.distribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 });
  });

  it("sin partidas: distribución a cero y sin recientes", () => {
    expect(championPanelData(AHRI, [row("M1", 62, 1, 1000)])).toEqual({
      championId: 103,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      recent: [],
    });
  });
});

describe("championFigures", () => {
  it("partidas, 1º, top 3 (0 decimales) y puesto medio (2 decimales) en es-ES", () => {
    const figures = championFigures({
      games: 7,
      firsts: 2,
      top3: 4,
      avgPlacement: 3.142857,
    });
    expect(figures.map((f) => [f.key, f.label, f.value, f.gold])).toEqual([
      ["games", "partidas", "7", false],
      ["firsts", "1º", "2", true],
      ["top3Rate", "top 3", "57 %", false],
      ["avgPlacement", "puesto medio", "3,14", false],
    ]);
  });

  it("sin partidas: 0 partidas y una raya en el resto, nunca NaN", () => {
    const figures = championFigures(AHRI);
    expect(figures.map((f) => f.value)).toEqual(["0", "—", "—", "—"]);
  });
});

describe("championStatus", () => {
  it("verificado: fecha del primer 1º y la partida a la que enlaza", () => {
    const won = entry({
      state: "won",
      games: 3,
      firsts: 2,
      firstWinAt: Date.UTC(2026, 0, 12, 20, 0),
      firstWinMatchId: "EUW1_1",
    });
    expect(championStatus(won, "won", NOW)).toEqual({
      label: "Ganado · verificado ✓",
      detail: "1º el 12 ene",
      tone: "won",
      matchId: "EUW1_1",
    });
  });

  it("verificado de otro año: la fecha lleva el año", () => {
    const won = entry({
      state: "won",
      firstWinAt: Date.UTC(2025, 11, 5),
      firstWinMatchId: "EUW1_1",
    });
    expect(championStatus(won, "won", NOW).detail).toBe("1º el 5 dic 2025");
  });

  it("verificado sin fecha: solo el rótulo", () => {
    const won = entry({ state: "won", firstWinMatchId: "EUW1_1" });
    expect(championStatus(won, "won", NOW).detail).toBeNull();
  });

  it("jugado sin ganar: el mejor puesto, sin enlace", () => {
    const played = entry({ state: "played", games: 4, bestPlacement: 2 });
    expect(championStatus(played, "played", NOW)).toEqual({
      label: "Jugado sin ganar",
      detail: "mejor puesto 2º",
      tone: "neutral",
      matchId: null,
    });
  });

  it("sin jugar: solo el rótulo", () => {
    expect(championStatus(AHRI, "none", NOW)).toEqual({
      label: "Sin jugar",
      detail: null,
      tone: "neutral",
      matchId: null,
    });
  });

  it("ganado a mano: dice que no está en el historial, con o sin partidas", () => {
    const played = entry({ state: "played", games: 3, bestPlacement: 2 });
    expect(championStatus(played, "manual", NOW)).toEqual({
      label: "Ganado a mano",
      detail: "sin 1º en el historial",
      tone: "manual",
      matchId: null,
    });
    expect(championStatus(AHRI, "manual", NOW).detail).toBe(
      "sin partidas esta temporada",
    );
  });

  it("no depende de cuánto hace: un 1º de ayer también muestra su fecha", () => {
    const won = entry({
      state: "won",
      firstWinAt: NOW - DAY,
      firstWinMatchId: "EUW1_1",
    });
    expect(championStatus(won, "won", NOW).detail).toBe("1º el 28 sept");
  });
});
