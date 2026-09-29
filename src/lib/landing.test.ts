import { describe, expect, it } from "vitest";
import { landingTarget } from "./landing";

const ME = { gameName: "BEJITO MAMBO", tagLine: "1991" };

describe("landingTarget", () => {
  it("con «mi perfil» y sin ?inicio redirige a su slug", () => {
    expect(landingTarget(ME, false)).toBe("BEJITO%20MAMBO-1991");
  });

  it("?inicio fuerza la landing aunque haya «mi perfil»", () => {
    expect(landingTarget(ME, true)).toBeNull();
  });

  it("sin «mi perfil» nunca redirige", () => {
    expect(landingTarget(null, false)).toBeNull();
    expect(landingTarget(null, true)).toBeNull();
  });

  it("el slug es el mismo que el de la URL del perfil (codificado)", () => {
    expect(landingTarget({ gameName: "Ñandú", tagLine: "EUW" }, false)).toBe(
      "%C3%91and%C3%BA-EUW",
    );
  });
});
