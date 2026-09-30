# Task T06 — Panel de campeón (`?campeon=`) con stats personales y enlaces externos

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`?campeon={slug}` abre, sobre cualquier pestaña, el panel de campeón (§3.6, D9). En escritorio es una hoja lateral y por debajo de 640 px una hoja inferior, siempre en portal. Contiene:
- retrato, estado ("Ganado · verificado ✓ · 1º el 12 sep · ver partida", "Jugado sin ganar", "Sin jugar" o "Ganado a mano");
- objetivo (◎ poner/quitar);
- stats personales (partidas, 1º, top 3 y puesto medio), distribución 1º–6º y últimas partidas con ese campeón;
- enlaces "Builds y meta ↗" a op.gg, LoLalytics, METAsrc, u.gg y Blitz;
- "Marcar como ganado a mano…" con confirmación (solo si no está verificado).

En perfiles ajenos no se muestran ni el objetivo ni el marcado manual (D12).

## Contexto <!-- SHOULD -->

- spec.md:
  - Entregable 6, AC2 (panel por URL directa) y AC4 (enlaces);
  - "Decisiones técnicas": "URL" (`?campeon` = `id` de Data Dragon en minúsculas, o el `championName` en minúsculas si falta del catálogo), "Panel en portal" (Esc/✕ quitan `?campeon` y el foco vuelve al origen) y "Enlaces externos".
- Brief:
  - §3.6 (maqueta del panel);
  - §4.9 (plantillas);
  - §4.4 y §4.12 (marcado manual con confirmación);
  - §7 (`Esc` cierra el panel).
- **Tabla de enlaces verificada por el orquestador** en el navegador integrado el 2026-09-30 (Data Dragon 16.19.1, 173 campeones). Los tests fijan esta tabla. `ddId` es el `id` de Data Dragon; `kebab(ddId)` parte el camelCase con guion (`([a-z])([A-Z])` → `$1-$2`) y pasa a minúsculas.

  | Web | Plantilla | Slug | Excepciones | Cómo se verificó |
  |---|---|---|---|---|
  | op.gg | `https://op.gg/lol/modes/arena/{slug}/build` | `lower(ddId)` | ninguna | 173/173 contra los enlaces de su tier list de Arena |
  | LoLalytics | `https://lolalytics.com/lol/{slug}/arena/build/` | `lower(ddId)` | `MonkeyKing` → `wukong` | 173/173 contra su home de Arena |
  | METAsrc | `https://www.metasrc.com/lol/arena/champions/{slug}/build` | `kebab(ddId)` (`TwistedFate` → `twisted-fate`, `DrMundo` → `dr-mundo`, `KSante` → `ksante`) | `JarvanIV` → `jarvan`, `KogMaw` → `kogmaw`, `MonkeyKing` → `wukong`, `RekSai` → `reksai`, `Renata` → `renata-glasc` | 173/173 contra su tier list de Arena |
  | u.gg | `https://u.gg/lol/champions/arena/{slug}-arena-build` | `lower(ddId)` | ninguna (`monkeyking` y `wukong` valen los dos) | 10 a mano: Ahri, MonkeyKing, Nunu, Renata, Belveth, Kaisa, JarvanIV, DrMundo, KogMaw y Wukong |
  | Blitz | `https://blitz.gg/lol/champions/{slug}/arena` | `ddId` tal cual (con mayúsculas; `ahri` redirige a `Ahri`) | ninguna | 8 a mano: Ahri, MonkeyKing, Nunu, Renata, Belveth, Kaisa, JarvanIV y KogMaw |

  Un slug inválido da página genérica o "Oops!" (op.gg, LoLalytics y Blitz) o redirige a la lista (METAsrc): el título de la página basta como prueba.
- Código:
  - Álbum: `AlbumEntry` (`src/domain/album.ts`): `championId`, `ddId`, `name`, `portraitUrl`, `state`, `games`, `firsts`, `top3`, `bestPlacement`, `avgPlacement`, `lastPlayedAt`, `firstWinAt` y `firstWinMatchId`.
  - `ProfileView.album` ya viene en la página.
  - Estado efectivo con capa local: `effectiveState` y `CardState` (`album-view.ts`).
  - Marcado manual: `manualActionFor` y `manualCopy` (`album-interaction.ts`) y `CardMenu` (`card-menu.tsx`, popover de Base UI en portal).
  - Objetivos y marcas: `localActions` y `useLocalStore` (`src/lib/use-local-store.ts`), `profileData` e `isMyProfile` (`src/lib/local-store.ts`). En perfil ajeno: `header.tsx` l. 249 ("Viendo el perfil de X").
  - Distribución y colores: `distributionSegments`, `placeTone` y `TONE_BG` (junto a `placeTone` desde T05), y `formChipLabel` (`src/domain/scoreboard.ts`).
  - Partidas: `?tab=partidas&partida=` con `tabHref` (T03/T05).
  - Portal y hojas: `@base-ui/react` (ya instalado; `Dialog` pinta en portal, gestiona el foco y cierra con Esc). Todo `position: fixed` dentro de `.app` queda contenido por su `container-type`: el panel **tiene** que ir en portal.
  - Retratos: el álbum ya los trae (`portraitUrl`).
- Datos bajo demanda: las últimas partidas con el campeón (hasta 10) y su distribución se calculan en el servidor solo con `?campeon` (con `playerRows` en `loadProfilePage`, sin consulta nueva) y van en `ProfileView.champion?`. No añadas nada al payload sin `?campeon`.
- Avisos de UI: `text-muted-foreground`/`text-faint` (no `text-muted`), `tabular-nums` fuera de `font-display`, contraste ≥ 4,5:1 y `prefers-reduced-motion` (sin animar la entrada de la hoja).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Enlaces** (`src/lib/champion-links.ts` + tests):
   - `championLinks(ddId, name)` → 5 `{ site, label, href }` en el orden op.gg, LoLalytics, METAsrc, u.gg y Blitz.
   - Usa las plantillas y excepciones de la tabla del Contexto.
   - Tests con los 5 sitios para Ahri, Wukong (`MonkeyKing`), Nunu & Willump (`Nunu`), Renata Glasc (`Renata`), Bel'Veth (`Belveth`) y Kai'Sa (`Kaisa`), más las excepciones de METAsrc (`JarvanIV`, `KogMaw`, `RekSai`, `DrMundo`, `TwistedFate`) y un campeón sin `ddId`: devuelve `[]`, sin enlaces inventados.
2. **Slug interno** (`view-model.ts` o `champion-panel-view.ts` + tests):
   - `championSlug(entry)` = `(ddId ?? name).toLowerCase()`;
   - `findChampionBySlug(album, slug)`: insensible a mayúsculas; `null` si no existe → no se abre el panel.
3. **Datos**: con `?campeon` válido, `loadProfilePage` rellena `champion: { championId, distribution, recent: RecentGame[] (≤ 10) }`, calculado con `playerRows`. Tests en `data.test.ts`: sin `?campeon` no está.
4. **Panel** (`champion-panel.tsx`, cliente):
   - `Dialog` de Base UI en portal. Hoja lateral a la derecha de unos 420 px (100 % por debajo de 640 px, como hoja inferior de hasta 85 vh con desplazamiento interno).
   - Título = nombre del campeón (`h2`) y botón ✕ "Cerrar panel".
   - Esc, ✕ o clic en el fondo → `router.replace` sin `campeon` (`scroll: false`). El foco vuelve al elemento que lo abrió, o al `main` si se abrió por URL.
   - Contenido según el Objetivo:
     - estado con `effectiveState` (capa local solo en "mi perfil");
     - "ver partida" → `firstWinMatchId`;
     - objetivo ◎ y marcado manual con confirmación, reutilizando `manualCopy` y el flujo de `CardMenu`; solo en "mi perfil";
     - stats `es-ES` ("—" sin partidas);
     - distribución con `aria-label` por segmento;
     - últimas partidas como chips enlazados a su partida;
     - enlaces con `target="_blank" rel="noopener noreferrer"` y ↗.
   - Sin partidas: "Aún no has jugado a {nombre} esta temporada" y los enlaces igualmente.
5. **Abrir el panel**:
   - Clic (o Enter) en un cromo del álbum y en una fila de la vista lista → `?campeon={slug}`, conservando el resto de la query.
   - No rompas: flechas, `o` (objetivo), menú ⋯ y la diana, que siguen con su acción propia (revisa `album.tsx`, `album-card.tsx` y `album-interaction.ts`).
   - También abren el panel el nombre del campeón en las filas de Partidas (T05).
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si arrancas un servidor: `WORKER_ENABLED=false`, solo la BD de tests, y lo paras al terminar.

## Criterios de aceptacion <!-- MUST -->

- [ ] `?campeon={slug}` abre el panel por URL directa sobre cualquier pestaña; Esc/✕ lo cierran quitando el parámetro y devuelven el foco.
- [ ] Hoja lateral en escritorio y hoja inferior por debajo de 640 px, en portal, sin scroll horizontal.
- [ ] Estado, stats, distribución, últimas partidas enlazadas y "ver partida" del primer 1º.
- [ ] Objetivo y marcado manual (con confirmación) solo en "mi perfil"; en perfil ajeno no aparecen.
- [ ] `championLinks` con los 5 sitios y los casos límite probados; enlaces en pestaña nueva con `noopener`.
- [ ] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
