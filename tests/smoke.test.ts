import { describe, expect, it } from "vitest";

describe("entorno de tests", () => {
  it("usa la BD de tests y no la de desarrollo", () => {
    expect(process.env.DATABASE_URL).toMatch(/hylistats_test$/);
  });

  it("resuelve el alias @ hacia src", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("a", "b")).toBe("a b");
  });

  it("importa server-only sin lanzar (stub)", async () => {
    await expect(import("server-only")).resolves.toBeDefined();
  });
});
