import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Helpers para tests del cliente Riot y de lo que lo consume (ingesta, worker): reloj falso
// determinista y acceso a los fixtures de `tests/fixtures/`. Sin red ni key.

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

/** Contenido de un fixture tal cual está en disco (p. ej. `account.json`, `matches/<id>.json`). */
export function readFixtureText(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

export function readFixtureJson<T = unknown>(name: string): T {
  return JSON.parse(readFixtureText(name)) as T;
}

/** Ids de las partidas grabadas en `tests/fixtures/matches/`, ordenados. */
export function listMatchFixtureIds(): string[] {
  return readdirSync(path.join(FIXTURES_DIR, "matches"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
}

/**
 * Reloj falso para `now`/`sleep` inyectables. `sleep(ms)` cede un macrotask (para que quien
 * esperaba una concesión vea la hora en que se concedió) y después avanza el reloj hasta
 * `inicio + ms`; sueños solapados no suman.
 */
export function createFakeClock(start = 1_800_000_000_000) {
  let current = start;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number): Promise<void> => {
      sleeps.push(ms);
      const target = current + ms;
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (target > current) current = target;
    },
    /** Duraciones pedidas a `sleep`, en orden. */
    sleeps,
    /** Avanza el reloj sin pasar por `sleep`. */
    advance: (ms: number) => {
      current += ms;
    },
  };
}
export type FakeClock = ReturnType<typeof createFakeClock>;
