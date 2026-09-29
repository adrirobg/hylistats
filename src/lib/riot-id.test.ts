import { describe, expect, it } from "vitest";
import { parseProfileSlug, parseRiotId, profileSlug } from "./riot-id";

describe("profileSlug", () => {
  it("une nombre y tag con `-` y codifica para la URL", () => {
    expect(profileSlug("Faker", "KR1")).toBe("Faker-KR1");
    expect(profileSlug("BEJITO MAMBO", "1991")).toBe("BEJITO%20MAMBO-1991");
    expect(profileSlug("Ñandú", "EUW")).toBe("%C3%91and%C3%BA-EUW");
  });

  it("recorta espacios en los extremos", () => {
    expect(profileSlug("  Faker ", " KR1 ")).toBe("Faker-KR1");
  });
});

describe("parseProfileSlug", () => {
  it("separa nombre y tag", () => {
    expect(parseProfileSlug("Faker-KR1")).toEqual({
      gameName: "Faker",
      tagLine: "KR1",
    });
  });

  it("decodifica espacios (%20) y acentos", () => {
    expect(parseProfileSlug("BEJITO%20MAMBO-1991")).toEqual({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
    });
    expect(parseProfileSlug("%C3%91and%C3%BA-EUW")).toEqual({
      gameName: "Ñandú",
      tagLine: "EUW",
    });
  });

  it("separa por el último `-`: el nombre puede llevar guiones", () => {
    expect(parseProfileSlug("Mi-Nombre-Raro-EUW")).toEqual({
      gameName: "Mi-Nombre-Raro",
      tagLine: "EUW",
    });
    expect(parseProfileSlug("Foo--EUW")).toEqual({
      gameName: "Foo-",
      tagLine: "EUW",
    });
  });

  it("recorta espacios alrededor de nombre y tag", () => {
    expect(parseProfileSlug("%20Faker%20-%20KR1%20")).toEqual({
      gameName: "Faker",
      tagLine: "KR1",
    });
  });

  it("es el inverso de profileSlug", () => {
    for (const [name, tag] of [
      ["BEJITO MAMBO", "1991"],
      ["Mi-Nombre-Raro", "EUW"],
      ["Ñandú", "EUW"],
      ["Tú & Yo", "ab12"],
    ]) {
      expect(parseProfileSlug(profileSlug(name, tag))).toEqual({
        gameName: name,
        tagLine: tag,
      });
    }
  });

  it("acepta el nombre ya decodificado", () => {
    expect(parseProfileSlug("BEJITO MAMBO-1991")).toEqual({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
    });
  });

  it("valida el tag: 2–5 alfanuméricos", () => {
    expect(parseProfileSlug("Faker-A")).toBeNull();
    expect(parseProfileSlug("Faker-AB")).not.toBeNull();
    expect(parseProfileSlug("Faker-ABCDE")).not.toBeNull();
    expect(parseProfileSlug("Faker-ABCDEF")).toBeNull();
    expect(parseProfileSlug("Faker-EU!")).toBeNull();
    expect(parseProfileSlug("Faker-E%20W")).toBeNull();
    expect(parseProfileSlug("Faker-")).toBeNull();
  });

  it("valida el nombre: 3–16 caracteres", () => {
    expect(parseProfileSlug("Ab-EUW")).toBeNull();
    expect(parseProfileSlug("Abc-EUW")).not.toBeNull();
    expect(parseProfileSlug(`${"a".repeat(16)}-EUW`)).not.toBeNull();
    expect(parseProfileSlug(`${"a".repeat(17)}-EUW`)).toBeNull();
    expect(parseProfileSlug("%20%20a%20%20-EUW")).toBeNull(); // 1 carácter tras recortar
    expect(parseProfileSlug("-EUW")).toBeNull();
  });

  it("cuenta caracteres, no unidades UTF-16", () => {
    expect(parseProfileSlug(`${"😀".repeat(16)}-EUW`)).not.toBeNull();
    expect(parseProfileSlug(`${"😀".repeat(17)}-EUW`)).toBeNull();
  });

  it("rechaza entradas inválidas", () => {
    expect(parseProfileSlug("")).toBeNull();
    expect(parseProfileSlug("SinGuion")).toBeNull();
    expect(parseProfileSlug("Faker%ZZ-EUW")).toBeNull(); // `%` mal formado
    expect(parseProfileSlug("%ED%A0%80-EUW")).toBeNull(); // UTF-8 inválido
    expect(parseProfileSlug("Fa%00ker-EUW")).toBeNull(); // carácter de control
  });
});

describe("parseRiotId", () => {
  it("separa `Nombre#TAG` por el último `#`", () => {
    expect(parseRiotId("BEJITO MAMBO#1991")).toEqual({
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
    });
    expect(parseRiotId("  Faker # KR1 ")).toEqual({
      gameName: "Faker",
      tagLine: "KR1",
    });
  });

  it("null sin `#` o con nombre o tag inválidos", () => {
    expect(parseRiotId("Faker-KR1")).toBeNull();
    expect(parseRiotId("Faker#")).toBeNull();
    expect(parseRiotId("#KR1")).toBeNull();
    expect(parseRiotId("Faker#K")).toBeNull();
    expect(parseRiotId("Fa#KR1")).toBeNull();
  });

  it("encaja con parseProfileSlug a través de profileSlug", () => {
    const id = parseRiotId("Mi-Nombre-Raro#EUW");
    expect(id).not.toBeNull();
    if (!id) return;
    expect(parseProfileSlug(profileSlug(id.gameName, id.tagLine))).toEqual(id);
  });
});
