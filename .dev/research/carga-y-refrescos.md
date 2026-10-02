# Carga y refrescos en producción (2026-10-02)

Investigación para la iter-10. Origen: los 502 de la sesión conjunta de Arena del 2026-10-02 (18:20, 18:24, 18:52, 19:27 y 21:11 CEST, con 4–5 personas en la web). Es un análisis: las decisiones se toman en el grill y en la spec.

## 1. Qué pasó: reinicios por el health check

Render reinició la instancia en cada uno de los 502 (eventos `server_failed`: *HTTP health check failed (timed out after 5 seconds)*; logs `Running 'npm run start:prod'`):

| 502 (CEST) | Ráfaga de "destination stream closed early" | Reinicio |
|---|---|---|
| 18:20 / 18:24 | 18:22:09 (~25 respuestas cortadas) | 18:22:28 |
| 18:52 | 18:52:19 | 18:52:27 |
| 19:27 | 19:25:43 | 19:25:58 |
| 21:11 | 21:11:44 | 21:11:55 |

Mecánica: el proceso se satura de CPU, `/api/health` no responde en 5 s, Render da la instancia por caída y la reinicia. El arranque deja la web sin servicio 15–30 s, porque `db:migrate` solo ya tarda ~10 s.

Descartado como causa: la memoria (~170 MB de 512) y la BD (`/api/health` responde en 0,12–0,24 s en reposo). En el plan Free no hay request logs ni métricas HTTP, solo logs de app, eventos y CPU/memoria.

Reproducido sin querer el mismo día a las 21:41 CEST: unas pocas peticiones seguidas desde un solo cliente (una cada vez) mientras alguien tenía abierta la pestaña Grupo. El perfil con `?tab=grupo` tardó 12,5 s y las dos peticiones siguientes dieron 502, con la misma ráfaga de cortes en el log, aunque esta vez sin reinicio.

## 2. Por qué se satura

### 2.1 CPU del plan

Render Free da **0,15 vCPU**. En la sesión, el uso medio por intervalo de 2 min (MAX) llegó a 0,08–0,14.

### 2.2 Coste de cada render

Medido en local (Mac, BD local con 1222 partidas y 6 miembros; tiempo de carga de datos, sin el render de React):

| Carga | Tiempo / CPU por llamada |
|---|---|
| `loadGroupView` | ~72 ms |
| `loadProfileGroupData` (cabecera: ELO + títulos) | ~64 ms |
| `loadProfilePage`, cualquier pestaña | ~75 ms |
| `loadProfilePage` con `tab=grupo` | **~150 ms** (el grupo se calcula dos veces) |
| `countActiveGroupSyncs` | ~1 ms |

Medido en producción (una petición cada vez, HTML completo):

| Página | Tiempo | Tamaño (gzip) |
|---|---|---|
| Perfil (resumen) | 2,8 s | 43 KB |
| Perfil `?tab=partidas` | 4,7 s | 79 KB |
| Perfil `?tab=estadisticas` | 6,9 s | 25 KB |
| Perfil `?tab=grupo` | 12,5 s (con otro usuario activo) | 39 KB |
| `/grupo` | 2,9 s (10,2 s en frío) | 286 KB (sin comprimir) |

Producción va 30–40 veces más lenta que la carga local. Cada render es CPU síncrona (ELO, títulos, temporada, álbum) que bloquea el event loop, así que mientras dura el health check espera.

### 2.3 Hallazgos en el código

1. **`router.refresh()` vuelve a renderizar la página entera en el servidor**: todas las consultas, todos los cálculos y el payload RSC completo, **haya o no datos nuevos**. Lo disparan:
   - `AutoRefresh` (perfil): cada **3 s** si el perfil tiene un job activo y cada **30 s** si no (`auto-refresh-policy.ts`), solo con la pestaña visible.
   - `GroupFreshness` (`/grupo` y la pestaña Grupo): la misma política, pero "activo" significa que **cualquier miembro** tiene un job.
   - `useRefresh`: cada 3 s mientras espera a que aparezca el job pedido con "Actualizar", hasta 90 s.
   - `NotFoundCard`: cada 3 s durante 25 s tras "Reintentar".
2. **Dos pollers a la vez en la pestaña Grupo del perfil**: `AutoRefresh` y `GroupFreshness` llaman a `router.refresh()` cada uno con su propio intervalo, y hacen dos comprobaciones cada 60 s (`ensureFreshOnViewAction` y `ensureGroupFreshAction`). Esa pestaña se renderiza el doble de veces.
3. **El grupo se calcula en cada render del perfil de un miembro**: `loadProfilePage` llama siempre a `loadProfileGroupData` para el ELO y los títulos de la cabecera (todas las partidas de los miembros, ELO desde `SEASON_START` y periodos). Con `tab=grupo` se suma `loadGroupView`, que lo repite (deuda anotada en iter-05: "carga doble en `tab=grupo`").
4. **Nadie comparte el cálculo**: 5 personas viendo el grupo son 5 cálculos idénticos del ELO, los títulos y la temporada en cada ciclo de refresco.
5. **Objetos grandes**: `view.elo.standings` serializa 638 KB (el desglose de cada partida de cada miembro), y `profile.elo` 296 KB. La pestaña Partidas pasa `data.elo.matches` entero (toda la temporada) al componente cliente `MatchesPanel`, aunque solo se pinten las partidas visibles.
6. **Comprobación de frescura** (`ensureFreshOnView`): cada visor, cada 60 s, encola un incremental si el perfil (o cada miembro, en la vista de grupo) lleva más de 5 min sin sincronizar (`STALE_AFTER_MS`). El guardia está en el servidor, así que no se duplican jobs, pero cada visor repite las consultas: la del grupo son 6 miembros × ~3 consultas.
7. **Cada incremental pide siempre a Riot** el 602002 (`getPlayerData`) y el icono (`getSummonerByPuuid`), aunque no haya partidas nuevas: 3–4 peticiones por job. Lo normal en mitad de una partida es 0 partidas nuevas.

### 2.4 Estimación de carga en una sesión

Supuesto: 5 visores con la pestaña Grupo abierta, sin jobs activos (reposo):
- Por visor: 2 pollers × 2 refrescos/min = 4 renders/min, a 2–4 s de servidor cada uno.
- Total: 20 renders/min × ~3 s = **~60 s de servidor por minuto**. El proceso está saturado solo con el polling en reposo.
- Cada 5 min, el reloj de frescura encola los 6 miembros a la vez y el ritmo de todos pasa a 3 s mientras duran los jobs (~5–20 s): unos picos encima de la saturación.

Con el perfil en Resumen en vez de la pestaña Grupo, la carga baja a la mitad (un poller, sin el doble cálculo), pero sigue estando cerca del límite.

## 3. Cómo llega a los demás lo que actualiza uno

Los datos son compartidos (BD), así que todos lo ven, pero tarde y con coste:
- Si A pulsa "Actualizar grupo", se encolan los jobs. B, C y D no se enteran hasta su siguiente refresco en reposo (**hasta 30 s**). Después, cada uno vuelve a renderizar la página entera cada 3 s mientras haya jobs.
- La información es la misma para todos, pero cada visor la calcula entera por su cuenta, y lo repite aunque no haya cambiado nada.

Cuándo se actualizan las partidas solas: con la web abierta, entre 5 y 6 min después de la última sincronización de cada perfil (guardia de 5 min y latido de 60 s). Una partida de Arena dura ~20 min, así que aparece hasta ~6 min después de terminar, más lo que tarde el worker.

## 4. Palancas (para el grill y la spec)

Ordenadas por impacto/coste estimado. No son excluyentes.

A. **Refrescar solo cuando cambian los datos.** Un endpoint de estado barato (p. ej. `GET /api/estado`) que devuelva una **versión de datos** y el **estado de la sincronización** (jobs activos, progreso). El cliente lo consulta cada N s y solo llama a `router.refresh()` si la versión cambió. Como el worker vive en el mismo proceso, la versión puede ser un contador en memoria (`globalThis`, igual que la señal de despertar) que el worker sube cuando **guarda datos visibles** (partidas nuevas, 602002, icono, perfil resuelto) y que `/admin` sube al cambiar el grupo; con un id de arranque para que un reinicio cuente como cambio. Así el endpoint no consulta la BD. Lo que solo es estado de sincronización (botón ocupado, barra de progreso del backfill) lo pinta el cliente con ese mismo JSON, sin rerender.
   - Decisiones abiertas: N (¿10 s?), si un incremental con 0 partidas sube la versión (texto "sincronizado hace…") y cómo se separan los datos del estado en las piezas que hoy leen `data.sync`.
B. **Un solo poller por página.** Fusionar `AutoRefresh` y `GroupFreshness` (y la vigilancia de `useRefresh`) en un único mecanismo, y que la comprobación de frescura vaya en la misma petición (el estado puede hacer de latido: "alguien mira, mantener frescos estos perfiles").
C. **Calcular el grupo una vez por versión de datos.** Memo en memoria de la vista del grupo (filas, ELO, periodos, títulos, temporada) con la clave versión + día/semana de juego, compartida por todos los visores, la cabecera del perfil y la pestaña Grupo. Quita el doble cálculo de `tab=grupo` y hace que 5 visores cuesten como 1. Alternativa: la caché de Next 16 (`"use cache"` con etiquetas, invalidada desde el worker); hay que leer la guía de `node_modules/next/dist/docs/` antes de elegir.
D. **Recortar lo que va al cliente.** `MatchesPanel` solo con el desglose ELO de las partidas visibles, y revisar los payloads grandes (Partidas, 79 KB gzip).
E. **Ajustar el ritmo de sincronización.** Si los refrescos ya no cuestan renders, se puede bajar el guardia de 5 min (p. ej. a 2–3 min) para que las partidas aparezcan antes, y saltarse `getPlayerData`/`getSummonerByPuuid` cuando no hay partidas nuevas, para no gastar cuota de Riot. Pendiente de investigar: si Spectator-V5 expone las partidas de Arena en curso; si lo hace, se podría sincronizar justo al terminar la partida en lugar de con un reloj.
F. **Quitar `/grupo`** (decisión del supervisor, 2026-10-02): no reduce carga por sí sola (la pestaña Grupo tiene el mismo coste), pero elimina una superficie y un poller.
G. **Fuera de código**: Render Starter (~7 $/mes, 0,5 vCPU) multiplica por ~3 la CPU disponible, pero rompe el €0 de F22 y no quita el desperdicio. Quitar el health check evita reinicios, pero deja la web lenta y sin recuperación automática si se cuelga: descartado.

Cómo verificarlo sin repetir el incidente: medir en local (build de producción) renders por minuto y CPU con N pestañas simuladas antes y después, y en producción con el MCP de Render (CPU y eventos `server_failed`) durante la siguiente sesión conjunta. No lanzar pruebas de carga contra producción.
