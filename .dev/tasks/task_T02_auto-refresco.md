# Task T02 — Auto-refresco D10: al volver a la pestaña y cada 5 min si está visible

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] `STALE_AFTER_MS` = 5 min y `ensureFreshOnView` con cooldown de 5 min por defecto; el botón conserva el suyo de 60 s.
- [ ] Comprobación al montar, al volver a la pestaña y cada 60 s con la pestaña visible; sin polling ni comprobaciones con la pestaña oculta.
- [ ] Tests de servidor (umbral, error sin `lastSyncedAt`) y de la política de cliente en verde; los cuatro checks en verde.
- [ ] (Orquestador) Con la app real, el worker activo y la pestaña visible ≥ 11 min: ≤ 1 incremental automático cada 5 min, `matchIds` +2 por incremental (logs del worker y `sync_jobs`).

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
