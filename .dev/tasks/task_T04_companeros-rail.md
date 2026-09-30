# Task T04 — Pestaña Compañeros y top de compañeros en el raíl

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

- **Pestaña Compañeros** (§3.4): tabla con Compañero, Partidas, 1º, % 1º, Top 3, Puesto medio y Última.
  - Muestra mínima ≥ 3 por defecto (`?min`) y aviso ⚠ con valores atenuados por debajo de 5 (D6).
  - Orden por cabecera (`?orden`) y enlace al perfil del compañero en hylistats.
- **Raíl** (D2): top de compañeros bajo la forma.

## Contexto <!-- SHOULD -->

- spec.md:
  - Entregable 4;
  - "Decisiones técnicas": "Enlaces de compañeros" (siempre a `/euw/{Nombre-TAG}`; ★ si está en favoritos) y "URL" (`?min`, 3 por defecto; `?orden` por columna).
- Brief:
  - §3.4 (maqueta de la tabla; orden por defecto: partidas desc);
  - §4.8;
  - §5 ("Vacío: sin compañeros ≥ N partidas" → indicar el umbral y ofrecer bajarlo);
  - §7 (< 640 px: la tabla pasa a lista de tarjetas);
  - §3.2 (raíl: "Hylimichi 38p 18% 3,1 · zapas14 4p ⚠pocas").
- Maqueta `.dev/research/design-mock.html`: busca `mates` / `Compañeros` para la caja del raíl.
- Datos (T01): `TeammateSummary` (`src/domain/queries.ts`) = `{ gameName, tagLine, games, firsts, top3, avgPlacement, lastPlayedAt }`, ordenado por partidas desc. `ProfileStats.teammates` sale de `getProfileStats`.
- Andamiaje (T03):
  - `loadProfilePage(db, …, view)`, con `view.tab`;
  - `ProfileView.teammates?` solo para `companeros`;
  - `tabHref` y paneles `panel-{tab}` en `page.tsx`.
- Utilidades:
  - `formatPercent` y `formatDecimal` (`es-ES`) y `formatRelative` en `src/lib/format.ts`;
  - `profileSlug(gameName, tagLine)` en `src/lib/riot-id.ts`;
  - favoritos: `useLocalStore` + `LocalState.favorites` (`src/lib/local-store.ts`, `src/lib/use-local-store.ts`); todo en `try/catch`, funciona sin `localStorage`;
  - UI: `Box` (`src/components/hy/box.tsx`) y `src/components/ui/table.tsx`.
- Avisos de UI:
  - `text-muted` **no** es texto atenuado (en shadcn es una superficie): usa `text-muted-foreground` o `text-faint`;
  - `tabular-nums` no funciona en `font-display`: las cifras en columna van en body o mono;
  - contraste ≥ 4,5:1;
  - container queries sobre `@container` de `Cabin` (`@min-[640px]:`, `@max-[640px]:`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Lógica pura** (`src/app/euw/[slug]/teammates-view.ts` + tests):
   - `SMALL_SAMPLE = 5` y `DEFAULT_MIN_GAMES = 3`.
   - `parseTeammateParams(source)` → `{ min: 1 | 3 | 5 | 10, orden }`, con 3 por defecto y lo desconocido a su valor por defecto.
   - `ORDENES`: `partidas` (por defecto), `primeros`, `pct1`, `top3`, `medio` (asc) y `ultima`. Desempates deterministas.
   - `teammateRows(list, params, nowMs)`: filtra por `min`, ordena y devuelve cifras formateadas (`es-ES`: "18,4 %", "3,10", "hace 2 d") y `small: games < 5`.
   - `railTeammates(list, 5)`: top 5 por partidas, sin filtro de mínimo, con `small`.
2. **Carga**:
   - `loadProfilePage` rellena `teammates` completo solo con `tab === "companeros"`.
   - `ProfileView.railTeammates` (top 5) siempre: es poco y el raíl lo pinta en todas las pestañas.
   - Tests en `data.test.ts`, sin `puuid`.
3. **Pestaña** (`teammates-panel.tsx`):
   - Controles: "Mostrar: ≥ 1 · ≥ 3 · ≥ 5 · ≥ 10 partidas" (segmentado, URL `?min`).
   - Tabla con cabeceras ordenables (botones con `aria-sort`) y "1º = victoria" visible. La fila con ⚠ lleva `title`/`aria-label` "Muestra pequeña: menos de 5 partidas" y los valores atenuados.
   - Nombre como enlace a `/euw/{profileSlug}` con `#TAG` atenuado, y ★ si el Riot ID está en favoritos: solo cliente, tras `useLocalReady`, sin desajuste de hidratación.
   - Menos de 640 px de contenedor: lista de tarjetas sin scroll horizontal.
   - Vacío con compañeros por debajo del mínimo: "Ningún compañero con ≥ 3 partidas juntos" y botón "Ver todos (≥ 1)".
   - Sin partidas: reutiliza el vacío de §5 que ya usa la página.
4. **Raíl**:
   - Caja `Box` "Compañeros" con hint "partidas juntos" bajo la forma, en `RailBoxes` de `page.tsx`.
   - Filas compactas: nombre (enlace), "38 p", "% 1º" y "medio", y "⚠ pocas" si `small`.
   - Enlace "Ver todos" a `tabHref(…, "companeros")`.
   - Por debajo de 1100 px la caja cae al final del main, como la forma (ver comentario de `cabin.tsx`).
5. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si arrancas un servidor: `WORKER_ENABLED=false`, solo la BD de tests, y lo paras al terminar (puertos 3000 y 3001 libres).

## Criterios de aceptacion <!-- MUST -->

- [x] Tabla con las 7 columnas de §3.4, `?min` (≥ 3 por defecto) y `?orden` en la URL, ⚠ y valores atenuados por debajo de 5.
- [x] Enlace al perfil del compañero (`/euw/{Nombre-TAG}`), ★ si es favorito, sin `puuid` en HTML ni URL.
- [x] Top 5 en el raíl con "⚠ pocas"; vacío de §5 con el umbral y la opción de bajarlo.
- [x] Lógica pura probada; los cuatro checks en verde.
- [x] (Orquestador) Sin scroll horizontal a 375, 960 y 1440 px; `?tab=companeros&min=5` abre así por URL directa.

## Notas de implementacion <!-- MAY -->

- **Lógica pura** en `teammates-view.ts`: `parseTeammateParams`/`teammateSearch` (`?min` 1|3|5|10, `?orden` con 6 valores y los valores por defecto omitidos en la URL), `teammatesAtLeast`, `sortTeammates` (desempates deterministas), `teammateRows`, `railTeammates`, `emptyMessage` y `canShowAll`.
- **`?min` se filtra en el servidor**: `ProfileView.teammates` solo lleva los que pasan el mínimo, para no enviar cientos de compañeros de una partida en cada `router.refresh()`. El orden por columna lo aplica el cliente. `railTeammates` (5 filas formateadas, sin `puuid`) va siempre.
- **Componentes**:
  - `teammates-panel.tsx` (cliente): tabla con `th[aria-sort]` y botones, y lista de tarjetas por debajo de 640 px.
  - `teammates-rail.tsx`, `teammate-parts.tsx` (`TeammateName` y `SmallSampleBadge`) y `tab-link.tsx`.
  - `Segmented`/`SegButton` extraídos de `album.tsx` a `src/components/hy/segmented.tsx`.
  - `NoGames` compartido para el vacío de §5.
- **Desviaciones**:
  - La columna Compañero no se ordena: no hay orden por nombre.
  - La ★ solo sale en tabla y tarjetas, no en el raíl.
  - Sin hover de fila, porque `text-faint` sobre `surface-2` baja a 4,05:1.
  - "Ver todos (≥ 1)" puede mandar muchos compañeros: aceptado, no se pidió tope.

## Evidencias <!-- MUST -->

- **Checks (orquestador)**:
  - `npm run lint`: OK, 132 ficheros;
  - `npm run typecheck`: OK;
  - `npm test`: 38 ficheros y 693 tests en verde (+38);
  - `npm run build`: OK.
- **Navegador integrado** (orquestador, `hylistats-testdb`, semilla `synced 30000`):
  - `/euw/Jugador%20Uno-EUW?tab=companeros` por URL directa:
    - tabla con las 7 columnas y "1º = victoria";
    - fila `Player013#ANON 11 · 1 · 9,1 % · 54,5 % · 3,45 · hace 26 min`;
    - filas con menos de 5 partidas con "⚠ pocas" y cifras atenuadas.
  - Raíl a 1440 px: tercera caja "Compañeros · partidas juntos" bajo Forma.
  - Sin `anon-puuid` en el HTML.
  - Sin scroll horizontal: `scrollWidth` ≤ `innerWidth` a 1440, 960 y 375 px. A 375 px se ven las tarjetas.
  - `Vacio Demo#EUW?tab=companeros` muestra el vacío de §5: "No hay partidas de Arena desde el inicio de la temporada actual (2026-05-12 00:00 UTC)…".
- **Commit**: ver `git log` (`feat(ui): pestaña Compañeros y top de compañeros en el raíl`).
