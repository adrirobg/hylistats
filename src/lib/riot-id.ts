// Riot ID <-> slug de URL (`/euw/{nombre}-{tag}`). Módulo puro, sin BD ni servidor: lo importan
// también los componentes cliente. La identidad de un perfil (`lower(nombre)#lower(tag)`) sigue
// en `normalizeRiotId` (`src/worker/queue.ts`): no se duplica aquí para no arrastrar la capa de
// BD a los bundles de cliente.

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

/** Recorta y valida (nombre 3–16 caracteres, tag 2–5 alfanuméricos); `null` si no es un Riot ID. */
function toRiotId(gameName: string, tagLine: string): RiotId | null {
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
