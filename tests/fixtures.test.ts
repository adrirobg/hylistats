import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Comprueba que las fixtures grabadas por `scripts/record-fixtures.ts` están completas y,
// sobre todo, anonimizadas (el repo es público). No usa red ni la key de Riot.

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const MATCHES_DIR = path.join(FIXTURES_DIR, "matches");

const SELF_PUUID = "anon-puuid-self";
const ANON_PUUID = /^anon-puuid-(self|\d{3})$/;
/** Forma de un puuid real: 78 caracteres base64url. */
const REAL_PUUID_SHAPE = /^[A-Za-z0-9_-]{78}$/;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface Participant {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  placement: number;
  playerSubteamId: number;
  [key: string]: Json;
}

interface Match {
  metadata: { matchId: string; participants: string[] };
  info: { queueId: number; participants: Participant[] };
}

const readText = (file: string) => readFileSync(file, "utf8");
const readJson = <T = Json>(name: string): T =>
  JSON.parse(readText(path.join(FIXTURES_DIR, name))) as T;

const matchFiles = existsSync(MATCHES_DIR)
  ? readdirSync(MATCHES_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort()
  : [];
const matches = matchFiles.map((name) => readJson<Match>(`matches/${name}`));

/** Recorre todos los strings de un JSON. */
function* strings(value: Json): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* strings(item);
  else if (value !== null && typeof value === "object")
    for (const item of Object.values(value)) yield* strings(item);
}

describe("fixtures de la Riot API", () => {
  it("existen y son JSON válido", () => {
    for (const name of [
      "account.json",
      "match-ids.json",
      "match-404.json",
      "player-data.json",
    ]) {
      expect(existsSync(path.join(FIXTURES_DIR, name)), name).toBe(true);
      expect(() => readJson(name), name).not.toThrow();
    }
    expect(existsSync(path.join(FIXTURES_DIR, "README.md"))).toBe(true);
  });

  it("account.json es el jugador de prueba con puuid anónimo", () => {
    expect(readJson("account.json")).toEqual({
      puuid: SELF_PUUID,
      gameName: "BEJITO MAMBO",
      tagLine: "1991",
    });
  });

  it("match-ids.json es una lista de ids de partida", () => {
    const ids = readJson<string[]>("match-ids.json");
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^EUW1_\d+$/);
  });

  it("match-404.json guarda el estado y el cuerpo del 404", () => {
    const fixture = readJson<{ status: number; body: Json }>("match-404.json");
    expect(fixture.status).toBe(404);
    expect(fixture.body).toBeTruthy();
  });

  it("player-data.json está recortado a los retos de Arena", () => {
    const data = readJson<{
      totalPoints: Json;
      categoryPoints: Json;
      challenges: { challengeId: number }[];
      preferences?: Json;
    }>("player-data.json");
    expect(data.totalPoints).toBeTruthy();
    expect(data.categoryPoints).toBeTruthy();
    expect(data).not.toHaveProperty("preferences");
    const allowed = new Set([
      602000, 602001, 602002, 601000, 601001, 601002, 601003, 601004, 601005,
      601006,
    ]);
    for (const { challengeId } of data.challenges) {
      expect(allowed.has(challengeId), String(challengeId)).toBe(true);
    }
    expect(data.challenges.map((c) => c.challengeId)).toContain(602002);
  });

  describe("partidas", () => {
    it("hay al menos 5, todas de Arena tríos con 18 participantes", () => {
      expect(matches.length).toBeGreaterThanOrEqual(5);
      matches.forEach((match, i) => {
        const file = matchFiles[i];
        expect(match.metadata.matchId, file).toBe(file.replace(".json", ""));
        expect(match.info.queueId, file).toBe(1750);
        expect(match.info.participants, file).toHaveLength(18);
        expect(match.metadata.participants, file).toHaveLength(18);
      });
    });

    it("el jugador de prueba aparece en todas", () => {
      matches.forEach((match, i) => {
        const self = match.info.participants.filter(
          (p) => p.puuid === SELF_PUUID,
        );
        expect(self, matchFiles[i]).toHaveLength(1);
        expect(match.metadata.participants).toContain(SELF_PUUID);
      });
    });

    // Documenta la muestra: las 10 partidas más recientes no contienen ningún 1º del jugador.
    // Los tests de dominio que lo necesiten sintetizan uno en memoria a partir de una partida real
    // (p. ej. cambiando `placement` de su trío) o usan el trío ganador real de cada partida.
    it("el jugador de prueba queda entre 2º y 6º y cada partida tiene un trío ganador de 3", () => {
      for (const [i, match] of matches.entries()) {
        const self = match.info.participants.find(
          (p) => p.puuid === SELF_PUUID,
        );
        expect(self?.placement, matchFiles[i]).toBeGreaterThanOrEqual(2);
        expect(self?.placement, matchFiles[i]).toBeLessThanOrEqual(6);
        const winners = match.info.participants.filter(
          (p) => p.placement === 1,
        );
        expect(winners, matchFiles[i]).toHaveLength(3);
        // El trío ganador comparte `playerSubteamId`.
        expect(new Set(winners.map((p) => p.playerSubteamId)).size).toBe(1);
      }
    });

    it("el jugador de prueba tiene exactamente 2 compañeros de trío en cada partida", () => {
      for (const match of matches) {
        const self = match.info.participants.find(
          (p) => p.puuid === SELF_PUUID,
        );
        const mates = match.info.participants.filter(
          (p) =>
            p.playerSubteamId === self?.playerSubteamId &&
            p.puuid !== SELF_PUUID,
        );
        expect(mates).toHaveLength(2);
      }
    });
  });

  describe("anonimización", () => {
    it("ningún puuid tiene forma de puuid real y todos son anónimos", () => {
      for (const match of matches) {
        const puuids = [
          ...match.metadata.participants,
          ...match.info.participants.map((p) => p.puuid),
        ];
        for (const puuid of puuids) {
          expect(puuid).toMatch(ANON_PUUID);
          expect(puuid).not.toMatch(REAL_PUUID_SHAPE);
        }
        expect(new Set(match.metadata.participants)).toEqual(
          new Set(match.info.participants.map((p) => p.puuid)),
        );
      }
      expect((readJson("account.json") as { puuid: string }).puuid).toMatch(
        ANON_PUUID,
      );
    });

    it("ninguna cadena de ningún fichero tiene forma de puuid real", () => {
      const files = [
        "account.json",
        "match-ids.json",
        "match-404.json",
        "player-data.json",
        ...matchFiles.map((name) => `matches/${name}`),
      ];
      for (const file of files) {
        for (const value of strings(readJson(file))) {
          expect(value, file).not.toMatch(REAL_PUUID_SHAPE);
        }
      }
    });

    it("solo queda el Riot ID del jugador de prueba; los ajenos son PlayerNNN#ANON", () => {
      for (const match of matches) {
        for (const p of match.info.participants) {
          if (p.puuid === SELF_PUUID) {
            expect(p.riotIdGameName).toBe("BEJITO MAMBO");
            expect(p.riotIdTagline).toBe("1991");
          } else {
            expect(p.riotIdGameName).toMatch(/^Player\d{3}$/);
            expect(p.riotIdTagline).toBe("ANON");
            // Mismo número en el nombre que en el puuid sustituto.
            expect(p.puuid.slice(-3)).toBe(p.riotIdGameName.slice(-3));
          }
          expect(p.summonerName ?? "").toBe("");
        }
      }
    });

    it("ningún fichero contiene algo con forma de key de Riot", () => {
      const files = [
        "account.json",
        "match-ids.json",
        "match-404.json",
        "player-data.json",
        "README.md",
        ...matchFiles.map((name) => `matches/${name}`),
      ];
      for (const file of files) {
        expect(readText(path.join(FIXTURES_DIR, file)), file).not.toContain(
          "RGAPI-",
        );
      }
    });
  });
});
