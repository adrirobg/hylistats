# Task T08 — Estados restantes de §5: límite de peticiones, cola compartida, Arena fuera de rotación, contador oficial y perfil ajeno

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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
5. **"Marcar a mano" desde otra pestaña** (hallazgo de T03): `markByHand` en `arena-god.tsx` hace `router.replace(withSearchParam(pathname, search, "filtro", "sin-ganar"))` en cualquier pestaña. En `?tab=resumen`, eso deja `filtro` en una URL sin álbum. Tiene que partir de la query de `tabHref(pathname, search, "campeones")` (vuelve a Campeones y conserva `campeon`) y después poner el filtro. Cúbrelo con un test de la función pura que construya la URL.
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si arrancas un servidor: `WORKER_ENABLED=false`, solo la BD de tests, y lo paras al terminar.

## Criterios de aceptacion <!-- MUST -->

- [x] Límite de peticiones y cola compartida, derivados en el servidor sin exponer `lastError` ni ids ajenos, y pintados en la banda (backfill) o en el botón/header (incremental).
- [x] Etiqueta de Arena fuera de rotación con la regla de 7 días sobre la BD propia.
- [x] "Oficial sin dato" y perfil ajeno cubiertos por tests en las vistas nuevas.
- [x] Funciones puras probadas (`classifyRetry`, `syncBandModel`, `arenaQuietPhrase`); los cuatro checks en verde.
- [x] (Orquestador) Cada estado se ve en el navegador con una semilla en `hylistats_test`.

## Notas de implementacion <!-- MAY -->

- **Datos** (`data.ts`):
  - `SyncProgress` gana `retryAt`, `reason: RetryReason | null` y `queue: SyncQueue | null`.
  - `loadRetry` usa el `nextRunAt` futuro del job o, en `fetching`, la `nextAttemptAt` mínima si **todas** las partidas pendientes esperan, con una consulta `limit 1`.
  - `loadQueue` cuenta con el criterio de `pickWork`:
    - `ahead`: `pending`/`listing` sin backoff por `interactive desc, id asc`;
    - `sharing`: otros `fetching` sin backoff; un job interactivo solo reparte con interactivos.
    - `queue` vale `null` mientras el job espera un reintento.
  - Aproximación documentada: `sharing` no mira si a los otros jobs les quedan partidas listas.
- **`classifyRetry`**: `RATE_LIMIT_MARKER = "[rate-limit]"` va como prefijo fijo del mensaje de `RiotRateLimitError`, en `errors.ts`, y sobrevive a `safeErrorMessage`. Un `lastError` sin marca se clasifica como `error`, así que un backfill en backoff por 5xx pinta el progreso normal.
- **`arenaQuiet`**:
  - `max(gameCreation)` de las colas de `ARENA_QUEUE_IDS` en toda la BD, sin acotar a temporada ni perfil;
  - se salta la consulta sin `lastSyncedAt` o con `lastJobError`;
  - `ARENA_QUIET_DAYS = 7` en `config.ts`.
- **Vista**:
  - `syncBandModel(sync, paused, now)` con `rate_limit` (tono `trust` como la pausa, barra congelada) y `queued` (tono neutro: esperar turno no es un aviso);
  - `fetching` con `sharing`: ETA × (`sharing` + 1) y "· cola compartida con N perfiles";
  - `queueStartMinutes` = `ahead` × `REQUESTS_PER_JOB_START` (10) × 1,2 s, al menos 1 min;
  - `incrementalStatus`: "En cola (Nº)…" en el botón y el límite en un `Notice` bajo el header;
  - la pausa por key sigue mandando sobre todo.
- **Header**: la etiqueta de Arena es una tercera línea de la zona de frescura, en `text-faint` (4,58:1 sobre el header, AA). Es un `<output>` siempre presente con `empty:hidden`, para que solo se anuncie al aparecer.
- **Paso 4**: `officialPhrase` (dominio) sustituye al ternario inline. `shownProfileData` (`local-store.ts`, pura) sustituye a la lógica inline de `use-profile-local.ts`, para poder probar que un perfil ajeno no enseña objetivos ni marcas. Comportamiento idéntico.
- **Paso 5**: `markByHandHref(pathname, search)` parte de `tabHref(…, "campeones")` y pone `filtro=sin-ganar`.
- **Tests existentes** que ya cubrían el paso 4:
  - `arena-god.test.ts` ("sin contador oficial: unknown…", "sin dato oficial: dice cuándo se intentó");
  - `data.test.ts` ("perfil recién registrado…", `unknown`);
  - `local-store.test.ts` (`isMyProfile`);
  - `teammates-view.test.ts` ("… sin puuid", "railTeammates: solo lleva lo que se pinta").

## Evidencias <!-- MUST -->

- **Checks** (orquestador): `npm run lint` OK (156 ficheros), `npm run typecheck` OK, `npm test` 46 ficheros y **965 tests** en verde (+81), `npm run build` OK.
- **Navegador integrado** (orquestador): `next dev` en el 3001 contra `hylistats_test`, con `WORKER_ENABLED=false`, 1280 px y `seed-perfil.mts` ampliado en el scratchpad (modos T08).

  | Semilla | Qué sale |
  |---|---|
  | `ratelimit` (job `fetching` 307/504, `nextRunAt` +110 s, `lastError` con marca) | Banda `trust` (`rgb(22,32,44)`): "Límite de peticiones alcanzado: la sincronización se reanuda sola en ~1 min" · "307 / 504 partidas descargadas. Los datos ya descargados siguen visibles." y barra congelada |
  | `ratelimit-match` (job sin espera; sus 3 partidas pendientes con `nextAttemptAt` +170 s) | La misma banda con "~3 min" |
  | `ratelimit-inc` (incremental) | Sin banda; botón "Comprobando…" deshabilitado; aviso `trust` bajo el header: "Límite de peticiones alcanzado: la sincronización se reanuda sola en ~2 min. Datos de ahora mismo." |
  | `error503` (control, backoff por 503) | Banda normal: "Descargando la temporada: 307 / 504 partidas · ~4 min". El HTML no contiene ni "503" ni la marca |
  | `queued` (2 `pending` ajenos con id menor) | Banda neutra: "En cola: posición 3 · empieza en ~1 min" · "Otros perfiles se están sincronizando antes…". El HTML no contiene nombres ni `puuid` ajenos |
  | `queued-inc` (1 `listing` ajeno) | Sin banda; botón "En cola (2º)…" |
  | `sharing` (2 `fetching` ajenos) | "Descargando la temporada: 212 / 504 partidas · ~18 min · cola compartida con 2 perfiles" (292 × 1,2 s × 3 / 60 = 17,5 → 18) |
  | `quiet` (partidas −12 días) | Tercera línea del header: "Sin partidas de Arena desde hace 12 d: puede que Arena esté fuera de rotación"; `#858179` sobre el header, 4,58:1 |
  | `quiet-old` (−45 días) | "Sin partidas de Arena desde el 16 ago: …". A 375 px cabe en 2 líneas y sin scroll horizontal (375/375) |
  | `unknown` (`challengeValue` nulo) | Barra "… · oficial sin dato" y aviso "No se pudo leer el contador oficial (ahora). Reintentar" |

- **Perfil ajeno** (semilla `unknown`, `localStorage` con `profiles["jugador uno#euw"] = {targets:[497], manual:[17]}`):
  - con "mi perfil" = Jugador Uno: barra "2 de 60 · 1 verificado + 1 manual" y Rakan "…, objetivo". El panel `?campeon=rakan` muestra "Objetivo · quitar" y "Marcar como ganado a mano…".
  - con "mi perfil" = Vacio Demo, sin borrar esos datos: "Viendo el perfil de Jugador Uno" y barra "1 de 60 · 1 verificado + 0 manuales". Ningún `aria-label` de objetivo ni de marca. El panel ya no ofrece objetivo ni marcado a mano.
- **"Marcar a mano" desde Resumen**: en `?tab=resumen`, pulsar [Marcar a mano] lleva a `?filtro=sin-ganar`, con la pestaña Campeones activa y `aria-pressed` en "Sin ganar". Con el panel abierto, el fondo queda `inert` y no se puede pulsar; la conservación de `?campeon` la cubre el test de `markByHandHref`.
- **Commit**: ver `git log` (`feat(ui): estados de límite de peticiones, cola compartida y Arena fuera de rotación`).
