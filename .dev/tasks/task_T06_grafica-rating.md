# Task T06 — Gráfica de evolución del rating

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Una gráfica de la evolución del rating en la pestaña Resumen del perfil de cada miembro, con las ligas como referencia.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Gráfica de evolución del rating"; **AC6**.
- Código:
  - `src/app/euw/[slug]/summary-panel.tsx:~50` (Box "Evolución" con `WonCurveChart`).
  - `src/app/euw/[slug]/won-curve-chart.tsx` y `won-curve-view.ts` (+ test): precedente con `recharts` y `src/components/ui/chart.tsx`, eje temporal, tooltip, comportamiento a 375 px y estado vacío.
  - `src/app/euw/[slug]/page.tsx:~401` (props de `SummaryPanel`).
  - Serie del ELO del perfil (T02) y cortes de liga en `config.ts` (T01).

## Prompt / instrucciones para worker <!-- MUST -->

1. Componente `rating-chart.tsx` con su view-model puro y test (puntos, dominio del eje Y con margen, ligas visibles en ese dominio), siguiendo `won-curve-chart.tsx`.
2. Una línea con el rating tras cada partida de la temporada (eje X temporal) y las ligas como franjas o líneas de referencia con su nombre. Tooltip con fecha, rating y cambio de la partida.
3. En la pestaña Resumen, en un `Box` propio ("Rating" o similar) junto a "Evolución". Solo en miembros (ELO no `null`); con 0 partidas, estado vacío con una frase como la de la curva.
4. El último punto coincide con el rating de la cabecera (mismo dato).
5. Legible a 375 px y en escritorio, con colores de los tokens del tema (claro y oscuro).

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; números con `formatDecimal`/`formatCount` de `@/lib/format`; componentes `hy/*` y `ui/*`; textos de UI en español.
- No hagas crecer `src/app/euw/[slug]/data.ts` (716 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Gráfica de rating con ligas en Resumen, solo en miembros.
- [x] Estado vacío sin partidas.
- [x] Último punto = rating de la cabecera.
- [x] Legible a 375 px y en escritorio; test del view-model.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `rating-view.ts` (+ test), `rating-chart.tsx` (línea de rating, ligas como `ReferenceArea` con nombre, tooltip con fecha, rating y cambio, `ReferenceDot` en el último punto, `figcaption` textual), `summary-panel.tsx` (Box "Rating" tras "Evolución", solo en miembros) y `page.tsx`.
- Fronteras de liga en `min − 0,5` (la liga se decide por el redondeado); Hierro y Diamante recortados al eje.
- 375 px y temas: comprobación del orquestador en T07 (el proyecto solo define el tema oscuro).
- `npm run lint && npm run typecheck && npm test && npm run build` en verde (1350 tests).

