import { defineConfig } from "drizzle-kit";

// drizzle-kit no carga `.env.local`: se hace aquí (sin sobrescribir el entorno ni imprimir nada).
try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin `.env.local` (p. ej. en CI): se usa el entorno tal cual.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
