# Task T10 — Raíl: marcador, distribución 1º–6º y forma de las últimas 20

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

A partir de 1100 px, el raíl (D2) muestra:

- el **marcador**: 5 cifras en display (Partidas, 1º, % 1º, Top 3 y Puesto medio) con la leyenda "1º = victoria";
- la **distribución** 1º–6º como barra apilada;
- la **forma** de las últimas 20 partidas.

Entre 640 y 1099 px, el marcador pasa a ser una **franja compacta** de 5 cifras bajo la barra Arena God. En móvil, igual. Los compañeros del raíl son de #3.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (Raíl D2), Entregable 10, AC5 (el marcador se rellena en vivo durante el backfill) y AC6.
- Brief:
  - §4.6: marcador con Top-N fijo en 3 (D3) y la leyenda "Victoria = 1º de 6 equipos".
  - §4.7: tira de forma de 20 chips circulares con el número dentro (1º oro, 2º–3º verde agua, 4º–6º pizarra, nunca rojo), con tooltip de campeón y "hace cuánto". En #2, el clic no abre la partida: las partidas son de #3.
  - §7: rangos (≥ 1600 raíl de 360 px, 1100–1599 de 320 px, 640–1099 una columna con franja de KPIs, < 640 móvil).
  - §6.1: colores de puesto.
- Maqueta `.dev/research/design-mock.html`:
  - CSS: `.rail`, `.box`, `.kpis`, `.kpi`, `.kpi.gold`, `.dist`, `.dist-l`, `.form`, `.fc`, `.p1`, `.p23` y `.p46` (l. 163–186).
  - HTML: l. 380–395.
  - JS: `renderKpis` y `renderForm` (l. 569–582).
- Datos:
  - `ProfileView.summary: StatsSummary` (`src/domain/stats.ts`: `games`, `firsts`, `firstRate`, top 3, `avgPlacement` y `distribution: Record<1..6, number>`; comprueba los nombres exactos).
  - `recentForm(rows, 20)` de T03 (`src/domain/album.ts`), la más reciente primero, con `{ matchId, placement, championId, championName, gameCreation }`.
  - Nombre de visualización y retrato: el catálogo de T03/T08 (`album` o `getChampionCatalog`) por `championId`.
- Utilidades:
  - T02: `Box` y tokens `place-1`, `place-top` y `place-low`.
  - T05: `src/lib/format.ts` (porcentaje y decimal `es-ES`, `formatRelative`).
  - T06: layout con el hueco del raíl y la franja bajo la barra.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Datos**: añade `form` (resultado de `recentForm`, con el nombre de visualización resuelto por el catálogo cuando exista) a `ProfileView` o a lo que ya pase `page.tsx`, sin `puuid`. Tests en `data.test.ts` si cambias `loadProfilePage`.
2. **Formato puro** (`src/domain/scoreboard.ts` o en `format.ts`), probado:
   - `scoreboardFigures(summary)` → 5 cifras formateadas en `es-ES`: "509", "84", "16,5 %", "52 %", "3,40".
   - Sin partidas: "—" en lugar de `NaN` o 0 %.
   - `distributionSegments(summary)` → 6 segmentos con su % y su color, que suman 100 % (o vacíos si no hay partidas).
   - `placeTone(p)` → `p1` | `p23` | `p46`.
3. **Componentes**:
   - `Scoreboard`: variantes `rail` (rejilla de 5 con cifras de 30 px) y `strip` (franja compacta en una fila que puede partirse en dos en 375 px sin desbordar). La distribución lleva `title` y un `aria-label` por segmento ("2º: 17,3 %") y leyenda 1º…6º.
   - `FormStrip`:
     - 20 chips con el número dentro y la más reciente a la izquierda.
     - `title` y `aria-label`: "Ahri · 1º · hace 2 h".
     - Lista accesible (`ol` con `aria-label` "Forma: últimas 20 partidas, la más reciente primero").
     - Con menos de 20 partidas se pintan las que haya; sin partidas, un texto vacío útil.
4. **Montaje** en `page.tsx`:
   - Raíl con `Scoreboard` (`rail`) y `FormStrip` en cajas `Box` con los títulos "Marcador · 1º = victoria" y "Forma · últimas 20 · más reciente a la izquierda".
   - Por debajo de 1100 px de contenedor: el raíl se oculta y aparece `Scoreboard` (`strip`) bajo la barra Arena God, visible siempre. La forma se muestra al final del `main` en una caja compacta.
   - Usa container queries en el contenedor `.app`, coherentes con T06.
5. **Tests** de las funciones puras: formato `es-ES`, sin partidas, suma de la distribución y tonos.
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] El raíl a partir de 1100 px muestra marcador (5 cifras), distribución 1º–6º y forma (20) según la maqueta.
- [ ] Entre 640 y 1099 px y en móvil hay una franja compacta de 5 cifras bajo la barra, sin scroll horizontal a 375 y 960 px.
- [ ] Cifras en `es-ES` con `tabular-nums`; puestos 4º–6º en pizarra, nunca rojo; chips con número y `aria-label`.
- [ ] Funciones puras probadas; los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
