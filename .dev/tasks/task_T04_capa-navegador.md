# Task T04 — Capa de navegador (F6) y parser de entrada de Riot ID

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Dos piezas puras y probadas que consumen la landing (T05), el header (T06) y el álbum (T09):

1. **Capa de navegador**: "mi perfil", favoritos, recientes, y objetivos y marcas manuales por perfil. Guarda en `localStorage`, exporta e importa JSON, y funciona igual sin storage.
2. **Parser de lo que teclea el usuario**: `Nombre#TAG`, `Nombre-TAG` o una URL de op.gg.

## Contexto <!-- SHOULD -->

- spec.md: Entregable 4, AC1 (tests de la capa de navegador: sin storage, JSON corrupto, import/export; y del parser) y "Decisiones técnicas → Datos locales".
- think.md F5 (el navegador recuerda "mi perfil", favoritos y recientes) y F6 (objetivos y marcas solo en `localStorage`, exportar/importar).
- Brief §3.1 (el campo acepta `Nombre#TAG`, `Nombre-TAG` y la URL pegada de op.gg; región fija EUW), §4.12 (menú local: exportar/importar, olvidar "mi perfil", borrar objetivos y marcas) y D12 (los perfiles ajenos no muestran datos locales).
- `src/lib/riot-id.ts`: módulo puro con `RiotId`, `toRiotId` (valida nombre de 3–16 caracteres y tag de 2–5 alfanuméricos), `parseProfileSlug`, `profileSlug` y `parseRiotId` (separa por el último `#`). Ya hay tests en `src/lib/riot-id.test.ts`.
- `normalizeRiotId(gameName, tagLine)` vive hoy en `src/worker/queue.ts:25` (lado servidor) y se importa desde `src/app/euw/[slug]/data.ts` y el worker. El learn de iter-01 pide moverla a `src/lib/riot-id.ts`, que es puro, para usarla también en cliente.
- Formatos de URL de op.gg que hay que aceptar, con o sin `https://`, con o sin `www.`, con barra final, sufijos y query:
  - `op.gg/lol/summoners/euw/Nombre-TAG`
  - `op.gg/summoners/euw/Nombre-TAG`
  - `op.gg/es/lol/summoners/euw/Nombre-TAG`
  - sufijos como `/champions` o `?queue_type=…`
  - nombre codificado (`BEJITO%20MAMBO-1991`)
- Zod 4 disponible. Sin jsdom: el storage de los tests es un objeto falso que implementa la interfaz `Storage` (o `null`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Riot ID** (`src/lib/riot-id.ts`):
   - Mueve aquí `normalizeRiotId` y re-expórtala desde `src/worker/queue.ts` para no romper importaciones, o actualiza los imports; lo que deje el diff más limpio.
   - Añade `parseRiotIdInput(input: string): { ok: true; riotId: RiotId } | { ok: false; reason: "empty" | "format" | "region" }`:
     - Recorta el texto.
     - Si parece una URL de op.gg, extrae la región y el slug y los parsea con `parseProfileSlug`. Región distinta de `euw` → `"region"`.
     - Si contiene `#`, usa `parseRiotId`.
     - Si no, separa por el último `-`.
     - Exporta también `riotIdInputError(reason)`, con el mensaje en español para la UI: formato `Nombre#TAG`; "Solo EUW".
   - Tests nuevos para las tres formas, las variantes de URL, espacios, tildes, vacío, región no EUW y basura.
2. **Capa de navegador** (`src/lib/local-store.ts`, sin `"use client"` en la lógica pura):
   - Estado versionado:
     - `{ v: 1, myProfile: RiotId | null, favorites: Array<RiotId & { addedAt: number }>, recents: Array<RiotId & { visitedAt: number }>, profiles: Record<riotIdNorm, { targets: number[]; manual: number[] }> }`
     - `targets` y `manual` son `championId`.
   - Reductores puros e inmutables:
     - `setMyProfile` y `clearMyProfile`.
     - `toggleFavorite`.
     - `addRecent`: al principio, sin duplicados por Riot ID normalizado, máximo 10.
     - `removeRecent`.
     - `toggleTarget(norm, championId)`.
     - `setManual(norm, championId, on)`.
     - `clearProfileData(norm)`.
     - `isMyProfile(state, riotId)`: compara normalizado.
   - `exportState(state): string`: JSON con indentación y `v`.
   - `importState(text)`: `{ ok: true; state } | { ok: false; error: string }`. Valida con Zod, descarta entradas inválidas sueltas (un `championId` no numérico, un Riot ID inválido) sin rechazar todo, y rechaza JSON no parseable o de otra versión con un mensaje claro.
   - `createLocalStore(storage: Storage | null)`:
     - `getState()`, `subscribe(listener)` y `dispatch(reducer)`.
     - **Todo acceso a storage en `try/catch`.**
     - Con `storage === null`, o si lanza (modo privado, cuota, JSON corrupto guardado), sigue funcionando en memoria.
     - Un valor corrupto guardado no rompe la carga: arranca vacío y lo sobrescribe en la siguiente escritura.
     - Clave `hylistats:v1`.
   - **Hook cliente** (`src/lib/use-local-store.ts`, con `"use client"`):
     - Instancia única perezosa con `window.localStorage` protegido en `try/catch` (acceder a la propiedad puede lanzar).
     - `useLocalStore(selector)` con `useSyncExternalStore`, con snapshot de servidor = estado vacío para no romper la hidratación.
     - Sincronía entre pestañas con el evento `storage`.
     - Acciones expuestas como funciones.
3. **Tests** (`src/lib/local-store.test.ts`):
   - Sin storage (`null`) y con un storage que lanza en `getItem`/`setItem`: funciona en memoria.
   - JSON corrupto guardado: arranca vacío.
   - Ida y vuelta export → import idéntica.
   - Import de JSON inválido, de otra versión o con entradas parcialmente inválidas.
   - `addRecent`: deduplica, pone el último primero y limita a 10.
   - `toggleTarget` y `setManual` por perfil.
   - `isMyProfile` sin distinguir mayúsculas.
   - La suscripción notifica.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] `parseRiotIdInput` acepta `Nombre#TAG`, `Nombre-TAG` y URLs de op.gg EUW, y rechaza las demás regiones y la basura, con tests.
- [x] `normalizeRiotId` es pura en `src/lib/riot-id.ts`, sin romper el worker ni la página.
- [x] La capa de navegador funciona sin storage, con storage que lanza y con JSON corrupto; import/export con validación (tests).
- [x] Hook `useLocalStore` compatible con SSR (`useSyncExternalStore` con snapshot de servidor).
- [x] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- `normalizeRiotId` vive en `src/lib/riot-id.ts` y `src/worker/queue.ts` la re-exporta (los imports de servidor no cambian); `toRiotId` pasa a exportarse.
- `localStorage`: clave `hylistats:v1`. Para probar la redirección: `localStorage.setItem("hylistats:v1", JSON.stringify({v:1, myProfile:{gameName:"…", tagLine:"…"}, favorites:[], recents:[], profiles:{}}))`.
- `useLocalStore(selector)` memoiza el selector por referencia de estado; `useLocalReady()` es `false` en servidor e hidratación (la redirección de la landing debe esperarlo). `localActions` lanza en el servidor.
- `favorites` en orden de alta; `recents` del más reciente al más antiguo. `importText` sustituye el estado (no fusiona).

## Evidencias <!-- MUST -->

- Tests: `src/lib/riot-id.test.ts` (49; tres formas, 17 variantes de URL, regiones y basura), `src/lib/local-store.test.ts` (53; sin storage, storage que lanza, JSON corrupto, export/import, reductores, suscripción) y `src/lib/use-local-store.test.ts` (4; SSR con `renderToString`).
- Checks (orquestador, 2026-09-29): `npm run lint` OK (87 ficheros) · `npm run typecheck` OK · `npm test` 28 ficheros, 442 tests en verde · `npm run build` OK.
- Commit: ver `git log` (`feat(lib): capa de navegador y parser de Riot ID`).
