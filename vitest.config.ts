import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // `server-only` lanza fuera de un bundle de Next; en tests se sustituye por un stub vacío.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Los tests con BD comparten una única base de datos: se ejecutan en serie.
    fileParallelism: false,
    // Los tests no cargan `.env.local` (no ven la key de Riot) y nunca usan la BD de desarrollo.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        "postgres://hylistats:hylistats@localhost:5433/hylistats_test",
    },
  },
});
