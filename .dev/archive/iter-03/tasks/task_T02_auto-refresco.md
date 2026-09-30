# Task T02 — Auto-refresco D10: al volver a la pestaña y cada 5 min si está visible

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Con la pestaña del perfil visible, la página pide un incremental automático como mucho cada 5 min: al montarse, al volver a la pestaña (`visibilitychange`) y con un latido mientras está visible. El guardia está en el servidor, así que vale para varias pestañas y visitantes. Con la pestaña oculta no hay polling ni disparos. El botón Actualizar mantiene su cooldown de 60 s.

## Contexto <!-- SHOULD -->

- spec.md: Entregable 2, AC3 (≤ 1 incremental automático por perfil cada 5 min = 2 peticiones de ids, una por cola) y "Decisiones técnicas" → "AC3 y umbral automático".
- Brief D10 (§8): "Al enfocar + cada 5 min visible, sujeto al presupuesto de I2".
- Código actual:
  - `src/app/euw/[slug]/auto-refresh.tsx`: llama una vez a `ensureFreshOnViewAction(slug)` al montar (guarda por slug para StrictMode). Después hace `router.refresh()` cada 3 s con job activo (`POLL_ACTIVE_MS`) y cada 30 s sin él (`POLL_IDLE_MS`).
  - `src/app/euw/[slug]/actions.ts` → `ensureFreshOnViewAction` → `ensureFreshOnView(db, profileId)`.
  - `src/worker/queue.ts`:
    - `STALE_AFTER_MS = 2 min` (l. 19) y `REFRESH_COOLDOWN_MS = 60 s`;
    - `ensureFreshOnView({ now, staleAfterMs, cooldownMs })` devuelve `fresh` si `lastSyncedAt` es reciente o el perfil es `not_found`, `active` si hay job, y si no, llama a `requestRefresh(..., { interactive: false, cooldownMs })`;
    - `requestRefresh` devuelve `cooldown` si el último job terminó hace menos de `cooldownMs`.
  - Tests: `src/worker/queue.test.ts` (l. 228, `ensureFreshOnView`), `src/worker/worker.test.ts` (l. 584) y `src/app/euw/[slug]/actions.test.ts` (l. 147). Usan `STALE_AFTER_MS` de forma simbólica.
  - `use-refresh.tsx` (botón Actualizar): no lo cambies. Su cooldown de 60 s y su vigilancia se mantienen.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Servidor** (`src/worker/queue.ts`):
   - El umbral automático pasa a 5 min: `STALE_AFTER_MS = 5 * 60_000`. Actualiza su comentario: "disparos automáticos (montaje, volver a la pestaña, latido): como mucho uno cada 5 min por perfil (AC3 de #3)".
   - `ensureFreshOnView` usa por defecto `cooldownMs = STALE_AFTER_MS` (no el de 60 s del botón). Así, un incremental automático que acaba en `error` sin tocar `lastSyncedAt` tampoco se repite antes de 5 min.
   - Actualiza tests y comentarios que citen 2 min (`actions.ts`, `queue.test.ts`, `worker.test.ts`).
   - Añade un test: con un job terminado en `error` hace 2 min y `lastSyncedAt` viejo, `ensureFreshOnView` devuelve `cooldown`, y a los 5 min + 1 ms, `queued`.
2. **Cliente** (`auto-refresh.tsx`):
   - Saca a un módulo puro probado (`auto-refresh-policy.ts` o en `view-model.ts`) la decisión de cuándo comprobar y cuándo hacer polling:
     - comprobar (`ensureFreshOnViewAction`) al montar, al pasar a `visible` y cada `CHECK_EVERY_MS = 60_000` mientras la pestaña esté visible;
     - `router.refresh()` cada 3 s o 30 s solo con la pestaña visible;
     - al volver a `visible`, un `router.refresh()` inmediato además de la comprobación.
   - Usa `document.visibilityState` y el evento `visibilitychange`. Con la pestaña oculta se limpian los intervalos.
   - Conserva la guarda de StrictMode: una sola comprobación por montaje. Si la comprobación devuelve `queued` o `active`, `router.refresh()`. Los errores se tragan (mejor esfuerzo), como ahora.
   - Comentarios en español: explica que el guardia de 5 min está en el servidor y que el latido de 60 s solo toca la BD propia.
3. Tests de la política pura: montaje visible → comprueba; oculto → no hay intervalos; volver a visible → comprueba y refresca; el intervalo de polling depende de `active`.
4. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] `STALE_AFTER_MS` = 5 min y `ensureFreshOnView` con cooldown de 5 min por defecto; el botón conserva el suyo de 60 s.
- [x] Comprobación al montar, al volver a la pestaña y cada 60 s con la pestaña visible; sin polling ni comprobaciones con la pestaña oculta.
- [x] Tests de servidor (umbral, error sin `lastSyncedAt`) y de la política de cliente en verde; los cuatro checks en verde.
- [x] (Orquestador) Con la app real, el worker activo y la pestaña visible ≥ 11 min: ≤ 1 incremental automático cada 5 min, `matchIds` +2 por incremental (logs del worker y `sync_jobs`).

## Notas de implementacion <!-- MAY -->

- **Servidor**: `STALE_AFTER_MS = 5 min`, y `ensureFreshOnView` usa ese mismo valor como `cooldownMs` por defecto. Un incremental automático que acaba en `error` sin tocar `lastSyncedAt` no se repite antes de 5 min. `requestRefresh`, que usa el botón, sigue con 60 s.
- **Cliente**:
  - La política pura está en `auto-refresh-policy.ts`: `autoRefreshOnEvent(mount|visible|checkTick|pollTick, visible)` e `autoRefreshIntervals({ visible, active })`, con 7 tests.
  - `auto-refresh.tsx` lee la visibilidad con `useSyncExternalStore` sobre `visibilitychange`.
  - El polling y el latido van en intervalos separados, así que un cambio de `active` no reinicia el latido de 60 s.
  - Al montar solo se comprueba: la página acaba de renderizarse. Al volver a `visible`, se comprueba y se relee al momento.
- **Tests**: el caso `queued` de `actions.test.ts` pasa de 5 a 6 min, porque 5 min quedaba justo en el borde. Test nuevo en `queue.test.ts`: con un job en `error` hace 2 min devuelve `cooldown` a los 2 min y a los 5 min − 1 ms, y `queued` a los 5 min + 1 ms.
- **Cadencia real**: el latido de 60 s cae unos milisegundos antes de cumplirse los 5 min del job anterior. Por eso el incremental entra cada ~6 min, dentro del "entre 5 y 6 min" de la spec.

## Evidencias <!-- MUST -->

- **Checks (orquestador)**:
  - `npm run lint`: OK, 123 ficheros;
  - `npm run typecheck`: OK;
  - `npm test`: 37 ficheros y 637 tests en verde (+8);
  - `npm run build`: OK.
- **AC3 contra Riot** (orquestador, 2026-09-30):
  - Entorno: `hylistats-dev` (BD dev, worker activo, key `ok` de fuente `db`); perfil `BEJITO MAMBO#1991` abierto en el navegador integrado.
  - Observador JS en la página: parchea `fetch`, registra Server Actions (`next-action`), peticiones RSC y `visibilitychange`, y deja una marca en `window` que sobrevive a toda la prueba (sin recargas).
  - **Visible, 08:17–08:35 UTC (19 min)**:
    - Server Action cada 60 s exactos (08:18:10, 08:19:10… 08:35:10) y RSC cada 30 s.
    - `sync_jobs`: incrementales no interactivos 9 (08:17:10), 10 (08:23:10), 11 (08:29:10) y 12 (08:35:10), separados 6 min.
    - `/api/health`: `requests.matchIds` 2 → 4 → 6 → 8 (+2 por incremental, una petición por cola) y `match` 0.
    - Log del worker por job: `cola 1750 completa (1 ids), sigue con la siguiente` → `listado completo, 0 partidas en cola` → `terminado (incremental, 0 partidas, 602002 = 77)`.
  - **Oculta, 08:36:15–08:41:56 (5 min 41 s)**:
    - El panel del navegador integrado no oculta las pestañas de fondo: `visibilityState` siguió en `visible` con otra pestaña delante, y el job 12 entró igual.
    - Por eso la ocultación se simuló con la misma API que lee el componente: `visibilityState`/`hidden` redefinidos y `visibilitychange` disparado.
    - Resultado: 0 Server Actions y 0 RSC durante los 5 min 41 s; `matchIds` quieto en 8.
  - **Vuelta a visible (08:41:56)**:
    - Server Action y RSC en el mismo milisegundo.
    - Job 13 (incremental, 08:41:56.22), porque habían pasado más de 5 min desde el 12.
    - `matchIds` 10 y polling de 3 s mientras el job estuvo activo.
  - **Total**: 5 incrementales automáticos en 25 min, nunca dos en menos de 5 min; 10 peticiones de ids y 0 de detalle. Ningún 401/403.
