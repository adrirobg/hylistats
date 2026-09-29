import type { MetadataRoute } from "next";

// Web no publicitada (F9): se bloquea el rastreo. Ver también X-Robots-Tag en next.config.ts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
