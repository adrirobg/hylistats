# Task T01 — Repo desplegable

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Que Render pueda construir y arrancar la app tal cual: Node 24 LTS fijado con límite superior y arranque que aplica las migraciones antes de `next start`.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Repo listo para Render"; **AC1**, **AC3**.
- `package.json` (sin `engines`; scripts `start`, `db:migrate` con `tsx --env-file-if-exists`), `scripts/migrate.ts` (usa `DATABASE_URL`), Node local v26.9.0.
- Render: el *pre-deploy command* no existe en Free; Node se elige por `NODE_VERSION`, `.node-version`, `.nvmrc` o `engines` (en ese orden).

## Prompt / instrucciones para worker <!-- MUST -->

1. Node acotado a la 24 LTS. Se usa `.node-version` (`24`) en lugar de `engines`: Render lo lee con más prioridad que `engines`, no genera avisos `EBADENGINE` en local (Node 26) y CI lo reutiliza con `node-version-file`.
2. Script de arranque de producción que ejecute `db:migrate` y después `next start` (sin cambiar `npm start` en local, que no debe migrar).
3. `.mcp.json` del proyecto (ya creado) entra en el commit.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] Node acotado a 24.x en `.node-version` (AC1).
- [x] Script de arranque de producción con migraciones; `npm start` local sin cambios (AC1, AC3).
- [x] Lint, typecheck, tests y build en verde (AC1).

## Evidencias <!-- MUST -->

- `.node-version` = `24`; `.github/workflows/ci.yml` usa `node-version-file: .node-version` (antes `lts/*`, hoy también 24).
- `package.json`: `start:prod` = `npm run db:migrate && next start`; `start` intacto. `db:migrate` usa `--env-file-if-exists`, así que en Render toma `DATABASE_URL` del entorno.
- `.mcp.json` formateado con Biome y commiteado.
- `npm run lint && npm run typecheck && npm test && npm run build`: verde, 1268/1268 tests (commit d32cc24).
