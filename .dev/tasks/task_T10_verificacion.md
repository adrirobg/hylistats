# Task T10 — Verificación E2E y verify-report

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] verify-report con evidencia de AC1–AC10.
- [x] AC11 como gate manual explícito.

## Evidencias <!-- MUST -->

`.dev/verify-report.md` concluye **PASS**, con el CI pendiente de confirmar al abrir la PR.

- Por criterio:
  - AC1: 0 nulos y 450/450 frente al JSON.
  - AC4: 90/90 comparaciones y ❄️/🔥 17/17. La SQL y las tablas están en el anexo A.
  - AC5: 30/30 récords, tras la corrección `77607d9`.
  - AC6–AC9: verificados en el navegador.
  - AC10: 1110 tests en verde en local.
- AC11 queda listado como gate de merge, junto con AC5 de #3 y AC8 de #2.
