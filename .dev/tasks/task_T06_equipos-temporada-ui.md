# Task T06 — Bloques Equipos y Temporada en la vista del grupo

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La vista del grupo muestra el bloque Equipos (tablas de Dúos y Tríos) y el bloque Temporada (tabla ordenable con pestañas Resumen y Récords y líderes destacados).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Bloque Equipos" y "Bloque Temporada"; Entregable 5; **AC7** y **AC8**.
- Código: componente de vista de T05; datos de T03 vía `loadGroupView` (T04). Enlace a partida: `/euw/<slug>?tab=partidas&partida=<matchId>` (patrón de `stats-panel.tsx`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Equipos**: dos tablas, Dúos y Tríos, con los nombres de los miembros, partidas, 1º, % de 1º y puesto medio, en el orden que da T03.
2. **Temporada**: tabla con una fila por miembro y dos pestañas (Resumen y Récords) con las columnas de la spec. Ordenable por cualquier columna (clic en la cabecera, accesible por teclado, con `aria-sort`). El líder de cada columna destacado (T03). Cada récord enlaza a su partida en el perfil de su dueño.
3. A 375 px no hay scroll horizontal de página: la tabla puede tener scroll propio dentro de su contenedor.
4. Vista-modelo pura con tests para el orden y los enlaces. Comprueba en el navegador con datos reales.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Tablas de Dúos y Tríos con sus columnas y orden (AC7).
- [ ] Temporada con Resumen y Récords, ordenable, líderes destacados y récords enlazados a su partida (AC8).
- [ ] Sin scroll horizontal de página a 375 px (AC8).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
