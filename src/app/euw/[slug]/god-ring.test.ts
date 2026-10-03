import { describe, expect, it } from "vitest";
import { arenaGodState } from "@/domain/arena-god";
import { godMilestones, godRemaining, godRing } from "./god-ring";

const R = 50;
const C = 2 * Math.PI * R;
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

describe("godRing", () => {
  it("sin manuales: solo el arco de verificados", () => {
    const ring = godRing(state(30, 0, 30, 60), R);
    expect(ring.circumference).toBeCloseTo(C);
    expect(ring.verifiedLength).toBeCloseTo(C / 2);
    expect(ring.manualLength).toBe(0);
    expect(ring.officialAngle).toBeCloseTo(180);
    expect(ring.percent).toBe(50);
  });

  it("con manuales: el arco azul sigue al oro", () => {
    const ring = godRing(state(30, 15, 45, 60), R);
    expect(ring.verifiedLength).toBeCloseTo(C / 2);
    expect(ring.manualLength).toBeCloseTo(C / 4);
    expect(ring.percent).toBe(75);
  });

  it("los manuales no pasan de la vuelta completa", () => {
    const ring = godRing(state(50, 20, null, 60), R);
    expect(ring.verifiedLength + ring.manualLength).toBeCloseTo(C);
    expect(ring.manualLength).toBeCloseTo((C * 10) / 60);
    expect(ring.percent).toBe(100);
  });

  it("sin oficial: no hay marca", () => {
    expect(godRing(state(10, 0, null, 60), R).officialAngle).toBeNull();
  });

  it("oficial por encima de la meta: la marca se queda en la vuelta completa", () => {
    expect(godRing(state(40, 0, 80, 60), R).officialAngle).toBe(360);
  });

  it("total por encima de la meta: vuelta completa sin desbordar", () => {
    const ring = godRing(state(70, 0, 70, 60), R);
    expect(ring.verifiedLength).toBeCloseTo(C);
    expect(ring.manualLength).toBe(0);
    expect(ring.percent).toBe(100);
  });

  it("meta 60: sin hito de la Deidad en el anillo", () => {
    const ring = godRing(state(30, 0, 30, 60), R);
    expect(ring.milestoneAngle).toBeNull();
    expect(ring.milestoneCovered).toBe(false);
  });

  it("meta catálogo: hito de la Deidad en 60/173 de la vuelta", () => {
    const ring = godRing(state(75, 0, 75, 173), R);
    expect(ring.milestoneAngle).toBeCloseTo((60 / 173) * 360);
    expect(ring.milestoneCovered).toBe(true);
    expect(ring.percent).toBe(43);
  });

  it("meta catálogo con el arco aún antes del hito (Deidad por el oficial)", () => {
    expect(godRing(state(50, 0, 61, 173), R).milestoneCovered).toBe(false);
  });

  it("cero verificados: arcos vacíos y 0 %", () => {
    const ring = godRing(state(0, 0, 0, 60), R);
    expect(ring.verifiedLength).toBe(0);
    expect(ring.manualLength).toBe(0);
    expect(ring.officialAngle).toBe(0);
    expect(ring.percent).toBe(0);
  });

  it("cero verificados con manuales: el arco azul empieza a las 12", () => {
    const ring = godRing(state(0, 6, null, 60), R);
    expect(ring.verifiedLength).toBe(0);
    expect(ring.manualLength).toBeCloseTo(C / 10);
  });

  it("el 100 % solo con la meta cumplida", () => {
    expect(godRing(state(59, 0, 59, 60), R).percent).toBe(98);
    expect(godRing(state(172, 0, 172, 173), R).percent).toBe(99);
  });
});

describe("godRemaining", () => {
  it("lo que falta hasta la meta, nunca negativo", () => {
    expect(godRemaining({ total: 45, goal: 60 })).toBe(15);
    expect(godRemaining({ total: 75, goal: 60 })).toBe(0);
  });
});

describe("godMilestones", () => {
  it("antes de la Deidad: la meta final en tenue", () => {
    expect(godMilestones({ verified: 40, official: 40, goal: 60 })).toEqual([
      { label: "Deidad · 60", done: false, later: false },
      { label: "después, Dios", done: false, later: true },
    ]);
  });

  it("con la Deidad y meta catálogo: Deidad conseguida y Dios con su cifra", () => {
    expect(godMilestones({ verified: 75, official: 75, goal: 173 })).toEqual([
      { label: "Deidad · 60", done: true, later: false },
      { label: "Dios · 173", done: false, later: false },
    ]);
  });

  it("la Deidad cuenta el oficial aunque los verificados no lleguen", () => {
    expect(
      godMilestones({ verified: 50, official: 62, goal: 173 })[0]?.done,
    ).toBe(true);
  });

  it("Deidad conseguida sin catálogo (meta 60): Dios sin cifra", () => {
    expect(godMilestones({ verified: 65, official: null, goal: 60 })).toEqual([
      { label: "Deidad · 60", done: true, later: false },
      { label: "Dios", done: false, later: false },
    ]);
  });
});
