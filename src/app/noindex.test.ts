import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import robots from "./robots";

describe("noindex y descargo de Riot", () => {
  it("robots() debe devolver disallow: '/' para todos los user agents", () => {
    const result = robots();

    // Validar que robots devuelve la estructura esperada
    expect(result).toBeDefined();
    expect(result.rules).toBeDefined();

    // Validar que disallow es '/'
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const defaultRule = rules.find(
      (r) => r.userAgent === "*" || Array.isArray(r.userAgent),
    );

    expect(defaultRule).toBeDefined();
    expect(defaultRule?.disallow).toBe("/");
  });

  it("nextConfig.headers() debe incluir X-Robots-Tag header para todas las rutas", async () => {
    // nextConfig es un objeto con una función headers() async
    if (!nextConfig.headers) {
      throw new Error("nextConfig no tiene headers");
    }

    const headers = await nextConfig.headers();

    // Buscar la regla para /:path*
    const headerRule = headers.find((h) => h.source === "/:path*");

    expect(headerRule).toBeDefined();
    expect(headerRule?.headers).toBeDefined();

    // Buscar el header X-Robots-Tag
    const robotsHeader = headerRule?.headers?.find(
      (h) => h.key.toLowerCase() === "x-robots-tag",
    );

    expect(robotsHeader).toBeDefined();
    expect(robotsHeader?.value).toBe("noindex, nofollow");
  });
});
