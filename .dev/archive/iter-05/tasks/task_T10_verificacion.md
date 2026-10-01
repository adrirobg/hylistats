# Task T10 — Verificación de iter-05

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`.dev/verify-report.md` con la evidencia de AC1–AC11 y AC12 listado como gate manual del supervisor.

## Contexto <!-- SHOULD -->

- spec.md: **AC1–AC12**; Entregable 9.
- `.dev/archive/iter-04/verify-report.md`: formato y el patrón del cruce independiente (AC4 de iter-04, 90/90).
- `.dev/archive/iter-04/learn.md` → "Que funciono": verificar en el navegador con datos reales y seguir los enlaces reales.

## Prompt / instrucciones para worker <!-- MUST -->

Task del orquestador, con subagentes para el cruce independiente:
1. Dar de alta en `/admin` a los 6 miembros de F19 (BEJITO MAMBO, Hylimichi, Azpekaa, TheCIutch, zapas14 y Krill1nt); comprobar el error con un Riot ID no registrado y que elruffles no aparece (AC1).
2. `npm run lint && npm run typecheck && npm test && npm run build`.
3. **Cruce independiente (AC11)**: un subagente con SQL propio (sin reutilizar el TypeScript de la app) calcula Hoy y Semana (ranking y títulos) del día y de la semana actuales y de al menos una semana pasada con partidas, Equipos y Temporada, y los compara con el HTML servido de `/grupo` y con los badges de los 6 perfiles.
4. En el navegador con datos reales: apertura de títulos por foco (AC5), pestaña Grupo en los 6 perfiles y no en el de elruffles, con los mismos valores que `/grupo` (AC9), Temporada frente al perfil de cada miembro y enlaces de récords (AC8), 375 px (AC8), y `sync_jobs` al abrir la vista y con el botón (AC10). Visitar perfiles con el worker activo gasta cuota: hazlo a propósito.
5. Escribir `.dev/verify-report.md` con la evidencia y AC12 como gate de merge (sesión conjunta F18, con AC11 de #7, AC5 de #3 y AC8 de #2).

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] AC1–AC10 con evidencia (comandos, salidas, capturas).
- [x] AC11: cruce independiente, todas las comparaciones cuadran o se explican y corrigen.
- [x] AC12 listado como gate manual del supervisor.
- [x] `.dev/verify-report.md` escrito.

## Evidencias <!-- MUST -->

- `.dev/verify-report.md`: **PASS (gate manual pendiente)**. AC1–AC10 con evidencia de navegador, `sync_jobs` y checks locales (59 ficheros, 1264 tests); AC11 con cruce SQL independiente sin diferencias (anexo A); AC12 como gate de merge (F18).
- Alta de los 6 miembros de F19 desde `/admin` (AC1), con error claro para un Riot ID no registrado.
- Corrección durante Execute/Verify: `f59ba71` (nombre de visualización del campeón en Temporada, AC8).
