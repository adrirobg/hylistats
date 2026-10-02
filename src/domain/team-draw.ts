// Sorteo de equipos (#19): se baraja a los jugadores y se reparten de 3 en 3 en el orden de salida,
// como hace el grupo con una ruleta: los 3 primeros forman el primer equipo y lo que sobra completa
// el último con desconocidos (1 → va solo; 2 → dúo con un desconocido). Sin BD ni estado: el sorteo
// lo hace una sola persona en su navegador y lo enseña.

/** Jugadores por equipo en Arena tríos (6 equipos de 3). */
export const ARENA_TEAM_SIZE = 3;

/** Equipo del sorteo: jugadores en el orden en que salieron y huecos que llena Riot con desconocidos. */
export interface DrawnTeam {
  players: string[];
  unknowns: number;
}

/**
 * Barajado uniforme (Fisher–Yates) que no toca la entrada. `random` devuelve un valor en [0, 1),
 * como `Math.random`; los tests lo inyectan.
 */
export function shuffle<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Reparte el orden de salida en equipos de `ARENA_TEAM_SIZE`; el último lleva los desconocidos. */
export function splitTeams(order: readonly string[]): DrawnTeam[] {
  const teams: DrawnTeam[] = [];
  for (let start = 0; start < order.length; start += ARENA_TEAM_SIZE) {
    const players = order.slice(start, start + ARENA_TEAM_SIZE);
    teams.push({ players, unknowns: ARENA_TEAM_SIZE - players.length });
  }
  return teams;
}

/** Nombre escrito a mano, sin espacios sobrantes. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Clave para detectar repetidos: sin distinguir mayúsculas. */
export function nameKey(name: string): string {
  return cleanName(name).toLocaleLowerCase("es");
}

export type AddNameResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

/** Valida un nombre escrito frente a los que ya están en la lista (miembros incluidos). */
export function validateName(
  raw: string,
  existing: readonly string[],
): AddNameResult {
  const name = cleanName(raw);
  if (name === "") return { ok: false, message: "Escribe un nombre" };
  const key = nameKey(name);
  if (existing.some((other) => nameKey(other) === key)) {
    return { ok: false, message: `${name} ya está en la lista` };
  }
  return { ok: true, name };
}
