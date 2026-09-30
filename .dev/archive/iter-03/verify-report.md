# Verify Report: hylistats — iter-03 compañeros, partidas, panel de campeón y cierre de v1
**Fecha**: 2026-09-30
**Consume**: commits de `feat/3-companeros-partidas` (T01–T08), AC1–AC5 de `.dev/spec.md` (issue [#3](https://github.com/adrirobg/hylistats/issues/3)), T09
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

Los cinco criterios de `spec.md`. AC2 y AC4 se verificaron contra la app real (`next build && next start` sobre la BD dev, con worker y dev key vigente) y AC3 contra Riot. Los estados de §5 se verificaron con semillas en `hylistats_test`:

- spec.md AC1: `lint`, `typecheck`, `test` y `build` en verde, con tests de compañeros (tríos: 2 por partida) y de slugs de enlaces; además, 0 fugas de key, `ADMIN_TOKEN` y `puuid`.
- spec.md AC2: pestañas, panel (`?campeon`) y partida expandida (`?partida`), abiertos por URL directa y restaurados al recargar.
- spec.md AC3: ≤ 1 incremental automático por perfil cada 5 min con la pestaña visible, que son 2 peticiones de ids; nada con la pestaña oculta.
- spec.md AC4: 5 campeones límite × 5 webs, abiertos desde los enlaces del panel.
- spec.md AC5: criterio de terminado F4 (sesión real del grupo). **Gate de merge**: aceptación manual del supervisor.
- Entregables 3 y 8: sin scroll horizontal a 375, 960 y 1440 px en las cuatro pestañas y con el panel abierto, y los estados de §5.

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), `next` 16.3.7 (Turbopack), `vitest`, Biome.
- Postgres 17 en `docker compose` (puerto 5433): BD `hylistats` (dev) para el E2E y `hylistats_test` para los tests y las semillas de §5.
- E2E: `npm start` sobre el build de `f828ebe`, con el log en el scratchpad (`server-t09.log`). El worker está activo; la key está en `settings` (fuente `db`, estado `ok`) y es la dev key que caduca hacia las 18:30 UTC.
- Estados de §5: `next dev -p 3001` contra `hylistats_test` con `WORKER_ENABLED=false`, y `seed-perfil.mts` ampliado con los modos de T08 (scratchpad).
- Navegador integrado del desktop app (Chromium), con viewport emulado por `resize_window`.
- La key, el `ADMIN_TOKEN` y los `puuid` solo se cargaron en variables del shell y nunca se imprimieron: solo longitudes y recuentos.

## Checks ejecutados <!-- MUST -->

```bash
# AC1 (sobre el árbol de f828ebe; T09 solo toca .dev/)
npm run lint && npm run typecheck && npm test && npm run build
npx vitest run src/domain/stats.test.ts src/domain/queries.test.ts src/lib/champion-links.test.ts

# E2E
npm start 2>&1 | tee "$SCRATCH/server-t09.log"       # launch.json local: hylistats-start-log
curl -s localhost:3000/api/health
curl -s -D - "localhost:3000/euw/BEJITO%20MAMBO-1991?…" -o "$SCRATCH/http/…"   # 13 respuestas

# Fugas (key de settings y de .env.local, ADMIN_TOKEN y puuid del perfil, en variables del shell)
grep -rlF -- "$V" .next/static | wc -l ; grep -rlF -- "$V" .next | wc -l
grep -rlF --exclude-dir={node_modules,.next,.git} --exclude=.env.local -- "$V" . | wc -l
git rev-list --all | xargs git grep -lF -- "$V" | wc -l
grep -lF -- "$V" "$SCRATCH"/http/* "$SCRATCH"/server-t09.log | wc -l
# Los 8629 puuid distintos de participants, como fichero de patrones
grep -rlF -f "$SCRATCH/puuids.txt" .next/static | wc -l

# AC3 (independiente del log)
select id, kind, interactive, status, created_at, finished_at from sync_jobs where id >= 19 order by id;

# AC2, AC4, responsive y §5: navegador integrado (JS de inspección: URL, título, h1, scrollWidth, aria-*)
```

## Resultados observados <!-- MUST -->

### AC1 — PASS

- **Checks** (último cambio de código, `f828ebe`):
  - Biome: 156 ficheros sin avisos.
  - `tsc --noEmit`: OK.
  - Tests: **46 ficheros, 965 tests** en verde. Eran 623 al cerrar iter-02.
  - `next build`: OK (`ƒ /euw/[slug]`, `ƒ /api/health`, `ƒ /admin`, `ƒ /api/admin/key`).
- **Compañeros**:
  - `src/domain/stats.test.ts` (16 tests): "agrupa los compañeros de trío de las 10 partidas reales". Cada partida aporta exactamente 2 compañeros, con el mismo `playerSubteamId` y distinto `puuid`. Además, "funciona igual con solo las filas del trío (3 por partida)".
  - `src/domain/queries.test.ts`: "alimenta computeTeammates con el mismo resultado que las 18 filas de cada partida".
- **Slugs de enlaces**: `src/lib/champion-links.test.ts` (11 tests) cubre Wukong, Nunu & Willump, Renata Glasc, Bel'Veth y Kai'Sa, el `kebab` de METAsrc y sus excepciones (JarvanIV, KogMaw, RekSai).
- **Fugas**: 0 en todos los sitios revisados. Longitudes: key 42, `ADMIN_TOKEN` 48 y `puuid` 78.

  | Dónde | Key (`settings`) | Key (`.env.local`) | `ADMIN_TOKEN` | `puuid` del perfil |
  |---|---|---|---|---|
  | `.next/static` | 0 | 0 | 0 | 0 |
  | `.next` completo | 0 | 0 | 0 | 0 |
  | Árbol de trabajo sin `.env.local`, `node_modules`, `.next` ni `.git` | 0 | 0 | 0 | 0 |
  | Historial git (todas las ramas) | 0 | 0 | 0 | 0 |
  | 13 respuestas HTTP y log del servidor | 0 | 0 | 0 | 0 |

  Las 13 respuestas: perfil en las cuatro pestañas, con `?partida` y con `?campeon`, en HTML y RSC, más `/`, `/?inicio`, `/admin`, `/api/health` y `/robots.txt`.
  - Los **8629 `puuid` distintos** de `participants` (compañeros y rivales) aparecen 0 veces en `.next/static`, en las respuestas y el log, y en el árbol.
  - Cadenas con forma de `puuid` (78 caracteres) en las respuestas: 0. Texto de `lastError` (marca `[rate-limit]` o `-> 4xx/5xx`): 0.
  - Los `RGAPI-` del árbol son el prefijo que valida el código y keys falsas de tests (`RGAPI-test-secret-…`, `RGAPI-fake-…`, `RGAPI-env-key-000…`).
  - Todas las respuestas del perfil llevan `X-Robots-Tag: noindex, nofollow`.

### AC2 — PASS

Por URL directa sobre la BD dev (`BEJITO MAMBO#1991`, 599 partidas), a 1440 px:

| URL | Qué se abre | Tras recargar |
|---|---|---|
| `?tab=resumen` | Pestaña Resumen activa, con los `h2` "Marcador · 1º = victoria", "Forma · últimas 20", "Evolución · campeones ganados acumulados" y "Destacados" | Igual |
| `?tab=companeros&min=5` | Pestaña Compañeros, `aria-pressed` en "≥ 5" y 9 filas; la primera es "Hylimichi#EUW 414 · 53 · 12,8 % · 52,7 % · 3,42 · hace 56 min" | Igual: "≥ 5" y 9 filas |
| `?tab=partidas&partida=EUW1_7999505011` | Pestaña Partidas con esa partida `aria-expanded` y en vista (`top` 97 px); detalle 6×3 con los 18 jugadores ("1º Ankay#EUW 12/5/18 Darius…") | Igual |
| `?campeon=monkeyking` (Campeones) | Panel "Wukong · Jugado sin ganar · mejor puesto 3º", con las stats y los 5 enlaces | — |
| `?tab=companeros&campeon=monkeyking` | Panel sobre Compañeros, con el foco dentro del diálogo | Igual |

Hay capturas de cada una.

### AC3 — PASS

- **Evidencia principal** (T02, justo tras implementar el auto-refresco; completa en `tasks/task_T02_auto-refresco.md` de esta iteración → Evidencias), con la app real y el worker contra Riot:
  - **Visible, 08:17–08:35 UTC**: Server Action cada 60 s. Incrementales no interactivos 9, 10, 11 y 12, separados 6 min. `requests.matchIds` 2 → 4 → 6 → 8 (+2 por incremental, uno por cola) y `match` 0.
  - **Oculta, 5 min 41 s**: 0 Server Actions, 0 RSC y `matchIds` quieto.
  - **Vuelta a visible**: comprobación inmediata y job 13, porque habían pasado más de 5 min.
  - Total: 5 incrementales automáticos en 25 min, nunca dos en menos de 5 min.
- **Repetido con el código final** (`f828ebe`, E2E de T09): con la pestaña del perfil visible en el navegador integrado, el proceso `next start` encadenó estos incrementales automáticos (`sync_jobs`, no interactivos, hora UTC):

  | Job | Creado | Separación |
  |---|---|---|
  | 22 | 13:42:34 | — (la visita al abrir) |
  | 23 | 13:47:57 | 5 min 23 s |
  | 24 | 13:53:28 | 5 min 31 s |
  | 25 | 13:58:57 | 5 min 29 s |

  - Según `/api/health`, el proceso hizo `matchIds` 8 (= 4 × 2), `playerData` 4 y `match` 0, con 0 × 429 y 0 reintentos.
  - El log de cada job: "cola 1750 completa (0 ids), sigue con la siguiente" → "listado completo, 0 partidas en cola" → "terminado (incremental, 0 partidas, 602002 = 77)".
- **Uso real del supervisor** (su `npm run dev`, el mismo día): jobs 20 (13:28:18) y 21 (13:34:18), separados 6 min.

### AC4 — PASS

Se abrieron en el navegador integrado los enlaces que pinta el panel `?campeon=` de la app (`target=_blank`, `rel="noopener noreferrer"`), para los 5 casos límite. Los 25 abren la página del campeón correcto, sin redirecciones:

| Campeón (panel) | op.gg | LoLalytics | METAsrc | u.gg | Blitz |
|---|---|---|---|---|---|
| Wukong | `/lol/modes/arena/monkeyking/build` · "Wukong Arena - Build, Augments…" | `/lol/wukong/arena/build/` · h1 "Wukong Arena Build, Augments & Counters" | `/lol/arena/champions/wukong/build` · h1 "Wukong Arena Build LoL…" | `/lol/champions/arena/monkeyking-arena-build` · h1 "Wukong Arena Build" | `/lol/champions/MonkeyKing/arena` · h1 "Wukong Arena Build, Augments…" |
| Nunu y Willump | `…/nunu/build` · "Nunu & Willump Arena - Build…" | `…/nunu/arena/build/` · h1 "Nunu & Willump Arena Build…" | `…/champions/nunu/build` · h1 "Nunu & Willump Arena Build…" | `…/nunu-arena-build` · h1 "Nunu & Willump Arena Build" | `…/Nunu/arena` · h1 "Nunu & Willump Arena Build…" |
| Renata Glasc | `…/renata/build` · "Renata Glasc Arena - Build…" | `…/renata/arena/build/` · h1 "Renata Glasc Arena Build…" | `…/champions/renata-glasc/build` · h1 "Renata Glasc Arena Build…" | `…/renata-arena-build` · h1 "Renata Glasc Arena Build" | `…/Renata/arena` · h1 "Renata Glasc Arena Build…" |
| Bel'Veth | `…/belveth/build` · "Bel'Veth Arena - Build…" | `…/belveth/arena/build/` · h1 "Bel'Veth Arena Build…" | `…/champions/belveth/build` · h1 "Bel'Veth Arena Build…" | `…/belveth-arena-build` · h1 "Bel'Veth Arena Build" | `…/Belveth/arena` · h1 "Bel'Veth Arena Build…" |
| Kai'Sa | `…/kaisa/build` · "Kai'Sa Arena - Build…" | `…/kaisa/arena/build/` · h1 "Kai'Sa Arena Build…" | `…/champions/kaisa/build` · h1 "Kai'Sa Arena Build…" | `…/kaisa-arena-build` · h1 "Kai'Sa Arena Build" | `…/Kaisa/arena` · h1 "Kai'Sa Arena Build…" |

- La URL final coincide con la del enlace en los 25 casos.
- En op.gg el `h1` es genérico ("Game modes"), así que la prueba es el `<title>`. En el resto, el `h1` nombra al campeón.
- La primera carga de u.gg se quedó en la comprobación automática de Cloudflare ("Un momento…"). Se resolvió sola, sin intervención, y la recarga dio la página de Wukong.
- No se interactuó con banners de cookies: solo se leyeron URL, título y `h1`.
- La tabla completa de slugs (173 campeones en op.gg, LoLalytics y METAsrc; muestras en u.gg y Blitz) se verificó en T06.

### Responsive — PASS

`document.documentElement.scrollWidth` ≤ `clientWidth` en las 15 combinaciones (BD dev):

| Ancho | Campeones | Resumen | Compañeros | Partidas + `?partida` | Panel (`?tab=partidas&campeon=kaisa`) |
|---|---|---|---|---|---|
| 375 | 375 = 375 | 375 = 375 | 375 = 375 | 375 = 375 | 375 ≤ 375 (hoja inferior de 0 a 375 px) |
| 960 | 945 = 945 | 945 = 945 | 945 = 945 | 945 = 945 | 945 ≤ 960 (hoja lateral de 525 a 945 px) |
| 1440 | 1425 = 1425 | 1425 = 1425 | 1425 = 1425 | 1425 = 1425 | 1425 ≤ 1440 (hoja lateral de 1005 a 1425 px) |

Con el panel abierto se bloquea el scroll del documento: `clientWidth` crece y el panel respeta el hueco de la barra de scroll.

### Estados de §5 — PASS

Detalle y semillas en `task_T08_estados-s5.md` → Evidencias. En resumen, con `hylistats_test`:

| Estado | Qué se ve |
|---|---|
| Límite de peticiones, backfill (job o todas sus partidas en backoff por 429) | Banda azul acero: "Límite de peticiones alcanzado: la sincronización se reanuda sola en ~N min", con la barra congelada en 307/504 |
| Límite de peticiones, incremental | Sin banda; aviso bajo el header: "…se reanuda sola en ~2 min. Datos de ahora mismo." |
| Backoff por 503 (control) | Progreso normal: no se confunde con el límite |
| Cola | "En cola: posición 3 · empieza en ~1 min"; en el incremental, el botón dice "En cola (2º)…" |
| Cola compartida | "212 / 504 partidas · ~18 min · cola compartida con 2 perfiles" |
| Arena fuera de rotación | "Sin partidas de Arena desde hace 12 d: puede que Arena esté fuera de rotación" y, con más de 30 días, "desde el 16 ago" (4,58:1 sobre el header) |
| Oficial sin dato | "… · oficial sin dato" y "No se pudo leer el contador oficial…" |
| Perfil ajeno | "Viendo el perfil de Jugador Uno". Con objetivos y marcas guardados en el navegador, no se muestran ni en el álbum ni en el panel |

- En ninguna respuesta aparecen el `lastError`, los nombres ni los `puuid` de otros perfiles.

### AC5 — Gate de merge (aceptación manual del supervisor)

Criterio de terminado de la v1 (F4): en una sesión real de Arena, el grupo elige campeón y consulta stats y compañeros sin abrir otra web. El recuento de campeones ganados cuadra con el contador oficial o la app explica la diferencia. El orquestador no puede cumplirlo. Va como checklist en la PR y, tras el merge, como gate pendiente en `think.md` §Hilos abiertos.

Dato de apoyo del E2E: la BD dev muestra 77 verificados y `602002` = 77.

### Presupuesto Riot

Del proceso `next start` de T09 (`/api/health`): `matchIds` 8, `playerData` 4, `match` 0, `account` 0 y `validate` 0. Son los 4 incrementales automáticos, con **0 × 429 y 0 reintentos**. No hubo backfill ni `db:reset`.

## Juicio de coherencia y sentido <!-- MUST -->

- **Canon ↔ instancias**:
  - Los 5 AC de #3 / `spec.md` tienen evidencia directa, y AC5 queda como gate.
  - T01–T08 cubren los entregables 1–8, y sus Evidencias cuadran con lo observado aquí.
  - Se respetan D4 (curva con el umbral de 60), D6 (≥ 3 y aviso por debajo de 5), D9 (panel en portal, hoja lateral o inferior), D10 (auto-refresco) y D12 (perfil ajeno sin capa local).
  - No entra nada de "No incluye": ni D5, ni D8, ni D11, ni hosting.
- **Sentido en el dominio**:
  - Los incrementales sin partidas nuevas cuestan exactamente 2 peticiones de ids (una por cola) y 1 de `player-data`, como prevé la spec (I2).
  - La cadencia observada (5 min 23 s – 6 min) es el efecto esperado de un latido de 60 s sobre un umbral de 5 min en el servidor.
  - La inferencia "Arena fuera de rotación" se redacta como posibilidad ("puede que"). Solo sale si la última sincronización fue bien, para no confundir un fallo propio con la rotación de Riot.
- **Mismatch spec ↔ código**:
  - La spec ejemplifica la etiqueta con "desde el X". Para menos de 30 días sale "desde hace N d", porque reutiliza `whenPhrase`, como el resto de la frescura. Es coherente con el header y no cambia el sentido.
  - `reason: "error"` (backoff por 5xx) viaja en `SyncProgress`, pero ninguna vista lo pinta: un 5xx transitorio no es un estado de §5 y se ve el progreso normal.

## Revision de calidad del codigo <!-- SHOULD -->

Pasada sobre el diff de la iteración: 71 ficheros de `src/` y `tests/`, unas 11 000 líneas añadidas, de ellas unas 5300 de tests.

- **Deuda de iter-02 saldada**: `TONE_BG` pasa junto a `placeTone` (T05).
- **Lógica pura aparte y probada**: `matches-view.ts`, `teammates-view.ts`, `champion-panel-view.ts`, `won-curve-view.ts`, `auto-refresh-policy.ts`, `refresh-outcome.ts` y, en T08, `classifyRetry`, `syncBandModel`, `incrementalStatus`, `markByHandHref` y `shownProfileData`.
- **Large module** (vigilar):
  - `data.ts` pasa de unas 190 a 621 líneas: carga por pestaña, espera y cola, `arenaQuiet`. Mantiene una frontera con lista blanca (sin `puuid` ni `lastError`), pero ya es candidato a partirse (p. ej. `sync-progress.ts` para `loadSyncProgress` / `loadRetry` / `loadQueue`).
  - `album-card.tsx` (511) y `album.tsx` (485) siguen como en iter-02.
- **Duplicated knowledge** (menor, documentado): `loadQueue` replica el orden de `pickWork` (`src/worker/steps.ts`) en SQL. Los dos citan al otro en sus comentarios, y hay tests de `data.test.ts` que fijan las reglas (interactivo, backoff e `id`). Si `pickWork` cambia, hay que tocar las dos.
- **Contrato explícito en lugar de parsear texto**: `RATE_LIMIT_MARKER` es un prefijo fijo del mensaje de `RiotRateLimitError`, probado de extremo a extremo (worker → `lastError` → `classifyRetry`).
- Sin generalidad especulativa, middle man ni cadenas de mensajes relevantes.

## Replay / validacion independiente <!-- SHOULD -->

- **AC3** se validó con dos fuentes independientes del log de la app: `sync_jobs` por SQL y `/api/health`, en dos momentos (T02 y T09) y con dos versiones del código. Además, el uso del propio supervisor dio la misma cadencia (jobs 20–21).
- **AC4** se validó en las webs de terceros reales, no con los tests: los tests fijan las plantillas y el navegador comprueba que siguen vigentes.
- **Fugas**: se buscaron los valores reales, sin fiarse de patrones, y además las formas (`puuid` de 78 caracteres y `RGAPI-`).
- **No aplica** un replay por otro actor del E2E con Riot: la spec prohíbe un segundo backfill completo, y los incrementales son idempotentes (0 partidas nuevas).

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| "Marcar a mano" desde otra pestaña dejaba `?filtro` en una URL sin álbum (hallazgo de T03) | resuelto | N/A | `markByHandHref` (T08), con test y verificado en el navegador desde `?tab=resumen` |
| `data.ts` creció a 621 líneas | diferido | Orquestador | `learn.md` → Deuda: partir la carga de sync (`loadSyncProgress`, `loadRetry`, `loadQueue`) si crece más |
| `loadQueue` replica en SQL el orden de `pickWork` | diferido | Orquestador | Documentado en ambos sitios y fijado en tests. `learn.md` → Deuda |
| `sharing` cuenta los `fetching` ajenos sin mirar si les queda algo listo que pedir (puede sobrestimar la ETA un instante) | diferido | Supervisor | Aproximación documentada; hilo "Pulido UI" si molesta |
| Detalles menores anotados durante la iteración: "Aún no has jugado a X" sale igual en perfiles ajenos; "Ver todos (≥ 1)" de Compañeros no tiene tope; a 375 px se pierde la marca "12 may" del eje de la curva | diferido | Supervisor | Hilo "Pulido y mejora de la UI base" de `think.md` |
| El payload RSC del polling sigue siendo deuda de iter-02 (56–108 kB según la pestaña, con carga por pestaña) | diferido | Orquestador | Hilo "Pulido UI" (ya registrado) |

## Conclusion <!-- MUST -->

**PASS**

- **AC1**: checks en verde (965 tests), tests de tríos y slugs, y 0 fugas de key, `ADMIN_TOKEN` y `puuid` (incluidos 8629 de compañeros y rivales).
- **AC2**: pestañas, panel sobre dos pestañas y partida expandida por URL directa, restaurados al recargar.
- **AC3**: incrementales automáticos separados 5 min 23 s – 6 min, con +2 `matchIds` cada uno, contra Riot en T02 y en T09; nada con la pestaña oculta.
- **AC4**: 25/25 enlaces correctos en 5 campeones límite.
- **Responsive**: 15/15 sin scroll horizontal. **§5**: los 8 estados vistos con semillas.
- **AC5** queda como gate de merge: sesión real del grupo (F4), aceptación manual del supervisor.
