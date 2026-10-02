# Task T03 — Migración en producción

**Owner**: supervisor
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

## Objetivo <!-- MUST -->

Producción con la Personal key en `RIOT_API_KEY`, datos descargados de nuevo y perfiles y grupo intactos (AC7).

## Contexto <!-- SHOULD -->

- `docs/deploy.md` → "Migrar a una key de otro proyecto de Riot" (pasos 1–6)
- Requiere la PR de #16 mergeada (el comando corre desde `main` en el Mac) y el grupo avisado

## Prompt / instrucciones para worker <!-- MUST -->

Pasos del supervisor, desde el Mac: seguir el runbook. El agente no escribe keys en la BD de producción ni tiene acceso a Supabase desde la sesión cloud. Guardar la salida de la foto previa y de la verificación para el verify-report.

## Criterios de aceptacion <!-- MUST -->

- [x] AC7 de la spec

## Evidencias <!-- MUST -->

Ejecutada el 2026-10-02 (11:48–12:31Z). Detalle en `verify-report.md` (AC7); salidas en `~/Backups/hylistats/` del Mac del supervisor (fuera del repo).
