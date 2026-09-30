// Riot ID <-> slug de URL (`/euw/{nombre}-{tag}`) y lo que teclea el usuario. Módulo puro, sin BD
// ni servidor: lo importan también los componentes cliente y el worker (`src/worker/queue.ts`
// re-exporta `normalizeRiotId` desde aquí para no arrastrar la capa de BD a los bundles de cliente).

export interface RiotId {
  gameName: string;
  tagLine: string;
}

const GAME_NAME_MIN = 3;
const GAME_NAME_MAX = 16;
// Alfanuméricos Unicode: los tags de otras regiones no siempre son ASCII.
const TAG_LINE = /^[\p{L}\p{N}]{2,5}$/u;
// Un carácter de control (p. ej. NUL, que Postgres no admite en `text`) nunca es un nombre real.
const CONTROL_CHARS = /\p{Cc}/u;

/** Identidad primaria del perfil: `lower(gameName)#lower(tagLine)`, sin espacios en los extremos. */
export function normalizeRiotId(gameName: string, tagLine: string): string {
  return `${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}`;
}

/** Recorta y valida (nombre 3–16 caracteres, tag 2–5 alfanuméricos); `null` si no es un Riot ID. */
export function toRiotId(gameName: string, tagLine: string): RiotId | null {
  const name = gameName.trim();
  const tag = tagLine.trim();
  const length = [...name].length; // caracteres, no unidades UTF-16
  if (length < GAME_NAME_MIN || length > GAME_NAME_MAX) return null;
  if (CONTROL_CHARS.test(name)) return null;
  if (!TAG_LINE.test(tag)) return null;
  return { gameName: name, tagLine: tag };
}

/**
 * `{nombre}-{tag}` de la URL -> Riot ID. Decodifica el slug y separa por el ÚLTIMO `-` (el
 * nombre puede llevar guiones; el tag nunca). `null` si el slug no es un Riot ID válido.
 */
export function parseProfileSlug(slug: string): RiotId | null {
  let text: string;
  try {
    text = decodeURIComponent(slug);
  } catch {
    return null; // `%` mal formado o UTF-8 inválido
  }
  const at = text.lastIndexOf("-");
  if (at < 0) return null;
  return toRiotId(text.slice(0, at), text.slice(at + 1));
}

/** Riot ID -> segmento de URL (`{nombre}-{tag}` codificado). Inverso de `parseProfileSlug`. */
export function profileSlug(gameName: string, tagLine: string): string {
  return encodeURIComponent(`${gameName.trim()}-${tagLine.trim()}`);
}

/** `Nombre#TAG` (lo que se teclea en el buscador) -> Riot ID; separa por el último `#`. */
export function parseRiotId(input: string): RiotId | null {
  const at = input.lastIndexOf("#");
  if (at < 0) return null;
  return toRiotId(input.slice(0, at), input.slice(at + 1));
}

export type RiotIdInputError = "empty" | "format" | "region";
export type RiotIdInputResult =
  | { ok: true; riotId: RiotId }
  | { ok: false; reason: RiotIdInputError };

// Host de op.gg (con o sin `https://`, con o sin `www.`) seguido del resto de la URL. Sin `#` como
// delimitador: `op.gg#EUW` es un Riot ID válido, no una URL.
const OPGG_URL = /^(?:https?:\/\/)?(?:www\.)?op\.gg(?:[/?]|$)(.*)$/i;
// Cualquier otra URL con esquema: no es un Riot ID ni una URL de op.gg.
const OTHER_URL = /^[a-z][a-z\d+.-]*:\/\//i;
// Región de op.gg (`euw`, `eune`, `na`, `kr`, `oce`...): letras y, como mucho, un dígito final.
const REGION = /^[a-z]{2,5}\d?$/i;

/**
 * Lo que se teclea o pega en el buscador -> Riot ID. Acepta `Nombre#TAG`, `Nombre-TAG` (último
 * `-`, el nombre puede llevar guiones) y la URL de un perfil de op.gg
 * (`op.gg/lol/summoners/euw/Nombre-TAG`, con o sin idioma, sufijos o query). La región es fija
 * (EUW): una URL de op.gg de otra región devuelve `region`; el resto de fallos, `format`.
 */
export function parseRiotIdInput(input: string): RiotIdInputResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };

  const url = OPGG_URL.exec(text);
  if (url) return parseOpggPath(url[1]);
  if (OTHER_URL.test(text)) return { ok: false, reason: "format" };

  const riotId = text.includes("#") ? parseRiotId(text) : parseDashed(text);
  return riotId ? { ok: true, riotId } : { ok: false, reason: "format" };
}

/** `Nombre-TAG` tecleado (sin decodificar: aquí `%` es un carácter más). */
function parseDashed(text: string): RiotId | null {
  const at = text.lastIndexOf("-");
  if (at < 0) return null;
  return toRiotId(text.slice(0, at), text.slice(at + 1));
}

/** Ruta de op.gg (`[es/][lol/]summoners/{región}/{slug}[/sufijo]`, sin host) -> Riot ID EUW. */
function parseOpggPath(rest: string): RiotIdInputResult {
  const path = rest.split(/[?#]/)[0];
  const segments = path.split("/").filter(Boolean);
  const at = segments.findIndex((s) => s.toLowerCase() === "summoners");
  if (at < 0) return { ok: false, reason: "format" };
  const region = segments[at + 1];
  const slug = segments[at + 2];
  if (!region || !slug || !REGION.test(region)) {
    return { ok: false, reason: "format" };
  }
  if (region.toLowerCase() !== "euw") return { ok: false, reason: "region" };
  const riotId = parseProfileSlug(slug);
  return riotId ? { ok: true, riotId } : { ok: false, reason: "format" };
}

/** Mensaje en español para la UI del fallo de `parseRiotIdInput`. */
export function riotIdInputError(reason: RiotIdInputError): string {
  switch (reason) {
    case "empty":
      return "Escribe tu Riot ID con el formato Nombre#TAG.";
    case "format":
      return "Riot ID no válido. Usa el formato Nombre#TAG (también Nombre-TAG o la URL de op.gg): el nombre tiene de 3 a 16 caracteres y el tag de 2 a 5 letras o números.";
    case "region":
      return "Solo EUW: hylistats todavía no admite otras regiones.";
  }
}
