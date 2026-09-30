import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDecimal,
  formatPercent,
  formatRelative,
  formatShortDate,
} from "./format";

const NOW = Date.UTC(2026, 8, 29, 15, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it('menos de un minuto (o fecha futura) es "ahora"', () => {
    expect(formatRelative(NOW, NOW)).toBe("ahora");
    expect(formatRelative(NOW - 59_999, NOW)).toBe("ahora");
    expect(formatRelative(NOW + 5 * MIN, NOW)).toBe("ahora");
  });

  it("minutos, redondeando hacia abajo, hasta la hora", () => {
    expect(formatRelative(NOW - MIN, NOW)).toBe("hace 1 min");
    expect(formatRelative(NOW - 5 * MIN, NOW)).toBe("hace 5 min");
    expect(formatRelative(NOW - (HOUR - 1), NOW)).toBe("hace 59 min");
  });

  it("horas, redondeando hacia abajo, hasta el día", () => {
    expect(formatRelative(NOW - HOUR, NOW)).toBe("hace 1 h");
    expect(formatRelative(NOW - 2.9 * HOUR, NOW)).toBe("hace 2 h");
    expect(formatRelative(NOW - (DAY - 1), NOW)).toBe("hace 23 h");
  });

  it('entre 24 y 48 horas es "ayer"', () => {
    expect(formatRelative(NOW - DAY, NOW)).toBe("ayer");
    expect(formatRelative(NOW - (2 * DAY - 1), NOW)).toBe("ayer");
  });

  it("días desde el segundo hasta el 29", () => {
    expect(formatRelative(NOW - 2 * DAY, NOW)).toBe("hace 2 d");
    expect(formatRelative(NOW - 3.5 * DAY, NOW)).toBe("hace 3 d");
    expect(formatRelative(NOW - (30 * DAY - 1), NOW)).toBe("hace 29 d");
  });

  it("a partir de 30 días, fecha corta sin año si es el actual", () => {
    expect(formatRelative(Date.UTC(2026, 0, 12), NOW)).toBe("12 ene");
    // Justo en el límite de los 30 días (29-sep menos 30 d = 30-ago).
    expect(formatRelative(NOW - 30 * DAY, NOW)).toMatch(/^30 ago/);
  });

  it("con el año si es de otro año", () => {
    expect(formatRelative(Date.UTC(2025, 11, 5), NOW)).toBe("5 dic 2025");
  });

  it("la fecha corta va en UTC, no en la zona del proceso", () => {
    // 23:30 UTC del 12-ene: en zonas por delante de UTC ya sería el 13.
    expect(formatRelative(Date.UTC(2026, 0, 12, 23, 30), NOW)).toBe("12 ene");
  });
});

describe("formatShortDate", () => {
  it("fecha corta en UTC, sin año si es el actual y con año si no lo es", () => {
    expect(formatShortDate(Date.UTC(2026, 0, 12), NOW)).toBe("12 ene");
    expect(formatShortDate(Date.UTC(2025, 11, 5), NOW)).toBe("5 dic 2025");
  });

  it("no depende de cuánto hace: una fecha de ayer sigue siendo una fecha", () => {
    expect(formatShortDate(NOW - DAY, NOW)).toBe("28 sept");
  });

  it("va en UTC, no en la zona del proceso", () => {
    expect(formatShortDate(Date.UTC(2026, 0, 12, 23, 30), NOW)).toBe("12 ene");
  });
});

describe("formatDateTime", () => {
  it("UTC con hora y minutos", () => {
    expect(formatDateTime(new Date("2026-09-29T15:04:59.000Z"))).toBe(
      "2026-09-29 15:04 UTC",
    );
  });

  it("acepta ms desde epoch", () => {
    expect(formatDateTime(Date.UTC(2026, 0, 2, 3, 4))).toBe(
      "2026-01-02 03:04 UTC",
    );
  });

  it('sin fecha es "-"', () => {
    expect(formatDateTime(null)).toBe("-");
  });
});

describe("formatPercent", () => {
  it("proporción a porcentaje es-ES con 1 decimal por defecto", () => {
    expect(formatPercent(0.1837)).toBe("18,4 %");
    expect(formatPercent(0)).toBe("0,0 %");
    expect(formatPercent(1)).toBe("100,0 %");
  });

  it("admite otro número de decimales", () => {
    expect(formatPercent(0.1837, 0)).toBe("18 %");
    expect(formatPercent(0.1837, 2)).toBe("18,37 %");
  });
});

describe("formatDecimal", () => {
  it("coma decimal con 2 decimales por defecto", () => {
    expect(formatDecimal(3.1)).toBe("3,10");
    expect(formatDecimal(2)).toBe("2,00");
  });

  it("admite otro número de decimales", () => {
    expect(formatDecimal(1.23456, 1)).toBe("1,2");
    expect(formatDecimal(1.23456, 3)).toBe("1,235");
  });
});
