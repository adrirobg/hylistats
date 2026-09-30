# Task T01 — Columnas nuevas, ingesta y relleno desde rawGz

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Existen `participants.total_damage_taken`, `participants.largest_killing_spree` y `profiles.profile_icon_id`. La ingesta rellena las dos primeras en cada partida nueva y un script idempotente las rellena para todas las partidas ya guardadas desde `matches.raw_gz`, sin pedir nada a Riot.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Datos"; Entregable 1; AC1.
- think.md §2 "Datos": todas las partidas guardadas tienen `rawGz` (1192/1192 a 2026-09-30). El JSON trae `totalDamageTaken` y `largestKillingSpree` por participante (comprobado).
- Código:
  - `src/db/schema.ts`: tablas `profiles` (l. ~55) y `participants` (l. ~97). Los estados se validan en TS; migraciones en `drizzle/` con `drizzle.config.ts`.
  - `src/lib/riot/schemas.ts:25`: `ParticipantDto` (zod), "solo los campos que persiste la tabla `participants`".
  - `src/domain/ingest.ts:39`: `matchToRows(match)` mapea DTO → filas; `storeMatch` (l. 88) inserta con `rawGz: gzipSync(raw)`.
  - `scripts/`: scripts tsx existentes (`migrate.ts`, `sync-season.ts`) como referencia de conexión a BD y estilo.
- Tests: `src/domain/ingest.test.ts` y fixtures en `tests/fixtures/`.

## Prompt / instrucciones para worker <!-- MUST -->

1. Añade a `participants`: `totalDamageTaken integer("total_damage_taken")` y `largestKillingSpree integer("largest_killing_spree")`, **nullable** (las filas existentes no los tienen hasta el relleno). Añade a `profiles`: `profileIconId integer("profile_icon_id")`, nullable.
2. Genera la migración con drizzle-kit (siguiente número tras `0002`) y revísala: solo `ADD COLUMN`.
3. `ParticipantDto` gana `totalDamageTaken` y `largestKillingSpree` (enteros). `matchToRows` los copia.
4. Script `scripts/backfill-participant-columns.ts` (+ entrada en `package.json`, p. ej. `db:backfill-columns`):
   - recorre `matches` con `raw_gz` en lotes, hace gunzip, parsea y actualiza las filas de `participants` por `(match_id, puuid)` **solo donde alguna de las dos columnas es null**;
   - es idempotente: una segunda ejecución no actualiza nada e informa `0` filas;
   - informa al final: partidas leídas, filas actualizadas y partidas sin `raw_gz`.
5. Tests: `matchToRows` copia los campos nuevos; el relleno (función exportada que reciba `db`, probada contra `hylistats_test`) rellena, y una segunda llamada no cambia nada.
6. Ejecuta la migración y el script contra la BD local de desarrollo (docker, puerto 5433) y anota la salida en Evidencias. Comprueba con SQL que no quedan nulos en esas dos columnas.
7. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] Migración con las 3 columnas nuevas, nullable.
- [x] Ingesta rellena `totalDamageTaken` y `largestKillingSpree` en partidas nuevas.
- [x] Script idempotente: en la BD local deja 0 nulos y una segunda ejecución actualiza 0 filas.
- [x] Tests del mapeo y del relleno en verde. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Migración `drizzle/0003_nostalgic_blonde_phantom.sql`: 3 `ADD COLUMN` nullable (`participants.total_damage_taken`, `participants.largest_killing_spree`, `profiles.profile_icon_id`). Aplicada a `hylistats` y `hylistats_test`.
- Ingesta: `ParticipantDto` + `matchToRows` copian `totalDamageTaken` y `largestKillingSpree` (test en `src/domain/ingest.test.ts`).
- Relleno: `backfillParticipantColumns(db)` en `src/domain/backfill-participant-columns.ts`; wrapper `scripts/backfill-participant-columns.ts` (`npm run db:backfill-columns`). 5 tests contra `hylistats_test` (relleno + 2.ª pasada a 0, lotes, no pisa valores, sin `raw_gz`, `raw_gz` corrupto).
- BD local, 1.ª ejecución: `Partidas leídas: 1192 · Filas actualizadas: 21456 · Partidas sin raw_gz: 0`. 2.ª ejecución: `Filas actualizadas: 0`.
- SQL: `participants` 21456 filas, 0 nulos en `total_damage_taken` y 0 en `largest_killing_spree`.
- `npm run lint && npm run typecheck && npm test && npm run build`: verde (47 ficheros, 970 tests).
