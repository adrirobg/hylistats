# Task T07 — Verificación y recálculo independiente

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`.dev/verify-report.md` con la evidencia de AC1–AC7 (tests, recálculo independiente sobre la BD local y capturas a 375 px y escritorio) y AC8 marcado como gate manual abierto (F18).

## Contexto <!-- SHOULD -->

- spec.md: **AC1–AC8**; Estrategia.
- think.md: F18 (validación manual agrupada); simulación de referencia en ORGANIZED "ELO del grupo" (Hechos y P5).
- Precedente: `.dev/archive/iter-05/verify-report.md` (cruce SQL independiente, AC11).

## Prompt / instrucciones para worker <!-- MUST -->

1. Lanzar un subagente independiente (modelo capaz, p. ej. Opus) que, **sin leer ni reutilizar el TypeScript de la app**, escriba un script propio (SQL contra la BD local + Python u otro lenguaje) que recalcule con la regla de la spec: rating final, partidas, liga y provisional por miembro; cambio del día y de la semana mostrados; y el cambio de al menos 20 partidas con casos de 0, 1 y 2 desconocidos y de miembros rivales.
2. Obtener los valores que sirve la app (página `/grupo`, perfiles de miembros y detalle de partidas en el navegador, o los loaders) y compararlos: ±0,01 antes de redondear. Cada diferencia se explica y se corrige.
3. Capturas de la Clasificación, cabecera, historial y gráfica a 375 px y en escritorio; comprobar que un no miembro (elruffles si no es miembro, u otro perfil) no muestra nada de ELO.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde.
5. Escribir `.dev/verify-report.md` con AC1–AC7 y AC8 abierto.

## Criterios de aceptacion <!-- MUST -->

- [ ] Recálculo independiente cuadra (AC7).
- [ ] Evidencia de AC1–AC6 (tests y capturas).
- [ ] AC8 registrado como gate manual abierto (F18).
- [ ] `.dev/verify-report.md` completo.

## Evidencias <!-- MUST -->

