# Task T08 — Estados restantes de §5: límite de peticiones, cola compartida, Arena fuera de rotación, contador oficial y perfil ajeno

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Header y banda explican, en lenguaje llano y sin códigos, los estados de §5 que faltan:
- **Límite de peticiones**: "Límite de peticiones alcanzado: la sincronización se reanuda sola en ~2 min". El progreso queda congelado pero visible.
- **Cola compartida**: "En cola: posición 2 · empieza en ~1 min"; mientras descarga en paralelo con otros perfiles, la ETA lo tiene en cuenta.
- **Arena fuera de rotación**: "Sin partidas de Arena desde el X: puede que Arena esté fuera de rotación".
- **Contador oficial no disponible** y **perfil ajeno**: ya existen desde iter-02. Se comprueban en las vistas nuevas y se cubren con tests.

## Contexto <!-- SHOULD -->

- spec.md:
  - Entregable 8;
  - "Decisiones técnicas" → "Arena fuera de rotación": inferido de la BD propia. Si la última partida de Arena de **cualquier** perfil tiene más de 7 días y la última sincronización fue bien, se muestra la etiqueta.
  - "Decisiones técnicas" → "Límite de peticiones y cola compartida": derivados en el servidor; el texto de `lastError` no sale del servidor.
- Brief §5 (tabla de estados), §4.10 (banda de backfill, incremental en el botón y cola compartida) y §4.3 ("sin dato oficial").
- Código del worker (orden de servicio en `src/worker/steps.ts`):
  - `pickWork` (l. ~243):
    1. `pending`/`listing` por `interactive desc, id asc`;
    2. después los `fetching` en round-robin por `lastServedAt asc nulls first`, con los interactivos antes.

    Un job en backoff tiene `nextRunAt > now`.
  - `failJob` (l. ~785): con 5xx o 429 persistentes pone `nextRunAt` con backoff y `lastError = safeErrorMessage(error)`. Un `RiotRateLimitError` (`src/lib/riot/errors.ts`) trae "límite de peticiones tras N intentos" en su mensaje (`src/lib/riot/client.ts` l. ~293).
  - Las partidas en backoff viven en `match_fetch.nextAttemptAt` (`fetchMatch`, l. ~700), con `lastError` por partida.
- Carga: `src/app/euw/[slug]/data.ts`, con `loadSyncProgress`, `SyncProgress`, `loadLastJobError` y `ProfileView` (`sync`, `lastJobError`, `paused`). La vista es pura en `view-model.ts` (`syncBandModel`, `SECONDS_PER_MATCH`, `syncEtaMinutes`, `dataAgePhrase`) y se pinta en `sync-band.tsx` y `header.tsx`.
- Ya existentes:
  - "oficial sin dato" (`arena-god.tsx` l. 155, `src/domain/arena-god.ts` con estado `unknown`);
  - "Viendo el perfil de X" (`header.tsx` l. 249);
  - el panel de campeón oculta objetivo y marcado manual en perfiles ajenos (T06).
- Semillas del orquestador para verificar (`seed-perfil.mts`): modos `synced|backfill|incremental|listing|resolving|error|paused`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Datos** (`data.ts` + tests en `data.test.ts`):
   - `SyncProgress` gana `retryAt: Date | null` y `reason: "rate_limit" | "error" | null`.
     - `retryAt`: `nextRunAt` futuro del job o, en `fetching`, la `nextAttemptAt` más cercana si **todas** las partidas pendientes están en backoff.
     - La clasificación se hace en el servidor: `rate_limit` si el `lastError` correspondiente viene de un `RiotRateLimitError`. Usa una función pura `classifyRetry(lastError)` con test, apoyada en un marcador estable. Si hace falta, añade al mensaje de `RiotRateLimitError` o a `safeErrorMessage` un prefijo fijo y documentado. El texto no llega a la página.
   - `SyncProgress` gana `queue: { ahead: number; sharing: number } | null`.
     - `ahead`: jobs activos de **otros** perfiles que `pickWork` serviría antes (solo si este job está `pending`/`listing`).
     - `sharing`: número de otros jobs `fetching` con los que reparte el round-robin (si este está `fetching`).
     - Sin `puuid` ni ids de otros perfiles en la vista: solo recuentos.
   - `ProfileView.arenaQuiet: { lastArenaGameAt: number } | null`:
     - `lastArenaGameAt` es la última partida de Arena de la BD (cualquier perfil, colas `ARENA_QUEUE_IDS`, `max(gameCreation)`);
     - vale no `null` si tiene más de `ARENA_QUIET_DAYS = 7` días, el perfil tiene `lastSyncedAt` y no hay `lastJobError`.
     - Constante en `src/lib/config.ts` con comentario (Riot no expone la rotación de modos).
2. **Vista pura** (`view-model.ts` + tests):
   - `syncBandModel` gana los casos `rate_limit` (con minutos hasta `retryAt`, al menos 1, y el progreso congelado si lo hay) y `queued` (posición `ahead + 1`, "empieza en ~N min" con una estimación sencilla y documentada, al menos 1).
   - En `fetching` con `sharing > 0`, la ETA se multiplica por `sharing + 1` y el texto añade "· cola compartida con N perfiles".
   - La pausa por key caducada sigue mandando sobre todo.
   - Incremental: el mismo estado va al texto del botón o al aviso del header, no a la banda (§4.10). Ejemplos: "En cola (2º)…", "Límite de peticiones: se reanuda en ~2 min".
   - `arenaQuietPhrase(lastArenaGameAt, now)` → "Sin partidas de Arena desde el 12 sep: puede que Arena esté fuera de rotación", con `whenPhrase`/`formatRelative`.
3. **UI**:
   - `sync-band.tsx` pinta los casos nuevos (tono de aviso, no de error) y `header.tsx` la etiqueta de Arena en la zona de frescura (segunda línea), atenuada, con `role="status"` solo si cambia.
   - Lenguaje llano, sin códigos HTTP.
4. **Comprobaciones de lo existente**: añade o ajusta tests para que "oficial sin dato" (§4.3, `unknown`) siga saliendo sin `challengeValue`, y para que en perfil ajeno el panel (T06) y la tabla de compañeros (T04) no muestren datos locales. Si ya están probados, cita el test en tus notas.
5. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si arrancas un servidor: `WORKER_ENABLED=false`, solo la BD de tests, y lo paras al terminar.

## Criterios de aceptacion <!-- MUST -->

- [ ] Límite de peticiones y cola compartida, derivados en el servidor sin exponer `lastError` ni ids ajenos, y pintados en la banda (backfill) o en el botón/header (incremental).
- [ ] Etiqueta de Arena fuera de rotación con la regla de 7 días sobre la BD propia.
- [ ] "Oficial sin dato" y perfil ajeno cubiertos por tests en las vistas nuevas.
- [ ] Funciones puras probadas (`classifyRetry`, `syncBandModel`, `arenaQuietPhrase`); los cuatro checks en verde.
- [ ] (Orquestador) Cada estado se ve en el navegador con una semilla en `hylistats_test`.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
