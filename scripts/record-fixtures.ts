/**
 * Graba UNA vez respuestas reales de la Riot API, las anonimiza y las deja en `tests/fixtures/`
 * para que todos los tests funcionen sin key ni red.
 *
 * Uso: `npm run fixtures:record` (= `tsx --env-file-if-exists=.env.local scripts/record-fixtures.ts`).
 *
 * Reglas:
 * - La key sale SOLO de `process.env.RIOT_API_KEY`; nunca se loguea ni se escribe a disco.
 * - Máximo 15 peticiones en total, secuenciales y con >= 1 s de pausa. 401/403/429 abortan sin reintentar.
 * - Todo se mantiene en memoria hasta el final: se anonimiza, se comprueba que no queda ningún
 *   puuid/Riot ID real ni la key en el contenido serializado y solo entonces se escribe a disco.
 *   El mapa real -> anónimo vive solo en memoria.
 * - El repo es PÚBLICO: si la comprobación de fugas falla, no se escribe nada.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// --- Configuración de la grabación ---

const RIOT_ID = { gameName: "BEJITO MAMBO", tagLine: "1991" } as const;
const REGIONAL_HOST = "https://europe.api.riotgames.com";
const PLATFORM_HOST = "https://euw1.api.riotgames.com";
const ARENA_QUEUE = 1750;
/** 2026-05-12T00:00:00Z en segundos (Riot filtra `startTime` en segundos). */
const START_TIME_S = 1778544000;
const IDS_COUNT = 10;
const MIN_MATCHES = 5;
const MAX_MATCH_DETAILS = 10;
/** Id de partida inexistente (verificado: 404 real) para grabar el cuerpo del error. */
const MISSING_MATCH_ID = "EUW1_7300000001";
const MAX_REQUESTS = 15;
const PAUSE_MS = 1100;
const CHALLENGE_IDS = new Set([
  602000, 602001, 602002, 601000, 601001, 601002, 601003, 601004, 601005,
  601006,
]);

const SELF_ANON_PUUID = "anon-puuid-self";
const ANON_TAGLINE = "ANON";

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures",
);

// --- Tipos mínimos (las respuestas reales traen ~170 campos por participante) ---

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Anonimización (funciones puras, exportadas para poder probarlas sin red) ---

const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * Sustituye puuids y Riot IDs de forma determinista por orden de aparición.
 * El primer puuid registrado es el del jugador de prueba (`anon-puuid-self`).
 */
export function createAnonymizer(selfPuuid: string) {
  /** puuid real -> índice (0 = jugador de prueba). Solo en memoria. */
  const indexByPuuid = new Map<string, number>([[selfPuuid, 0]]);
  const realGameNames = new Set<string>();

  const indexOf = (puuid: string): number => {
    let index = indexByPuuid.get(puuid);
    if (index === undefined) {
      index = indexByPuuid.size;
      indexByPuuid.set(puuid, index);
    }
    return index;
  };

  const anonPuuid = (puuid: string): string => {
    const index = indexOf(puuid);
    return index === 0 ? SELF_ANON_PUUID : `anon-puuid-${pad3(index)}`;
  };

  /** Recorre el JSON sustituyendo todo string que sea un puuid conocido o vaya bajo la clave `puuid`. */
  const replacePuuids = (value: Json, key?: string): Json => {
    if (typeof value === "string") {
      return key === "puuid" || indexByPuuid.has(value)
        ? anonPuuid(value)
        : value;
    }
    if (Array.isArray(value)) return value.map((item) => replacePuuids(item));
    if (isObject(value)) {
      const out: JsonObject = {};
      for (const [k, v] of Object.entries(value)) out[k] = replacePuuids(v, k);
      return out;
    }
    return value;
  };

  /** Neutraliza los campos de identidad de un participante de Match-V5. */
  const scrubParticipant = (participant: JsonObject, realPuuid: string) => {
    const index = indexOf(realPuuid);
    if (index !== 0) {
      const realName = participant.riotIdGameName;
      if (typeof realName === "string" && realName !== "") {
        realGameNames.add(realName);
      }
      participant.riotIdGameName = `Player${pad3(index)}`;
      participant.riotIdTagline = ANON_TAGLINE;
    }
    if ("summonerName" in participant) participant.summonerName = "";
    if ("summonerId" in participant) participant.summonerId = "anon";
    if ("accountId" in participant) participant.accountId = "anon";
    if ("profileIcon" in participant) participant.profileIcon = 0;
  };

  return {
    anonymizeAccount(account: JsonObject): JsonObject {
      return replacePuuids(account) as JsonObject;
    },

    anonymizeMatch(match: JsonObject): JsonObject {
      const copy = structuredClone(match);
      const metadata = copy.metadata;
      const info = copy.info;
      if (!isObject(metadata) || !isObject(info)) {
        throw new Error("Partida con estructura inesperada (metadata/info)");
      }
      // 1) Registrar puuids en orden de aparición: metadata primero, luego info.
      if (Array.isArray(metadata.participants)) {
        for (const puuid of metadata.participants) {
          if (typeof puuid === "string") indexOf(puuid);
        }
      }
      const participants = Array.isArray(info.participants)
        ? info.participants.filter(isObject)
        : [];
      // 2) Limpiar identidades usando el puuid real (antes de sustituirlo).
      for (const participant of participants) {
        if (typeof participant.puuid === "string") {
          scrubParticipant(participant, participant.puuid);
        }
      }
      // 3) Sustituir todos los puuids del documento.
      return replacePuuids(copy) as JsonObject;
    },

    anonymizePlayerData(playerData: JsonObject): JsonObject {
      const challenges = Array.isArray(playerData.challenges)
        ? playerData.challenges.filter(
            (entry) =>
              isObject(entry) &&
              typeof entry.challengeId === "number" &&
              CHALLENGE_IDS.has(entry.challengeId),
          )
        : [];
      // Recorte: solo totalPoints, categoryPoints y los retos de Arena; sin `preferences`.
      const trimmed: JsonObject = {
        totalPoints: playerData.totalPoints ?? null,
        categoryPoints: playerData.categoryPoints ?? null,
        challenges,
      };
      return replacePuuids(trimmed) as JsonObject;
    },

    /** Puuids reales vistos (para la comprobación de fugas). Solo en memoria. */
    realPuuids: () => [...indexByPuuid.keys()],
    /** Nombres reales de terceros vistos (para la comprobación de fugas). Solo en memoria. */
    realThirdPartyNames: () => [...realGameNames],
  };
}

/**
 * Falla si en algún fichero serializado aparece un puuid real, un Riot ID de tercero, la key
 * o cualquier cadena con forma de puuid (>= 70 caracteres base64url). Nunca imprime los valores.
 */
export function assertNoLeaks(
  files: ReadonlyMap<string, string>,
  secrets: { puuids: string[]; names: string[]; apiKey: string },
): void {
  const problems: string[] = [];
  for (const [name, content] of files) {
    if (secrets.apiKey !== "" && content.includes(secrets.apiKey)) {
      problems.push(`${name}: contiene la key de Riot`);
    }
    if (content.includes("RGAPI-")) {
      problems.push(`${name}: contiene algo con forma de key de Riot`);
    }
    for (const puuid of secrets.puuids) {
      if (content.includes(puuid)) {
        problems.push(`${name}: contiene un puuid real`);
      }
    }
    for (const realName of secrets.names) {
      // Se busca el string JSON exacto para no dar falsos positivos por subcadenas.
      if (realName.length >= 3 && content.includes(JSON.stringify(realName))) {
        problems.push(`${name}: contiene un Riot ID de tercero`);
      }
    }
    if (/[A-Za-z0-9_-]{70,}/.test(content)) {
      problems.push(`${name}: contiene una cadena con forma de puuid`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `FUGA DE DATOS, no se escribe nada:\n  ${problems.join("\n  ")}`,
    );
  }
}

// --- Cliente Riot (secuencial, con tope de peticiones) ---

/** Error que obliga a parar sin reintentar (auth, rate limit, tope propio). */
class FatalRiotError extends Error {}

interface RiotResponse {
  status: number;
  body: Json;
}

function createRiotClient(apiKey: string) {
  let requests = 0;
  let lastRequestAt = 0;

  return {
    get requestCount() {
      return requests;
    },
    /** `label` es lo único que se loguea (la URL lleva puuids reales). */
    async get(
      url: string,
      label: string,
      okStatuses: number[] = [200],
    ): Promise<RiotResponse> {
      if (requests >= MAX_REQUESTS) {
        throw new FatalRiotError(
          `Tope de ${MAX_REQUESTS} peticiones alcanzado, abortando`,
        );
      }
      const wait = lastRequestAt + PAUSE_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

      requests++;
      lastRequestAt = Date.now();
      const response = await fetch(url, {
        headers: { "X-Riot-Token": apiKey },
      });
      console.log(
        `[${requests}/${MAX_REQUESTS}] ${label} -> ${response.status}`,
      );

      const text = await response.text();
      if ([401, 403, 429].includes(response.status)) {
        const retryAfter = response.headers.get("retry-after");
        throw new FatalRiotError(
          `Riot respondió ${response.status} en "${label}"${
            retryAfter ? ` (Retry-After ${retryAfter}s)` : ""
          }: se para sin reintentar`,
        );
      }
      let body: Json;
      try {
        body = JSON.parse(text) as Json;
      } catch {
        body = text;
      }
      if (!okStatuses.includes(response.status)) {
        throw new FatalRiotError(
          `Estado inesperado ${response.status} en "${label}"`,
        );
      }
      return { status: response.status, body };
    },
  };
}

// --- Flujo principal ---

function selfParticipant(match: JsonObject, selfPuuid: string) {
  const info = match.info;
  if (!isObject(info) || !Array.isArray(info.participants)) return undefined;
  return info.participants.find(
    (p): p is JsonObject => isObject(p) && p.puuid === selfPuuid,
  );
}

async function main() {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta RIOT_API_KEY (ejecutar con `npm run fixtures:record`, que carga .env.local)",
    );
  }
  const client = createRiotClient(apiKey);

  // 1) Cuenta.
  const accountRes = await client.get(
    `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(RIOT_ID.gameName)}/${encodeURIComponent(RIOT_ID.tagLine)}`,
    "account by-riot-id",
  );
  const account = accountRes.body;
  if (!isObject(account) || typeof account.puuid !== "string") {
    throw new Error("Respuesta de account sin puuid");
  }
  const selfPuuid = account.puuid;
  const anonymizer = createAnonymizer(selfPuuid);

  // 2) Ids de partidas Arena de la temporada.
  const idsRes = await client.get(
    `${REGIONAL_HOST}/lol/match/v5/matches/by-puuid/${selfPuuid}/ids?queue=${ARENA_QUEUE}&startTime=${START_TIME_S}&start=0&count=${IDS_COUNT}`,
    "match ids (queue 1750)",
  );
  const matchIds = idsRes.body;
  if (
    !Array.isArray(matchIds) ||
    !matchIds.every((id) => typeof id === "string")
  ) {
    throw new Error("Respuesta de ids inesperada");
  }
  const ids = matchIds as string[];

  // 3) Detalle en orden hasta tener >= 5 partidas y al menos un 1º puesto del jugador.
  const matches = new Map<string, JsonObject>();
  let hasFirstPlace = false;
  let detailRequests = 0;
  for (const id of ids) {
    if (matches.size >= MIN_MATCHES && hasFirstPlace) break;
    if (detailRequests >= MAX_MATCH_DETAILS) break;
    detailRequests++;
    const res = await client.get(
      `${REGIONAL_HOST}/lol/match/v5/matches/${id}`,
      `match ${id}`,
      [200, 404],
    );
    if (res.status === 404 || !isObject(res.body)) {
      console.warn(`  aviso: ${id} no disponible (404), se omite`);
      continue;
    }
    matches.set(id, res.body);
    if (selfParticipant(res.body, selfPuuid)?.placement === 1) {
      hasFirstPlace = true;
    }
  }

  // 4) Cuerpo real de un 404.
  const missing = await client.get(
    `${REGIONAL_HOST}/lol/match/v5/matches/${MISSING_MATCH_ID}`,
    `match ${MISSING_MATCH_ID} (404 esperado)`,
    [404],
  );

  // 5) Retos del jugador.
  const playerDataRes = await client.get(
    `${PLATFORM_HOST}/lol/challenges/v1/player-data/${selfPuuid}`,
    "challenges player-data",
  );
  if (!isObject(playerDataRes.body)) {
    throw new Error("Respuesta de player-data inesperada");
  }

  // --- Anonimizar, comprobar fugas y solo entonces escribir ---
  const output = new Map<string, string>();
  // Las partidas (~130 KB cada una) se escriben compactas; el resto con sangría para poder revisarlas.
  const serialize = (value: Json, compact = false) =>
    `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`;

  output.set("account.json", serialize(anonymizer.anonymizeAccount(account)));
  output.set("match-ids.json", serialize(ids));
  const anonMatches = new Map<string, JsonObject>();
  for (const [id, match] of matches) {
    const anon = anonymizer.anonymizeMatch(match);
    anonMatches.set(id, anon);
    output.set(`matches/${id}.json`, serialize(anon, true));
  }
  output.set(
    "match-404.json",
    serialize({ status: missing.status, body: missing.body }),
  );
  output.set(
    "player-data.json",
    serialize(anonymizer.anonymizePlayerData(playerDataRes.body)),
  );

  assertNoLeaks(output, {
    puuids: anonymizer.realPuuids(),
    names: anonymizer.realThirdPartyNames(),
    apiKey,
  });

  await rm(path.join(FIXTURES_DIR, "matches"), {
    recursive: true,
    force: true,
  });
  for (const [name, content] of output) {
    const target = path.join(FIXTURES_DIR, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  // Resumen (solo datos ya anonimizados) para documentar el README.
  console.log(`\nPeticiones a Riot: ${client.requestCount}/${MAX_REQUESTS}`);
  console.log(`Partidas grabadas: ${matches.size} (de ${ids.length} ids)`);
  for (const [id, anon] of anonMatches) {
    const info = anon.info as JsonObject;
    const participants = (info.participants as Json[]).filter(isObject);
    const me = participants.find((p) => p.puuid === SELF_ANON_PUUID);
    if (!me) continue;
    const mates = participants
      .filter(
        (p) =>
          p.playerSubteamId === me.playerSubteamId &&
          p.puuid !== SELF_ANON_PUUID,
      )
      .map((p) => String(p.puuid));
    console.log(
      `  ${id}: placement=${me.placement} champion=${me.championName}(${me.championId}) subteam=${me.playerSubteamId} companeros=[${mates.join(", ")}]`,
    );
  }
  if (!hasFirstPlace) {
    // No es un error: los tests de dominio sintetizan un 1º en memoria a partir de una partida real.
    console.warn(
      "Aviso: ninguna partida grabada con el jugador en 1º puesto (la muestra son las últimas partidas)",
    );
  }
}

// Solo se ejecuta al lanzarlo como script (no al importarlo desde una comprobación).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
