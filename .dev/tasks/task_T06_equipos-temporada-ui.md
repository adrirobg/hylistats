# Task T06 — Bloques Equipos y Temporada en la vista del grupo

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] Tablas de Dúos y Tríos con sus columnas y orden (AC7).
- [x] Temporada con Resumen y Récords, ordenable, líderes destacados y récords enlazados a su partida (AC8).
- [x] Sin scroll horizontal de página a 375 px (AC8).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `src/app/grupo/teams-block.tsx` (Dúos y Tríos en el orden del dominio, % de 1º con `formatPercent`), `season-table.tsx` (pestañas Resumen/Récords con `@base-ui/react/tabs`, cabeceras `<button>` en `<th aria-sort>`, orden con `sortSeasonRows`, líder en dorado + "(líder)" oculto, fila del dueño con `aria-current`, récords enlazados con `matchHref`), `season-view-model.ts` (+20 tests, cifras comparadas con `scoreboardFigures`/`computeRecords`), `table-parts.tsx`.
- Formato de cada columna tomado del perfil (marcador, Estadísticas, barra de Deidad).
- Corrección del orquestador (AC8): el campeón salía con `championName` de Match-V5 ("AurelionSol"); `SeasonCell` lleva `championId` y `withDisplayNames` en `group-view.ts` resuelve el nombre del catálogo por `championId` con fallback, como el perfil. Tests nuevos ("MonkeyKing" → "Wukong").
- Navegador (worker, datos reales): 375 px `scrollWidth` = 375 en Resumen y Récords; orden desc/asc con `aria-sort`; líder de Máx. daño BEJITO MAMBO 175.057; el enlace del récord abre `/euw/BEJITO%20MAMBO-1991?tab=partidas&partida=EUW1_7926916560`; Hylimichi coincide con su perfil (911 partidas, 113 1º, 12,4 %, 3,60, 108 campeones). Tras la corrección: "Aurelion Sol", "Bel'Veth".
- Orquestador: `npm run lint && npm run typecheck && npm test && npm run build` en verde tras T06 (57 ficheros, 1240 tests); tests del arreglo 40/40.
