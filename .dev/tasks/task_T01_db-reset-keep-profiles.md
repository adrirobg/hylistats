# Task T01 — db:reset --keep-profiles con tests

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

## Objetivo <!-- MUST -->

`npm run db:reset -- --keep-profiles [--url …] [--yes]`, que vacía partidas y cola, conserva perfiles, grupo y `settings`, corrige los Riot ID cambiados y encola un backfill por perfil. Con tests.

## Contexto <!-- SHOULD -->

- spec.md: Alcance, AC1–AC5
- think.md: ORGANIZED "iter-08", paso 3 del plan 2a
- `src/worker/steps.ts:395` (`resolveAccount`: con `puuid` null pide Account-V1 por `gameName`/`tagLine`)
- `scripts/migrate.ts` (patrón de `--url` y destino sin credenciales)

## Prompt / instrucciones para worker <!-- MUST -->

Lógica en `src/db/reset.ts` (`summarizeReset`, `resetData`); `scripts/db-reset.ts` solo parsea flags e imprime. `TRUNCATE` sin `CASCADE` ni `RESTART IDENTITY` en modo `keepProfiles`. Nada de PUUID ni contraseña en la salida.

## Criterios de aceptacion <!-- MUST -->

- [x] AC1–AC4 de la spec cubiertos por tests
- [x] AC5: lint, typecheck, tests y build en verde

## Notas de implementacion <!-- MAY -->

- La corrección del Riot ID usa la fila de `participants` de la partida con mayor `game_end_timestamp` del perfil; se ignoran nombres vacíos.
- El reseteo completo (sin flag) se mantiene tal cual (`RESTART IDENTITY CASCADE`).

## Evidencias <!-- MUST -->

- `tests/db/reset.test.ts`: 6 tests en verde (resumen, keepProfiles, Riot ID, completo, CLI sin `--yes` y CLI con `--url --yes`).
- `src/worker/worker.test.ts` → "migración de key": 2 tests en verde (backfill tras el reset; perfil con nombre antiguo queda `active`).
- `npm run lint && npm run typecheck && npm test && npm run build`: verde, 1276 tests.
