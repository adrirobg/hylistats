/**
 * Prioridad de una petición (menor número = más urgente):
 * `0` interactivo (el usuario espera), `1` listado de ids, `2` detalle de partida.
 */
export type Priority = 0 | 1 | 2;

export const PRIORITY = { interactive: 0, list: 1, detail: 2 } as const;

const PRIORITY_LEVELS = 3;

/** Como mucho `limit` peticiones en cualquier ventana deslizante de `windowMs`. */
export interface RateWindow {
  limit: number;
  windowMs: number;
}

/**
 * Límites de la Personal/development key (`100:120,20:1` por host) con un 10 % de margen:
 * el margen absorbe refrescos interactivos y la deriva entre nuestro reloj y el de Riot.
 */
export const DEFAULT_WINDOWS: readonly RateWindow[] = [
  { limit: 18, windowMs: 1_000 },
  { limit: 90, windowMs: 120_000 },
];

export interface HostLimiterOptions {
  windows?: readonly RateWindow[];
  /** Reloj en epoch ms (inyectable en tests). */
  now?: () => number;
  /** Espera `ms` milisegundos (inyectable en tests). */
  sleep?: (ms: number) => Promise<void>;
}

/** Lo único que el cliente necesita de un limitador (facilita los dobles de test). */
export interface Limiter {
  acquire(priority: Priority): Promise<void>;
  blockUntil(epochMs: number): void;
}

/** `sleep` real (por defecto del limitador y del cliente). */
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Limitador de un host de Riot: ventanas deslizantes (log de timestamps) y cola por prioridad.
 *
 * - `acquire(priority)` se resuelve cuando hay hueco en TODAS las ventanas y el host no está
 *   bloqueado; al resolverse ya cuenta como petición enviada.
 * - Cola por prioridad; FIFO dentro de cada prioridad. Al liberarse un hueco se sirve siempre
 *   la prioridad más urgente que esté esperando (una petición interactiva adelanta a las de
 *   un backfill que ya llevan tiempo en cola).
 * - `blockUntil(epochMs)` congela el host (p. ej. tras un 429 con `Retry-After`).
 */
export class HostLimiter implements Limiter {
  private readonly windows: readonly RateWindow[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  // Instantes de concesión, en orden ascendente; se podan por la ventana más larga.
  private timestamps: number[] = [];
  private readonly maxWindowMs: number;
  private readonly queues: Array<Array<() => void>> = Array.from(
    { length: PRIORITY_LEVELS },
    () => [],
  );
  private blockedUntil = 0;
  private pumping = false;

  constructor(options: HostLimiterOptions = {}) {
    this.windows = options.windows ?? DEFAULT_WINDOWS;
    if (this.windows.length === 0) {
      throw new RangeError("HostLimiter necesita al menos una ventana");
    }
    for (const { limit, windowMs } of this.windows) {
      if (!Number.isInteger(limit) || limit < 1 || !(windowMs > 0)) {
        throw new RangeError(
          `Ventana inválida: limit=${limit}, windowMs=${windowMs}`,
        );
      }
    }
    this.maxWindowMs = Math.max(...this.windows.map((w) => w.windowMs));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleep;
  }

  /** Peticiones esperando hueco (todas las prioridades). */
  get pending(): number {
    return this.queues.reduce((total, queue) => total + queue.length, 0);
  }

  /** Bloquea el host hasta `epochMs`; nunca acorta un bloqueo ya existente. */
  blockUntil(epochMs: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, epochMs);
  }

  acquire(priority: Priority): Promise<void> {
    const queue = this.queues[priority];
    if (!queue) {
      return Promise.reject(new RangeError(`Prioridad inválida: ${priority}`));
    }
    return new Promise<void>((resolve) => {
      queue.push(resolve);
      void this.pump();
    });
  }

  /** Milisegundos hasta que haya hueco en todas las ventanas (0 = ya). */
  private waitTime(now: number): number {
    let wait = Math.max(0, this.blockedUntil - now);
    const count = this.timestamps.length;
    for (const { limit, windowMs } of this.windows) {
      // La `limit`-ésima concesión más reciente marca cuándo se libera un hueco.
      const index = count - limit;
      if (index >= 0) {
        const releaseAt = (this.timestamps[index] as number) + windowMs;
        if (releaseAt > now) wait = Math.max(wait, releaseAt - now);
      }
    }
    return wait;
  }

  private next(): (() => void) | undefined {
    for (const queue of this.queues) {
      const grant = queue.shift();
      if (grant) return grant;
    }
    return undefined;
  }

  // Un único bucle sirve la cola: duerme hasta que haya hueco y entonces concede la prioridad
  // más urgente. Se reevalúa tras cada espera, así que `blockUntil` y los recién llegados se
  // tienen en cuenta aunque lleguen mientras duerme.
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pending > 0) {
        const now = this.now();
        const wait = this.waitTime(now);
        if (wait > 0) {
          await this.sleep(wait);
          continue;
        }
        const last = this.timestamps[this.timestamps.length - 1] ?? now;
        // El reloj del sistema puede retroceder: el log debe seguir ordenado.
        this.timestamps.push(Math.max(now, last));
        const cutoff = now - this.maxWindowMs;
        while (
          this.timestamps.length > 0 &&
          (this.timestamps[0] as number) <= cutoff
        ) {
          this.timestamps.shift();
        }
        this.next()?.();
      }
    } finally {
      this.pumping = false;
    }
  }
}
