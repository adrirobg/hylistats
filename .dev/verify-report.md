# Verify Report: hylistats — iter-10 carga, refrescos y flujo de ramas
**Fecha**: 2026-10-02
**Consume**: commits de `feat/22-carga-y-refrescos` (T01–T09, integrados desde worktrees), AC1–AC12 de `.dev/spec.md` (issue [#22](https://github.com/adrirobg/hylistats/issues/22)); mediciones de T06 y T08
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

- spec.md AC1: versión de datos por perfil y del grupo, puntos de subida, id de arranque.
- spec.md AC2: estado barato y propagación (política, botones, barras, toasts desde el JSON).
- spec.md AC3: un solo poller por página, frescura dentro del estado, `STALE_AFTER_MS` = 2 min.
- spec.md AC4: `GroupView` calculada una vez por versión, día y semana.
- spec.md AC5: sin `/grupo`.
- spec.md AC6: payload de Partidas.
- spec.md AC7: incremental ligero.
- spec.md AC8: medición local antes/después.
- spec.md AC9: flujo de ramas (las cláusulas de entrega —merge en `develop`, cierre y `v1.1.0`— se cumplen en Ship).
- spec.md AC10: prueba de carga en producción → **abierta**, tras la release `v1.1.0` (se añade aquí).
- spec.md AC11: aceptación manual del grupo → **gate abierto** (F18).
- spec.md AC12: calidad.
- T09 (Spectator-V5, sin AC propio): investigación documentada.

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), Node 26.9.0, `next` 16.3.7 (Turbopack), Vitest, Biome.
- Postgres 17 en Docker (`hylistats-postgres-1`, puerto 5433). Cada worker usó su BD de tests propia (`tNN_hylistats_test`, borradas al terminar); el árbol principal, `hylistats_test`.
- **"Antes"** (T08): build de producción del código de `develop` en el puerto 3108, BD dev con los datos de la dev key (1222 partidas, 6 miembros), worker en pausa (dev key caducada guardada en `settings`).
- **"Después"** (T10): build de producción de la rama (`GROUP_VIEW_LOG=1 next start -p 3110`).
  - AC8 en reposo: misma BD y mismas condiciones que el "antes" (worker en pausa).
  - Navegador y worker: a petición del supervisor, la BD dev local se **migró a la Personal key** (`pg_dump` previo en `~/Backups/hylistats/backup-local-2026-10-02-pre-personal.sql`; `settings.riot_api_key` vaciada; `npm run db:reset -- --keep-profiles --yes`; servidor con `RIOT_API_KEY` = Personal en el entorno). Backfill completo: 7 perfiles, 1247 partidas, 602002 al día.
- Navegador integrado del desktop app (ventana de 632×409 y 800×600).

## Checks ejecutados <!-- MUST -->

```bash
# AC12 — calidad (árbol principal, rama integrada)
npm run lint && npm run typecheck && npm test && npm run build

# AC8 — antes (T08, código de develop) y después (rama)
npm run sim:session -- --base-url http://localhost:3108 --slugs "BEJITO MAMBO#1991,Hylimichi#EUW,Azpekaa#EUW,Krill1nt#EUW,TheCIutch#EUW" --clients 5 --duration 5 --mode antes --start-tab grupo --switch-every 0
npm run sim:session -- --base-url http://localhost:3110 --slugs "BEJITO MAMBO#1991,Hylimichi#EUW,Azpekaa#EUW,Krill1nt#EUW,TheCIutch#EUW" --clients 5 --duration 5 --mode despues --start-tab grupo --switch-every 0

# AC4/AC8 — cálculos de GroupView (una línea por cálculo con GROUP_VIEW_LOG=1)
grep -c '\[group-view\] cálculo' server.log
grep -o 'clave=[^ ]*' server.log | sort | uniq -d    # vacío = ninguna clave calculada dos veces

# AC3 — pollers sueltos
grep -rn "setInterval\|router.refresh\|\.refresh()" src --include=*.ts --include=*.tsx | grep -v test

# AC5 — redirect
curl -sI http://localhost:3105/grupo

# AC6 — tamaños (T06): HTML y RSC (cabecera RSC: 1) de /euw/hylimichi-euw?tab=partidas, sin comprimir y gzip
```

Pasos manuales en el navegador (rama en el 3110, worker activo con la Personal key):

1. Perfil de Hylimichi durante el backfill: barra de progreso y datos creciendo; red (`/api/estado` y peticiones RSC).
2. `/grupo` → URL final; tooltip del badge "Pareja rota del día" → enlace → posición de `#titulos`.
3. Pestaña Grupo: consultas con `&grupo=1`; consola.
4. Botón Actualizar (pestaña visible) con un `MutationObserver` sobre el `<output>` del toast y el botón; dos veces (dentro y fuera del cooldown).
5. Propagación: clic en una pestaña y un "otro cliente" que imita al poller (`/api/estado` cada 10 s, `curl`).
6. "Actualizar grupo" en la pestaña Grupo; jobs en BD y contador de cálculos.

## Resultados observados <!-- MUST -->

**AC12 — calidad.** En el árbol principal, con T01–T09 integradas: lint OK, typecheck OK, **71 ficheros y 1437 tests en verde**, build OK. Cada worker pasó además lint, typecheck, test y build en su worktree antes de commitear (T05: 1369, T06: 1376, T08: 1382, T02: 1393, T07: 1403, T04: 1409, T03: 1410 tests). Nota: en el árbol principal el primer build tras quitar `/grupo` falló por tipos obsoletos de un `next dev` anterior en `.next/dev/types/validator.ts` (referencia a `src/app/grupo/page.js`); se resolvió borrando `.next/dev` (artefacto generado).

**AC1 — versión de datos** (T02). `src/lib/data-version.ts`: `globalThis.__hylistatsDataVersions` con id de arranque (`"<bootId>.<n>"`), contador por perfil y del grupo; tests unitarios. Subidas (`src/worker/version-bumps.ts`, tests de BD en `src/worker/data-version.test.ts`): partida insertada → cada perfil registrado entre sus participantes (y el grupo si alguno es miembro), tras el commit y solo si `storeMatch` la insertó; perfil resuelto o `not_found`; `closeJob` solo si cambian el 602002 (valor o nivel) o el icono, no por `lastSyncedAt`; `/admin` en el dominio, solo si la lista cambia. Backfill de un perfil ajeno no toca miembros ni grupo salvo partidas compartidas (test). Tras el reinicio del servidor el id de arranque cambió (`25b020d7` → `8c39981c`). En el navegador: el job sin partidas de las 21:40 no cambió la versión (`8c39981c.959` antes y después).

**AC2 — estado y propagación** (T02 + T04).
- `GET /api/estado?perfil=<slug>[&grupo=1]` (`no-store`): el test de la ruta hace lanzar a `loadGroupView`, `loadProfileGroupData` y `getProfileStats`, y pasa → el estado no calcula el grupo ni las stats. Respuesta de ~0,3–0,4 KB (JSON del perfil y del grupo); p50 11 ms / p95 21 ms en la simulación.
- Política pura `status-policy.ts` con tests: 10 s / 5 s con job (del perfil, o de algún miembro con `grupo=1`), solo con la pestaña visible, consulta inmediata al montar y al volver, `router.refresh()` solo si cambian `kind`/`version`/`groupVersion` y como mucho uno por consulta.
- Navegador: durante el backfill, `/api/estado` cada 5 s y un repintado RSC tras las consultas que traían versión nueva; la barra avanzó de 40 a 81/863 sin recargar. Con el limitador de Riot en espera (90 peticiones/2 min), consultas sin repintado (sin datos nuevos). En reposo, solo `/api/estado` cada 10 s. Con el panel del navegador oculto (`visibilityState = hidden`), ninguna consulta.
- Propagación: clic en Actualizar a las 21:40:02 → el "otro cliente" vio el job en la consulta de ese mismo instante y `lastSyncedAt` nuevo en la siguiente (21:40:12): **≤ 10 s**. Las partidas nuevas aparecieron al guardarlas el worker (backfill y partida `EUW1_8001920698`, guardada 21:36:18).
- Toasts (pestaña visible): dentro del cooldown, "Espera un momento" a los 249 ms; fuera de él, botón ocupado al instante y **"Sin partidas nuevas" ~5 s después, sin petición RSC de repintado** (solo la respuesta de la server action).
- "Actualizar grupo": 5 incrementales encolados (Hylimichi en cooldown), terminados en ~1,2 s, sin partidas. Con jobs tan cortos la etiqueta "Actualizando N de M" no llega a pintarse entre dos consultas: es lo esperado.
- Consola sin avisos de hidratación en Resumen y Grupo.

**AC3 — un poller y frescura** (T02 + T04). El grep solo encuentra un `router.refresh()`, en `status-provider.tsx:137`; los otros `setInterval` son la animación del sorteo y el reloj de `use-now.ts`. Borrados `auto-refresh.tsx`, `auto-refresh-policy.ts`, `group-freshness-section.tsx` y las actions `ensureFreshOnViewAction` / `ensureGroupFreshAction`. Frescura dentro del estado con registro compartido `globalThis.__hylistatsFreshnessChecks` (como mucho una vez cada 30 s por perfil, también entre página y grupo; tests). `STALE_AFTER_MS` = 2 min con tests de cola y acciones; en el navegador, incrementales automáticos de los miembros cada ~2 min con la pestaña Grupo abierta.

**AC4 — grupo calculado una vez** (T03). Memo en `src/domain/group-view-memo.ts` (clave: versión del grupo + día de juego + semana + año + temporada + catálogo; promesa compartida). Tests: N llamadas concurrentes → 1 cálculo; recálculo por versión, por las 06:00 de Madrid y por el lunes 06:00; vista igual a `loadGroupView`; `tab=grupo` → 1 cálculo. Servidor: con las 5 cargas de AC8, **1 cálculo**; durante todo el backfill y las pruebas, **95 cálculos con 95 claves distintas** (ninguna repetida), máx. ~93 ms. Los tests existentes de títulos y ELO de la cabecera siguen en verde.

**AC5 — sin `/grupo`** (T05). `curl -sI /grupo` → `307`, `location: /`. En el navegador, `/grupo` acaba en `http://localhost:3110/`. La barra superior solo tiene "Sorteo". El tooltip del badge enlaza a `?tab=grupo#titulos`: al pulsarlo, la URL pasa a `/euw/hylimichi-euw?tab=grupo#titulos` y `#titulos` queda arriba (top = 16 px), con "TÍTULOS — cómo se ganan". Sin otros enlaces a `/grupo`.

**AC6 — payload de Partidas** (T06; `hylimichi-euw`, 933 participaciones, bytes):

| Petición | HTML | HTML gzip | RSC | RSC gzip |
|---|---|---|---|---|
| `?tab=partidas` antes | 497.399 | 75.514 | 294.804 | 60.151 |
| `?tab=partidas` después | 259.769 | 27.812 | 76.600 | 13.742 |
| `&n=2` (100 filas) antes | 645.839 | 82.153 | 312.476 | 62.225 |
| `&n=2` (100 filas) después | 421.689 | 37.226 | 106.652 | 18.726 |

Con `n=2`, el DOM sin `<script>` es idéntico antes y después; `?partida` fuera del bloque conserva su desglose.

**AC7 — incremental ligero** (T07). Tests del worker: un incremental vacío hace solo los `matchIds` (sin `playerData` ni `summoner`) y conserva los valores guardados; con partida nueva y en el backfill sí los pide. Criterio añadido y **aceptado por el supervisor**: también se piden si el perfil tiene una partida guardada que terminó después de su última lectura (caso de la partida que ya descargó un amigo). Retraso del 602002: no concluyente con los datos locales, sin indicios (T07).

**AC8 — medición local** (5 clientes en la pestaña Grupo, 5 min en reposo):

| | Antes (`develop`) | Después (rama) |
|---|---|---|
| Peticiones | 105 (5 cargas + 100 refrescos) | 155 (5 cargas + 150 de estado) |
| Renders de página | **21,0/min** (25, 20, 20, 20, 20) | **1,0/min = solo las 5 cargas** (5, 0, 0, 0, 0) |
| Tamaño medio de respuesta | 188 KB | 12 KB (las 5 cargas HTML; el estado son ~0,3–0,4 KB) |
| Tiempos | carga p50 830 ms; refresco RSC p50 191 / p95 214 ms | carga p50 427 ms; estado p50 11 / p95 21 ms |
| 5xx | 0 | 0 |
| CPU del proceso | ~4,2 s/min | n/m (casi todo son consultas de ~11 ms) |
| Cálculos de `GroupView` | uno por render | 1 |

"Actualizar grupo" a mitad (navegador): 0 partidas nuevas → 0 cambios de versión del grupo → **0 cálculos** (95 antes y después). En el backfill, cálculos = cambios de versión del grupo (95/95). Propagación ≤ 10 s (AC2).

**AC9 — flujo de ramas** (T01). Tag anotado `v1.0.0` sobre `b955a82`, en GitHub tras el sí del supervisor (`refs/tags/v1.0.0`). `AGENTS.md` ("Ramas y releases (F27)": `develop`, releases, hotfix, SemVer, sin staging), `docs/deploy.md` ("Releases y hotfixes": runbook de release en 4 pasos y de hotfix en 5; el despliegue automático sigue diciendo `main`), `dev-ship` (PR contra `develop`, cierre en `develop`, paso 4 "Oferta de release" sin ejecutarla sin el sí) y `dev-close-iter` (cierre en `develop`); entrada #32 en `dogfood-log.md`. Pendiente de Ship: merge en `develop`, cierre allí y release `v1.1.0` (`package.json` incluido).

**AC10 — abierta**: tras la release `v1.1.0`, con el sí del supervisor en el momento.

**AC11 — gate manual abierto** (F18): siguiente sesión conjunta del grupo. Dato real ya visto: tras el final del lobby (21:34:11) la partida estaba guardada a las 21:36:18 (~2 min).

**T09 — Spectator-V5**: devuelve la partida de Arena en curso (`gameQueueConfigId` 1750, `CHERRY`, 18 participantes con `riotId`, sin subequipo: todos `teamId` 100). Tras la eliminación del jugador sigue devolviendo la partida del lobby; Match-V5 la publica al terminar el lobby. Detalle e implicaciones en `.dev/research/riot-api.md` §7b.

## Juicio de coherencia y sentido <!-- MUST -->

- **Coherencia spec ↔ código**: cada palanca de F26 tiene su pieza y su test (A versión + estado, B poller, C memo, D payload, E guardia y parte barata, F `/grupo`). Las tres desviaciones están registradas y son conservadoras: el criterio extra de T07 (aceptado por el supervisor), la superposición de `lastSyncedAt` sobre la vista memorizada (T03, valores iguales a los de hoy sin consultas extra) y `SyncEmpty` (T04, estados vacíos que leen el estado para que un perfil sin partidas no quede en esqueleto fijo).
- **Sentido en el dominio**: la causa de los 502 era el trabajo de servidor por reloj; en reposo, el "después" deja **0 renders** frente a 21/min, y lo que queda (estado ~11 ms) no toca el cálculo del grupo. El trabajo pasa a depender de cambios reales: durante un backfill la página se rehace como mucho una vez cada 5 s por visor, y el grupo una vez por versión para todos. Las cifras locales no son las de Render (0,15 vCPU, ~30–40× más lento): por eso AC10 existe y no se da por cubierto con AC8.
- **Lo que no cambia**: el render de cada pestaña sigue costando lo mismo (fuera de alcance); las precargas de pestañas tras un repintado son baratas (con `loading.tsx` devuelven ~12 KB en 2–4 ms, frente a 40–70 KB de un render completo).
- **Flujo de ramas**: la propia iteración ya usa la PR contra `develop`; `main` sigue intacta hasta la release.

## Revision de calidad del codigo <!-- SHOULD -->

Diff `develop..feat/22-carga-y-refrescos`: 60 ficheros de `src/`, `scripts/` y `tests/` (+3900 / −995).
- **Divergent change** reducido: `data.ts` baja de 720 a 498 líneas; el estado de sincronización vive en `src/domain/sync-status.ts` y lo comparten la página y la ruta (sin duplicar), y la vista del grupo memorizada en su propio módulo.
- **Duplicated code**: T04 sacó `profileSyncToJson` / `groupSyncToJson` para que la ruta y el render generen el mismo JSON.
- **Estado global en `globalThis`** (versiones, frescura, memo): tres registros con el mismo patrón que la señal de despertar del worker. Es deliberado (una sola instancia, AGENTS.md) y cada uno tiene una función de reset para tests.
- **Speculative generality**: `--status-path` / `--version-field` del script de sesión son configurables por CLI; útil para AC10 contra producción, no más.
- Sin smells bloqueantes.

## Replay / validacion independiente <!-- SHOULD -->

Aplica parcialmente: cada task la implementó un worker en su worktree y el orquestador revisó los diffs críticos (puntos de subida en `steps.ts`, ruta de estado, memo, `needsCloseCounters`), integró, repasó la batería completa en el árbol principal y verificó en el navegador con el worker real. El replay independiente de verdad es AC10 (producción) y AC11 (el grupo), ambos abiertos.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| Tipos obsoletos de `next dev` en `.next/dev/types` rompen el build tras borrar una ruta | resuelto | N/A | `rm -rf .next/dev`; artefacto generado, no del repo |
| Los worktrees de los workers nacen de `b955a82` (sin la spec ni las tasks de la iteración) y la BD de tests exige el sufijo `hylistats_test` | resuelto | N/A | prompts corregidos en vivo (fast-forward a la rama, `tNN_hylistats_test`); a `dogfood-log` en Learn |
| Un worker (T07) imprimió `SUPABASE_DATABASE_URL` al hacer `grep` sobre `.env.local` (solo en su transcript local) | diferido | supervisor | rotación opcional; prohibir `grep`/`cat` de `.env.local` en los prompts de worker (Learn) |
| En `npm run build` de un worktree (T06), Turbopack falló con `next/font/google` (se midió con `--webpack`); en el árbol principal y en otros worktrees no se reprodujo | diferido | orquestador | observar; si se repite, anotarlo en Learn |
| `.env.local` local: `RIOT_API_KEY` sigue siendo la dev key caducada, y la BD local ya tiene los PUUID de la Personal key | diferido | supervisor | poner `RIOT_API_KEY` = Personal en `.env.local` (lo hace el supervisor: es un secreto) |
| 602002: en 2 de 7 perfiles el oficial va 1 por encima del recuento propio (dirección contraria a un retraso) | diferido | orquestador | fuera de alcance; anotarlo como hilo en Learn |

## Conclusion <!-- MUST -->

**PASS**

AC1–AC9 (salvo las cláusulas de entrega de AC9, que se cumplen en Ship) y AC12 verificados con evidencia. AC10 (prueba en producción tras `v1.1.0`) y AC11 (aceptación manual del grupo, F18) quedan abiertos y se mergea con ellos abiertos, como prevé la spec.
