import { describe, expect, it } from "vitest";
import { arenaGodState } from "@/domain/arena-god";
import { godBar, godRemaining } from "./god-bar";

const ids = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + i);

/** Estado del dominio con N verificados y M manuales distintos. */
const state = (
  verified: number,
  manual: number,
  official: number | null,
  goal: number,
) =>
  arenaGodState({
    verifiedIds: ids(1, verified),
    manualIds: ids(1000, manual),
    official,
    goal,
  });

describe("godBar", () => {
  it("sin manuales: la capa de manuales acaba donde el oro", () => {
    const bar = godBar(state(30, 0, 30, 60));
    expect(bar.verified).toBeCloseTo(50);
    expect(bar.total).toBeCloseTo(50);
    expect(bar.official).toBeCloseTo(50);
    expect(bar.percent).toBe(50);
  });

  it("con manuales: el azul sigue al oro", () => {
    const bar = godBar(state(30, 15, 45, 60));
    expect(bar.verified).toBeCloseTo(50);
    expect(bar.total).toBeCloseTo(75);
    expect(bar.percent).toBe(75);
  });

  it("los manuales no pasan del final", () => {
    const bar = godBar(state(50, 20, null, 60));
    expect(bar.verified).toBeCloseTo((50 / 60) * 100);
    expect(bar.total).toBe(100);
    expect(bar.percent).toBe(100);
  });

  it("sin oficial: no hay marca", () => {
    expect(godBar(state(10, 0, null, 60)).official).toBeNull();
  });

  it("oficial por encima de la meta: la marca se queda al final", () => {
    expect(godBar(state(40, 0, 80, 60)).official).toBe(100);
  });

  it("total por encima de la meta: barra llena sin desbordar", () => {
    const bar = godBar(state(70, 0, 70, 60));
    expect(bar.verified).toBe(100);
    expect(bar.total).toBe(100);
    expect(bar.percent).toBe(100);
  });

  it("meta 60: la Deidad es el final", () => {
    const bar = godBar(state(30, 0, 30, 60));
    expect(bar.godGoal).toBe(false);
    expect(bar.deity).toBe(100);
    expect(bar.deityReached).toBe(false);
  });

  it("meta catálogo: la Deidad en 60/173 del ancho, conseguida", () => {
    const bar = godBar(state(75, 0, 75, 173));
    expect(bar.godGoal).toBe(true);
    expect(bar.deity).toBeCloseTo((60 / 173) * 100);
    expect(bar.deityReached).toBe(true);
    expect(bar.percent).toBe(43);
  });

  it("la Deidad cuenta el oficial aunque los verificados no lleguen", () => {
    const bar = godBar(state(50, 0, 61, 173));
    expect(bar.deityReached).toBe(true);
    expect(bar.total).toBeLessThan(bar.deity);
  });

  it("los manuales no dan la Deidad", () => {
    expect(godBar(state(50, 15, null, 60)).deityReached).toBe(false);
  });

  it("cero verificados: capas vacías y 0 %", () => {
    const bar = godBar(state(0, 0, 0, 60));
    expect(bar.verified).toBe(0);
    expect(bar.total).toBe(0);
    expect(bar.official).toBe(0);
    expect(bar.percent).toBe(0);
  });

  it("cero verificados con manuales: el azul empieza en el 0", () => {
    const bar = godBar(state(0, 6, null, 60));
    expect(bar.verified).toBe(0);
    expect(bar.total).toBeCloseTo(10);
  });

  it("el 100 % solo con la meta cumplida", () => {
    expect(godBar(state(59, 0, 59, 60)).percent).toBe(98);
    expect(godBar(state(172, 0, 172, 173)).percent).toBe(99);
  });
});

describe("godRemaining", () => {
  it("lo que falta hasta la meta, nunca negativo", () => {
    expect(godRemaining({ total: 45, goal: 60 })).toBe(15);
    expect(godRemaining({ total: 75, goal: 60 })).toBe(0);
  });
});
