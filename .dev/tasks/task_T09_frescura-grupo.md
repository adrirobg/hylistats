# Task T09 — Frescura del grupo: auto-refresco, botón Actualizar grupo y antigüedad

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Al abrir `/grupo` o la pestaña Grupo se pide el incremental de los miembros que lo necesiten; hay un botón "Actualizar grupo" y la vista indica la sincronización más antigua.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Frescura"; Riesgos ("Presupuesto Riot"); Entregable 8; **AC10**.
- think.md: ORGANIZED P9.
- Código:
  - `src/worker/queue.ts:150` (`requestRefresh`, `REFRESH_COOLDOWN_MS` = 60 s del botón) y `:248` (`ensureFreshOnView`: límite de 5 minutos, `STALE_AFTER_MS`).
  - `src/app/euw/[slug]/actions.ts:57` (`refreshAction`) y `:78` (`ensureFreshOnViewAction`).
  - `src/app/euw/[slug]/auto-refresh-policy.ts`, `auto-refresh.tsx` y `use-refresh.tsx`: política de montaje, latido y visibilidad, y botón Actualizar del perfil.

## Prompt / instrucciones para worker <!-- MUST -->

1. Server actions del grupo: una que llama a `ensureFreshOnView` por cada miembro (disparos automáticos) y otra que llama a `requestRefresh` interactivo por cada miembro (botón). No cambies las reglas de `queue.ts`: reutilízalas.
2. En `/grupo` y en la pestaña Grupo, el mismo patrón que `AutoRefresh` del perfil (al montar, al volver a la pestaña y en el latido; nada con la pestaña oculta), aplicado a los miembros, y relectura mientras haya jobs activos.
3. Botón "Actualizar grupo" con estado (en cola, al día) y aviso de la sincronización más antigua ("Datos de hace X: <miembro>", con `formatRelative`).
4. Tests de las acciones con la BD de test: solo se encola a los miembros sin job activo y fuera del límite; el botón encola a los que no están en cooldown. Todo pasa por la cola existente (sin llamadas directas a Riot).

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Al abrir la vista se encola el incremental solo de los miembros sin job activo y fuera del límite de 5 minutos (test y comprobación en `sync_jobs`) (AC10).
- [ ] El botón "Actualizar grupo" pide el incremental de todos los miembros, respetando el cooldown (AC10).
- [ ] La vista indica la sincronización del miembro menos reciente (AC10).
- [ ] Todo pasa por la cola y el limitador existentes (AC10).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
