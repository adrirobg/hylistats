import { describe, expect, it } from "vitest";
import { championLinks } from "./champion-links";

// La tabla de plantillas y excepciones se comprobó a mano en el navegador contra cada web (ver
// `champion-links.ts`): estos tests la fijan, no la vuelven a comprobar (sin red).

/** `href` de cada sitio, en el orden en que salen. */
const hrefs = (ddId: string, name = ddId) =>
  Object.fromEntries(championLinks(ddId, name).map((l) => [l.site, l.href]));

describe("championLinks", () => {
  it("devuelve los cinco sitios en el orden op.gg, LoLalytics, METAsrc, u.gg y Blitz", () => {
    expect(
      championLinks("Ahri", "Ahri").map(({ site, label }) => [site, label]),
    ).toEqual([
      ["opgg", "op.gg"],
      ["lolalytics", "LoLalytics"],
      ["metasrc", "METAsrc"],
      ["ugg", "u.gg"],
      ["blitz", "Blitz"],
    ]);
  });

  it("Ahri: las plantillas base", () => {
    expect(hrefs("Ahri")).toEqual({
      opgg: "https://op.gg/lol/modes/arena/ahri/build",
      lolalytics: "https://lolalytics.com/lol/ahri/arena/build/",
      metasrc: "https://www.metasrc.com/lol/arena/champions/ahri/build",
      ugg: "https://u.gg/lol/champions/arena/ahri-arena-build",
      blitz: "https://blitz.gg/lol/champions/Ahri/arena",
    });
  });

  it("Wukong (MonkeyKing): LoLalytics y METAsrc usan `wukong`; el resto, el id", () => {
    expect(hrefs("MonkeyKing", "Wukong")).toEqual({
      opgg: "https://op.gg/lol/modes/arena/monkeyking/build",
      lolalytics: "https://lolalytics.com/lol/wukong/arena/build/",
      metasrc: "https://www.metasrc.com/lol/arena/champions/wukong/build",
      ugg: "https://u.gg/lol/champions/arena/monkeyking-arena-build",
      blitz: "https://blitz.gg/lol/champions/MonkeyKing/arena",
    });
  });

  it("Nunu & Willump (Nunu): el id, sin el nombre de visualización", () => {
    expect(hrefs("Nunu", "Nunu & Willump")).toEqual({
      opgg: "https://op.gg/lol/modes/arena/nunu/build",
      lolalytics: "https://lolalytics.com/lol/nunu/arena/build/",
      metasrc: "https://www.metasrc.com/lol/arena/champions/nunu/build",
      ugg: "https://u.gg/lol/champions/arena/nunu-arena-build",
      blitz: "https://blitz.gg/lol/champions/Nunu/arena",
    });
  });

  it("Renata Glasc (Renata): METAsrc usa `renata-glasc`", () => {
    expect(hrefs("Renata", "Renata Glasc")).toEqual({
      opgg: "https://op.gg/lol/modes/arena/renata/build",
      lolalytics: "https://lolalytics.com/lol/renata/arena/build/",
      metasrc: "https://www.metasrc.com/lol/arena/champions/renata-glasc/build",
      ugg: "https://u.gg/lol/champions/arena/renata-arena-build",
      blitz: "https://blitz.gg/lol/champions/Renata/arena",
    });
  });

  it("Bel'Veth (Belveth) y Kai'Sa (Kaisa): sin apóstrofo, el id en minúsculas", () => {
    expect(hrefs("Belveth", "Bel'Veth")).toEqual({
      opgg: "https://op.gg/lol/modes/arena/belveth/build",
      lolalytics: "https://lolalytics.com/lol/belveth/arena/build/",
      metasrc: "https://www.metasrc.com/lol/arena/champions/belveth/build",
      ugg: "https://u.gg/lol/champions/arena/belveth-arena-build",
      blitz: "https://blitz.gg/lol/champions/Belveth/arena",
    });
    expect(hrefs("Kaisa", "Kai'Sa")).toEqual({
      opgg: "https://op.gg/lol/modes/arena/kaisa/build",
      lolalytics: "https://lolalytics.com/lol/kaisa/arena/build/",
      metasrc: "https://www.metasrc.com/lol/arena/champions/kaisa/build",
      ugg: "https://u.gg/lol/champions/arena/kaisa-arena-build",
      blitz: "https://blitz.gg/lol/champions/Kaisa/arena",
    });
  });

  it("METAsrc: `kebab(ddId)` parte el camelCase con guion", () => {
    expect(hrefs("TwistedFate").metasrc).toBe(
      "https://www.metasrc.com/lol/arena/champions/twisted-fate/build",
    );
    expect(hrefs("DrMundo").metasrc).toBe(
      "https://www.metasrc.com/lol/arena/champions/dr-mundo/build",
    );
    // Dos mayúsculas seguidas no se parten: `KSante` -> `ksante`.
    expect(hrefs("KSante").metasrc).toBe(
      "https://www.metasrc.com/lol/arena/champions/ksante/build",
    );
  });

  it("METAsrc: las excepciones (JarvanIV, KogMaw, RekSai) ganan al kebab", () => {
    expect(hrefs("JarvanIV").metasrc).toBe(
      "https://www.metasrc.com/lol/arena/champions/jarvan/build",
    );
    expect(hrefs("KogMaw").metasrc).toBe(
      "https://www.metasrc.com/lol/arena/champions/kogmaw/build",
    );
    expect(hrefs("RekSai").metasrc).toBe(
      "https://www.metasrc.com/lol/arena/champions/reksai/build",
    );
  });

  it("las excepciones de METAsrc no cambian los demás sitios", () => {
    for (const id of ["JarvanIV", "KogMaw", "RekSai", "DrMundo"]) {
      const links = hrefs(id);
      expect(links.opgg).toBe(
        `https://op.gg/lol/modes/arena/${id.toLowerCase()}/build`,
      );
      expect(links.lolalytics).toBe(
        `https://lolalytics.com/lol/${id.toLowerCase()}/arena/build/`,
      );
      expect(links.ugg).toBe(
        `https://u.gg/lol/champions/arena/${id.toLowerCase()}-arena-build`,
      );
      expect(links.blitz).toBe(`https://blitz.gg/lol/champions/${id}/arena`);
    }
  });

  it("el nombre accesible dice el sitio, el campeón y que se abre en otra pestaña", () => {
    expect(championLinks("Kaisa", "Kai'Sa")[0].ariaLabel).toBe(
      "op.gg: builds y meta de Kai'Sa (se abre en otra pestaña)",
    );
  });

  it("sin ddId (campeón fuera del catálogo): ningún enlace inventado", () => {
    expect(championLinks(null, "Campeón Nuevo")).toEqual([]);
    expect(championLinks("", "Campeón Nuevo")).toEqual([]);
  });
});
