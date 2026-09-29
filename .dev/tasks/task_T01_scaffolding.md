# Task T01 — Scaffolding Next.js 16 + Postgres + tooling

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

App Next.js 16 en la raíz del repo con Tailwind 4, shadcn/ui, Biome, Vitest, dependencias de datos (Drizzle, pg, Zod, TanStack Query), Postgres local en `docker compose` (BD dev + BD test), `.env.example`, scripts npm y CI mínimo. `lint`, `typecheck`, `test` y `build` en verde.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (scaffolding), Entregable 1, AC1; "Decisiones técnicas del orquestador" (puerto 5433, BD `hylistats` y `hylistats_test`, env con `--env-file-if-exists`).
- `.dev/research/stack.md` §5 (comando propuesto y versiones de referencia) y §7 (secretos, `images.unoptimized`).
- El repo ya tiene `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.dev/`, `.claude/`: **no se sobrescriben**.

## Prompt / instrucciones para worker <!-- MUST -->

1. Genera el proyecto en un directorio temporal (el repo no está vacío): `npx create-next-app@latest <tmp>/hylistats --ts --tailwind --biome --app --src-dir --import-alias "@/*" --use-npm --turbopack --yes --skip-install --disable-git` (ajusta flags si el CLI de la versión instalada los rechaza). Copia su contenido a la raíz del repo sin `.git` ni `node_modules`.
   - `AGENTS.md`/`CLAUDE.md` generados: **no** reemplazan los del repo. Añade al final de `AGENTS.md` del repo una sección `## Next.js 16` con el aviso que trae el `AGENTS.md` generado (leer `node_modules/next/dist/docs/` antes de escribir código de Next). `CLAUDE.md` del repo no se toca.
   - `.gitignore`: fusiona (conserva las entradas existentes, añade las de Next). Asegura que `.env.local`/`.env*.local` quedan ignorados y que `.env.example` **sí** se versiona (`!.env.example` si hay un patrón `.env*`).
   - `README.md`: uno corto en español: qué es hylistats (1 línea), requisitos (Node, Docker), puesta en marcha (`docker compose up -d`, `cp .env.example .env.local`, `npm run db:migrate`, `npm run dev`), scripts.
2. `npm install`. Después shadcn: `npx shadcn@latest init -t next` (no interactivo; base color neutral) y `npx shadcn@latest add button card badge input tabs tooltip skeleton table chart`.
3. Dependencias: `npm i drizzle-orm pg zod @tanstack/react-query server-only` y `npm i -D drizzle-kit @types/pg vitest tsx`. No añadas otras sin justificarlo en el informe final.
4. `next.config.ts`: `images: { unoptimized: true }`. Nada más por ahora.
5. `docker-compose.yml` en la raíz: servicio `postgres` (imagen `postgres:17-alpine`), usuario/contraseña/BD `hylistats`, puerto host `5433:5432`, volumen con nombre, healthcheck `pg_isready`, y un script de init montado en `/docker-entrypoint-initdb.d/` que cree la BD `hylistats_test` (propietario `hylistats`).
6. `.env.example` con: `DATABASE_URL=postgres://hylistats:hylistats@localhost:5433/hylistats`, `DATABASE_URL_TEST=postgres://hylistats:hylistats@localhost:5433/hylistats_test`, `RIOT_API_KEY=`, `ADMIN_TOKEN=`, `SEASON_START=2026-05-12T00:00:00Z`, `WORKER_ENABLED=true`, cada una con un comentario de una línea.
7. Scripts npm: `dev`, `build`, `start` (los de Next), `lint` = `biome check .`, `format` = `biome format --write .`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`. Biome debe ignorar `.dev/`, `.claude/`, `drizzle/` (migraciones generadas), `src/components/ui/` (generado por shadcn) y `tests/fixtures/`.
8. `vitest.config.ts`: entorno `node`, alias `@` → `src`, `include: ['src/**/*.test.ts', 'tests/**/*.test.ts']`, alias del módulo `server-only` a un stub vacío `tests/stubs/server-only.ts` (en Node puro `server-only` lanza). `test.env.DATABASE_URL` = `process.env.DATABASE_URL_TEST ?? 'postgres://hylistats:hylistats@localhost:5433/hylistats_test'` para que los tests **nunca** usen la BD de desarrollo. `fileParallelism: false`. Los tests **no** cargan `.env.local`. Añade un test de humo `tests/smoke.test.ts`.
9. Sustituye la home de ejemplo (`src/app/page.tsx`) por un placeholder mínimo ("hylistats") y limpia assets de ejemplo no usados.
10. CI `.github/workflows/ci.yml` (push y pull_request): Node `lts/*`, servicio `postgres:17-alpine` con BD `hylistats_test` en el puerto 5433 del runner, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (con `DATABASE_URL_TEST`), `npm run build`.
11. Arranca Postgres (`docker compose up -d`) y comprueba que existen `hylistats` y `hylistats_test` (`docker compose exec postgres psql -U hylistats -l`).
12. Ejecuta `npm run lint && npm run typecheck && npm test && npm run build` hasta que pase.

## Criterios de aceptacion <!-- MUST -->

- [ ] `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` en verde.
- [ ] `docker compose up -d` deja Postgres sano con `hylistats` y `hylistats_test` en el puerto 5433.
- [ ] `AGENTS.md` y `CLAUDE.md` del repo conservados (solo se añade la sección Next.js 16 a `AGENTS.md`).
- [ ] `.env.example` versionable y `.env.local` ignorado (`git check-ignore`).
- [ ] Dependencias = las de `stack.md` §5 + `server-only`.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
