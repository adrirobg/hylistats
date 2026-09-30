# Task T07 — Pestaña Resumen: marcador, distribución, forma, curva D4 y destacados

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La pestaña Resumen (§3.3) contiene, a ancho completo:
- el marcador de 5 cifras con la leyenda "Victoria = 1º puesto (de 6 equipos)";
- la distribución 1º–6º apilada con sus porcentajes;
- la forma de las últimas 20, enlazada a cada partida;
- la **curva de campeones ganados acumulados** en la temporada (línea escalonada), con el umbral Arena God (60) como línea horizontal (D4);
- los **destacados**: "Ganados a la primera", "Más intentados sin ganar" y "Mejor % 1º (3+)", como chips que abren el panel de campeón.

## Contexto <!-- SHOULD -->

- spec.md:
  - Entregable 7;
  - "No incluye" (sin puesto medio móvil);
  - "Decisiones técnicas": "Curva D4" (verificados de dominio, sin marcas manuales, por fecha del primer 1º; umbral `ARENA_GOD_THRESHOLD`) y "Carga bajo demanda" (curva y destacados solo con `tab === "resumen"`).
- Brief §3.3 (maqueta), §4.6 (marcador) y §4.7 (forma).
- Código:
  - Marcador: `Scoreboard` (`src/app/euw/[slug]/scoreboard.tsx`, variantes `rail`/`strip`) y `scoreboardFigures`/`distributionSegments` (`src/domain/scoreboard.ts`). Reutilízalos; añade una variante `full` si hace falta para el ancho de pestaña.
  - Forma: `FormStrip` (`form-strip.tsx`, chips enlazados a la partida desde T05) y `ProfileView.form`.
  - Verificados: `verifiedChampions(rows)` (`src/domain/stats.ts`), con `firstWinAt` y `firstWinMatchId` por campeón; y `ProfileView.verifiedChampions`.
  - Álbum: `AlbumEntry` (`games`, `firsts`, `state` y `name`) y `championSlug`/`?campeon` (T06).
  - Umbral: `ARENA_GOD_THRESHOLD = 60` (`src/lib/config.ts`).
  - Gráfica: `recharts` + `src/components/ui/chart.tsx` (shadcn `ChartContainer`, `ChartTooltip`), ya instalados, sin dependencias nuevas. Revisa en `node_modules/recharts` la API de v3 (`LineChart`, `Line type="stepAfter"`, `ReferenceLine`). La gráfica es componente cliente; los datos llegan preparados del servidor.
  - Andamiaje: `ProfileView.summaryTab?` (T03) y `panel-resumen`.
- Avisos de UI: tokens de color de `globals.css` (`--place-1` oro, `--line`, `--text-faint`, etc.), contraste ≥ 4,5:1 en ejes y etiquetas, `tabular-nums` fuera de `font-display`, `prefers-reduced-motion` (`isAnimationActive={false}` si reduce) y sin scroll horizontal a 375 px (`ResponsiveContainer`/`ChartContainer` al 100 %).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Dominio puro** (`src/domain/summary.ts` + tests):
   - `wonCurve(verified, seasonStart, nowMs)`: puntos `{ at, count }`, uno por primer 1º en orden cronológico, más el inicio de temporada (0) y "ahora" (último valor), para la línea escalonada. Si dos campeones tienen el primer 1º en el mismo instante, el recuento sube 2 en ese punto. Sin verificados: `[]`.
   - `highlights(album)`:
     - `firstTry`: campeones cuyo primer 1º fue en su primera partida con ellos. Por fecha, los más recientes primero, hasta 8.
       - Necesita la primera partida por campeón: añade `firstPlayedAt` a `AlbumEntry` en `buildAlbum` (con test) o calcúlalo desde `playerRows`.
     - `mostTriedUnwon`: `state === "played"`, por `games` desc, hasta 8.
     - `bestFirstRate`: `games >= 3`, por `firsts/games` desc (desempate por más partidas), hasta 8.

     Cada chip lleva `{ championId, name, slug, games, detail }`, con `detail` como "1º a la primera", "9 partidas" o "3/5 · 60 %".
   - Tests: curva escalonada (orden, empates, sin verificados) y los tres destacados (incluido el umbral 3+ y los límites).
2. **Carga**: con `tab === "resumen"`, `loadProfilePage` rellena `summaryTab: { curve, highlights, threshold }`. Tests en `data.test.ts`: no aparece en otras pestañas.
3. **UI** (`summary-panel.tsx` y `won-curve-chart.tsx`, cliente):
   - Bloques `Box` "Marcador · 1º = victoria", "Forma · últimas 20", "Evolución · campeones ganados acumulados" y "Destacados".
   - La curva:
     - línea `stepAfter` en oro;
     - `ReferenceLine` en y = 60 con etiqueta "Arena God · 60";
     - eje X con fechas cortas `es-ES`; eje Y de 0 a max(60, recuento) + margen;
     - tooltip con fecha y "N campeones".
     - Un resumen textual accesible junto a la gráfica: "23 de 60 campeones ganados; el último, Ahri, el 12 sep". No debe depender solo del SVG.
   - Destacados: tres grupos con chips enlazados a `?campeon={slug}`, conservando la query. Un grupo vacío dice por qué ("Aún ningún campeón con 3+ partidas").
   - Sin partidas: el vacío de §5 que ya usa la página.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si arrancas un servidor: `WORKER_ENABLED=false`, solo la BD de tests, y lo paras al terminar.

## Criterios de aceptacion <!-- MUST -->

- [x] `?tab=resumen` pinta marcador, distribución, forma enlazada, curva con el umbral de 60 y destacados.
- [x] Curva y destacados probados como funciones puras (escalonado, empates, vacíos y umbral 3+).
- [x] Datos de Resumen solo con la pestaña activa (test).
- [x] Resumen textual accesible de la curva; chips que abren el panel.
- [x] Los cuatro checks en verde.
- [x] (Orquestador) Sin scroll horizontal a 375, 960 y 1440 px; la curva cuadra con el número de verificados.

## Notas de implementacion <!-- MAY -->

- **Dominio** (`src/domain/summary.ts`, 26 tests):
  - `wonCurve(verified, seasonStartMs, nowMs)`: escalonada desde el inicio de temporada, con los empates en un mismo punto y un punto final en "ahora". Sin verificados devuelve `[]`.
  - `highlights(album, rows)`: 3 grupos de hasta 8.
  - `wonSummary(...)`: el texto accesible.
- **Desviaciones**:
  - "Ganados a la primera" se calcula con `playerRows`, comparando el `matchId` de la primera partida con `firstWinMatchId`. No se añade `firstPlayedAt` a `AlbumEntry`, para no engordar el payload común.
  - "Mejor % 1º (3+)" exige además algún 1º, porque "0/4 · 0 %" ya sale en "Más intentados sin ganar".
- **UI**:
  - `summary-panel.tsx` (servidor) con 4 `Box`.
  - `won-curve-chart.tsx` (cliente, recharts): `stepAfter` en oro, `ReferenceLine` y = 60 "Arena God · 60", sin animación y con `aria-hidden`; el equivalente es el `figcaption` visible.
  - `highlight-groups.tsx` (cliente): chips a `?campeon=` que conservan la query.
  - `Scoreboard` con variante `full` y la leyenda "Victoria = 1º puesto (de 6 equipos)"; `DistributionBar` con `detailed`.
  - Las marcas de los ejes van en `var(--text-muted)`: el gris por defecto de recharts, `#666`, se quedaba en 3,1:1.
- **Refactors**: `championSlug` pasa a `domain/album.ts` (el dominio no importa de `app/`), `Titled` pasa a `tab-panel.tsx` y se borra `PendingPanel`, que ya no tiene usos.

## Evidencias <!-- MUST -->

- **Checks (orquestador)**:
  - `npm run lint`: OK, 155 ficheros;
  - `npm run typecheck`: OK;
  - `npm test`: 45 ficheros y 884 tests en verde (+41);
  - `npm run build`: OK.
- **Navegador integrado** (orquestador, `hylistats-testdb`, semilla `synced 30000`):
  - `/euw/Jugador%20Uno-EUW?tab=resumen` por URL directa muestra los `h2` "Marcador · 1º = victoria", "Forma · últimas 20", "Evolución · campeones ganados acumulados" y "Destacados".
  - `figcaption`: "1 de 60 campeones ganados; el último, Blitzcrank, el 30 sept.", que cuadra con 1 verificado.
  - SVG de recharts de 981×240 a 1440 px, con ejes "12 may… 1 sept" y "0/20/40/60", la etiqueta "Arena God · 60" y el recuento final 1.
  - Chips de destacados, p. ej. "Thresh · 3 partidas → `?tab=resumen&campeon=thresh`".
  - Sin scroll horizontal: `scrollWidth` ≤ `innerWidth` a 1440, 960 y 375 px (a 375 px la gráfica mide 283 px).
- **Commit**: ver `git log` (`feat(ui): pestaña Resumen con curva de campeones ganados y destacados`).
