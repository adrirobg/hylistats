# Task T07 — /admin (rotación de key) y /api/health

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Página `/admin` protegida por `ADMIN_TOKEN` para pegar una nueva key de Riot, que se valida contra Riot antes de guardarse en `settings` y despierta al worker; endpoint equivalente para operador por `Authorization: Bearer`; y `/api/health` con el estado de BD, worker, key, cola y métricas Riot, sin exponer la key.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (Key: tabla `settings` y `/admin`), Entregable 7, AC6, AC8.
- `.dev/research/stack.md` §7.1 puntos 1–3 (fuente de la key, `/admin` con `ADMIN_TOKEN`, comparación en tiempo constante, cookie `httpOnly`; validación con una llamada barata antes de guardar; aviso "caduca ~última key + 24 h") y §7 fila "Salud".
- Código previo: `src/lib/riot/client.ts` (`validateKey`, `getRiotMetrics`), `src/lib/riot/key.ts`, `src/worker/queue.ts` (`wakeWorker`), `src/worker/main.ts` (`getWorkerStatus`), `src/db/schema.ts`.
- Next.js 16: leer `node_modules/next/dist/docs/` (Server Actions, `cookies()`, Route Handlers) antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

Sin llamadas a la Riot API real ni lectura de `.env.local`.

1. `src/lib/admin/auth.ts`: `isAdminConfigured()` (hay `ADMIN_TOKEN`), `checkAdminToken(candidate)` (SHA-256 de ambos + `crypto.timingSafeEqual`), `adminSessionValue()` = HMAC-SHA256(`ADMIN_TOKEN`, `'hylistats-admin'`) en hex, `isAdminSession(cookieValue)` (tiempo constante), `isAdminBearer(authorizationHeader)`.
2. `src/lib/admin/key-service.ts`: `saveRiotKey(db, candidate, deps = { validateKey, wakeWorker, now })` → recorta espacios; formato mínimo (`RGAPI-` + resto) o `invalid_format`; `validateKey(candidate)`: `ok` → guarda `settings.riotApiKey`, `keyStatus = 'ok'`, `keyStatusSince`, `keyStatusReason = null`, `updatedAt` y llama a `wakeWorker()`; `invalid` → no guarda, devuelve `invalid`; `error` → no guarda, devuelve `error`. `getKeyStatus(db)` → `{ status, since, reason, source: 'db' | 'env' | 'none', updatedAt, expiresHint }` (sin la key; `expiresHint` = `updatedAt + 24 h` solo si `source = 'db'`).
3. `/admin` (`src/app/admin/page.tsx` + `actions.ts`, `dynamic = 'force-dynamic'`):
   - Sin `ADMIN_TOKEN` configurado → mensaje "Admin deshabilitado: define ADMIN_TOKEN".
   - Sin sesión → formulario de token (Server Action) que, si es correcto, pone la cookie `hylistats_admin` = `adminSessionValue()` (`httpOnly`, `sameSite: 'strict'`, `secure` en producción, `path: '/'`, 30 días).
   - Con sesión → estado de la key (`getKeyStatus`), estado del worker (`getWorkerStatus`), formulario con `<input type="password" autocomplete="off">` para la nueva key (Server Action → `saveRiotKey`; mensaje de resultado; el valor **nunca** se re-renderiza) y botón de cerrar sesión.
   - HTML mínimo sin diseño.
4. `POST /api/admin/key` (Route Handler): exige `Authorization: Bearer <ADMIN_TOKEN>` (401 si no), cuerpo JSON `{ key }`, llama a `saveRiotKey` y responde `{ result }` (`ok` 200, `invalid`/`invalid_format` 400, `error` 502). Sin la key en la respuesta ni en logs. (Permite rotar la key desde el shell sin teclearla en un navegador.)
5. `GET /api/health` (`dynamic = 'force-dynamic'`, `Cache-Control: no-store`): `{ ok, db: 'ok' | 'error', worker: getWorkerStatus(), key: { status, since, source }, queue: { activeJobs, pendingMatches }, riot: getRiotMetrics() }`. Nunca la key ni puuids. `ok` = BD accesible.
6. Tests: `auth.test.ts` (token correcto/incorrecto/longitud distinta; sesión; bearer); `key-service.test.ts` con BD de test y `validateKey` falso (ok guarda + `wakeWorker` llamado; invalid/error no guardan; `invalid_format`; `getKeyStatus` con fuente `db`/`env`/`none`); test del handler de health invocando la función `GET` exportada con `settings.riotApiKey = 'RGAPI-test-secret-000'` y comprobando que el JSON serializado **no** contiene esa cadena; test del handler `POST /api/admin/key` (401 sin bearer; 200 con bearer y validador falso — inyecta el validador vía un módulo sustituible con `vi.mock`).
7. **Arranque con key del entorno** (hallazgo de T06): en `src/worker/main.ts` (`init()`), si `keyStatus = 'invalid'` y **no** hay key en BD (`settings.riotApiKey` null → la key sale de `RIOT_API_KEY`), poner `keyStatus = 'unknown'` al arrancar para reprobar una vez (el reinicio puede traer una key nueva en `.env.local`). Con key en BD inválida se mantiene la pausa hasta `/admin`. Test en `src/worker/main.test.ts` o `worker.test.ts`.
8. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] `/admin` protegido por `ADMIN_TOKEN`; la key se valida contra Riot antes de guardarse y despierta al worker sin reinicio.
- [x] `POST /api/admin/key` con bearer equivalente.
- [x] `/api/health` con BD, worker, key (sin valor), cola y métricas; test que prueba que no filtra la key.
- [x] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

- API: `src/lib/admin/auth.ts` (`ADMIN_COOKIE`, `isAdminConfigured`, `checkAdminToken`, `adminSessionValue`, `isAdminSession`, `isAdminBearer`), `src/lib/admin/key-service.ts` (`saveRiotKey(db, candidate, deps?)` → `ok | invalid | invalid_format | error`; `getKeyStatus(db)` → `{ status, since, reason, source, updatedAt, expiresHint }`, sin traer la key a memoria), `src/worker/steps.ts` (`markKeyUnknown`).
- Los errores de Drizzle citan los parámetros (la key): `saveKeyAction` y `POST /api/admin/key` capturan y loguean solo `safeErrorMessage` (test incluido).
- `/api/health` responde 503 (mismo JSON con `ok: false`, `db: 'error'`) si la BD falla; 200 si no. No expone `reason`.
- `/admin`: resultado por `redirect('/admin?result=<código>')` con mensajes de un mapa cerrado; la key nunca va en la URL ni se re-renderiza. Token y candidato con `trim()`.
- Punto 7: `init()` pasa `invalid` → `unknown` (sin tocar `updatedAt`) solo si la key no está en BD; si Riot vuelve a dar 401, se pausa otra vez. El test previo de "arranca en pausa" pasa a tener key en BD.
- Para T10: `ADMIN_TOKEN` debe estar en el entorno del servidor; sin él, `/admin` muestra "Admin deshabilitado" y el POST da 401.

## Evidencias <!-- MUST -->

- 60 tests nuevos (auth 12, key-service 18, health 3, `POST /api/admin/key` 13, actions 11, worker 3); el de health comprueba que el JSON no contiene la key de BD ni la del entorno, `RGAPI-`, puuids ni el motivo.
- Subagente: `next start` con `WORKER_ENABLED=false` → health 200 + `no-store`; POST sin bearer 401; con bearer y formato inválido 400 sin llamar a Riot; login con token malo/bueno y logout en el navegador.
- Orquestador: `npm run lint && npm run typecheck && npm test && npm run build` → 21 ficheros, 259 tests OK; build OK (`ƒ /admin`, `ƒ /api/admin/key`, `ƒ /api/health`).
- Commit: `feat(admin): rotación de key en /admin y /api/health`.
