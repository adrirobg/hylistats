# Task T03 — Bloque Clasificación en la vista del grupo

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un bloque "Clasificación" encima de los bloques actuales de la vista del grupo (`/grupo` y pestaña Grupo) con la tabla del ELO y una nota que explica la regla.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Bloque Clasificación"; **AC3**.
- Código:
  - `src/app/grupo/group-view.tsx:58` `GroupViewPanel` (orden de bloques; `highlightKey` = fila del dueño en la pestaña Grupo).
  - `src/app/grupo/period-block.tsx`, `table-parts.tsx`, `member-name.tsx`, `season-table.tsx`: patrones de tabla, nombre de miembro con enlace, fila destacada y comportamiento a 375 px.
  - `src/app/grupo/group-view-model.ts` (+ test): estilo de view-model puro.
  - `GroupView.elo` (T02) y formateadores de `src/domain/elo.ts` (T01).

## Prompt / instrucciones para worker <!-- MUST -->

1. Componente `clasificacion-block.tsx` (o nombre equivalente) y, si hace falta lógica de presentación, su view-model puro con test.
2. Columnas: posición, miembro (como en los otros bloques), liga, rating (entero), cambio del día y de la semana (con signo; "—" si no jugó; cabeceras con la etiqueta del periodo mostrado si no es el actual, como hace el bloque Hoy / Semana) y partidas de la temporada. Marca *provisional* visible en la fila.
3. Orden y posiciones compartidas tal como vienen del dominio. Fila de `highlightKey` destacada igual que en los otros bloques.
4. Nota breve bajo la tabla: puntos por puesto (+25 / +12 / +2 / −5 / −15 / −19 con rating 1500), que se gana un poco menos (y se pierde un poco más) cuanto más alto se está, los multiplicadores por desconocidos, los cortes de liga y que es de la temporada. Saca los números de las constantes de `config.ts`, no los escribas a mano.
5. Va **encima** de los bloques actuales, que no cambian.
6. Sin scroll horizontal de página a 375 px (la tabla puede tener scroll propio como las demás, o columnas compactas). Compruébalo con el navegador si tienes acceso; si no, déjalo indicado para el orquestador.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; números con `formatDecimal`/`formatCount` de `@/lib/format`; componentes `hy/*` y `ui/*`; textos de UI en español.
- No hagas crecer `src/app/euw/[slug]/data.ts` (716 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Bloque encima de los actuales en `/grupo` y pestaña Grupo, con las columnas de AC3.
- [ ] Orden, empates, provisional y fila destacada.
- [ ] Nota de la regla con valores de `config.ts`.
- [ ] Sin scroll horizontal de página a 375 px.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

