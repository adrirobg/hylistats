# Task T02 — Esquema de BD, migraciones y db:reset

**Owner**: worker:sonnet
**Estado**: in_progress *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Esquema Drizzle con `profiles`, `matches`, `participants`, `sync_jobs`, `match_fetch` y `settings`, migraciones versionadas, cliente de BD con pool pequeño, scripts `db:generate`, `db:migrate` y `db:reset`, y helpers de BD para tests.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (esquema), Entregable 2, "Decisiones técnicas" (cola: `sync_jobs.match_ids`; `match_fetch` único global).
- `.dev/research/sync-strategy.md` §2 (estados de `sync_jobs`/`match_fetch`) y §4 (qué se guarda).
- `.dev/research/stack.md` §7 (pool `pg` máx. ~5) y §7.1 (tabla `settings`, `db:reset` conserva `settings`).
- skill `riot-api` (`.claude/skills/riot-api/SKILL.md`), sección "Leer los campos Arena".

## Prompt / instrucciones para worker <!-- MUST -->

1. `src/db/schema.ts` (Drizzle, `pg-core`). Timestamps `timestamptz` con `defaultNow()`. Timestamps de Riot en ms como `bigint({ mode: 'number' })`.
   - `profiles`: `id` serial PK; `region` text not null default `'euw'`; `gameName`, `tagLine` text not null (forma canónica devuelta por Account-V1 una vez resuelto; al registrar, la tecleada); `riotIdNorm` text not null **unique** (`lower(gameName) + '#' + lower(tagLine)`); `puuid` text null unique; `status` text not null default `'resolving'` (`resolving` | `active` | `not_found`); `challengeValue` double null, `challengeLevel` text null, `challengeCheckedAt` timestamptz null (challenge 602002); `lastSyncedAt` timestamptz null; `createdAt`, `updatedAt`.
   - `matches`: `matchId` text PK; `queueId` int; `gameCreation`, `gameStartTimestamp`, `gameEndTimestamp` bigint ms; `gameDuration` int (s); `gameVersion` text; `endOfGameResult` text null; `rawGz` bytea null (JSON crudo gzip; define un `customType` bytea ↔ `Buffer`); `fetchedAt`.
   - `participants`: PK compuesta (`matchId`, `puuid`); `matchId` FK → `matches` on delete cascade; `participantId` int; `riotIdGameName`, `riotIdTagline` text; `championId` int; `championName` text; `placement` int; `playerSubteamId` int; `win` boolean; `augments` int[] (playerAugment1..6, con 0 = vacío); `items` int[] (item0..item6); `kills`, `deaths`, `assists`, `totalDamageDealtToChampions`, `goldEarned`, `champLevel` int. Índice por `puuid`.
   - `sync_jobs`: `id` serial PK; `profileId` FK → `profiles` on delete cascade; `kind` text (`backfill` | `incremental`); `interactive` boolean default false; `status` text (`pending` | `listing` | `fetching` | `done` | `error`); `matchIds` text[] not null default `{}` (orden más reciente primero); `totalIds` int default 0; `fetched` int default 0; `listCursor` int default 0; `attempts` int default 0; `lastError` text null; `nextRunAt` timestamptz null; `lastServedAt` timestamptz null (round-robin); `createdAt`, `updatedAt`, `startedAt` null, `finishedAt` null. Índice único parcial: un solo job activo por perfil (`status` in pending/listing/fetching). Índice por `status`.
   - `match_fetch`: `matchId` text PK; `status` text (`pending` | `done` | `missing` | `error`) default `pending`; `attempts` int default 0; `nextAttemptAt` timestamptz null; `lastError` text null; `createdAt`, `updatedAt`.
   - `settings`: fila única (`id` int PK con check `id = 1`); `riotApiKey` text null; `keyStatus` text not null default `'unknown'` (`unknown` | `ok` | `invalid`); `keyStatusSince` timestamptz null; `keyStatusReason` text null; `updatedAt`.
   - Exporta tipos `$inferSelect`/`$inferInsert` de cada tabla.
2. `drizzle.config.ts`: dialecto `postgresql`, `schema: './src/db/schema.ts'`, `out: './drizzle'`, `dbCredentials.url` desde `process.env.DATABASE_URL` (carga `.env.local` con `process.loadEnvFile` si existe, dentro de try/catch; **nunca** imprimas variables).
3. Genera la migración inicial con `drizzle-kit generate` (commitable en `drizzle/`). Añade en la migración (o una segunda, custom) el `INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING`.
4. `src/db/index.ts`: `getDb()` perezoso (no conecta al importar, para que `next build` no necesite BD), `Pool` de `pg` con `max: 5` desde `DATABASE_URL`, singleton en `globalThis` (sobrevive a HMR y a bundles distintos de Next). Exporta el tipo `Db`. Sin `server-only` aquí (lo importan scripts y tests).
5. `scripts/migrate.ts` (migrator de `drizzle-orm/node-postgres`, URL de `DATABASE_URL` o `--url`) y `scripts/db-reset.ts` (TRUNCATE `participants`, `matches`, `match_fetch`, `sync_jobs`, `profiles` RESTART IDENTITY CASCADE; conserva `settings` y migraciones; exige `--yes`). Scripts npm: `db:generate`, `db:migrate` y `db:reset` con `tsx --env-file-if-exists=.env.local`; `db:migrate:test` que migra `DATABASE_URL_TEST` (por defecto `postgres://hylistats:hylistats@localhost:5433/hylistats_test`).
6. Tests: `tests/global-setup.ts` (registrado en `vitest.config.ts` como `globalSetup`) que aplica migraciones a la BD de test; `tests/helpers/db.ts` con `getTestDb()` y `truncateAll()` (no borra la fila de `settings`; la devuelve a valores por defecto). Test `tests/db/schema.test.ts`: insertar/leer un perfil, unicidad de `riotIdNorm`, PK de `participants` (insertar dos veces con `onConflictDoNothing` deja 1 fila), índice parcial de job activo y fila única de `settings`.
7. Aplica migraciones a la BD dev y test (`npm run db:migrate`, `npm run db:migrate:test`). Postgres ya corre en Docker (puerto 5433); si no, `docker compose up -d`.
8. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] Migración en `drizzle/` aplicada a `hylistats` y `hylistats_test`.
- [ ] `npm run db:reset -- --yes` vacía las tablas de datos y conserva `settings`.
- [ ] Tests de esquema en verde contra `hylistats_test`; `next build` no conecta a la BD.
- [ ] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

- Estados como `text(..., { enum })` (validados en TS, sin CHECK en BD); constantes exportadas (`ACTIVE_SYNC_JOB_STATUSES`…).
- `db:migrate:test` usa `--test` en `scripts/migrate.ts` (evita que el shell expanda `DATABASE_URL_TEST` antes de cargar `.env.local`).
- `closeDb()` añadido para cerrar el pool en scripts/tests. `getTestDb()` se niega a operar si `DATABASE_URL` no acaba en `_test`.
- `key_kind` de stack §7.1 no se añade (fuera del issue, ver spec "No incluye").

## Evidencias <!-- MUST -->

- Migraciones `drizzle/0000_thick_gambit.sql` + `0001_seed_settings.sql` aplicadas a `hylistats` y `hylistats_test` (idempotentes).
- `db:reset -- --yes` probado: vacía perfiles/partidas y conserva `settings`; sin `--yes` aborta.
- Orquestador: `npx vitest run tests/db tests/smoke.test.ts` → 15 tests OK; `biome check` de los ficheros de T02 limpio. Build sin BD comprobado por el worker (`DATABASE_URL` a puerto inexistente → compila).
- Commit: `feat(db): esquema Drizzle, migraciones y db:reset`.
