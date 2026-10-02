# Spec: hylistats — iter-10 carga, refrescos y flujo de ramas
**Estado**: aprobada (issue [#22](https://github.com/adrirobg/hylistats/issues/22), aprobada por el supervisor, 2026-10-02, con las siete inferencias del orquestador y sin recortes; rama `feat/22-carga-y-refrescos` desde `develop`)
**Consume**: think.md §5 (alcance, fuera y criterio de terminado) y decisiones F26 y F27 como referencia y restricción; ORGANIZED "iter-10: carga, refrescos y flujo de ramas" (P1–P8); `.dev/research/carga-y-refrescos.md` (mediciones, hallazgos 2.3 y palancas A–F); F17 (día de juego), F18 (validación manual agrupada), F19 (grupo, revisado), F20 (semana), F22 (Render Free + Supabase Free) y F23 (superficie pública)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

Que el grupo (4–5 personas a la vez, F1) use la web sin 502 ni esperas y que lo que actualiza uno lo vean los demás sin refrescar a mano (F26): la página solo se rehace cuando hay datos nuevos y el grupo se calcula una vez para todos. Además, las features pasan por `develop` antes de producción y llegan a `main` en releases versionadas (F27); la iter-10 es la primera que recorre ese flujo, hasta `v1.1.0`.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Versión de datos** (palanca A). Contador en memoria (`globalThis`, como la señal de despertar de `src/worker/queue.ts`), con un id de arranque para que un reinicio cuente como cambio.
  - **Por perfil**: sube cuando el worker guarda algo que se ve de ese perfil: una partida en la que participa (también si la guarda el job de otro perfil), el contador `602002`, el icono, el perfil resuelto o `not_found`. Un incremental sin partidas nuevas **no** la sube.
  - **Del grupo**: sube cuando sube la de cualquier miembro y cuando `/admin` cambia la lista del grupo.
  - **Acotada**: el backfill de un perfil ajeno al grupo no hace repintar a quien mira otro perfil o la pestaña Grupo, salvo que una partida guardada incluya a ese perfil.
- **Estado barato** (A). Una petición que, para lo que mira la página (un perfil y, si es miembro, el grupo), devuelve la versión y el **estado de la sincronización**: job activo y progreso (lo que hoy es `ProfileView.sync`), cola, error del último job, pausa por key, "sincronizado hace…" (`lastSyncedAt`) y, en la vista del grupo, jobs activos y la sincronización más antigua. Puede hacer consultas ligeras a la BD (jobs y perfiles); **nunca** el cálculo del grupo ni el de las stats.
- **Un solo poller por página** (B). Consulta el estado cada **10 s** sin sincronización en marcha y cada **5 s** con ella, solo con la pestaña visible; al volver a la pestaña consulta en el momento. Llama a `router.refresh()` solo si cambió la versión, como mucho una vez por consulta. Sustituye a `AutoRefresh`, al polling de `GroupFreshness`, a la vigilancia de `useRefresh` y al polling de `NotFoundCard`.
  - Lo que solo es estado (botón Actualizar o "Actualizar grupo" ocupado, barra de progreso, aviso de antigüedad, toast de resultado "+N partidas · nuevo 1º con X" / "Sin partidas nuevas", barra Deidad de Arena sincronizando) se pinta desde el JSON del estado, sin rehacer la página.
  - **Frescura dentro del estado**: la misma petición hace de latido ("alguien mira estos perfiles") y aplica `ensureFreshOnView` / `ensureGroupFresh`. Para que 5 visores no repitan las consultas de frescura cada 10 s, la comprobación se hace como mucho una vez cada 30 s por perfil, compartida en memoria entre visores.
- **Guardia de frescura a 2 min** (E, P3): `STALE_AFTER_MS` de 5 a 2 min.
- **Grupo calculado una vez** (C). Memo en memoria de la vista del grupo (`GroupView`: filas, ELO, periodos, títulos, temporada, equipos) con clave = versión del grupo + día de juego (F17) + semana (F20) de `now`; lo comparten todos los visores, la cabecera del perfil (`loadProfileGroupData`: títulos y ELO) y la pestaña Grupo. Quita la carga doble de `tab=grupo`. Solo se guarda la última entrada.
- **Sin `/grupo`** (F, P7):
  - La URL `/grupo` redirige a `/`.
  - Desaparece el enlace "Grupo" de la barra superior (`top-bar.tsx`); "Sorteo" se queda.
  - El enlace del tooltip de los badges de título pasa de `/grupo#titulos` a `?tab=grupo#titulos` del mismo perfil.
  - La vista sigue en la pestaña Grupo de los perfiles de miembros, con el apartado Títulos al final, sin otros cambios. `revalidatePath("/grupo")` desaparece.
- **Desglose ELO solo de las filas visibles** (D). `MatchesPanel` recibe el desglose ELO solo de las partidas de `matches.rows` (el bloque de `?n`); "Ver más" trae el del bloque siguiente con el mismo mecanismo de hoy. Nada cambia en lo que se ve.
- **Incremental sin partidas, sin llamadas de más** (parte barata de E). Un incremental que no encuentra partidas nuevas no pide `602002` (`getPlayerData`) ni el icono (`getSummonerByPuuid`). El backfill y los incrementales con partidas nuevas siguen pidiéndolos.
- **Flujo de ramas** (F27):
  - Tag `v1.0.0` sobre `b955a82` (el `main` actual) y push del tag.
  - `AGENTS.md`: `develop` como rama de trabajo, `main` solo releases y hotfixes, SemVer, sin staging.
  - `docs/deploy.md`: runbook de release (4 pasos de P5) y de hotfix (P6); la sección de despliegue automático sigue diciendo `main`.
  - Skills `dev-ship` y `dev-close-iter` **adaptadas solo en hylistats**: PR contra `develop`, merge y cierre en `develop`, y al terminar `dev-ship` **ofrece** la release (no la hace sin el sí del supervisor). Entrada en `.dev/research/dogfood-log.md` como cambio local deliberado, para llevar la idea al canon de dev-system (excepción del supervisor a "registrar, no reparar").
  - `package.json` a `1.1.0` en la release de esta iteración (`npm version minor`).
- **Script de sesión simulada** (`scripts/`, sin dependencias nuevas, `fetch` de Node vía `tsx`): N clientes que imitan el poller (estado cada 10 s, repintado de la página al cambiar la versión), cambian de pestaña cada ~30 s y lanzan un "Actualizar grupo" a mitad; para al primer 502; informa de 502, tiempos p50/p95 por pestaña y por estado. Sirve contra local y contra producción.
- **Investigación de Spectator-V5**: comprobar con un miembro en una partida de Arena si `/lol/spectator/v5/active-games/by-summoner/{puuid}` la devuelve; resultado en `.dev/research/riot-api.md`. Sin código de producto.

**No incluye** <!-- SHOULD -->:
- Reorganizar pestañas e información (iteración posterior con su propio grill).
- Sincronizar al terminar la partida con Spectator (solo se investiga).
- Hacer más barato el render de cada pestaña del perfil (stats, álbum, Estadísticas): solo se reduce cuántas veces se hace.
- Render Starter, staging, WebSockets/SSE, `cacheComponents` / `"use cache"`.
- Cambios en lo que se ve de la vista del grupo, la cabecera o el historial.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Versión y estado | Contadores de versión (perfil y grupo) subidos desde el worker y `/admin`; petición de estado con la sincronización y la frescura dentro; guardia de 2 min |
| 2 | Poller único | Un mecanismo de cliente por página (perfil, pestaña Grupo, perfil no encontrado) que consulta el estado y repinta solo al cambiar la versión; la UI de sincronización lee el JSON |
| 3 | Grupo compartido | Memo de `GroupView` por versión + día + semana, usado por la pestaña Grupo y por la cabecera del perfil |
| 4 | Sin `/grupo` | Redirect, barra sin "Grupo", enlace de badges a la pestaña |
| 5 | Payload de Partidas | Desglose ELO solo de las filas visibles |
| 6 | Incremental ligero | Sin `602002` ni icono cuando no hay partidas nuevas |
| 7 | Flujo de ramas | Tag `v1.0.0`, `AGENTS.md`, `docs/deploy.md`, `dev-ship` y `dev-close-iter` adaptadas, entrada de dogfood |
| 8 | Script de sesión simulada | `scripts/` + script npm; mediciones locales y prueba en producción |
| 9 | Spectator-V5 | Nota en `riot-api.md` |
| 10 | Verificación | `verify-report.md` con mediciones antes/después y, tras la release, la prueba en producción |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Versión de datos.**
  - Sube al guardar una partida para cada perfil registrado que participa en ella, al cambiar `602002`, el icono o la resolución de un perfil, y la del grupo al subir la de un miembro o cambiar la lista en `/admin`.
  - Un incremental sin partidas nuevas no la sube.
  - El backfill de un perfil ajeno al grupo no cambia la versión de los miembros ni la del grupo (salvo partidas compartidas).
  - Tras un reinicio, la versión que ve un cliente cambia.
  - Tests unitarios y de BD.
- [ ] **AC2 — Estado y propagación.**
  - El estado devuelve la versión y la sincronización del perfil (y del grupo si aplica) sin calcular el grupo ni las stats.
  - El cliente lo consulta cada 10 s, o cada 5 s con sincronización en marcha, solo con la pestaña visible, y repinta como mucho una vez por consulta y solo si cambió la versión (política pura con tests, como `auto-refresh-policy.ts`).
  - Lo que pulsa una pestaña (Actualizar, "Actualizar grupo") se ve en las otras en ≤ 10 s, y las partidas nuevas aparecen cuando el worker las guarda.
  - El botón ocupado, la barra de progreso, el aviso de antigüedad, la barra Deidad de Arena y el toast de resultado (incluido "Sin partidas nuevas") se comportan como hoy.
- [ ] **AC3 — Un poller y frescura.**
  - En el perfil, en la pestaña Grupo y en "perfil no encontrado" hay un solo mecanismo de consulta; no queda ningún `setInterval` con `router.refresh()` fuera de él.
  - La frescura va en la petición de estado; con varios visores, cada perfil se comprueba como mucho una vez cada 30 s.
  - `STALE_AFTER_MS` = 2 min; los tests de la cola siguen el nuevo valor.
- [ ] **AC4 — Grupo calculado una vez.**
  - Con la misma versión del grupo, día y semana, `GroupView` se calcula una sola vez para cualquier número de visores, para la cabecera y para la pestaña Grupo.
  - Cambiar la versión, el día de juego (06:00) o la semana lo recalcula.
  - `tab=grupo` ya no lee ni calcula el grupo dos veces.
  - Los valores de la pestaña Grupo, los títulos y el ELO de la cabecera no cambian respecto a hoy (los tests existentes siguen en verde).
- [ ] **AC5 — Sin `/grupo`.**
  - `/grupo` redirige a `/`.
  - La barra superior no tiene "Grupo" en ningún perfil; "Sorteo" sigue.
  - El enlace "Títulos" del tooltip de un badge lleva al apartado Títulos de la pestaña Grupo del mismo perfil.
  - Nada más enlaza a `/grupo`.
- [ ] **AC6 — Payload de Partidas.**
  - `MatchesPanel` recibe el desglose ELO solo de las filas de `matches.rows`.
  - El historial muestra lo mismo que hoy, también tras "Ver más" y con filtros.
  - El tamaño de la pestaña Partidas se mide antes y después en el verify-report.
- [ ] **AC7 — Incremental ligero.**
  - Un incremental sin partidas nuevas no llama a `getPlayerData` ni a `getSummonerByPuuid`.
  - Con partidas nuevas, y en el backfill, sí.
  - Tests del worker con el cliente de Riot simulado.
- [ ] **AC8 — Medición local** (build de producción, BD local, script del entregable 8; números en el verify-report, antes con `develop` y después con la rama).
  - 5 clientes en la pestaña Grupo y 5 min en reposo: **0 renders de página** después (hoy ~20/min).
  - Tras un "Actualizar grupo": cálculos de `GroupView` = cambios de versión del grupo, no × visores (contador de cálculos en el log o en el memo).
  - Propagación ≤ 10 s entre pestañas.
- [ ] **AC9 — Flujo de ramas.**
  - Tag `v1.0.0` en `b955a82`, en GitHub.
  - `AGENTS.md` y `docs/deploy.md` describen `develop`, releases, SemVer, hotfix y la ausencia de staging.
  - `dev-ship` y `dev-close-iter` trabajan contra `develop` y `dev-ship` ofrece la release al final.
  - Entrada en `dogfood-log.md`.
  - La iter-10 se mergea en `develop`, se cierra allí y se publica como `v1.1.0` (`package.json` incluido) con el runbook.
- [ ] **AC10 — Prueba de carga en producción** (tras la release `v1.1.0`, en un rato sin partidas, con el sí del supervisor en el momento).
  - 5 clientes simulados durante 15 min con un "Actualizar grupo" a mitad.
  - **Gates**: 0 respuestas 502, 0 eventos `server_failed` en Render (MCP) y el estado siempre < 1 s.
  - Se registran sin umbral: p50/p95 por pestaña y CPU.
  - Si falla, hotfix (P6).
- [ ] **AC11 — Aceptación manual (gate del supervisor, F18).**
  - En la siguiente sesión conjunta, sin 502 ni esperas notables al cambiar de pestaña.
  - Las partidas aparecen ~2–3 min después de terminar.
  - Lo que actualiza uno lo ven los demás sin refrescar.
  - La PR se mergea con este gate abierto.
- [ ] **AC12 — Calidad.** `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Riesgos y restricciones <!-- MAY -->

- **Una sola instancia** (AGENTS.md): los contadores de versión y el memo viven en memoria del único proceso. Si algún día hay dos instancias, esto deja de valer (igual que el limitador de Riot).
- **La versión se pierde al reiniciar**: por eso lleva el id de arranque; el primer estado tras un reinicio fuerza un repintado, que es lo correcto.
- **El estado sigue consultando la BD**: es una consulta ligera por petición (jobs, perfiles), no el cálculo del grupo. Si el estado pasara de 1 s en la prueba de producción, se mueve a memoria lo que haga falta.
- **`useRefresh` y su toast dependen hoy de las props renovadas por el polling**: deben pasar a leer el estado. Si un job termina sin partidas, la versión no sube y la página no se repinta, pero el toast "Sin partidas nuevas" tiene que salir igual.
- **Cálculo por visita de las stats propias del perfil**: no cambia en esta iteración. Si la prueba en producción da tiempos altos de pestaña sin 502, se apunta como deuda, no se amplía el alcance.
- **Memo en memoria frente a la caché de Next 16**: `"use cache"` exige `cacheComponents: true`, que cambia el modelo de render de toda la app; `unstable_cache` es del modelo anterior y serializa (fechas). El memo es más simple y cabe en la regla de una sola instancia.
- **`data.ts` (720 líneas) y `group-titles.ts` (743)**: lo nuevo va en módulos propios; en `data.ts` solo cableado.
- **Prueba en producción**: tráfico propio y del volumen de 5 personas reales; puede provocar un reinicio si algo falla, por eso va en un rato sin partidas y para al primer 502. Las peticiones a Riot que dispara (frescura de 6 miembros cada 2 min) son irrelevantes frente al límite.
- **Retraso del contador `602002`**: si Riot actualiza el challenge unos minutos después de la partida, el incremental que la trae puede leer el valor viejo y los siguientes, sin partidas nuevas, ya no lo piden (T07). La task lo comprueba antes de implementar; si hay indicios, para y lo escala (p. ej. seguir pidiéndolo mientras `challengeCheckedAt` sea anterior a la última partida + un margen).
- **Skills locales adaptadas**: divergen del canon de dev-system a propósito; `/dev-setup` no las sobrescribe. La entrada de dogfood lo deja trazado.

## Estrategia de implementacion <!-- SHOULD -->

Orden por dependencias:
1. **Flujo de ramas** (T01): tag `v1.0.0`, documentación y skills. Va primero porque esta iteración ya se entrega con él. Independiente del resto.
2. **Versión y estado** (T02): contadores, puntos de subida en el worker y `/admin`, petición de estado con la frescura dentro y el guardia de 2 min.
3. **Grupo compartido** (T03), en paralelo con T02 en cuanto exista la versión del grupo.
4. **Poller único** (T04): depende de T02; incluye el paso de la UI de sincronización al JSON del estado.
5. **Sin `/grupo`** (T05): independiente; puede ir en paralelo.
6. **Payload de Partidas** (T06) e **incremental ligero** (T07), independientes.
7. **Script de sesión simulada** (T08), en paralelo; se usa para medir el "antes" sobre `develop` antes de mergear T02–T04.
8. **Spectator-V5** (T09): necesita a un miembro jugando Arena; se hace en cuanto lo haya, antes de cerrar la iteración.
9. **Verificación** (T10): mediciones locales, verify-report; después de la release, la prueba en producción (AC10) se añade al verify-report.

Entrega: PR de la rama contra `develop` con `Closes #22`, cierre de la iteración en `develop` con las skills ya adaptadas, release `v1.1.0` con el runbook (PR `develop → main` que mergea el supervisor, tag) y prueba en producción.

`.dev/tasks/index.json` es tracking operativo local derivado de esta spec y del issue. Cada cláusula de cada AC se asigna a un criterio de task. La implementación se delega en subagentes con el modelo y el nivel de razonamiento que pida cada task (T02, T03 y T04 tienen lógica delicada de concurrencia y estado de cliente); el orquestador coordina y revisa.

**Sin recortes** (supervisor, al aprobar la spec, 2026-10-02): se hacen todas las tasks.
