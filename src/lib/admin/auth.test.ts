import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_TOKEN_MIN_LENGTH,
  adminSessionValue,
  checkAdminToken,
  isAdminBearer,
  isAdminConfigured,
  isAdminSession,
} from "./auth";

const TOKEN = "test-admin-token-1234567890-abcdef";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", TOKEN);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdminConfigured", () => {
  it("es true solo con un ADMIN_TOKEN no vacío", () => {
    expect(isAdminConfigured()).toBe(true);
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(isAdminConfigured()).toBe(false);
    vi.stubEnv("ADMIN_TOKEN", "   ");
    expect(isAdminConfigured()).toBe(false);
  });
});

describe("longitud mínima de ADMIN_TOKEN", () => {
  const short = "a".repeat(ADMIN_TOKEN_MIN_LENGTH - 1);
  const exact = "a".repeat(ADMIN_TOKEN_MIN_LENGTH);

  it("el mínimo es 32 caracteres", () => {
    expect(ADMIN_TOKEN_MIN_LENGTH).toBe(32);
  });

  it("con 31 caracteres cuenta como no configurado y rechaza todo aunque coincida", () => {
    vi.stubEnv("ADMIN_TOKEN", short);
    expect(isAdminConfigured()).toBe(false);
    expect(checkAdminToken(short)).toBe(false);
    expect(
      isAdminSession(
        createHmac("sha256", short).update("hylistats-admin").digest("hex"),
      ),
    ).toBe(false);
    expect(isAdminBearer(`Bearer ${short}`)).toBe(false);
    expect(() => adminSessionValue()).toThrow();
  });

  it("con 32 caracteres funciona", () => {
    vi.stubEnv("ADMIN_TOKEN", exact);
    expect(isAdminConfigured()).toBe(true);
    expect(checkAdminToken(exact)).toBe(true);
    expect(isAdminSession(adminSessionValue())).toBe(true);
    expect(isAdminBearer(`Bearer ${exact}`)).toBe(true);
  });

  it("los espacios en los extremos no cuentan para la longitud", () => {
    vi.stubEnv("ADMIN_TOKEN", `  ${short}  `);
    expect(isAdminConfigured()).toBe(false);
    vi.stubEnv("ADMIN_TOKEN", `  ${exact}  `);
    expect(isAdminConfigured()).toBe(true);
    expect(checkAdminToken(exact)).toBe(true);
  });
});

describe("checkAdminToken", () => {
  it("acepta el token correcto", () => {
    expect(checkAdminToken(TOKEN)).toBe(true);
  });

  it("rechaza tokens incorrectos, de otra longitud, vacíos o ausentes", () => {
    expect(checkAdminToken("test-admin-token-1234567890-abcdeg")).toBe(false);
    expect(checkAdminToken(TOKEN.slice(0, -1))).toBe(false);
    expect(checkAdminToken(`${TOKEN}extra`)).toBe(false);
    expect(checkAdminToken("")).toBe(false);
    expect(checkAdminToken(undefined)).toBe(false);
    expect(checkAdminToken(null)).toBe(false);
  });

  it("sin ADMIN_TOKEN configurado rechaza todo, incluso la cadena vacía", () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(checkAdminToken("")).toBe(false);
    expect(checkAdminToken(TOKEN)).toBe(false);
  });
});

describe("sesión de admin", () => {
  it("adminSessionValue es HMAC-SHA256 hex del token, estable y distinto del token", () => {
    const value = adminSessionValue();
    expect(value).toBe(
      createHmac("sha256", TOKEN).update("hylistats-admin").digest("hex"),
    );
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).not.toContain(TOKEN);
    expect(adminSessionValue()).toBe(value);

    vi.stubEnv("ADMIN_TOKEN", "otro-admin-token-1234567890-abcdef");
    expect(adminSessionValue()).not.toBe(value);
  });

  it("adminSessionValue lanza sin ADMIN_TOKEN", () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(() => adminSessionValue()).toThrow();
  });

  it("isAdminSession acepta solo el valor de la cookie vigente", () => {
    const value = adminSessionValue();
    expect(isAdminSession(value)).toBe(true);
    // Mismo largo, un carácter distinto.
    const flipped = `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;
    expect(isAdminSession(flipped)).toBe(false);
    expect(isAdminSession(value.slice(0, 32))).toBe(false);
    expect(isAdminSession(TOKEN)).toBe(false);
    expect(isAdminSession("")).toBe(false);
    expect(isAdminSession(undefined)).toBe(false);
  });

  it("una sesión emitida con otro token deja de valer al cambiar ADMIN_TOKEN", () => {
    const value = adminSessionValue();
    vi.stubEnv("ADMIN_TOKEN", "otro-admin-token-1234567890-abcdef");
    expect(isAdminSession(value)).toBe(false);
  });

  it("sin ADMIN_TOKEN ninguna sesión es válida", () => {
    const value = adminSessionValue();
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(isAdminSession(value)).toBe(false);
  });
});

describe("isAdminBearer", () => {
  it("acepta Authorization: Bearer <token> (esquema sin distinguir mayúsculas)", () => {
    expect(isAdminBearer(`Bearer ${TOKEN}`)).toBe(true);
    expect(isAdminBearer(`bearer ${TOKEN}`)).toBe(true);
  });

  it("rechaza token incorrecto, otro esquema, cabecera vacía o ausente", () => {
    expect(isAdminBearer("Bearer nope")).toBe(false);
    expect(isAdminBearer("Bearer ")).toBe(false);
    expect(isAdminBearer(`Basic ${TOKEN}`)).toBe(false);
    expect(isAdminBearer(TOKEN)).toBe(false);
    expect(isAdminBearer("")).toBe(false);
    expect(isAdminBearer(null)).toBe(false);
    expect(isAdminBearer(undefined)).toBe(false);
  });

  it("sin ADMIN_TOKEN configurado rechaza todo", () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(isAdminBearer("Bearer ")).toBe(false);
    expect(isAdminBearer(`Bearer ${TOKEN}`)).toBe(false);
  });
});
