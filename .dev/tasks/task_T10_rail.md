# Task T10 — Raíl: marcador, distribución 1º–6º y forma de las últimas 20

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] El raíl a partir de 1100 px muestra marcador (5 cifras), distribución 1º–6º y forma (20) según la maqueta.
- [x] Entre 640 y 1099 px y en móvil hay una franja compacta de 5 cifras bajo la barra, sin scroll horizontal a 375 y 960 px.
- [x] Cifras en `es-ES` con `tabular-nums`; puestos 4º–6º en pizarra, nunca rojo; chips con número y `aria-label`.
- [x] Funciones puras probadas; los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- Lógica pura en `src/domain/scoreboard.ts`: `scoreboardFigures` (5 cifras `es-ES`, "—" sin partidas), `distributionSegments` (6 segmentos que suman 100, `[]` sin partidas), `placeTone` y `formChipLabel`. Componentes de servidor `scoreboard.tsx` (variantes `rail`/`strip`) y `form-strip.tsx`; suben en vivo con el `router.refresh()` de `AutoRefresh`, sin polling propio.
- `ProfileView.form` = `recentForm(playerRows, 20)` con el nombre de visualización del álbum; sin `puuid`.
- `Cabin` gana el slot `strip` bajo la barra Arena God (`@min-[1100px]:hidden`); el marcador del raíl se oculta por debajo de 1100 px (`@max-[1100px]:hidden`) y la forma queda al final del main (el `aside` ya cae debajo). El marcador existe dos veces en el DOM (una siempre `display: none`).
- Desviaciones menores (no se sobrediseña):
  - "1º" y "% 1º" en oro, como `renderKpis` de la maqueta; la task solo marcaba "1º".
  - En el raíl de 340 px, 5 columnas iguales (49 px) no caben con "16,5%" en display de 30 px (~64 px): se usa `flex justify-between` con `tracking-tight` y se quita el espacio antes de "%" solo en el raíl, como la maqueta.
  - La franja (< 1100 px) lleva solo las 5 cifras: la barra 1º–6º solo existe en el raíl.
  - `tabular-nums` está puesto, pero no tiene efecto en `font-display` (Big Shoulders sin `tnum`); son KPIs sueltos, se acepta.

## Evidencias <!-- MUST -->

- Navegador integrado (orquestador, 2026-09-30) contra `hylistats_test` (`hylistats-testdb`, semilla `synced 30000`), perfil `Jugador Uno#EUW`:
  - 1440 px: raíl de 340 px con `h2` "Marcador · 1º = victoria" y "Forma · últimas 20 · más reciente a la izquierda"; cifras `11 · 1 · 9,1% · 55% · 3,45` (`font-variant-numeric: tabular-nums`); 6 segmentos "1º: 9,1 %", "2º: 18,2 %", "3º: 27,3 %", "4º: 18,2 %", "5º: 18,2 %", "6º: 9,1 %"; 11 chips en `ol[aria-label="Forma: últimas 20 partidas, la más reciente primero"]`, p. ej. "Blitzcrank · 1º · hace 20 min". Colores: 1º `rgb(232,182,76)`, 2º–3º `rgb(79,179,163)`, 4º–6º `rgb(91,97,109)` (pizarra, sin rojo). `[data-slot=strip]` `display: none`. `scrollWidth = innerWidth = 1440`.
  - 1920 px: raíl 340 px (desviación conocida del rango de 380), franja oculta, `scrollWidth = 1920`.
  - 960 px: franja `11 · 1 · 9,1 % · 55 % · 3,45` justo tras `[data-slot=arena-god]`; en el `aside`, "Marcador" `display: none` y "Forma" visible al final del main. `scrollWidth = innerWidth = 960`.
  - 375 px: franja en una sola fila (borde derecho 323 px), forma hasta 329 px, `scrollWidth = innerWidth = 375`.
  - En vivo (AC5): semilla `backfill`, banda "Descargando la temporada: 212 / 504 partidas"; `finish-perfil newgame` → sin recargar (marcador de `window` intacto) el marcador pasa a `12 · 2 · 16,7% · 58% · 3,25`, 12 chips y el primero "Rakan · 1º · hace 1 min"; la banda desaparece.
  - `Vacio Demo#EUW`: cifras `0 · — · — · — · —`, 0 segmentos, forma "Aún no hay partidas: aquí aparecerán las últimas 20, la más reciente a la izquierda."
- Checks (orquestador): `npm run lint` OK (121 ficheros) · `npm run typecheck` OK · `npm test` 36 ficheros, 623 tests en verde (+12 `scoreboard.test.ts`, +3 `data.test.ts`) · `npm run build` OK.
- Commit: ver `git log` (`feat(ui): raíl con marcador, distribución 1º–6º y forma de las últimas 20`).
