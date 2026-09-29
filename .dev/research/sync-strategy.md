# I2 — Estrategia de backfill y sync

> Investigación I2 de `think.md` (2026-09-29). Consume `riot-api.md` (I1). Alimenta I3 (stack) y Spec.
> Etiquetas: **V** verificado en I1 · **D** documentado · **I** inferido/decisión propuesta.

## 0. Resumen ejecutivo

- El límite efectivo es el de **app**: `100 req / 120 s` y `20 req / s`, **por host** (V). `europe` (Account, Match-V5) y `euw1` (Challenges, Summoner) tienen presupuestos independientes. Todo el backfill vive en `europe`.
- Coste de un backfill de temporada: `ceil(N/100) + N` peticiones. Perfil de prueba: 504 partidas → ~510 peticiones → **~10 min** a ritmo sostenido de 0,83 req/s (V/I).
- Las partidas son **inmutables** y se descargan **una sola vez** por `matchId`, aunque aparezcan en el historial de varios amigos. En tríos del grupo, la deduplicación puede ahorrar 1/3–2/3 del coste combinado (I).
- El sync incremental cuesta **1 petición de ids** por perfil y refresco + 1 por cada partida nueva. En una sesión de Arena (~1 partida cada 15–20 min) es despreciable (I).
- Requisito para el stack: hace falta un **proceso de larga duración** (worker) con un rate limiter global por host y una cola persistente. Un backfill de 10 min no cabe en una función serverless de petición/respuesta (I).
- **PUUID cifrado por key/proyecto** (D). Conviene conseguir la Personal key **antes** de persistir datos reales. La identidad primaria del perfil es el Riot ID; `puuid` es caché re-resoluble.
- Al tener BD propia, las partidas guardadas **sobreviven a la retención de 2 años** de Riot (I): el histórico del grupo deja de caducar desde el día en que se registra.

## 1. Presupuesto de peticiones

| Operación | Host | Peticiones | Notas |
|---|---|---|---|
| Resolver Riot ID → puuid | europe | 1 | Solo al registrar o al cambiar de key |
| Listar ids de la temporada | europe | `ceil(N/100)` | `queue=1750&startTime=<inicio temporada>&count=100&start=k·100` |
| Detalle de partida | europe | 1 por partida **no vista** | Dedup por `matchId` en BD |
| Refresco incremental | europe | 1 + nuevas | `startTime=<gameEndTimestamp de la última guardada>` |
| Contador 602002 | euw1 | 1 | `player-data/{puuid}`; en cada refresco |
| Icono/nivel (Summoner-V4) | euw1 | 1 | Opcional, al refrescar la cabecera |

Escenarios (I):

| Escenario | Partidas únicas | Peticiones europe | Tiempo |
|---|---|---|---|
| 1 perfil nuevo (caso prueba) | 504 | ~510 | ~10 min |
| Grupo de 5 que juega mucho junto (solape alto) | ~1.000–1.500 | ~1.030–1.530 | ~20–30 min, una sola vez |
| Refresco de 5 perfiles tras 1 partida en trío | 1 | 5 ids + 1 detalle | < 10 s |

## 2. Modelo de trabajo propuesto (I)

**Cola persistente de dos niveles** en la BD (no en memoria: sobrevive a reinicios y despliegues):

1. `sync_jobs` por perfil: `pending → listing → fetching → done | error`, con `total_ids`, `fetched`, `cursor` y `last_synced_at`.
2. `match_fetch` por `matchId`: único global. Si ya existe en `matches`, se marca como resuelto sin petición.

**Worker único** (un proceso) con un **token bucket por host** que respete ambas ventanas (`20/1 s` y `100/120 s`). Mantener un margen del 10 % (≈90/120 s) para absorber refrescos interactivos mientras corre un backfill.

**Prioridades** (de mayor a menor):

1. Refresco interactivo (el usuario pulsa "actualizar" o la página abierta auto-refresca).
2. Listado de ids de un backfill nuevo, que es barato y da el `total` para la barra de progreso.
3. Detalles de backfill, en **round-robin entre perfiles** para que dos backfills simultáneos avancen a la vez.

**Orden del backfill: de más reciente a más antigua.** La UI se vuelve útil en segundos (últimas partidas, primeras victorias) y el checklist se completa progresivamente.

**Gestión de errores:**

- `429` → respetar `Retry-After`; si falta (límite de servicio), backoff exponencial con jitter.
- `5xx` / timeout → reintentos con backoff (máx. 5) y después `error` recuperable.
- `404` en detalle → marcar la partida como `missing` y no reintentar.
- `401/403` (key caducada o revocada) → **pausar el worker** y mostrar el aviso en la UI. Con la dev key pasa cada 24 h.

## 3. Disparadores de sync (I)

Sin login, el servidor no sabe quién es "mi perfil" (vive en el navegador, F6). Propuesta sin cron:

- **Al abrir un perfil**: si `last_synced_at` supera un umbral (p. ej. 2 min), encolar un refresco.
- **Auto-refresco mientras la página está abierta** (caso pantalla secundaria): polling ligero del estado cada 30–60 s a la BD propia (no a Riot), y un refresco real contra Riot cada ~3–5 min. Así, al acabar una partida, aparece sola en pocos minutos.
- **Botón "actualizar"** con cooldown (p. ej. 60 s) para evitar martilleo.
- **Primer registro**: dispara el backfill y la UI muestra el progreso (`fetched/total`) con los datos parciales ya visibles.

Un cron de refresco periódico de todos los perfiles no es necesario en v1. Queda como opción si se quiere que los datos estén frescos antes de abrir la web.

## 4. Qué se guarda (I)

- `matches`: `matchId`, `queueId`, `gameCreation`, `gameEndTimestamp`, `gameDuration`, `gameVersion`, `endOfGameResult`.
- `participants` (**los 18**, no solo los registrados): `matchId`, `puuid`, `riotIdGameName`, `riotIdTagline`, `championId`, `placement`, `playerSubteamId`, `playerAugment1..6`, items, KDA/daño. Guardar a todos permite las stats de compañeros y que un amigo que se registra después ya tenga partidas en BD (solo hay que listar sus ids).
- JSON crudo comprimido opcional (gzip, ~10–20 KB/partida estimado) para re-derivar campos nuevos sin volver a pedir la partida. El volumen del grupo (~1.500 partidas) queda en decenas de MB como mucho.
- `profiles`: Riot ID (identidad primaria), `puuid` + identificador de la key con que se resolvió, estado de sync y último valor de `602002`.

## 5. Identidad y cambio de key (D/I)

Los PUUID están cifrados por proyecto (D). Hasta ahora hay una **development key**. Si la **Personal key** pertenece a otro proyecto:

- Los `puuid` guardados (perfiles **y los 18 participantes** de cada partida) dejan de casar con los nuevos.
- Los `matchId` no cambian, pero el detalle re-pedido traería los `puuid` nuevos.

**Actualización 2026-09-29:** la Personal key exige registrar el producto y de momento no es posible. Se desarrolla con la **development key** (caduca cada 24 h): el worker debe pausarse ante 401/403 y reanudarse al rotar la key, y la rotación diaria no debe requerir redeploy. **Recomendación original:** solicitar la Personal key al empezar Execute y desarrollar ya con ella. Mientras tanto, tratar la BD de desarrollo como desechable. Si hubiera que migrar, re-resolver perfiles por Riot ID y re-mapear participantes por `riotIdGameName#riotIdTagline` dentro de cada partida (I).

## 6. Temporada (V/D/I)

- La API no expone fechas de temporada (V). Se guarda `SEASON_START` como **configuración** (inicio de Arena Season 2 ≈ 2026-05-12/13, parche 26.10; la primera partida 1750 del perfil de prueba es del 2026-05-16). Se actualiza a mano con cada temporada.
- Filtro de listado: `queue=1750` + `startTime=SEASON_START`. Con el selector de temporadas (recortable, F8), cada temporada sería un par `(queueId, rango de fechas)` en configuración.
- Validación natural en Execute: tras el backfill del perfil de prueba, `distinct(championId | placement==1)` desde `SEASON_START` debería dar **75** (valor del challenge 602002, V). Si no cuadra, activa la capa 3 (marcado manual) y el aviso de descuadre (F7).

## 7. Requisitos que pasa a I3 (stack)

1. Proceso **persistente** para el worker (o un servicio de colas con ejecución larga). No depender solo de funciones serverless con timeout.
2. **BD relacional** con escrituras concurrentes moderadas (worker + web). Volumen pequeño (decenas de MB).
3. Key **solo en servidor**, nunca en el cliente.
4. Canal de progreso hacia la UI: basta con polling cada 30–60 s. SSE o WebSocket son opcionales.
5. Una sola instancia del worker, o coordinación del rate limiter si hay varias. Recomendado: una sola instancia.
6. Coste bajo: uso de un grupo de amigos, tráfico mínimo.

## 8. Preguntas abiertas

- Umbral y cadencia exactos de auto-refresco: ajustar en Execute con uso real.
- ¿Refresco periódico en background para favoritos? No en v1 (sin login, el servidor no los conoce).
- Proyecto de la Personal key frente al de la dev key (afecta a §5): se resuelve al solicitarla.
