# Task T06 — Perfil: layout cabina, header, sincronización y estados

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`/euw/{nombre}-{tag}` deja de ser la página mínima de iter-01 y pasa a tener:

- El **esqueleto de cabina** del brief §3.2 y §7, con huecos para la barra Arena God (T07), el álbum (T08) y el raíl (T10).
- El **header** §4.1, con su menú local §4.12.
- La **banda de progreso del backfill** §4.10, que se refresca en vivo.
- El **toast** de resultado de "Actualizar".
- Los **estados** de §5 que afectan a esta vista.

Los datos locales siguen D12: solo se usan en "mi perfil".

## Contexto <!-- SHOULD -->

- spec.md: Alcance (Header de perfil y estados §5), Entregable 6, AC5 (rellenado en vivo) y AC6 (sin scroll horizontal). "Decisiones técnicas": datos en vivo con el polling de iter-01; datos locales solo en "mi perfil"; "Este soy yo"; recientes al visitar; Riot ID no encontrado en la página; solo la pestaña Campeones; avatar con iniciales.
- Brief:
  - §3.2: layout cabina y prioridad de bloques.
  - §4.1: header con identidad, ★, "mi perfil" o "Este soy yo", chip de temporada, frescura en dos líneas y "Actualizar" con progreso interno.
  - §4.10: banda "Descargando la temporada: 212 / 504 partidas · ~N min", "Puedes cerrar la pestaña…", pausa y "En cola".
  - §4.12: menú local con exportar/importar, olvidar "mi perfil" y borrar objetivos y marcas; lo destructivo se confirma en doble paso.
  - §5: vacíos, esqueletos, Riot ID no encontrado, error de la API con los datos visibles, rate limit y perfil ajeno ("Viendo el perfil de X").
  - §7: rangos ≥ 1600 (raíl 360 px), 1100–1599 (raíl 320 px), 640–1099 (una columna) y < 640 (móvil, header reducido); container queries.
- Maqueta `.dev/research/design-mock.html`:
  - CSS: `.app`, `.hdr`, `.who`, `.avatar`, `.chips`, `.fresh`, `.btn .prog`, `.body`, `.main`, `.rail`, `.tabs`, `.sync-band` y `.toast`.
  - HTML: header (l. 295–307), tablero de sincronización (l. 416–432) y toast (l. 472).
  - JS: animación del botón Actualizar (l. 726–746).
- Código actual en `src/app/euw/[slug]/`:
  - `page.tsx`: página mínima (`Header`, `Unregistered`, `SyncBlock`, `Summary`… se sustituyen).
  - `data.ts`: `loadProfilePage` → `ProfilePageData` (`unregistered` | `not_found` | `ProfileView` con `sync: SyncProgress | null`, `paused`, `lastSyncedAt`, `summary`, `verifiedChampions`, `challenge` y `seasonStart`). Tests en `data.test.ts`; nunca expone `puuid`.
  - `actions.ts`: `registerProfileAction`, `refreshProfileAction` y `ensureFreshOnViewAction`, que devuelven `RefreshResult` = `"queued" | "active" | "cooldown"`.
  - `auto-refresh.tsx`: `router.refresh()` cada 3 s con job activo y cada 30 s sin él, más `ensureFreshOnView` al montar.
  - `refresh-button.tsx`.
- Utilidades previas:
  - T02: `src/components/hy/` (`Box`, `Btn`, `Chip`, `Notice`) y tokens.
  - T04: `useLocalStore` (`isMyProfile`, `setMyProfile`, `toggleFavorite`, `addRecent`, `exportState`/`importState`…) y `parseRiotIdInput`.
  - T05: `src/lib/format.ts` (`formatRelative`, `formatDateTime`).
  - T03: `lastGameAt(rows)` en `src/domain/album.ts`.
  - `profileSlug`, `parseProfileSlug` y `normalizeRiotId` en `src/lib/riot-id.ts`.
- `profiles` en `src/db/schema.ts`: `lastSyncedAt`, `status`, `challenge*`. Mira si hay un campo o estado de error del último job (`syncJobs.status = 'error'`, `lastError`) para el aviso "No se pudo actualizar" (learn de iter-01: hoy no se avisa si el último job acabó en `error`).
- Next 16: lee `node_modules/next/dist/docs/` (`searchParams` asíncronos, `loading.tsx`, Server Actions, `useSearchParams` con `Suspense`) antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Datos** (`data.ts`), en `ProfileView`:
   - Añade `lastGameAt: number | null`, desde las filas del jugador con `lastGameAt` (T03). Puedes ampliar `getProfileStats` para devolver también las filas o lo derivado: decide lo mínimo.
   - Añade `lastJobError: { at: Date } | null` si el último job del perfil acabó en `error` después del último `done`, **sin** el texto de `lastError` (puede traer rutas; basta con que exista).
   - Actualiza `data.test.ts`, manteniendo la comprobación de que no hay `puuid` en ningún nivel.
2. **Layout** (`page.tsx`):
   - Contenedor `.app` con `container-type: inline-size`: header pegajoso, franja para la barra Arena God (hueco con un `div` marcado `{/* T07 */}`), cuerpo `.body` en una columna y, a partir de 1100 px de contenedor, `main + rail` (340 px; 380 px a partir de 1500 px, como la maqueta).
   - Barra de pestañas con solo **Campeones** (`role="tablist"`), con `?tab` interpretado (por defecto `campeones`).
   - En el `main`, un marcador de posición del álbum. En el raíl, marcadores de posición para T10 (marcador y forma).
   - Mientras no lleguen T07/T08/T10, el `main` muestra la lista de verificados actual con los tokens nuevos, para no perder información.
3. **Header** (componente cliente en `src/app/euw/[slug]/header.tsx` o similar; los datos del servidor van por props):
   - Avatar con las iniciales.
   - Nombre en display con `#TAG` atenuado.
   - ★ favorito (`toggleFavorite`, con `aria-pressed` y `aria-label`).
   - Chip "Mi perfil" si `isMyProfile`; si no hay "mi perfil", botón **"Este soy yo"** (`setMyProfile`); si es un perfil ajeno con "mi perfil" definido, chip "Viendo el perfil de X".
   - Chips "EUW" y "Arena · temporada actual" (etiqueta estática, D7).
   - Frescura en dos líneas: "Última partida **hace X**" (`lastGameAt`) y "Comprobado hace Y" (`lastSyncedAt`), relativas y actualizadas cada 30 s en cliente.
   - Botón **Actualizar** con icono lucide `RefreshCw` y la barra `.prog` inferior mientras hay job activo o un envío en curso. Resultados de la action: `cooldown` → "Espera un momento" en el toast; `active` → "Ya se está actualizando".
   - **Menú local** (botón "⋯"/`Settings2`) con: exportar JSON (descarga un `.json` con `Blob`), importar JSON (input file → `importState` → confirmar reemplazo → aplicar, o mostrar el error), olvidar "mi perfil" y borrar objetivos y marcas de este perfil. Lo destructivo pide un segundo clic de confirmación. Solo es accesible en "mi perfil", salvo exportar/importar, que se ven siempre.
   - Al montar en un perfil registrado: `addRecent(riotId)`.
   - En móvil (< 640 px): header reducido, con Riot ID y ↻ visibles y el resto en el menú o en una segunda línea sin desbordar.
4. **Banda de sincronización** (§4.10, bajo el header) con `SyncProgress`:
   - `resolving` → "Buscando el Riot ID…".
   - `listing` → "Listando partidas… N".
   - `fetching` en backfill → "Descargando la temporada: **f / t** partidas · ~N min", con barra y la nota "Puedes cerrar la pestaña, la descarga sigue. El álbum y el marcador se rellenan solos". Para la ETA, estima ~1,2 s por partida pendiente (100 peticiones cada 2 min); déjalo en una constante comentada.
   - `paused` → banda en azul acero "Actualización pausada: la clave de Riot ha caducado. Los datos son los de la última sincronización".
   - El incremental no muestra la banda: su progreso va dentro del botón Actualizar (§4.10).
5. **Toast** (`role="status"`, 4,2 s): al pasar de job activo a ninguno tras un "Actualizar" pulsado en esta pestaña, compara con los datos previos (props anteriores) y muestra "+N partidas · nuevo 1º con X" (campeones nuevos en `verifiedChampions`) o "Sin partidas nuevas". Deja la lógica de diff en una función pura `refreshOutcome(prev, next)` y pruébala.
6. **Estados §5**:
   - `unregistered`: tarjeta con el Riot ID y "Registrar y sincronizar", que mantiene la action actual.
   - `not_found`: "No encontramos «Nombre#TAG» en EUW. Revisa el #TAG", un campo con lo escrito (reutiliza el buscador de la landing o un input con `parseRiotIdInput`) y el botón **Reintentar** (`refreshProfileAction`, learn de iter-01).
   - Perfil sin partidas y sin job: "No hay partidas de Arena desde el inicio de la temporada actual (fecha)".
   - `lastJobError`: aviso en el header "No se pudo actualizar (Riot no responde). Datos de hace X" con reintento; los datos siguen visibles.
   - `loading.tsx` con esqueletos del layout final (header, barra, cuadrícula), sin spinner a pantalla completa.
7. Mantén `AutoRefresh` tal cual (polling), montado en perfiles registrados.
8. Responsive a 375/960/1440/1920 sin scroll horizontal: textos largos con `min-w-0` y `overflow-wrap`, y chips con `flex-wrap`.
9. `npm run lint && npm run typecheck && npm test && npm run build` en verde. La verificación visual la hace el orquestador en el navegador integrado: indica en el informe qué comprobar.

## Criterios de aceptacion <!-- MUST -->

- [x] Layout cabina con raíl a partir de 1100 px (container query) y una columna por debajo; solo la pestaña Campeones.
- [x] Header §4.1 completo, con ★, "Mi perfil"/"Este soy yo"/"Viendo el perfil de X", frescura en dos líneas y Actualizar con progreso.
- [x] Menú local con exportar/importar y borrados con confirmación en dos pasos.
- [x] Banda de backfill con f/t y ETA, y pausa por key; se actualiza con el polling.
- [x] Toast de resultado con `refreshOutcome` probado.
- [x] Estados §5: no registrado, no encontrado con reintento, sin partidas, error de la API con datos visibles, y esqueletos.
- [x] `data.ts` sin `puuid`, con tests actualizados. Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- Cabina en `cabin.tsx` (`<Cabin header band god tabs main rail/>`, `@container`). Huecos: `god={null}` (T07), `ChampionsPanel`/`VerifiedChampions` provisional en `#panel-campeones` (T08), `RailPlaceholders` (T10).
- Todo `position: fixed` dentro de `.app` queda contenido por `container-type`: el toast va en portal (`src/components/hy/toast.tsx`); menús y paneles futuros igual.
- `ProfileView` gana `lastGameAt` y `lastJobError: { at }` (sin el texto de `lastError`). El reintento de "no encontrado" usa `refreshAction` (no existe `refreshProfileAction`).
- **Desviación conocida**: el raíl de 380 px (≥ 1500 px de contenedor) es inalcanzable con el contenedor raíz de 1480 px; a 1920 el raíl mide 340 px. No se toca (prototipo; pulido futuro).
- `riot-id-search.tsx` (T05) recibe `defaultValue` para el estado "no encontrado".

## Evidencias <!-- MUST -->

- Navegador integrado (orquestador, 2026-09-30) contra `hylistats_test` (`WORKER_ENABLED=false`, puerto 3001) con escenarios sembrados:
  - Header: iniciales, ★, "Mi perfil", EUW, "Arena · temporada actual", frescura en dos líneas; rótulo enlaza a `/?inicio`; `addRecent` al visitar.
  - Anchos 375/960/1440/1920: `scrollWidth` = viewport en los cuatro; raíl 340 px a 1440 y 1920, debajo del `main` a 960.
  - Banda de backfill "212 / 504 partidas · ~6 min" → "343 / 504 · ~4 min" sin recargar (polling).
  - Actualizar → job → partida nueva: toast "+1 partida · nuevo 1º con Rakan" y datos renovados.
  - Estados: "No se pudo actualizar" con Reintentar y datos visibles; "No encontramos «Ausente Demo#EUW»" con campo y Reintentar; vacío "No hay partidas de Arena desde…"; perfil ajeno "Viendo el perfil de Vacio Demo".
  - Menú local: "Borrar objetivos y marcas" pide un segundo clic y vacía `profiles`. En móvil, Actualizar conserva el nombre accesible (`sr-only`).
- Checks (orquestador): `npm run lint` OK (106 ficheros) · `npm run typecheck` OK · `npm test` 32 ficheros, 499 tests en verde · `npm run build` OK.
- Commit: ver `git log` (`feat(ui): perfil con cabina, header, sincronización y estados`).
