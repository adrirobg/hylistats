import { describe, expect, it } from "vitest";
import { createFakeClock } from "../../../tests/helpers/riot";
import {
  DEFAULT_WINDOWS,
  HostLimiter,
  type HostLimiterOptions,
  type Priority,
} from "./limiter";

function setup(options: Pick<HostLimiterOptions, "windows"> = {}) {
  const clock = createFakeClock();
  const limiter = new HostLimiter({
    ...options,
    now: clock.now,
    sleep: clock.sleep,
  });
  const start = clock.now();
  /** Pide un hueco y devuelve cuántos ms después del inicio se concedió. */
  const grantedAt = async (priority: Priority) => {
    await limiter.acquire(priority);
    return clock.now() - start;
  };
  return { clock, limiter, start, grantedAt };
}

describe("HostLimiter", () => {
  it("por defecto deja un 10 % de margen sobre 20/1 s y 100/120 s", () => {
    expect(DEFAULT_WINDOWS).toEqual([
      { limit: 18, windowMs: 1_000 },
      { limit: 90, windowMs: 120_000 },
    ]);
  });

  it("concede 18 peticiones seguidas y la 19ª espera a que acabe el segundo", async () => {
    const { grantedAt } = setup();
    const times = await Promise.all(
      Array.from({ length: 19 }, () => grantedAt(2)),
    );
    expect(times.slice(0, 18)).toEqual(Array(18).fill(0));
    expect(times[18]).toBe(1_000);
  });

  it("no supera 90 peticiones en 120 s: la 91ª espera a que caduque la primera", async () => {
    const { grantedAt } = setup();
    const times = await Promise.all(
      Array.from({ length: 91 }, () => grantedAt(2)),
    );
    // 90 en ráfagas de 18 por segundo; la 91ª, cuando sale la primera de la ventana de 120 s.
    expect(Math.max(...times.slice(0, 90))).toBe(4_000);
    expect(times[90]).toBe(120_000);
    // En ninguna ventana de 120 s hay más de 90 concesiones.
    for (let i = 90; i < times.length; i++) {
      expect(
        (times[i] as number) - (times[i - 90] as number),
      ).toBeGreaterThanOrEqual(120_000);
    }
  });

  it("aplica también la ventana de 1 s durante un backfill largo", async () => {
    const { grantedAt } = setup();
    const times = await Promise.all(
      Array.from({ length: 200 }, () => grantedAt(2)),
    );
    for (let i = 18; i < times.length; i++) {
      expect(
        (times[i] as number) - (times[i - 18] as number),
      ).toBeGreaterThanOrEqual(1_000);
    }
  });

  it("sirve antes la prioridad más urgente y en FIFO dentro de cada prioridad", async () => {
    const { limiter, clock, start } = setup({
      windows: [{ limit: 1, windowMs: 1_000 }],
    });
    await limiter.acquire(2); // ocupa el único hueco
    const order: string[] = [];
    const request = (label: string, priority: Priority) =>
      limiter.acquire(priority).then(() => {
        order.push(`${label}@${clock.now() - start}`);
      });
    await Promise.all([
      request("detalle-a", 2),
      request("listado-a", 1),
      request("detalle-b", 2),
      request("interactivo-a", 0),
      request("interactivo-b", 0),
      request("listado-b", 1),
    ]);
    expect(order).toEqual([
      "interactivo-a@1000",
      "interactivo-b@2000",
      "listado-a@3000",
      "listado-b@4000",
      "detalle-a@5000",
      "detalle-b@6000",
    ]);
  });

  it("una petición interactiva adelanta a las de detalle que ya esperaban", async () => {
    const { limiter } = setup({ windows: [{ limit: 1, windowMs: 1_000 }] });
    await limiter.acquire(2);
    const order: string[] = [];
    const details = [1, 2, 3].map((n) =>
      limiter.acquire(2).then(() => order.push(`detalle-${n}`)),
    );
    const interactive = limiter
      .acquire(0)
      .then(() => order.push("interactivo"));
    await Promise.all([...details, interactive]);
    expect(order).toEqual([
      "interactivo",
      "detalle-1",
      "detalle-2",
      "detalle-3",
    ]);
  });

  it("blockUntil retrasa las concesiones hasta el instante indicado", async () => {
    const { limiter, start, grantedAt } = setup();
    limiter.blockUntil(start + 5_000);
    expect(await grantedAt(0)).toBe(5_000);
    // Pasado el bloqueo vuelve a funcionar con normalidad (hay hueco en las ventanas).
    expect(await grantedAt(0)).toBe(5_000);
  });

  it("blockUntil llamado mientras una petición espera alarga la espera", async () => {
    const { limiter, start, grantedAt } = setup({
      windows: [{ limit: 1, windowMs: 1_000 }],
    });
    await limiter.acquire(1);
    const pending = grantedAt(1); // esperaría 1 000 ms por la ventana
    limiter.blockUntil(start + 5_000);
    expect(await pending).toBe(5_000);
  });

  it("blockUntil no acorta un bloqueo existente ni afecta a un instante pasado", async () => {
    const { limiter, start, grantedAt } = setup();
    limiter.blockUntil(start + 3_000);
    limiter.blockUntil(start + 1_000);
    limiter.blockUntil(start - 10_000);
    expect(await grantedAt(1)).toBe(3_000);
  });

  it("cuenta las peticiones en espera", async () => {
    const { limiter } = setup({ windows: [{ limit: 1, windowMs: 1_000 }] });
    await limiter.acquire(2);
    const waiting = [limiter.acquire(2), limiter.acquire(0)];
    expect(limiter.pending).toBe(2);
    await Promise.all(waiting);
    expect(limiter.pending).toBe(0);
  });

  it("rechaza ventanas y prioridades inválidas", async () => {
    expect(() => new HostLimiter({ windows: [] })).toThrow(RangeError);
    expect(
      () => new HostLimiter({ windows: [{ limit: 0, windowMs: 1_000 }] }),
    ).toThrow(RangeError);
    expect(
      () => new HostLimiter({ windows: [{ limit: 1, windowMs: 0 }] }),
    ).toThrow(RangeError);
    await expect(
      new HostLimiter().acquire(7 as unknown as Priority),
    ).rejects.toThrow(RangeError);
  });
});
