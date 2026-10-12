# Task T04 — Verificación visual y verify-report

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Comprobar en el navegador que la racha y las reglas nuevas se ven bien a 1280 y a 375 px, y cerrar `verify-report.md`.

## Contexto <!-- SHOULD -->

- spec.md: AC4–AC7, AC10 y AC11.
- Resultados de T03.
- `.claude/launch.json`, para el servidor local con la BD local. Si no hay una racha real en curso, se simula con datos locales.

## Prompt / instrucciones para worker <!-- MUST -->

1. Hacer `npm run lint && npm run typecheck && npm test && npm run build`.
2. En el navegador, a 1280 y a 375 px, revisar:
   - El historial con racha y desconocidos.
   - El aviso de racha en «mi perfil» y en el perfil de otro miembro: que se cierra y que no vuelve a salir.
   - La Clasificación y El grupo hoy con 🔥.
   - La nota de la regla.
   - Un no miembro.
3. Hacer capturas y escribir `verify-report.md` con los AC cubiertos, lo que queda abierto (AC12) y los resultados de T03.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC10 y AC11, con capturas en `verify-report.md`.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
