# Spec: hylistats — iter-01 motor de datos
**Estado**: aprobada (issue [#1](https://github.com/adrirobg/hylistats/issues/1), aprobada por el supervisor el 2026-09-29)
**Consume**: think.md §1 y decisiones F1–F13 como referencia y restricción; `.dev/research/riot-api.md` (I1) + skill `riot-api`; `.dev/research/sync-strategy.md` (I2); `.dev/research/stack.md` (I3, salvo hosting: F12); runbook `.dev/research/orquestacion-v1.md`
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

## Objetivo <!-- MUST -->

Construir el motor de datos de hylistats (scaffolding, BD, cliente Riot, worker con cola persistente y dominio de stats) y demostrar que la lista verificada de campeones ganados (1º en Match-V5) cuadra con el contador oficial del challenge `602002`.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- Scaffolding según `stack.md` §5: Next.js 16 (App Router, TS, `src/`), Tailwind 4, shadcn/ui, Biome, Vitest, Drizzle + Postgres local con `docker compose`; CI mínimo (lint, typecheck, test, build).
- Esquema de BD según `sync-strategy.md` §4: `profiles` (Riot ID como identidad primaria; `puuid` como caché), `matches`, `participants` (los 18), JSON crudo comprimido opcional, `sync_jobs`, `match_fetch` y `settings`.
- Cliente Riot propio (skill `riot-api`): routing `europe`/`euw1`, limitador de dos ventanas por host con un 10 % de margen, `Retry-After`, backoff con jitter y validación con Zod.
- Worker en proceso (`instrumentation.ts`) con `pg_try_advisory_lock`, cola persistente, prioridades y round-robin (I2 §2), backfill de más reciente a más antigua, sync incremental y pausa ante 401/403.
- Temporada: `SEASON_START` configurable y `queue=1750`.
- Key: tabla `settings` y página `/admin` protegida con `ADMIN_TOKEN`, que valida la key contra Riot antes de guardarla; si no hay key en BD, se usa `RIOT_API_KEY` de `.env.local`. BD de desarrollo desechable (`db:reset`).
- Dominio: stats (partidas, 1º, % 1º, top 3, puesto medio, distribución 1º–6º), campeones ganados verificados (`distinct championId | placement==1` desde `SEASON_START`), compañeros por `playerSubteamId` y contador `602002` vía Challenges-V1.
- Página mínima sin diseño en `/euw/{nombre}-{tag}` para registrar un perfil y ver el progreso del backfill, las cifras y la lista verificada frente al contador oficial.
- Tests Vitest con fixtures reales grabadas (sin key; `puuid` anonimizados). Los tests no dependen de la API.
- `noindex` (robots + `X-Robots-Tag`) y descargo "not endorsed by Riot Games" en el footer.

**No incluye** <!-- SHOULD -->:
- UI final (#2); vistas de compañeros, partidas y panel de campeón (#3).
- Hosting/despliegue (F12), código de acceso, augments e items (más allá de guardarlos en `participants`).
- Guardia de `key_kind` dev/personal y snapshots históricos de `602002` (I1 §7.4): fuera del issue.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Scaffolding | App Next.js 16 en la raíz del repo, `docker-compose.yml` (Postgres, BD dev + test), `.env.example`, scripts npm (`lint`, `typecheck`, `test`, `build`, `db:*`), CI en `.github/workflows/` |
| 2 | Esquema y migraciones | `src/db/schema.ts`, `drizzle.config.ts`, `drizzle/` (migraciones), `scripts/migrate.ts`, `scripts/db-reset.ts` |
| 3 | Fixtures | `scripts/record-fixtures.ts` y `tests/fixtures/` con respuestas reales anonimizadas |
| 4 | Cliente Riot | `src/lib/riot/` (limitador, cliente, esquemas Zod, fuente de la key) |
| 5 | Ingesta y dominio | Mapeo Match-V5 → filas y stats/campeones/compañeros/602002 en `src/domain/` |
| 6 | Worker | `src/worker/` + `src/instrumentation.ts` |
| 7 | Admin y salud | `/admin` (login por `ADMIN_TOKEN`, rotación de key validada) y `/api/health` |
| 8 | Página de perfil | `/euw/{nombre}-{tag}` con registro, progreso, refresco, cifras y lista verificada vs `602002` |
| 9 | noindex y descargo | `robots.ts`, meta `robots`, cabecera `X-Robots-Tag`, footer con descargo de Riot |
| 10 | Verificación E2E | Backfill real de `BEJITO MAMBO#1991` y evidencias en `.dev/verify-report.md` |

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1 — `npm run lint`, `npm test` y `npm run build` en verde.
- [ ] AC2 — Registrar `BEJITO MAMBO#1991` lanza un backfill que termina sin 429 sin gestionar y con progreso `fetched/total` visible.
- [ ] AC3 — Deduplicación: una partida compartida por dos perfiles registrados se descarga una sola vez (test).
- [ ] AC4 — El nº de campeones distintos con `placement==1` desde `SEASON_START` es igual al valor de `602002` (75 el 2026-09-29, o el vigente). Si no, la diferencia queda explicada en `verify-report.md`.
- [ ] AC5 — El refresco incremental solo trae partidas nuevas: 1 petición de ids si no hay ninguna.
- [ ] AC6 — Con la key caducada, el worker se pausa y la página lo indica; al guardar una key válida en `/admin` se reanuda sin reiniciar.
- [ ] AC7 — Si se mata el proceso a mitad de backfill, al volver se reanuda desde la cola sin duplicados.
- [ ] AC8 — La key no aparece en el cliente, los logs ni el repo (grep).

## Riesgos y restricciones <!-- MAY -->

- **Key**: nunca se imprime, loguea, commitea ni se pasa a subagentes. Se lee de `settings` o de `.env.local` desde el código o el shell (`--env-file`). Con 401/403 se para y se avisa al supervisor.
- **Presupuesto Riot**: todo por el limitador; como mucho un backfill completo por perfil (~510 peticiones, ~10 min) salvo `db:reset` justificado. La prueba de AC7 (kill + reanudar) se hace dentro de ese mismo backfill.
- **Repo público**: los fixtures anonimizan `puuid`, `summonerId` y Riot ID de todos los jugadores salvo el del supervisor.
- **Singletons en Next**: `instrumentation.ts` y las rutas pueden cargar instancias distintas de un módulo; limitador, estado y señal de despertar del worker viven en `globalThis`.
- **Dependencias**: las de `stack.md` §5; cualquier otra solo si es claramente necesaria y justificada en el commit.

## Estrategia de implementacion <!-- SHOULD -->

Secuencia por dependencias: scaffolding → esquema → fixtures → cliente Riot → ingesta/dominio → worker → admin/salud → página → noindex/descargo → verificación E2E. Cada task la implementa un subagente con prompt autocontenido; el orquestador revisa el diff, ejecuta `npm run lint && npm test && npm run build` y commitea (`feat(scope): …` + `Refs: #1`).

Decisiones técnicas del orquestador (dentro del alcance, sin cambiar F1–F13):
- **Postgres** en `docker compose` con puerto de host `5433`; BD `hylistats` (dev) y `hylistats_test` (tests). Los tests con BD usan `hylistats_test` y en CI un contenedor de servicio.
- **Env**: Next carga `.env.local`; los scripts usan `tsx --env-file-if-exists=.env.local`. Los tests no cargan `.env.local` (no ven la key).
- **Cola**: `sync_jobs` guarda la lista ordenada de `matchId` del job (más reciente primero) para calcular `fetched/total`; `match_fetch` es único global por `matchId` y resuelve sin petición si la partida ya está en `matches`.
- **Llamadas a Riot**: todas pasan por el worker (registro/resolución de Riot ID incluida), salvo la validación de key en `/admin`, que usa el mismo limitador compartido.
- **`SEASON_START`** por defecto `2026-05-12T00:00:00Z` (publicación del parche 26.10; primera partida 1750 observada el 2026-05-16).
- **URL**: `/euw/{gameName}-{tagLine}`, separando por el último `-`. El `puuid` nunca sale de la BD (stack §7.1).

`.dev/tasks/index.json` es tracking operativo local derivado de este spec y del issue; no sustituye el source of truth superior.
