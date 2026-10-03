# Task T04 — Verificación visual y verify-report

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`verify-report.md` con veredicto por AC (AC1–AC12; AC13 queda para el supervisor tras la release) y capturas de la vitrina a 1280 y 375 px.

## Contexto <!-- SHOULD -->

- spec.md: Criterios de aceptación AC1–AC13.
- Plantilla: `.dev/templates/verify-report.md`; ejemplo: `.dev/archive/iter-10/verify-report.md`.
- App local: config `hylistats-dev-noworker` de `.claude/launch.json`.

## Prompt / instrucciones para worker <!-- MUST -->

1. Revisar el diff de T01–T03 contra la spec (alcance, inferencias I1–I10, nada de `GroupView` entera al cliente).
2. `npm run lint && npm run typecheck && npm test && npm run build`.
3. En el navegador, a 1280 y 375 px: miembro con muchos títulos, miembro sin títulos, no miembro, perfil sin 1º (o splash roto simulado); barra fija con scroll; Actualizar; consola sin errores. Capturas.
4. Cruzar los valores del trofeo Liga y la escalera con la pestaña Grupo.
5. Escribir `verify-report.md` con veredicto por AC y hallazgos.

## Criterios de aceptacion <!-- MUST -->

- [ ] `verify-report.md` con veredicto explícito por AC y evidencias.

## Evidencias <!-- MUST -->

