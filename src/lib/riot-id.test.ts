import { describe, expect, it } from "vitest";
import {
  normalizeRiotId,
  parseProfileSlug,
  parseRiotId,
  parseRiotIdInput,
  profileSlug,
  riotIdInputError,
} from "./riot-id";

describe("normalizeRiotId", () => {
  it("pasa a minúsculas y recorta los extremos", () => {
    expect(normalizeRiotId("  BEJITO MAMBO ", " 1991")).toBe(
      "bejito mambo#1991",
    );
    expect(normalizeRiotId("Ñandú", "EUW")).toBe("ñandú#euw");
  });

  it("no distingue mayúsculas: es la identidad del perfil", () => {
    expect(normalizeRiotId("Faker", "KR1")).toBe(
      normalizeRiotId("fAKER", "kr1"),
    );
  });
});

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

describe("parseRiotIdInput", () => {
  const bejito = {
    ok: true,
    riotId: { gameName: "BEJITO MAMBO", tagLine: "1991" },
  };

  it("acepta `Nombre#TAG`", () => {
    expect(parseRiotIdInput("BEJITO MAMBO#1991")).toEqual(bejito);
    expect(parseRiotIdInput("Ñandú#EUW")).toEqual({
      ok: true,
      riotId: { gameName: "Ñandú", tagLine: "EUW" },
    });
  });

  it("acepta `Nombre-TAG`, separando por el último `-`", () => {
    expect(parseRiotIdInput("BEJITO MAMBO-1991")).toEqual(bejito);
    expect(parseRiotIdInput("Mi-Nombre-Raro-EUW")).toEqual({
      ok: true,
      riotId: { gameName: "Mi-Nombre-Raro", tagLine: "EUW" },
    });
  });

  it("con `#` manda el `#`: el nombre puede llevar guiones", () => {
    expect(parseRiotIdInput("Mi-Nombre#EUW")).toEqual({
      ok: true,
      riotId: { gameName: "Mi-Nombre", tagLine: "EUW" },
    });
  });

  it("recorta espacios alrededor de todo y de nombre y tag", () => {
    expect(parseRiotIdInput("  BEJITO MAMBO # 1991  ")).toEqual(bejito);
    expect(parseRiotIdInput("\t BEJITO MAMBO - 1991 \n")).toEqual(bejito);
  });

  it("conserva tildes y no decodifica lo tecleado (`%` es un carácter más)", () => {
    expect(parseRiotIdInput("Ñandú-EUW")).toEqual({
      ok: true,
      riotId: { gameName: "Ñandú", tagLine: "EUW" },
    });
    expect(parseRiotIdInput("Ab%20cd-EUW")).toEqual({
      ok: true,
      riotId: { gameName: "Ab%20cd", tagLine: "EUW" },
    });
  });

  it("`op.gg#EUW` es un Riot ID, no una URL", () => {
    expect(parseRiotIdInput("op.gg#EUW")).toEqual({
      ok: true,
      riotId: { gameName: "op.gg", tagLine: "EUW" },
    });
  });

  describe("URL de op.gg", () => {
    it.each([
      "https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991",
      "https://op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991",
      "http://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991",
      "www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991",
      "op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991",
      "op.gg/summoners/euw/BEJITO%20MAMBO-1991",
      "https://www.op.gg/summoners/euw/BEJITO%20MAMBO-1991",
      "https://www.op.gg/es/lol/summoners/euw/BEJITO%20MAMBO-1991",
      "https://op.gg/es/summoners/euw/BEJITO%20MAMBO-1991",
      "https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991/",
      "https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991/champions",
      "https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991/champions/",
      "https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991?queue_type=ARENA",
      "https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991/champions?queue_type=ARENA#top",
      "  https://www.op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991  ",
      "HTTPS://WWW.OP.GG/LOL/SUMMONERS/EUW/BEJITO%20MAMBO-1991",
      "https://www.op.gg/lol/summoners/euw/BEJITO MAMBO-1991",
    ])("%s", (url) => {
      expect(parseRiotIdInput(url)).toEqual(bejito);
    });

    it("decodifica acentos y conserva los guiones del nombre", () => {
      expect(
        parseRiotIdInput("op.gg/lol/summoners/euw/%C3%91and%C3%BA-EUW"),
      ).toEqual({ ok: true, riotId: { gameName: "Ñandú", tagLine: "EUW" } });
      expect(
        parseRiotIdInput(
          "op.gg/lol/summoners/euw/Mi-Nombre-Raro-EUW/champions",
        ),
      ).toEqual({
        ok: true,
        riotId: { gameName: "Mi-Nombre-Raro", tagLine: "EUW" },
      });
    });

    it("región distinta de EUW -> `region`", () => {
      for (const region of ["kr", "na", "eune", "oce", "br", "KR"]) {
        expect(
          parseRiotIdInput(
            `https://www.op.gg/lol/summoners/${region}/Faker-KR1`,
          ),
        ).toEqual({ ok: false, reason: "region" });
      }
      expect(
        parseRiotIdInput("op.gg/summoners/kr/Faker-KR1/champions"),
      ).toEqual({ ok: false, reason: "region" });
    });

    it("la región manda sobre el slug: región ajena con slug roto sigue siendo `region`", () => {
      expect(parseRiotIdInput("op.gg/lol/summoners/kr/x")).toEqual({
        ok: false,
        reason: "region",
      });
    });

    it("URL de op.gg que no es un perfil -> `format`", () => {
      for (const url of [
        "op.gg",
        "https://www.op.gg/",
        "https://www.op.gg/lol",
        "https://www.op.gg/lol/champions",
        "https://www.op.gg/lol/summoners",
        "https://www.op.gg/lol/summoners/euw",
        "https://www.op.gg/lol/summoners/euw/",
        "https://www.op.gg/lol/summoners/euw/Faker", // sin tag
        "https://www.op.gg/lol/summoners/euw/Faker%ZZ-KR1", // `%` mal formado
        "https://www.op.gg/lol/summoners/Faker-KR1", // sin región
      ]) {
        expect(parseRiotIdInput(url)).toEqual({ ok: false, reason: "format" });
      }
    });
  });

  it("vacío -> `empty`", () => {
    expect(parseRiotIdInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseRiotIdInput("   \n\t ")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("basura -> `format`", () => {
    for (const text of [
      "hola",
      "Faker",
      "#",
      "-",
      "###",
      "#KR1",
      "Faker#",
      "Faker-",
      "Fa#KR1", // nombre corto
      "Faker#K", // tag corto
      "Faker#KR1234", // tag largo
      "Faker#KR!",
      `${"a".repeat(17)}#EUW`, // nombre largo
      "https://example.com/Faker-KR1", // URL que no es de op.gg
      "https://lolalytics.com/lol/arena",
      "ftp://op.gg/lol/summoners/euw/Faker-KR1",
      "Fa\u0000ker#EUW", // carácter de control
    ]) {
      expect(parseRiotIdInput(text)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("es coherente con parseRiotId y parseProfileSlug", () => {
    expect(parseRiotIdInput("Faker#KR1")).toEqual({
      ok: true,
      riotId: parseRiotId("Faker#KR1"),
    });
    expect(parseRiotIdInput("op.gg/lol/summoners/euw/Faker-KR1")).toEqual({
      ok: true,
      riotId: parseProfileSlug("Faker-KR1"),
    });
  });
});

describe("riotIdInputError", () => {
  it("da un mensaje en español distinto para cada motivo", () => {
    const messages = (["empty", "format", "region"] as const).map(
      riotIdInputError,
    );
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) expect(message).toMatch(/\S/);
  });

  it("`format` explica el formato Nombre#TAG y `region` avisa de que solo hay EUW", () => {
    expect(riotIdInputError("format")).toContain("Nombre#TAG");
    expect(riotIdInputError("region")).toContain("Solo EUW");
    expect(riotIdInputError("empty")).toContain("Nombre#TAG");
  });
});
