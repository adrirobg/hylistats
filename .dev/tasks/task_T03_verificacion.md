# Task T03 — Verificación en navegador

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Evidencia de AC1–AC6 sobre la app real en local.

## Contexto <!-- SHOULD -->

- spec.md: **AC1–AC6**.
- `.claude/launch.json`: servidores de desarrollo.

## Prompt / instrucciones para worker <!-- MUST -->

1. `/admin` con sesión a 1280 px y 375 px: capturas, sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`).
2. Flujos: token incorrecto, guardar key con formato inválido (no toca la key real), añadir un Riot ID ya miembro (`already`) e inválido (`invalid`). No quitar miembros reales del grupo salvo que se vuelvan a añadir.
3. Deshabilitado: servidor con `ADMIN_TOKEN` corto muestra el mensaje (o test que lo cubra).
4. `npm run lint && npm run typecheck && npm test && npm run build`.

## Criterios de aceptacion <!-- MUST -->

- [x] AC1–AC6 con evidencia en `verify-report.md`.

## Evidencias <!-- MUST -->

- `.dev/verify-report.md` (PASS).
