# Task T01 — Repo desplegable

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Que Render pueda construir y arrancar la app tal cual: Node 24 LTS fijado con límite superior y arranque que aplica las migraciones antes de `next start`.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Repo listo para Render"; **AC1**, **AC3**.
- `package.json` (sin `engines`; scripts `start`, `db:migrate` con `tsx --env-file-if-exists`), `scripts/migrate.ts` (usa `DATABASE_URL`), Node local v26.9.0.
- Render: el *pre-deploy command* no existe en Free; Node se elige por `NODE_VERSION`, `.node-version`, `.nvmrc` o `engines` (en ese orden).

## Prompt / instrucciones para worker <!-- MUST -->

1. `engines.node` en `package.json` con rango acotado a la 24 LTS (`>=24 <25`).
2. Script de arranque de producción que ejecute `db:migrate` y después `next start` (sin cambiar `npm start` en local, que no debe migrar).
3. `.mcp.json` del proyecto (ya creado) entra en el commit.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] Node acotado a 24.x en `engines` (AC1).
- [ ] Script de arranque de producción con migraciones; `npm start` local sin cambios (AC1, AC3).
- [ ] Lint, typecheck, tests y build en verde (AC1).

## Evidencias <!-- MUST -->

- {pendiente}
