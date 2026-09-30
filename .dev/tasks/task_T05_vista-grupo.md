# Task T05 — Vista del grupo: página /grupo, Hoy / Semana y apartado Títulos

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un componente de vista del grupo, que se muestra en la página `/grupo`, con el bloque Hoy / Semana (ranking y títulos, con su explicación) y el apartado Títulos, y un enlace "Grupo" en la cabecera de la app. El `Badge` se abre también al enfocarlo con el teclado.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Vista del grupo", "Bloque Hoy / Semana", "Títulos" y "Explicación de los títulos"; Entregable 5; **AC2** (fecha del periodo vacío), **AC3**, **AC5** y **AC9** (enlace y `/grupo`).
- `.dev/research/design-brief.md` y `design-mock.html`: lenguaje visual (no hay maqueta de `/grupo`).
- Código:
  - `loadGroupView` de T04.
  - `src/components/hy/badge.tsx`: `Badge` con Popover de Base UI `openOnHover`. Deuda de iter-04: se abre con el ratón, el clic y Enter, **pero no al recibir el foco**. Arréglalo en el componente (lo reutilizan la vista y T08) y compruébalo en el navegador; no te fíes del comentario de cabecera.
  - `src/app/euw/[slug]/top-bar.tsx`: cabecera de la app, donde va el enlace "Grupo".
  - `src/app/euw/[slug]/stats-panel.tsx` y `stats-panel-view.ts`: patrón de panel con vista-modelo pura y estados vacíos.

## Prompt / instrucciones para worker <!-- MUST -->

1. Componente de vista del grupo, preparado para mostrarse en `/grupo` y en la pestaña del perfil (T07), con una prop opcional para destacar la fila de un miembro. Este task pinta el bloque Hoy / Semana y el apartado Títulos; T06 añade Equipos y Temporada dentro de la misma vista.
2. **Hoy / Semana**: selector (estado en la URL, como las pestañas del perfil); ranking con posición, jugador (enlazado a su perfil), partidas, 1º y puesto medio; "sin mínimo" aparte; si el periodo mostrado no es el actual, indicarlo con su fecha ("Último día jugado: …"). Los títulos del periodo, cada uno con su explicación.
3. **Explicación de cada título**: al pasar el ratón, hacer clic o enfocarlo con el teclado se ve métrica, valor y partidas (el texto "por qué" de T02) y un enlace al apartado Títulos (ancla). Usa `Badge`.
4. **Apartado "Títulos"**: lista fija con los 7 títulos, qué mide cada uno, sus periodos, el mínimo y las reglas comunes (al menos 2 clasificados, empates compartidos, cortes del día y de la semana). Las cifras de los mínimos salen de las constantes de `config.ts`, no escritas a mano.
5. **Página `/grupo`** (`noindex`, como el resto) y enlace "Grupo" en `TopBar`.
6. Vista-modelo pura con tests (el repo no tiene jsdom). Comprueba en el navegador, con datos reales, que se abre por foco y que a 375 px no hay scroll horizontal de página.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] `/grupo` existe y se llega desde el enlace "Grupo" de la cabecera (AC9).
- [ ] Hoy / Semana con ranking, "sin mínimo" y empates compartidos (AC3); fecha visible cuando el periodo no es el actual (AC2).
- [ ] Cada título se abre con ratón, clic y foco (comprobado en el navegador), muestra métrica, valor y partidas y enlaza al apartado (AC5).
- [ ] El valor de la explicación de cada título coincide con el de su fila en el ranking o en la tabla de su bloque (AC5).
- [ ] Apartado Títulos con los 7 títulos, métricas, periodos, mínimos y reglas (AC5).
- [ ] `Badge` abierto por foco (deuda de iter-04).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
