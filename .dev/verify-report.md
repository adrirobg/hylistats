# Verify Report: hylistats — iter-01 motor de datos
**Fecha**: 2026-09-29
**Consume**: commits de `feat/1-motor-de-datos` (T01–T09), AC1–AC8 de `.dev/spec.md` (issue [#1](https://github.com/adrirobg/hylistats/issues/1))
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

Los ocho criterios de aceptación de `spec.md`, con la app real (`next build && next start`, Postgres 17 en Docker, dev key vigente) y un **único backfill completo** contra Riot (T10):

- spec.md AC1: `lint`, `test` y `build` en verde (más `typecheck`).
- spec.md AC2: registrar `BEJITO MAMBO#1991` desde la página lanza un backfill que termina sin 429 sin gestionar y con `fetched/total` visible.
- spec.md AC3: una partida compartida por dos perfiles se descarga una sola vez (test).
- spec.md AC4: nº de campeones distintos con `placement == 1` desde `SEASON_START` frente a `602002`.
- spec.md AC5: el refresco incremental sin partidas nuevas hace 1 sola petición de ids.
- spec.md AC6: con la key caducada el worker se pausa y la página lo indica; al guardar una key válida se reanuda sin reiniciar.
- spec.md AC7: `kill -9` a mitad de backfill → reanuda desde la cola sin duplicados.
- spec.md AC8: la key no aparece en el cliente, los logs ni el repo.

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), Node con `next` 16.3.7, `vitest` 5, Biome 2.4.2.
- Postgres 17-alpine en `docker compose` (puerto 5433; BD `hylistats` dev y `hylistats_test`).
- `.env.local` con `RIOT_API_KEY` (dev key), `ADMIN_TOKEN`, `SEASON_START` (por defecto `2026-05-12T00:00:00Z`) y `WORKER_ENABLED`. La key y el token se leyeron solo desde el shell, sin imprimirlos.
- Navegador integrado del desktop app (Chromium) para la UI.
- Logs del servidor en el scratchpad de la sesión (`server-1.log` antes del kill, `server-2.log` después).

## Checks ejecutados <!-- MUST -->

```bash
# AC1
npm run lint && npm run typecheck && npm test && npm run build

# Preparación del E2E (T10)
docker compose up -d
npm run db:migrate
npm run db:reset -- --yes
npm run build
npm start > "$SCRATCH/server-1.log" 2>&1 &

# AC2: navegador integrado → http://localhost:3000 → buscador "BEJITO MAMBO#1991"
#      → /euw/BEJITO%20MAMBO-1991 → "Registrar y sincronizar"; progreso leído en la página

# AC7: vigilante que, con fetched >= 254, captura /api/health y hace kill -9 al proceso que escucha en :3000
kill -9 "$(lsof -ti :3000 -sTCP:LISTEN)"
npm start > "$SCRATCH/server-2.log" 2>&1 &

# Recuentos (psql en el contenedor)
select id, kind, status, fetched, total_ids from sync_jobs;
select count(*) from matches; select count(*) from participants;
select count(distinct match_id) from participants;
select status, count(*) from match_fetch group by status;
```

## Resultados observados <!-- MUST -->

### AC1 — PASS

Tras T08 (último commit de código): Biome sin avisos (74 ficheros), `tsc --noEmit` OK, **24 ficheros / 299 tests** OK, `next build` OK (`ƒ /admin`, `ƒ /api/admin/key`, `ƒ /api/health`, `ƒ /euw/[slug]`). El mismo pipeline (`.github/workflows/`) corre en la CI de la PR antes del merge.

### AC2 — PASS

- El buscador de la home navegó a `/euw/BEJITO%20MAMBO-1991` ("Este Riot ID todavía no está registrado."). "Registrar y sincronizar" creó el perfil y su backfill.
- La página mostró el progreso con auto-refresco, sin recargar: `Sincronización inicial: descargando 7/508 partidas` → `49/508` a los ~7 s, con barra `<progress>`. "Actualizar" durante el job → "Ya hay una sincronización en curso.".
- Backfill terminado a las 18:18:03 UTC (inicio 18:07:44): job 1 `backfill` `done`, `fetched = total_ids = 508`.
- Métricas Riot: proceso 1 (hasta el kill) `account 1, matchIds 6, match 259, playerData 0, status429 0`; proceso 2 `match 251, playerData 1, status429 1, retries 1`. **Un 429, gestionado** (reintento con `Retry-After`) justo después del reinicio: el limitador vive en memoria y el proceso nuevo arranca con la ventana vacía mientras Riot aún contaba las peticiones del proceso anterior en su ventana de 120 s. Ningún 429 sin gestionar; el backfill terminó sin intervención.

### AC3 — PASS (test)

`src/worker/worker.test.ts` "AC3 dedupe": `BEJITO MAMBO` + `Player013#ANON` (compañero en las 10 partidas del fixture) → `getMatch` llamado 1 vez por id (10), 180 participantes, sin duplicados en `matches`. `match_fetch` es único global por `matchId` (PK).

### AC7 — PASS

- `kill -9` del servidor con `fetched = 258/508` (18:12:09 UTC). Estado en BD tras el kill: job `fetching` 258/508, `matches = 258`, `participants = 4644` (= 18 × 258), `match_fetch`: 258 `done` + 250 `pending`.
- Rearranque: `lock obtenido` (el `kill -9` liberó el advisory lock al caer la conexión) y el worker continuó el mismo job desde la cola: el proceso 2 no repitió Account-V1 ni el listado (`account 0`, `matchIds 0`).
- Fin: `matches = 508`, `participants = 9144` (= 18 × 508), `count(distinct match_id) = 508`, `match_fetch` 508 `done`, un solo job.
- Peticiones de detalle: 259 (proceso 1) + 251 (proceso 2, incluye 1 reintento por el 429) = 510 para 508 partidas: 1 reintento y **1 repetida** (la petición en vuelo en el momento del kill, cuyo resultado no llegó a guardarse; T06 ya preveía "repite como mucho 1 petición").

### AC4 — PASS (diferencia explicada y verificada)

- La página muestra **`70 verificados vs 602002 = 75 (MASTER): diferencia de -5`**. SQL independiente sobre la BD: `count(distinct champion_id) filter (placement = 1)` = **70** (79 primeros puestos en 508 partidas 1750 desde `SEASON_START`; 113 campeones jugados).
- **Causa: la cola 1740.** Además de la 1750 (Arena tríos), el jugador tiene partidas de una segunda cola de Arena, la **1740** (puestos 1–6, ausente de `queues.json`, igual que la 1750), que el backfill no lista porque la spec fija `queue=1750`. Sondeo acotado con el cliente y el limitador del proyecto (script en el scratchpad, fuera del repo):
  1. Ids de la temporada **sin filtro de cola**: 672 = 508 (1750, todas ya en BD; 0 partidas de la BD fuera del listado) + 164 de otras colas. Detalle de las 30 más recientes de esas 164: 29 son `queue=1740` (16 y 23-sep) y 1 es una partida 1750 posterior al backfill (17:59 UTC, la que trae el primer incremental de AC5).
  2. `queue=1740` en la temporada: **80 partidas** (19-jul a 23-sep), puestos `{1: 5, 2: 13, 3: 26, 4: 18, 5: 12, 6: 6}`. Los 5 primeros puestos son con **Sona** (25-jul), **Malphite** (12-ago), **Aphelios** (2-sep), **Gnar** (16-sep) y **Jayce** (23-sep): ninguno tiene un 1º en la 1750.
  3. `distinct champion | placement = 1` en **1750 ∪ 1740 = 75** = valor de `602002`.
  4. Contraste cronológico: el `achievedTime` de `602002` (paso a MASTER, umbral **60**) es, al milisegundo, el `gameCreation` del 1º con Syndra (`EUW1_7989101136`, 2026-09-19 21:30:14 UTC). Syndra es el campeón nº 56 en la 1750 sola y el **nº 60 en 1750 ∪ 1740**: el reto sube a MASTER justo con esa partida.
  - Coste del sondeo: 89 peticiones (8 de ids, 81 de detalle), 0 × 429. No es un segundo backfill.
- El texto que la página da para la diferencia ("la lista verificada solo ve el historial Match-V5 de esta temporada") no describe la causa real. Ver Hallazgos.

### AC5 — PASS

Métricas de `/api/health` (contadores del proceso) antes y después de cada "Actualizar" (job `incremental` interactivo):

| Momento | `matchIds` | `match` | `playerData` | Resultado |
|---|---|---|---|---|
| Tras el backfill | 0 | 251 | 1 | 508 partidas |
| 1er "Actualizar" (hay 1 partida nueva, 17:59) | 1 (+1) | 252 (+1) | 2 (+1) | job 2: `total_ids = 1`, 509 partidas |
| "Actualizar" otra vez a los pocos segundos | — | — | — | "Espera un momento: la última sincronización terminó hace menos de 60 s." (cooldown, sin job) |
| 2º "Actualizar" tras el cooldown (sin partidas nuevas) | 2 (+1) | 252 (+0) | 3 (+1) | job 3: `total_ids = 0`, 509 partidas |

**1 sola petición de ids y 0 de detalle** sin partidas nuevas. La petición de `player-data` (host `euw1`, otra ventana) refresca `602002` en cada sync; es deliberado y está documentado en `steps.ts` (T06).

### AC6 — PASS

1. `update settings set riot_api_key = 'RGAPI-00000000-0000-0000-0000-000000000000'` (key falsa, no la real) y "Actualizar" pasado el cooldown.
2. Riot respondió **401** a la petición de ids. `/api/health`: `worker.state = paused`, `key = { status: invalid, source: db }`. En `settings`: `keyStatusReason = "Riot europe /lol/match/v5/matches/by-puuid/:puuid/ids -> 401"`, sin la key ni puuids. Job 4 en `listing` con `attempts = 0` (no consumió intento). Log: `key rechazada por Riot, worker en pausa`.
3. La página (captura en el navegador integrado) mostró **"Actualización pausada: key caducada. Los datos son los de la última sincronización"**, `Actualización: listando… 0 ids` y los datos anteriores visibles.
4. En 25 s de pausa, 0 peticiones nuevas a Riot (`matchIds` se quedó en 3).
5. `POST /api/admin/key` con `Authorization: Bearer <ADMIN_TOKEN>` y la key real de `.env.local`, ambas leídas en el shell sin imprimirse (cabecera por `-H @<(…)` y cuerpo por stdin): **`{"result":"ok"} HTTP 200`**, tras 1 petición de validación.
6. **Mismo proceso, sin reinicio** (PID 34251): `key actualizada: se reanuda`, y el job 4 terminó a las 18:30:32, el mismo segundo del `POST`. `keyStatus = ok`, `source = db`, worker `idle`. El aviso desapareció de la página en el siguiente auto-refresco.

### AC8 — PASS

Key cargada en una variable del shell (longitud comprobada, valor nunca impreso); solo se imprimieron recuentos:

| Dónde | Apariciones |
|---|---|
| `.next/static` (lo que llega al cliente) | 0 ficheros |
| `.next` completo (bundles de servidor incluidos) | 0 ficheros |
| Logs del servidor (`server-1.log`, `server-2.log`), de los checks y de los sondeos (7 ficheros) | 0 |
| Árbol de trabajo sin `.env.local`, `node_modules`, `.next` ni `.git` (incluye `tests/fixtures/`) | 0 |
| Historial git (`git rev-list --all \| xargs git grep -lF`) | 0 |
| Respuestas HTTP de `/`, `/euw/BEJITO%20MAMBO-1991`, `/admin`, `/api/health`, `/robots.txt` | 0 |

Además: el `puuid` del perfil tampoco aparece en el HTML del perfil, en `/api/health` ni en los logs (0 en los tres). `X-Robots-Tag: noindex, nofollow` y `robots.txt` con `Disallow: /`. La key real queda guardada en `settings` de la BD dev local tras AC6, como prevé el diseño (fuente `db`).

### Presupuesto Riot

Backfill completo único: 1 account + 6 páginas de ids + 510 detalles (508 partidas + 1 repetida por el kill + 1 reintento por el 429) + 1 `player-data`. Después: 4 ids + 1 detalle + 3 `player-data` (incrementales y AC6) + 1 validación; sondeo de AC4, 89. Total ≈ 616 peticiones, un solo 429 (gestionado).

## Juicio de coherencia y sentido <!-- MUST -->

- **Coherencia canon ↔ instancias**: los ocho AC del issue #1 / `spec.md` tienen evidencia directa (AC3 por test, por decisión de la spec; el resto contra la app real). Las tasks T01–T10 cubren todos los entregables 1–10 y las evidencias de cada `task_*.md` cuadran con lo observado aquí (p. ej. T06 preveía "`kill -9` repite como mucho 1 petición" y así fue). Se respetan las decisiones de la spec: puerto 5433, `SEASON_START = 2026-05-12`, `queue=1750`, llamadas a Riot solo desde el worker (salvo la validación de `/admin`), `puuid` y key fuera del cliente.
- **Contradicción detectada con la research**: I1 (`riot-api.md` §5.2) daba la 1750 como la única cola Arena relevante, tras comprobar solo 1700 y 1710. El E2E encuentra la **1740** con 80 partidas del jugador esta temporada. La spec y la decisión `queue=1750` se tomaron con esa premisa. No cambio el alcance (queda como hallazgo para el supervisor), pero la premisa era incompleta.
- **Sentido en el dominio**: 508 partidas desde el 16-may (6 en mayo, 275 en septiembre), 18 participantes por partida, 15,6 % de 1º (azar en 6 equipos: 16,7 %) y puesto medio 3,34 (azar: 3,5): cifras verosímiles para un jugador frecuente. 70 campeones con 1º sobre 113 jugados cuadra con 79 primeros puestos repartidos (AurelionSol 8, Vi 2, Naafiri 2…). La explicación de AC4 no es un ajuste a posteriori: el recuento 1750 ∪ 1740 da 75 exactos y reproduce además el umbral 60 en el instante exacto del `achievedTime`, dos comprobaciones independientes.

## Revision de calidad del codigo <!-- SHOULD -->

Pasada sobre el diff de T07–T08 (T01–T06 se revisaron al cerrarse cada task):

- **Duplicated code** (menor): `formatDate` está copiado en `src/app/admin/page.tsx` y `src/app/euw/[slug]/page.tsx`, y el patrón "capturar el error de Drizzle y loguear solo `safeErrorMessage`" se repite en `src/app/admin/actions.ts` y `src/app/api/admin/key/route.ts`. Son páginas mínimas que la UI final (#2) sustituye.
- **Divergent change / identidad partida en dos módulos**: `normalizeRiotId` vive en `src/worker/queue.ts` y el resto de la lógica de Riot ID en `src/lib/riot-id.ts` (módulo puro). Moverla a `riot-id.ts` e importarla desde `queue.ts` no arrastraría la BD al bundle cliente.
- **Mysterious name / texto engañoso**: el mensaje de diferencia de `602002` en la página atribuye la diferencia al historial Match-V5 y no a colas no incluidas (ver Hallazgos).
- Sin feature envy, middle man ni generalidad especulativa relevantes. Las fronteras de seguridad están bien acotadas: listas blancas explícitas en `data.ts`/`queries.ts`, `getKeyStatus` pregunta con SQL si hay key sin traerla a memoria, y las Server Actions revalidan sesión y slug por su cuenta.

## Replay / validacion independiente <!-- SHOULD -->

- **Aplica de forma parcial**: el riesgo principal (AC4, cuadrar con un contador oficial opaco) se validó con una fuente independiente del pipeline. El sondeo lista ids **sin filtro de cola** y la cola 1740 directamente contra Riot, con un script aparte (actor: orquestador; repo en solo lectura; BD dev solo leída), y cruza el resultado con el `achievedTime` del reto.
- Cobertura efectiva: 672/672 ids de la temporada clasificados (508 en BD + 164 otras); las 80 partidas 1740, con detalle completo.
- Un replay completo por otro actor (segundo backfill) **no aplica**: el presupuesto de la spec permite un solo backfill por perfil, y los recuentos de BD (18 × partidas, `match_fetch` único, sin duplicados) ya se comprobaron por SQL, fuera de la app.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| La cola **1740** (segunda cola de Arena, 80 partidas del jugador esta temporada) queda fuera del backfill (`queue=1750`, decisión de la spec) y de las stats; por eso la lista verificada da 70 frente a 75 | diferido | Supervisor | Decisión de alcance antes de #2: ¿incluir la 1740 en backfill, incremental y stats (partidas, 1º, campeones)? Registrado en `learn.md` → Acciones siguientes (destino `think.md`). Evidencia: sondeo de AC4 (1750 ∪ 1740 = 75; umbral 60 en el `achievedTime`) |
| El texto de la página para la diferencia con `602002` ("solo ve el historial Match-V5 de esta temporada") no describe la causa real | diferido | Orquestador (#2) | UI final de #2, según la decisión anterior. `learn.md` → Acciones siguientes |
| Tras un reinicio del proceso, el limitador (en memoria) arranca con la ventana vacía y puede provocar un 429 mientras Riot aún cuenta las peticiones previas. Gestionado con `Retry-After` (AC2 cumple), pero evitable | diferido | Orquestador | Mejora opcional (sembrar el limitador con `X-App-Rate-Limit-Count` de la primera respuesta). `learn.md` → Deuda |
| `formatDate` duplicado; `normalizeRiotId` fuera de `riot-id.ts` | diferido | Orquestador (#2) | Refactor al rehacer las páginas en #2. `learn.md` → Deuda |

## Conclusion <!-- MUST -->

**PASS**

AC1–AC8 cumplidos con evidencia: AC1 checks en verde; AC2 backfill real con progreso visible y un solo 429, gestionado; AC3 por test; AC4 con la diferencia (70 frente a 75) explicada y verificada: es la cola 1740, y 1750 ∪ 1740 = 75; AC5 1 petición de ids sin partidas nuevas; AC6 pausa, aviso y reanudación sin reinicio; AC7 `kill -9` y reanudación sin duplicados; AC8 0 apariciones de la key. La inclusión de la cola 1740 queda como decisión del supervisor.
