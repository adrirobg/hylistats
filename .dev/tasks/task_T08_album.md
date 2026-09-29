# Task T08 — Álbum: cromos, bandas, filtros, búsqueda, orden, vista y URL

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La pestaña Campeones del perfil muestra el álbum del brief §4.4–4.5 con todos los campeones de Data Dragon y sus retratos. Incluye:

- cromos con 4 estados: verificado, manual, jugado sin ganar y sin jugar;
- el objetivo como capa ortogonal, distinguida por forma además de por color;
- bandas por estado con contador;
- filtro segmentado, búsqueda (`/`), orden y vista álbum/lista.

Todo el estado vive en la URL: `?vista`, `?filtro`, `?q` y `?orden`. En esta task, objetivos y marcas manuales **se leen** de la capa de navegador. Conmutarlos es T09.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (Álbum), Entregable 8 y AC3 ("4 estados y el objetivo según la maqueta; los filtros, la búsqueda y la vista se reflejan en la URL"). "Decisiones técnicas": Data Dragon `es_ES`; la búsqueda casa también con el id de Data Dragon; datos locales solo en "mi perfil"; sin panel de campeón (#3).
- Brief:
  - §4.4: tabla de estados. Verificado: color, borde dorado de 2 px y sello "1º" (con el nº de 1º si > 1). Manual: borde discontinuo azul acero y lápiz ("manual"). Jugado: desaturado 60 % y brillo 70 % ("×4 · mejor 2º"). Sin jugar: brillo 25 %. Objetivo: anillo naranja y diana arriba a la izquierda. Retrato ≥ 72 px, rejilla `minmax(84px, 1fr)`; nombre de visualización debajo.
  - §4.5: buscador con foco al pulsar `/`; filtros Objetivos sin ganar · Sin ganar · Sin jugar · Ganados · Todos. Por defecto, "Objetivos sin ganar" si hay objetivos y, si no, "Todos" con bandas (D1). Orden: estado (bandas), alfabético, más intentados, mejor puesto y último jugado. Vista álbum/lista (tabla con partidas, 1º, top 3, medio y último).
  - §5: vacío "sin objetivos" → "Marca objetivos con ◎ en cualquier campeón para verlos aquí" + atajo a Todos.
  - §7: cromos de 64 px en móvil; sin scroll horizontal.
- Maqueta `.dev/research/design-mock.html`:
  - CSS: `.controls`, `.search`, `.seg-ctl`, `.band`, `.band-h`, `.grid`, `.empty`, `.card`, `.pt`, `.nm`, `.sub`, `.s-won`, `.s-manual`, `.s-played`, `.s-none`, `.seal`, `.pencil`, `.tgt` e `.is-target` (l. 115–161).
  - JS: `cardHTML`, `subTxt`, `band` y `renderAlbum` (l. 524–566), con la semántica de las bandas y del filtro, más el cambio a "todos" al escribir (l. 713).
  - Tabla (l. 200–209).
- Dominio (T03): `src/domain/album.ts`, con `buildAlbum(catalog, rows)` → `AlbumEntry[]` (`championId`, `ddId`, `name`, `portraitUrl`, `state: won|played|none`, `games`, `firsts`, `top3`, `bestPlacement`, `avgPlacement`, `lastPlayedAt`, `firstWinAt` y `firstWinMatchId`). También `src/lib/ddragon.ts`, con `getChampionCatalog()` (server-only; nunca lanza).
- Capa de navegador (T04): `useLocalStore`, con `profiles[normalizeRiotId(...)].targets` y `.manual`, e `isMyProfile`.
- Página (T06): `src/app/euw/[slug]/page.tsx` con el hueco del álbum en el `main`, la pestaña Campeones, `data.ts` y `ProfileView`. `src/lib/format.ts` (T05) tiene `formatRelative`, `formatDateTime` y los formateadores de % y decimales.
- Next 16: lee `node_modules/next/dist/docs/` sobre `useSearchParams` (exige `Suspense`), `router.replace(..., { scroll: false })`, `next/image` con `images.unoptimized` (ya activo en `next.config.ts`; Data Dragon es remoto) y `searchParams` asíncronos antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Datos**: en `data.ts`/`page.tsx`, carga el catálogo (`getChampionCatalog`) en paralelo con el resto y pasa `album: AlbumEntry[]` al componente cliente. Solo datos serializables, sin `puuid`. Actualiza `data.test.ts` si cambias `loadProfilePage`; el catálogo se puede inyectar para no usar red en tests.
2. **Vista pura** (`src/domain/album-view.ts` o `src/app/euw/[slug]/album-view.ts`), probada:
   - `parseAlbumParams(searchParams)` → `{ vista: "album" | "lista"; filtro: "objetivos" | "sin-ganar" | "sin-jugar" | "ganados" | "todos" | null; q: string; orden: "estado" | "alfabetico" | "intentos" | "mejor" | "reciente" }`. Valores inválidos → valor por defecto.
   - `albumSearch(params)`: el inverso, que omite los valores por defecto para que la URL sea limpia.
   - `defaultFiltro(hasTargets)`: D1.
   - `effectiveState(entry, manualSet)`: `won` | `manual` | `played` | `none`. Si el campeón está verificado, manda `won` aunque también tenga marca manual.
   - `matchesQuery(entry, q)`: sin distinguir mayúsculas ni tildes, sobre `name` y `ddId`.
   - `albumSections(entries, { targets, manual }, params)` → `Array<{ key, title, tone: "target" | "won" | "neutral", entries, empty }>`, con la semántica de `renderAlbum` de la maqueta:
     - `objetivos`: objetivos sin ganar (ganar incluye el manual).
     - `sin-ganar`: jugados sin ganar.
     - `sin-jugar`.
     - `ganados`: verificados + manuales.
     - `todos`: bandas Objetivos sin ganar (solo si hay), Jugados sin ganar y Sin jugar (ambas sin los objetivos) y Ganados.
     - Con `orden = estado`: bandas, alfabético dentro de cada una. Con otro orden: una única sección con el título del filtro, ordenada (`intentos`: `games` desc; `mejor`: `bestPlacement` asc, con los nulos al final; `reciente`: `lastPlayedAt` desc).
     - Con `q` sin resultados: una sección vacía con "Ningún campeón coincide con «q»".
3. **Componente cliente** `Album`:
   - **Controles**: buscador con icono y `kbd` "/", filtro segmentado con `aria-pressed` y el de objetivos subrayado en naranja, selector de orden (`select` nativo con estilo) y conmutador de vista (Álbum ▦ / Lista ☰).
   - En perfiles ajenos, o sin "mi perfil", el filtro "Objetivos sin ganar" se oculta y el por defecto es Todos.
   - **URL**: cada cambio hace `router.replace('?' + albumSearch(...), { scroll: false })`. La búsqueda escribe en la URL con un debounce corto (~200 ms). Al escribir con un filtro distinto de `todos`, cambia a `todos` (como la maqueta). La tecla `/` (fuera de inputs) enfoca el buscador. Conserva `?tab` y demás parámetros ajenos al álbum.
   - **Bandas**: `h3` en display uppercase con tracking y el contador en mono; tono naranja para objetivos y oro para ganados.
   - **Cromo**: `next/image` o `img` con `loading="lazy"`, `alt` = nombre y tamaño fijo para no mover el layout. Sin retrato, las iniciales sobre un degradado como en la maqueta.
     - Los estados se distinguen por forma: sello "1º" dorado rotado, lápiz en un círculo azul y diana naranja con anillo si es objetivo.
     - Nombre de 13 px con `overflow-wrap`.
     - Dato secundario en mono, según `subTxt` de la maqueta.
     - Cada cromo es focusable (`tabindex=0`) con un `aria-label` completo ("Ahri, ganado verificado, 3 primeros puestos, objetivo").
     - En un cromo verificado, `title` con "1º el {fecha}".
     - Todavía no abre ningún panel (#3).
     - Deja un hueco para el botón de diana y el menú ⋯ que añade T09: la diana se pinta si es objetivo, sin interacción.
   - **Vista lista**: tabla densa (Campeón con retrato pequeño, Estado, Partidas, 1º, Top 3 en %, Medio y Último jugado con `formatRelative`), con cifras `tabular-nums`. En menos de 640 px oculta Top 3 y Medio; envoltorio con `overflow-x: auto` como red de seguridad.
   - **Rejilla**: `repeat(auto-fill, minmax(88px, 1fr))`; en menos de 640 px, `minmax(72px, 1fr)` con retrato de 64 px. Sin scroll horizontal a 375 px.
   - **Vacíos** con el texto de la maqueta o el brief y un atajo a Todos cuando aplique.
   - **Rendimiento**: `useMemo` para las secciones. Nada de estado duplicado entre la URL y los componentes, salvo el valor del input durante el debounce.
4. Monta el álbum en el `main` de `page.tsx` en lugar del marcador de posición de T06, envuelto en `Suspense` por `useSearchParams`. Retira la lista provisional de verificados.
5. **Tests** de `album-view`: parse y serialización de la URL (valores inválidos y por defecto omitidos), `defaultFiltro`, `effectiveState` con los manuales, `matchesQuery` con tildes (`"kaisa"` casa con `"Kai'Sa"`) y por `ddId`, `albumSections` para cada filtro, cada orden y la búsqueda vacía, y objetivos excluidos de las otras bandas en `todos`.
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde. La verificación visual (4 estados + objetivo, URL y 375 px) la hace el orquestador: indica en el informe cómo sembrar objetivos y manuales en `localStorage` para verlos.

## Criterios de aceptacion <!-- MUST -->

- [ ] El álbum lista todos los campeones del catálogo (y los jugados ausentes) con retratos de Data Dragon por `championId` ↔ `key`.
- [ ] Los 4 estados y el objetivo se distinguen por forma y por color, según la maqueta.
- [ ] Filtros, búsqueda (`/`), orden y vista funcionan y se reflejan en la URL (`?filtro`, `?q`, `?orden`, `?vista`) sin perder `?tab`.
- [ ] Vista lista y vacíos útiles; sin scroll horizontal en 375 px.
- [ ] `album-view` probado; los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
