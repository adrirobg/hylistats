# Task T02 — Runbook de migración y docs

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

## Objetivo <!-- MUST -->

Runbook de la migración en `docs/deploy.md` y docs sin la rotación diaria.

## Contexto <!-- SHOULD -->

- spec.md: AC6; decisiones 2 y 4
- `src/lib/riot/key.ts` (la key de la BD manda sobre `RIOT_API_KEY`), `src/lib/admin/key-service.ts` (`expiresHint` solo con fuente `db`)

## Prompt / instrucciones para worker <!-- MUST -->

Secciones "Key de Riot" y "Migrar a una key de otro proyecto de Riot" en `docs/deploy.md`; fila `RIOT_API_KEY`; `AGENTS.md` (Stack → Riot API) y `docs/cloud.md`.

## Criterios de aceptacion <!-- MUST -->

- [x] Orden obligatorio key → reset explícito
- [x] Comandos copiables para foto previa, reset, verificación y vaciado de la key de la BD

## Evidencias <!-- MUST -->

- Diff de `docs/deploy.md`, `AGENTS.md` y `docs/cloud.md` en la rama `cloud/fix/16-personal-key`.
