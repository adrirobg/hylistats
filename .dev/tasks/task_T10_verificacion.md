# Task T10 — Verificación E2E y verify-report

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`.dev/verify-report.md` con evidencia de AC1–AC10 y AC11 listado como gate manual de merge.

## Contexto <!-- SHOULD -->

- spec.md: Criterios de aceptación AC1–AC11.
- Dogfood #17: escribir la evidencia por AC según se obtiene, no al final.
- BD local: docker `hylistats-postgres-1`, usuario/BD `hylistats`, puerto 5433; 6 perfiles del grupo + BEJITO MAMBO/elruffles.

## Prompt / instrucciones para worker <!-- MUST -->

1. AC1: SQL de nulos y muestra contra el JSON.
2. AC4: para los 6 perfiles del grupo, consultas SQL independientes (récords, rachas, días F17, a la primera, campeón con más 1º, recuento ❄️/🔥 con la fórmula F16) frente a lo que pinta la app. Consultas y salidas en el report.
3. AC5–AC8: navegador integrado (escritorio y 375 px), capturas.
4. AC9: estado del logo (hecho o recortado → hilo abierto).
5. AC10: checks locales y CI.
6. AC11: gate manual (sesión real con el grupo) + AC5 de #3 y AC8 de #2, copiados a la PR.

## Criterios de aceptacion <!-- MUST -->

- [ ] verify-report con evidencia de AC1–AC10.
- [ ] AC11 como gate manual explícito.

## Evidencias <!-- MUST -->

Pendiente.
