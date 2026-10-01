# Verify Report: hylistats — iter-05 capa de grupo
**Fecha**: 2026-10-01
**Consume**: commits de `feat/9-capa-de-grupo` (T01–T09 y la corrección `f59ba71`), AC1–AC12 de `.dev/spec.md` (issue [#9](https://github.com/adrirobg/hylistats/issues/9))
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

Los doce criterios de `spec.md`. Se verificaron contra la app en local sobre la BD dev con los 6 miembros de F19 dados de alta desde `/admin`. AC10 se verificó con el worker activo y la dev key vigente.

- spec.md AC1: alta y baja en `/admin`, error con un Riot ID no registrado y elruffles fuera de toda cifra.
- spec.md AC2: semana de juego (tests de límite y de cambio de hora) y periodo vacío.
- spec.md AC3: ranking con mínimos, empates y "sin mínimo".
- spec.md AC4: los 7 títulos y sus casos (tests y cruce independiente).
- spec.md AC5: explicación por ratón, clic y foco en la vista y en el badge, y apartado Títulos.
- spec.md AC6: badges de los 6 perfiles frente a la vista (cruce independiente) y ningún badge en elruffles.
- spec.md AC7: tablas de Dúos y Tríos de temporada.
- spec.md AC8: Temporada (Resumen y Récords) frente al perfil y la BD, orden, líderes, enlaces y 375 px.
- spec.md AC9: `/grupo` y la pestaña Grupo (6 sí, elruffles no) con los mismos valores.
- spec.md AC10: `sync_jobs` al abrir la vista y con el botón, con el worker activo.
- spec.md AC11: cruce SQL independiente (anexo A).
- spec.md AC12: **gate de merge**, aceptación manual del supervisor en la sesión conjunta (F18).

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), `next` 16.3.7 (Turbopack), `vitest`, Biome.
- Postgres en Docker (`hylistats-postgres-1`): la BD `hylistats` (dev) para E2E y AC11, y `hylistats_test` para los tests.
- Preview `hylistats-dev-noworker` (`WORKER_ENABLED=false`) para la UI y AC11, con la BD congelada (1196 partidas). El preview `hylistats-dev` (con worker) solo se usó para AC10.
- Para aislar un artefacto (ver AC10) se usaron además un worktree de `main` en :3002 y `next start` en :3003, ambos sin worker y ya retirados.
- Dev key guardada el 2026-09-30 a las 15:07 UTC (caduca hacia las 15:07 UTC del 2026-10-01). Se usó sin errores entre las 00:44 y las 00:57 UTC.
- Navegador integrado del desktop app (Chromium), con el viewport emulado por `resize_window`.

## Checks ejecutados <!-- MUST -->

```bash
# Checks locales (tras cada task y sobre a5ed34f)
npm run lint && npm run typecheck && npm test && npm run build

# AC1: /admin tras el login (navegador)
#   alta "Nadie Registrado#EUW" → alta de los 6 → duplicado → quitar y volver a añadir Krill1nt

# AC9: fetch de /euw/<slug> y /euw/<slug>?tab=grupo (7 perfiles); texto renderizado de la vista
#   (iframe, de "HOY / SEMANA" a "Reglas comunes") frente a /grupo, en dia y semana

# AC10 (worker activo)
docker exec hylistats-postgres-1 psql -U hylistats -d hylistats -c \
  "select id, profile_id, kind, status, interactive, created_at, finished_at from sync_jobs where id>=100 order by id;"

# AC11: SQL propio (anexo A) frente al HTML de /grupo, el payload RSC, loadGroupView con now pasados y /euw/<slug>
```

## Resultados observados <!-- MUST -->

- **Checks locales**: lint limpio (199 ficheros), typecheck OK, **59 ficheros y 1264 tests** en verde, y el build OK con `/grupo` como ruta dinámica.
- **AC1** (navegador, `/admin` tras el login):
  - "Nadie Registrado#EUW" → "Ese Riot ID no está registrado: búscalo primero en la app." No se crea nada.
  - Alta de BEJITO MAMBO#1991, Hylimichi#EUW, Azpekaa#EUW, TheCIutch#EUW, zapas14#EUW y Krill1nt#EUW: `added` ×6.
  - "hylimichi#euw" → `already`. Quitar Krill1nt → `removed`; volver a añadirlo → `added`.
  - La lista final tiene 6 miembros. elruffles no aparece en ninguna cifra: test de `group-view.test.ts` (juega las mismas partidas que un miembro, con el peor puesto y 90 000 de daño) y anexo A (ni ranking, ni equipos, ni Temporada, ni badges).
  - Tests: `group.test.ts` y `admin/actions.test.ts` (sin sesión no muta nada).
- **AC2**:
  - `gameDay` sigue siendo la única definición del día: `gameWeek` toma el día de juego y retrocede hasta el lunes.
  - Tests en `group-titles.test.ts`:
    - lunes a las 05:59 cae en la semana anterior y a las 06:00 en la nueva;
    - semanas del 2026-03-29 y del 2026-10-25, que duran 7 días menos 1 h y más 1 h, con un barrido cada 15 minutos;
    - periodo vacío.
  - Datos reales: con `now` = 2026-07-20 (día sin partidas) la app muestra el 2026-07-19 con `isCurrent=false`, el último día con partidas según el SQL (anexo A).
  - La etiqueta "Último día jugado: …" está cubierta por los tests de la vista-modelo. En datos reales no se vio porque había partidas hoy.
- **AC3**: ranking de hoy 5/5, de la semana 6/6 y de la semana pasada, todos cuadran con el SQL (anexo A). Krill1nt sale "sin mínimo" con 2 partidas en el día. Los empates comparten posición en los tests.
- **AC4**:
  - Tests de los 7 títulos (42 en `group-titles.test.ts`): empate compartido, un solo clasificado, justo en el mínimo y uno por debajo, desempate de rotos por puesto medio, trío con un externo (es dúo y no trío) y dúo dentro de un trío.
  - Datos reales (anexo A), con títulos de hoy 7/7 y de la semana 7/7:
    - Semana 2026-09-21: el desempate de Equipo roto por puesto medio (2 primeros, 1,33 frente a 2,67).
    - Día 2026-09-24: Pareja mental boom compartida a 4,50.
    - Día 2026-09-16: Azpekaa, justo en el mínimo de 3, gana el trol y el diablo.
- **AC5**:
  - **Vista `/grupo`**, a 375 px: Tab sobre "El trol del día" da `:focus-visible` y `aria-expanded=true`. El popup muestra "Peor puesto medio del día: 4,00 en 4 partidas" y "Cómo funcionan los títulos". El 4,00 es el de su fila del ranking.
  - **Badge del perfil de TheCIutch**:
    - Con Tab, "El D-d-d-diablo del día" se abre: "Más daño medio a campeones del día: 46.124 por partida en 12 partidas", enlace `/grupo#titulos`. Coincide con su fila del ranking.
    - Con clic de ratón, "Pareja rota del día": "1 en 11 partidas (puesto medio 3,91)". Coincide con la fila Hylimichi+TheCIutch de "Dúos y tríos del día".
    - El hover lo comprobaron los workers de T05 y T08.
  - **Apartado Títulos**: los 7 títulos con métrica, periodos y mínimo (tomado de `config.ts`), y las reglas comunes.
  - El valor del "por qué" coincide con la tabla en todos los títulos del cruce (anexo A).
  - Nota: la captura de pantalla del perfil no enseña el popup abierto, porque la herramienta pierde el foco o el hover al capturar. El DOM lo da visible: opacidad 1, z 50 y `elementFromPoint` sobre el diálogo.
- **AC6**:
  - 20/20 badges en 7/7 perfiles (anexo A). Cada miembro tiene exactamente sus títulos de día y de semana, y los de dúo y trío salen en cada uno de sus miembros.
  - elruffles: 0 badges.
  - Ejemplo: TheCIutch tiene 6 (diablo, pareja rota y pareja mental boom del día; diablo, equipo roto y pareja rota de la semana).
- **AC7**:
  - Dúos 15/15 y Tríos 19/19 frente al SQL (anexo A), con partidas, 1º, % de 1º y puesto medio, ordenados por partidas.
  - En Tríos solo hay tríos de miembros (test de `group-season.test.ts` y anexo A).
- **AC8**:
  - Resumen 48/48, Récords 42/42 (valor y partida; en las rachas, primera y última) y líderes 15/15 (anexo A).
  - Frente al perfil:
    - TheCIutch: 262 / 31 / 11,8 % / 3,44 y Deidad 31, iguales en `/grupo` y en su perfil.
    - Hylimichi: 911 / 113 / 12,4 % / 3,60 / 108 (worker de T06).
    - El campeón se muestra con su nombre de visualización ("Aurelion Sol"), como el perfil (corrección `f59ba71`).
  - Orden: desc y asc cambian el orden y `aria-sort`.
  - Líderes en dorado con "(líder)".
  - El récord de daño de BEJITO MAMBO (175.057) abre `/euw/BEJITO%20MAMBO-1991?tab=partidas&partida=EUW1_7926916560`.
  - 375 px: `scrollWidth` = 375 en Resumen y Récords; la tabla tiene scroll propio.
- **AC9**:
  - El enlace "Grupo" de la cabecera lleva a `/grupo`.
  - La pestaña Grupo está en los 6 miembros, con `?tab=grupo` → `panel-grupo`. elruffles tiene 5 pestañas y su `?tab=grupo` cae en `panel-campeones`.
  - Texto de la vista idéntico al de `/grupo` en **12/12** (6 perfiles × día y semana, con Equipos y Temporada).
  - La fila del dueño va con `aria-current` en el ranking y en Temporada.
  - El selector Semana conserva `tab=grupo`.
- **AC10** (worker activo):
  - **Jobs previos**: 100 a 105, pendientes de visitas anteriores sin worker. Se procesaron a las 00:44:24–26 (1196 → 1201 partidas).
  - **00:44:49**: al abrir `/grupo` con todos sincronizados hace menos de 1 min, **0 jobs**. Aviso "Sincronización más antigua: ahora (TheCIutch#EUW)".
  - **00:45:02**: el botón dentro del cooldown de 60 s, **0 jobs**.
  - **00:50:09**: el botón encola los jobs 108 a 112, interactivos, para los perfiles 3, 1, 2, 6 y 5. TheCIutch queda fuera por su cooldown: su job 107 terminó a las 00:49:26.
  - **00:51:26**: clic real de ratón en el botón: jobs 113 a 118, interactivos, los 6 miembros.
  - **00:56:49**: al abrir `/grupo` con los 6 miembros sincronizados hace más de 5 min, los jobs 119 a 124, **no interactivos, uno por miembro**.
    - **elruffles no se encola**, aunque también estaba desactualizado desde las 00:47:59.
    - Hasta las 00:57:20, más de 100 llamadas a `ensureGroupFreshAction` no encolaron **ningún job más**.
  - Todo pasa por `sync_jobs` y el worker, sin errores.
- **AC11**: **todas las comparaciones cuadran** (anexo A). Captura de las 00:37 a las 00:41 UTC, con la BD congelada.

  | Bloque | Cuadran |
  |---|---|
  | Hoy | ranking 5/5, títulos 7/7, tabla del día 5/5, equipos del periodo 12/12 |
  | Semana | ranking 6/6, títulos 7/7, tabla 13/13, equipos 20/20 |
  | Semana pasada 09-21 y día 09-24 | 40/40 y 29/29 |
  | Extras (semana 09-14, día 09-16, día vacío 07-20) | 87/87 |
  | Equipos de temporada | Dúos 15/15, Tríos 19/19 |
  | Temporada | Resumen 48/48, líderes 15/15, Récords 42/42 |
  | Badges | 20/20 en 7/7 perfiles |

- **AC12**: no lo puede cumplir el orquestador. Queda como **gate de merge** (ver Conclusión).

## Juicio de coherencia y sentido <!-- MUST -->

- **Una sola fuente de cálculo**:
  - `/grupo`, la pestaña Grupo y los badges salen de las mismas `groupPeriods` y `loadMemberRows` (`group-view.ts`).
  - La tabla de Temporada sale de `computeSummary`, `computeRecords`, `verifiedChampions` y `wonChampionsCount`, la regla extraída de `arenaGodGoal` sin cambiar su comportamiento.
  - Que los valores coincidan con el perfil se sigue del código y se comprobó en datos reales (AC8 y anexo A).
- **Sin datos nuevos ni almacenamiento de títulos**: no hay columnas nuevas en `participants`. Solo se añadió la tabla `group_members`, y rankings, títulos y badges se calculan al leer.
- **Privacidad**: el `puuid` no sale de `group-view.ts`, que lo sustituye por `memberKey(profileId)` (test "sin puuids en el JSON").
- **Sentido en el dominio**: con las 5 partidas nuevas de AC10, la vista cambió sola. Krill1nt entró en el ranking del día, Hylimichi pasó a ser el trol del día con 20 partidas y aparecieron Equipo roto y Equipo mental boom del día. Es el comportamiento que busca F20/F21 para la sesión conjunta.
- **Regla literal de F21**:
  - "Equipo roto del día" se otorgó a un trío con 0 primeros: "0 en 3 partidas (puesto medio 3,33)", porque el puesto medio desempata entre dos tríos sin primeros.
  - Es lo que manda la spec, que no exige un 1º. Está documentado en tests y se lleva al supervisor como posible ajuste tras F18.
- **Observaciones de presentación** (no contradicen la spec y las decide el supervisor):
  - **zapas14**: "% a la primera" usa como denominador los campeones ganados verificados (28). La columna contigua de campeones ganados muestra 29, que es el contador oficial. Es la definición de `computeRecords` y coincide con su pestaña Estadísticas, como pide AC8.
  - **Cabecera del perfil** a 375 px con 7 badges (Hylimichi): mide unos 345 px de 812 y es sticky. No desborda.
- **AC10 y el entorno de prueba**:
  - El panel del navegador integrado alterna `document.visibilityState` entre hidden y visible cada unos 2 s. Cada "visible" dispara `apply("visible")`, que comprueba y hace `router.refresh()`.
  - El ciclo es idéntico en `main`, en el `AutoRefresh` del perfil (worktree en :3002), y con `next start` (:3003). No lo introduce iter-05 y no ocurre en una pestaña real.
  - Las reglas del servidor lo absorben: más de 100 llamadas, 0 jobs de más.
  - Dos clics del botón a las 00:45:40 y hacia las 00:46:10 no llegaron al servidor durante esos ciclos. Los de las 00:50:09 y las 00:51:26 sí. Ver Hallazgos.

## Revision de calidad del codigo <!-- SHOULD -->

Pasada sobre el diff (49 ficheros, +7664/−59, sobre todo tests):

- **Duplicated code**: `group-freshness.tsx` repite unas 40 líneas de la plomería de `auto-refresh.tsx` (visibilidad, efectos e intervalos). La política sí es compartida (`auto-refresh-policy.ts`). Diferido.
- **Large module / divergent change**: `src/domain/group-titles.ts` (743 líneas) junta periodos, ranking, equipos y títulos. Está bien cohesionado por F20/F21, pero cualquier cambio de mínimos, títulos o periodos pasa por él. Diferido, para dividirlo si F18 cambia las reglas.
- **`data.ts`** crece de 679 a 716 líneas (+37, solo pegamento: `titles`, `isMember` y `group` bajo `tab === "grupo"`). Con `tab=grupo` se cargan las filas del grupo dos veces (`loadProfileTitles` y `loadGroupView`). Deuda conocida de iter-04, diferida.
- **Feature envy / mysterious name**: no se detectan. Los nombres siguen el vocabulario de la spec (`displayedPeriod`, `awardTitles`, `titlesOf`, `memberKey`).
- Sin dependencias nuevas.

## Replay / validacion independiente <!-- SHOULD -->

Aplica, porque los títulos son visibles para todo el grupo y un valor erróneo rompe la confianza (F18). La validación independiente es AC11:

- **Actor**: un subagente Opus con SQL propio.
- **Fuentes canónicas**: `spec.md` y las definiciones de `records.ts`, solo leídas.
- **Repo**: auditado en solo lectura. El repo quedó limpio y solo se ejecutaron SELECT.
- **Lado app**:
  - HTML SSR de `/grupo` y del payload RSC;
  - `loadGroupView` con `now` pasados (único modo de ver semanas anteriores; la app no navega por ellas);
  - HTML de los 7 perfiles.
- **Cobertura y resultado**: ver la tabla de AC11 y el anexo A. **0 diferencias.**

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| El campeón de Temporada salía con el `championName` de Match-V5 ("AurelionSol") y no como en el perfil (AC8) | resuelto | N/A | `f59ba71`: `SeasonCell.championId` y `withDisplayNames` con el catálogo; tests "MonkeyKing" → "Wukong" |
| En el navegador integrado, 2 de 4 clics de "Actualizar grupo" no llegaron al servidor durante el ciclo de visibilidad del panel (artefacto del entorno, presente también en `main`) | diferido | supervisor | Sesión conjunta F18 (AC12): pulsar "Actualizar grupo" en una pestaña real y confirmar que encola. Si falla, issue de fix |
| "Equipo roto" se otorga a tríos con 0 primeros (regla literal de F21) | diferido | supervisor | Revisión de mínimos y reglas tras F18 (constantes en `config.ts`) |
| zapas14: "% a la primera" (denominador 28 verificados) junto a "Campeones ganados" 29 (oficial) | diferido | supervisor | Decisión de presentación tras F18 |
| Cabecera sticky del perfil de unos 345 px a 375 px con 7 badges | diferido | supervisor | Hilo "Pulido y mejora de la UI base" de `think.md` |
| Plomería duplicada en `group-freshness.tsx`, `group-titles.ts` de 743 líneas y `data.ts` de 716 líneas con carga doble en `tab=grupo` | diferido | orquestador | `learn.md` → deuda técnica |

## Conclusion <!-- MUST -->

**PASS** (gate manual pendiente)

AC1 a AC11 cumplen con evidencia. AC12 es aceptación manual del supervisor y queda como **gate de merge**. Según F18, la PR se mergea con este gate abierto. Se valida en la sesión conjunta de Arena junto con AC11 de #7, AC5 de #3 y AC8 de #2:

- [ ] El grupo tiene `/grupo` o la pestaña Grupo abiertos y ve cambiar los títulos del día con sus partidas.
- [ ] Nadie encuentra un título o un valor que contradiga sus partidas.
- [ ] Quien recibe un título entiende por qué leyendo su explicación.
- [ ] (De Hallazgos) "Actualizar grupo" encola el incremental de los miembros en una pestaña real.


## Anexo A — AC11: cruce SQL independiente frente a la app


### Captura

- **Fecha/hora**: 2026-10-01 00:37:02 – 00:41:22 UTC (02:37–02:41 Madrid). Día de juego actual: **2026-09-30** (antes de las 06:00 Madrid); semana actual: **2026-09-28**. Todas las capturas, antes de la frontera de las 04:00 UTC.
- **BD estable durante la captura**: no hay worker. `max(matches.fetched_at)` = 2026-09-30 21:26:16 UTC; 1196 partidas y 21528 filas de participantes, iguales al principio y al final.
- **Rama**: `feat/9-capa-de-grupo` (HEAD a5ed34f). No se tocaron código, BD ni ficheros del repo. Las visitas encolan jobs en `sync_jobs`, que no se tocaron.

### Universo

- **Miembros**: las filas de `group_members` (6). `profile_id` 1 BEJITO MAMBO#1991, 2 Hylimichi#EUW, 3 Azpekaa#EUW, 4 TheCIutch#EUW, 5 zapas14#EUW, 6 Krill1nt#EUW. elruffles#6485 (id 7) no es miembro.
- **Filas**: `participants ⨝ matches`, `queue_id in (1750,1740)`, `game_creation >= 1778544000000`, `placement between 1 and 6`, solo con el puuid de un miembro.
- **Día de juego**: `((to_timestamp(game_start_timestamp/1000.0) at time zone 'Europe/Madrid') - interval '6 hours')::date`. Se resta sobre la hora local de pared, lo que equivale a la regla de `gameDay`: hora local de Madrid antes de las 06:00, día anterior. Semana: `date_trunc('week', dia)`.
- **Dúo**: dos miembros con el mismo `(match_id, player_subteam_id)`, sea el tercero miembro o no. Cada fila de miembro solo se une con otras filas de miembro, así que un trío aporta sus 3 dúos. **Trío**: tres miembros en el mismo equipo.
- **Mínimos**: 3 partidas en el día y 5 en la semana para los individuales; 3 partidas juntos para dúos y tríos. Competencia: 2 o más clasificados. Los empates se comparan con medias de 10 decimales (`round(avg,10)`) y comparten título.
- **Desempates de Temporada** (leídos en `src/domain/records.ts`, `summary.ts` y `album.ts`, y replicados en SQL sin ejecutar ese código):
  - **Orden cronológico**: `(game_creation, match_id)`.
  - **Récord de una partida**: gana la más antigua.
  - **Rachas**: gana la más reciente.
  - **Campeón con más 1º**: más 1º, después más partidas, después el nombre y después el `champion_id`. El nombre es el más reciente.
  - **Victorias a la primera** (`firstTryMatches`): campeones cuya primera partida en ese orden, entre los puestos 1..6, fue un 1º.
- **Campeones ganados**: `greatest(campeones distintos con algún 1º en el universo, coalesce(profiles.challenge_value,0))`.
- **Nombres de campeón**: la BD guarda el id interno (AurelionSol, Belveth, MasterYi) y la app muestra el nombre de visualización de Data Dragon (Aurelion Sol, Bel'Veth, Maestro Yi). Se comparan como alias.

### Fuentes del lado app

| Bloque | Fuente |
|---|---|
| Hoy (día 2026-09-30): ranking, sin mínimo, títulos con su "por qué", "Dúos y tríos del día" | `curl -s http://localhost:3000/grupo` (HTML SSR), y además el JSON de `loadGroupView(getDb(), Date.now())` con todos los equipos del periodo, incluidos los de menos de 3 partidas |
| Semana actual (2026-09-28) | `curl -s 'http://localhost:3000/grupo?periodo=semana'` (HTML) y el mismo JSON del loader |
| Semanas y días pasados | Script `app-view.ts` (scratchpad): llama a `loadGroupView(getDb(), now)` con `now` = 2026-09-24T12:00Z (día 09-24, semana 09-21), 2026-09-16T12:00Z (día 09-16, semana 09-14) y 2026-07-20T12:00Z (día vacío, se muestra el 07-19; semana 07-20). Se ejecutó con `NODE_OPTIONS=--conditions=react-server npx tsx --env-file-if-exists=.env.local`, porque `server-only` impide importarlo sin esa condición. Solo vuelca JSON y no calcula nada |
| Equipos (Dúos y Tríos de temporada) | HTML de `/grupo`, idéntico en `?periodo=semana` (diff vacío) |
| Temporada: Resumen | HTML SSR de `/grupo` y props `table` del componente cliente en el payload RSC (`self.__next_f`) |
| Temporada: Récords y líderes | Payload RSC de `/grupo`: `table.rows[].cells` y `table.leaders`. La pestaña es cliente y no sale como texto en el HTML. El payload es idéntico en `?periodo=semana` |
| Badges | HTML de `/euw/<slug>` de los 6 miembros y de `elruffles-6485`. Respondieron 200 en menos de 0,2 s y el stream completo quedó en el HTML |

La comparación de periodos se automatizó con `compare.py` (scratchpad): ejecuta `sql/period.sql` y contrasta conjuntos con el JSON del loader, redondeando half-up igual que la app. Los bloques del HTML se cotejaron a mano contra la salida SQL, que va transcrita abajo.

### Consultas SQL

Se ejecutan con `cat base.sql X.sql | docker exec -i hylistats-postgres-1 psql -U hylistats -d hylistats --csv -v ...`. Todas son SELECT/CTE.

### base.sql (universo, se antepone a todas)
```sql
with mem as (
  select p.id as pid, p.game_name || '#' || p.tag_line as rid, p.puuid, p.challenge_value
  from profiles p join group_members g on g.profile_id = p.id
),
u as (
  select pa.match_id, pa.puuid, mem.rid, pa.player_subteam_id as st, pa.placement,
         pa.total_damage_dealt_to_champions as dmg, pa.kills, pa.deaths,
         pa.total_damage_taken as dtk, pa.largest_killing_spree as spree,
         pa.champion_id, pa.champion_name, m.game_creation, m.game_start_timestamp,
         ((to_timestamp(m.game_start_timestamp / 1000.0) at time zone 'Europe/Madrid') - interval '6 hours')::date as dia
  from participants pa
  join matches m on m.match_id = pa.match_id
  join mem on mem.puuid = pa.puuid
  where m.queue_id in (1750, 1740)
    and m.game_creation >= 1778544000000
    and pa.placement between 1 and 6
),
uw as (select u.*, date_trunc('week', u.dia)::date as semana from u)
```

### period.sql (ranking, equipos y títulos de un periodo; `-v per=dia|semana -v val=AAAA-MM-DD -v min=3|5`)
```sql
-- variables: per (dia|semana), val (fecha), min (mínimo individual)
, p as (select * from uw where :per = :'val'),
ind as (
  select rid, count(*) as n, count(*) filter (where placement = 1) as firsts,
         round(avg(placement)::numeric, 10) as avgp, round(avg(dmg)::numeric, 10) as avgd
  from p group by rid
),
q as (select * from ind where n >= :min),
nq as (select count(*) as c from q),
duo as (
  select a.rid as m1, b.rid as m2, count(*) as n, count(*) filter (where a.placement = 1) as firsts,
         round(avg(a.placement)::numeric, 10) as avgp
  from p a join p b on a.match_id = b.match_id and a.st = b.st and a.rid < b.rid
  group by 1, 2
),
trio as (
  select a.rid as m1, b.rid as m2, c.rid as m3, count(*) as n, count(*) filter (where a.placement = 1) as firsts,
         round(avg(a.placement)::numeric, 10) as avgp
  from p a join p b on a.match_id = b.match_id and a.st = b.st and a.rid < b.rid
           join p c on c.match_id = a.match_id and c.st = a.st and b.rid < c.rid
  group by 1, 2, 3
),
dq as (select * from duo where n >= 3),
tq as (select * from trio where n >= 3),
titles as (
  select 'El trol' as titulo, rid as quien, avgp::text as valor, n from q
   where (select c from nq) >= 2 and avgp = (select max(avgp) from q)
  union all
  select 'El pacifista', rid, avgd::text, n from q
   where (select c from nq) >= 2 and avgd = (select min(avgd) from q)
  union all
  select 'El D-d-d-diablo', rid, avgd::text, n from q
   where (select c from nq) >= 2 and avgd = (select max(avgd) from q)
  union all
  select 'Equipo roto', m1 || ' + ' || m2 || ' + ' || m3, firsts || ' 1º / avg ' || avgp, n from tq
   where (select count(*) from tq) >= 2
     and (firsts, -avgp) = (select firsts, -avgp from tq order by firsts desc, avgp asc limit 1)
  union all
  select 'Equipo mental boom', m1 || ' + ' || m2 || ' + ' || m3, avgp::text, n from tq
   where (select count(*) from tq) >= 2 and avgp = (select max(avgp) from tq)
  union all
  select 'Pareja rota', m1 || ' + ' || m2, firsts || ' 1º / avg ' || avgp, n from dq
   where (select count(*) from dq) >= 2
     and (firsts, -avgp) = (select firsts, -avgp from dq order by firsts desc, avgp asc limit 1)
  union all
  select 'Pareja mental boom', m1 || ' + ' || m2, avgp::text, n from dq
   where (select count(*) from dq) >= 2 and avgp = (select max(avgp) from dq)
)
select 'RANK' as k, (case when n >= :min then rank() over (order by case when n >= :min then avgp end asc nulls last)::text else 'sin mínimo' end) as pos,
       rid as quien, n::text as partidas, firsts::text as primeros, round(avgp, 2)::text as avgp, round(avgd)::text as avgd
from ind
union all
select 'DUO', null, m1 || ' + ' || m2, n::text, firsts::text, round(avgp, 2)::text, null from duo
union all
select 'TRIO', null, m1 || ' + ' || m2 || ' + ' || m3, n::text, firsts::text, round(avgp, 2)::text, null from trio
union all
select 'TITULO', titulo, quien, n::text, null, valor, null from titles
order by 1, 2, 3;
```

### teams.sql (dúos y tríos de temporada)
```sql
, duo as (
  select 'DUO' as k, a.rid || ' + ' || b.rid as equipo, count(*) as n, count(*) filter (where a.placement = 1) as firsts
       , round(100.0 * count(*) filter (where a.placement = 1) / count(*), 1) as pct, round(avg(a.placement), 2) as avgp
  from u a join u b on a.match_id = b.match_id and a.st = b.st and a.rid < b.rid
  group by 2 having count(*) >= 3
),
trio as (
  select 'TRIO' as k, a.rid || ' + ' || b.rid || ' + ' || c.rid as equipo, count(*) as n, count(*) filter (where a.placement = 1) as firsts
       , round(100.0 * count(*) filter (where a.placement = 1) / count(*), 1) as pct, round(avg(a.placement), 2) as avgp
  from u a join u b on a.match_id = b.match_id and a.st = b.st and a.rid < b.rid
           join u c on c.match_id = a.match_id and c.st = a.st and b.rid < c.rid
  group by 2 having count(*) >= 3
)
select * from duo union all select * from trio order by 1, 3 desc, 2;
```

### season.sql (Resumen y Récords por miembro)
```sql
, o as (
  select u.*, row_number() over (partition by rid order by game_creation, match_id collate "C") as rn
  from u
),
resumen as (
  select rid, count(*) as games, count(*) filter (where placement = 1) as firsts,
         round(100.0 * count(*) filter (where placement = 1) / count(*), 1) as pct1,
         round(avg(placement), 2) as avgp
  from u group by rid
),
won as (
  select rid, count(distinct champion_id) filter (where placement = 1) as won_univ from u group by rid
),
firstgame as (  -- primera partida de cada campeón en orden (game_creation, match_id)
  select distinct on (rid, champion_id) rid, champion_id, placement, match_id
  from u order by rid, champion_id, game_creation, match_id collate "C"
),
ft as (select rid, count(*) filter (where placement = 1) as first_try from firstgame group by rid),
champ as (
  select rid, champion_id, count(*) as games, count(*) filter (where placement = 1) as firsts,
         (array_agg(champion_name order by game_creation desc, match_id collate "C" desc))[1] as name
  from u group by rid, champion_id
),
top as (
  select distinct on (rid) rid, name, firsts, games from champ where firsts > 0
  order by rid, firsts desc, games desc, name, champion_id
),
rec as (
  select m.rid,
    (select dmg || ' ' || match_id || ' ' || champion_name from o where o.rid = m.rid order by dmg desc, rn limit 1) as max_dmg,
    (select dtk || ' ' || match_id || ' ' || champion_name from o where o.rid = m.rid and dtk is not null order by dtk desc, rn limit 1) as max_dtk,
    (select kills || ' ' || match_id || ' ' || champion_name from o where o.rid = m.rid order by kills desc, rn limit 1) as max_kills,
    (select spree || ' ' || match_id || ' ' || champion_name from o where o.rid = m.rid and spree is not null order by spree desc, rn limit 1) as max_spree,
    (select deaths || ' ' || match_id || ' ' || champion_name from o where o.rid = m.rid order by deaths desc, rn limit 1) as max_deaths
  from (select distinct rid from u) m
),
isl as (  -- gaps and islands sobre el orden cronológico
  select rid, (placement = 1) as win, rn, match_id,
         rn - row_number() over (partition by rid, (placement = 1) order by rn) as grp
  from o
),
runs as (
  select rid, win, count(*) as len, min(rn) as r0, max(rn) as r1 from isl group by rid, win, grp
),
best_runs as (  -- empate: la más reciente
  select distinct on (rid, win) r.rid, r.win, r.len,
         (select match_id from o where o.rid = r.rid and o.rn = r.r0) as desde,
         (select match_id from o where o.rid = r.rid and o.rn = r.r1) as hasta
  from runs r order by rid, win, len desc, r1 desc
)
select r.rid, r.games, r.firsts, r.pct1, r.avgp, w.won_univ, coalesce(mem.challenge_value, 0)::int as challenge,
       greatest(w.won_univ, coalesce(mem.challenge_value, 0)::int) as campeones_ganados,
       ft.first_try,
       round(100.0 * ft.first_try / greatest(w.won_univ, coalesce(mem.challenge_value, 0)::int), 1) as pct_ft_sobre_ganados,
       round(100.0 * ft.first_try / nullif(w.won_univ, 0), 1) as pct_ft_sobre_won_univ,
       top.name || ' ' || top.firsts || 'x1º (' || top.games || ' p)' as top_champ,
       rec.max_dmg, rec.max_dtk, rec.max_kills, rec.max_spree, rec.max_deaths,
       bw.len || ' ' || bw.desde || '..' || bw.hasta as racha_1,
       bd.len || ' ' || bd.desde || '..' || bd.hasta as racha_sin_1
from resumen r join won w using (rid) join ft using (rid) left join top using (rid) join rec using (rid)
join mem on mem.rid = r.rid
left join best_runs bw on bw.rid = r.rid and bw.win
left join best_runs bd on bd.rid = r.rid and not bd.win
order by r.rid;
```

### gaps.sql (días y semanas sin partidas, para probar el periodo vacío)
```sql
, d as (select distinct dia from u), w as (select distinct semana from uw)
select 'dia_vacio' k, g::date, (select max(dia) from d where dia < g::date) ultimo from generate_series('2026-05-12'::date, '2026-09-30', '1 day') g where g::date not in (select dia from d) and g::date > (select min(dia) from d)
union all
select 'semana_vacia', g::date, (select max(semana) from w where semana < g::date) from generate_series('2026-05-11'::date, '2026-09-28', '7 day') g where g::date not in (select semana from w) and g::date > (select min(semana) from w)
order by 1,2;
```
Hora y día actuales: `select now(), ((now() at time zone 'Europe/Madrid') - interval '6 hours')::date` dio `2026-10-01 00:37:02+00 | 2026-09-30`.

---

### Comparación por bloque

En las tablas: **SQL** es el valor esperado calculado aquí; **App** es el valor servido; ✓ indica que cuadran.

### 1. Hoy: día de juego 2026-09-30 (`/grupo`, "Día: 30 sept")

**Ranking**

| Pos SQL | Jugador | Part. | 1º | Medio | Daño | Pos/valores App | |
|---|---|---|---|---|---|---|---|
| 1 | zapas14 | 11 | 1 | 3,45 | 41.821 | 1 · 11 · 1 · 3,45 · 41.821 | ✓ |
| 2 | TheCIutch | 12 | 1 | 3,83 | 46.124 | 2 · 12 · 1 · 3,83 · 46.124 | ✓ |
| 3 | Hylimichi | 15 | 1 | 3,93 | 37.084 | 3 · 15 · 1 · 3,93 · 37.084 | ✓ |
| 4 | BEJITO MAMBO | 4 | 0 | 4,00 | 37.218 | 4 · 4 · 0 · 4,00 · 37.218 | ✓ |
| sin mínimo | Krill1nt | 2 | — | — | — | Sin mínimo: Krill1nt 2 partidas | ✓ |

Azpekaa no jugó y no sale en ninguno de los dos lados.

**Títulos del día**

| Título | SQL (titular · valor · partidas) | App (titular · "por qué") | |
|---|---|---|---|
| El trol | BEJITO MAMBO · 4,0000 · 4 | BEJITO MAMBO · "Peor puesto medio del día: 4,00 en 4 partidas" | ✓ |
| El pacifista | Hylimichi · 37.084,33 · 15 | Hylimichi · "…37.084 por partida en 15 partidas" | ✓ |
| El D-d-d-diablo | TheCIutch · 46.124,25 · 12 | TheCIutch · "…46.124 por partida en 12 partidas" | ✓ |
| Pareja rota | Hylimichi+TheCIutch · 1 1º · medio 3,909 · 11 | Hylimichi+TheCIutch · "1 en 11 partidas (puesto medio 3,91)" | ✓ |
| Pareja mental boom | BEJITO MAMBO+TheCIutch · 4,333 · 3 | BEJITO MAMBO+TheCIutch · "4,33 en 3 partidas" | ✓ |
| Equipo roto / Equipo mental boom | No se otorgan: solo 1 trío con 3 o más partidas (Hylimichi+TheCIutch+zapas14, 7) | No aparecen | ✓ |

**Dúos y tríos del día** (3 o más partidas): Hylimichi+TheCIutch 11·1·3,91; TheCIutch+zapas14 8·0·4,00; Hylimichi+TheCIutch+zapas14 7·0·4,14; Hylimichi+zapas14 7·0·4,14; BEJITO MAMBO+TheCIutch 3·0·4,33. Los mismos 5 en los dos lados ✓.

Con el JSON del loader, que incluye los equipos de menos de 3 partidas, cuadran los 8 dúos y los 4 tríos (`compare.py`).

**Recuento Hoy: ranking 5/5, títulos 7/7 (5 otorgados + 2 de trío no otorgados), tabla del día 5/5, equipos del loader 12/12.**

### 2. Semana actual: 2026-09-28 (`/grupo?periodo=semana`, "Semana: 28 sept – 4 oct")

**Ranking**

| Pos | Jugador | SQL (part · 1º · medio · daño) | App | |
|---|---|---|---|---|
| 1 | zapas14 | 21 · 3 · 3,19 · 39.059 | 21 · 3 · 3,19 · 39.059 | ✓ |
| 2 | TheCIutch | 22 · 3 · 3,27 · 43.835 | 22 · 3 · 3,27 · 43.835 | ✓ |
| 3 | Hylimichi | 49 · 6 · 3,65 · 36.243 | 49 · 6 · 3,65 · 36.243 | ✓ |
| 4 | BEJITO MAMBO | 30 · 2 · 3,67 · 35.009 | 30 · 2 · 3,67 · 35.009 | ✓ |
| 5 | Azpekaa | 14 · 3 · 3,86 · 35.556 | 14 · 3 · 3,86 · 35.556 | ✓ |
| 6 | Krill1nt | 8 · 0 · 3,88 · 34.779 | 8 · 0 · 3,88 · 34.779 | ✓ |

Nadie queda sin mínimo en ninguno de los dos lados.

**Títulos de la semana**

| Título | SQL | App ("por qué") | |
|---|---|---|---|
| El trol | Krill1nt · 3,875 · 8 | Krill1nt · "3,88 en 8 partidas" | ✓ |
| El pacifista | Krill1nt · 34.779,25 · 8 | Krill1nt · "34.779 por partida en 8 partidas" | ✓ |
| El D-d-d-diablo | TheCIutch · 43.834,82 · 22 | TheCIutch · "43.835 … en 22 partidas" | ✓ |
| Equipo roto | Hylimichi+TheCIutch+zapas14 · 2 1º · 3,30 · 10 (los otros 3 tríos clasificados tienen 0 1º) | Ídem · "2 en 10 partidas (puesto medio 3,30)" | ✓ |
| Equipo mental boom | Azpekaa+BEJITO MAMBO+Hylimichi · 4,667 · 9 | Ídem · "4,67 en 9 partidas" | ✓ |
| Pareja rota | Hylimichi+TheCIutch · 3 1º · 3,294 · 17 | Ídem · "3 en 17 partidas (puesto medio 3,29)" | ✓ |
| Pareja mental boom | Azpekaa+Hylimichi · 4,364 · 11 | Ídem · "4,36 en 11 partidas" | ✓ |

**Dúos y tríos de la semana** (3 o más partidas): 9 dúos y 4 tríos (BEJITO MAMBO+Hylimichi 20·0·4,00 … BEJITO MAMBO+TheCIutch+zapas14 3·0·2,33). La lista del HTML coincide fila a fila con la SQL: **13/13** ✓.

Con el JSON del loader cuadran los 12 dúos y los 8 tríos: 20/20.

**Recuento Semana actual: ranking 6/6, títulos 7/7, tabla de la semana 13/13, equipos del loader 20/20.**

### 3. Semanas y días pasados (lado app: `loadGroupView(getDb(), now)`)

Salida literal de `compare.py`:
```
app-0924.json day 2026-09-24 RANK: 5/5 cuadran
app-0924.json day 2026-09-24 SINMIN: 1/1 cuadran
app-0924.json day 2026-09-24 DUO: 10/10 cuadran
app-0924.json day 2026-09-24 TRIO: 7/7 cuadran
app-0924.json day 2026-09-24 TITULO: 6/6 cuadran
app-0924.json week 2026-09-21 RANK: 6/6 cuadran
app-0924.json week 2026-09-21 SINMIN: 0/0 cuadran
app-0924.json week 2026-09-21 DUO: 14/14 cuadran
app-0924.json week 2026-09-21 TRIO: 13/13 cuadran
app-0924.json week 2026-09-21 TITULO: 7/7 cuadran
app-09-16.json day 2026-09-16 RANK: 5/5 cuadran
app-09-16.json day 2026-09-16 SINMIN: 1/1 cuadran
app-09-16.json day 2026-09-16 DUO: 9/9 cuadran
app-09-16.json day 2026-09-16 TRIO: 5/5 cuadran
app-09-16.json day 2026-09-16 TITULO: 5/5 cuadran
app-09-16.json week 2026-09-14 RANK: 6/6 cuadran
app-09-16.json week 2026-09-14 SINMIN: 0/0 cuadran
app-09-16.json week 2026-09-14 DUO: 15/15 cuadran
app-09-16.json week 2026-09-14 TRIO: 15/15 cuadran
app-09-16.json week 2026-09-14 TITULO: 7/7 cuadran
app-07-20.json day 2026-07-19 RANK: 0/0 cuadran
app-07-20.json day 2026-07-19 SINMIN: 2/2 cuadran
app-07-20.json day 2026-07-19 DUO: 1/1 cuadran
app-07-20.json day 2026-07-19 TRIO: 0/0 cuadran
app-07-20.json day 2026-07-19 TITULO: 0/0 cuadran
app-07-20.json week 2026-07-20 RANK: 3/3 cuadran
app-07-20.json week 2026-07-20 SINMIN: 1/1 cuadran
app-07-20.json week 2026-07-20 DUO: 5/5 cuadran
app-07-20.json week 2026-07-20 TRIO: 2/2 cuadran
app-07-20.json week 2026-07-20 TITULO: 5/5 cuadran
```

**Semana 2026-09-21** (la pedida; `now` = 2026-09-24T12:00Z). Títulos:

| Título | SQL | App | |
|---|---|---|---|
| El trol | Hylimichi · 3,763 · 76 | Hylimichi · "3,76 en 76 partidas" | ✓ |
| El pacifista | Hylimichi · 36.093,41 · 76 | Hylimichi · "36.093 … en 76" | ✓ |
| El D-d-d-diablo | TheCIutch · 47.190,08 · 51 | TheCIutch · "47.190 … en 51" | ✓ |
| Equipo roto | Azpekaa+BEJITO MAMBO+zapas14 · 2 1º · 1,333 · 3 | Ídem · "2 en 3 partidas (puesto medio 1,33)" | ✓ (desempate por puesto medio frente a Azpekaa+BEJITO MAMBO+Hylimichi, también con 2 1º pero medio 2,67) |
| Equipo mental boom | Hylimichi+TheCIutch+zapas14 · 3,833 · 6 | Ídem · "3,83 en 6 partidas" | ✓ |
| Pareja rota | Azpekaa+BEJITO MAMBO · 6 1º · 2,714 · 14 | Ídem · "6 en 14 partidas (puesto medio 2,71)" | ✓ |
| Pareja mental boom | Hylimichi+zapas14 · 3,913 · 23 | Ídem · "3,91 en 23 partidas" | ✓ |

Ranking 6/6 (Krill1nt 20·5·2,80 · BEJITO MAMBO 65·12·3,17 · Azpekaa 27·6·3,30 · TheCIutch 51·4·3,39 · zapas14 62·7·3,53 · Hylimichi 76·6·3,76). Dúos 14/14, tríos 13/13.

**Día 2026-09-24** (mismo `now`):
- Ranking 5/5 + Azpekaa sin mínimo (2 partidas).
- Títulos 6/6, incluido un **empate compartido** en Pareja mental boom: BEJITO MAMBO+zapas14 (4,50 en 6) y Hylimichi+TheCIutch (4,50 en 4), los dos en ambos lados.
- **Títulos de trío no otorgados** (1 solo trío clasificado), en ambos lados.

**Semana 2026-09-14 y día 2026-09-16** (`now` = 2026-09-16T12:00Z):
- Todo cuadra: semana 6+15+15+7, día 5+1+9+5+5.
- Caso de **jugador justo en el mínimo**: Azpekaa, con 3 partidas en el día, gana El trol y El D-d-d-diablo, y Krill1nt (2) queda sin mínimo.

**Periodo vacío** (`now` = 2026-07-20T12:00Z, lunes):
- El SQL confirma que el día de juego 2026-07-20 no tiene partidas de miembros. La app muestra el día **2026-07-19** con `isCurrent=false`, el último con partidas según `gaps.sql`.
- En ese día, BEJITO MAMBO y Hylimichi quedan sin mínimo (2 partidas), no hay títulos y el único dúo coincide: 1/1.
- La semana 2026-07-20 cuadra: 3 en el ranking, 1 sin mínimo, 5 dúos, 2 tríos y 5 títulos. El script fija un `now` histórico, así que la semana incluye partidas posteriores a ese `now`; los dos lados usan el mismo criterio.

**Recuento de periodos pasados: 156/156 cuadran** (suma de las filas de `compare.py`):
- Semana 2026-09-21 (la pedida): 40/40. Día 2026-09-24: 29/29.
- Semana 2026-09-14: 43/43. Día 2026-09-16: 25/25.
- Día 2026-07-19 (mostrado por periodo vacío): 3/3. Semana 2026-07-20: 16/16.

### 4. Equipos: Dúos y Tríos de temporada (HTML de `/grupo`)

| Dúo | SQL (part · 1º · % · medio) | App | |
|---|---|---|---|
| BEJITO MAMBO+Hylimichi | 414 · 53 · 12,8 · 3,42 | 414 · 53 · 12,8 % · 3,42 | ✓ |
| Azpekaa+Hylimichi | 320 · 46 · 14,4 · 3,58 | ídem | ✓ |
| Azpekaa+BEJITO MAMBO | 189 · 36 · 19,0 · 3,38 | ídem | ✓ |
| Hylimichi+zapas14 | 160 · 13 · 8,1 · 3,68 | ídem | ✓ |
| Hylimichi+TheCIutch | 139 · 18 · 12,9 · 3,54 | ídem | ✓ |
| BEJITO MAMBO+TheCIutch | 136 · 12 · 8,8 · 3,38 | ídem | ✓ |
| BEJITO MAMBO+zapas14 | 112 · 15 · 13,4 · 3,16 | ídem | ✓ |
| TheCIutch+zapas14 | 102 · 9 · 8,8 · 3,36 | ídem | ✓ |
| Hylimichi+Krill1nt | 101 · 18 · 17,8 · 3,50 | ídem | ✓ |
| Azpekaa+zapas14 | 73 · 9 · 12,3 · 3,48 | ídem | ✓ |
| BEJITO MAMBO+Krill1nt | 56 · 11 · 19,6 · 3,43 | ídem | ✓ |
| Krill1nt+TheCIutch | 50 · 8 · 16,0 · 3,62 | ídem | ✓ |
| Azpekaa+TheCIutch | 34 · 4 · 11,8 · 3,24 | ídem | ✓ |
| Krill1nt+zapas14 | 30 · 5 · 16,7 · 3,67 | ídem | ✓ |
| Azpekaa+Krill1nt | 23 · 1 · 4,3 · 3,78 | ídem | ✓ |

| Trío | SQL (part · 1º · % · medio) | App | |
|---|---|---|---|
| Azpekaa+BEJITO MAMBO+Hylimichi | 140 · 23 · 16,4 · 3,49 | ídem | ✓ |
| BEJITO MAMBO+Hylimichi+TheCIutch | 65 · 5 · 7,7 · 3,51 | ídem | ✓ |
| BEJITO MAMBO+Hylimichi+zapas14 | 48 · 3 · 6,3 · 3,46 | ídem | ✓ |
| BEJITO MAMBO+TheCIutch+zapas14 | 39 · 3 · 7,7 · 3,15 | ídem | ✓ |
| Azpekaa+Hylimichi+zapas14 | 35 · 3 · 8,6 · 3,71 | ídem | ✓ |
| Hylimichi+TheCIutch+zapas14 | 30 · 4 · 13,3 · 3,37 | ídem | ✓ |
| BEJITO MAMBO+Hylimichi+Krill1nt | 29 · 8 · 27,6 · 2,93 | ídem | ✓ |
| Hylimichi+Krill1nt+TheCIutch | 24 · 4 · 16,7 · 3,92 | ídem | ✓ |
| Azpekaa+TheCIutch+zapas14 | 15 · 1 · 6,7 · 3,27 | ídem | ✓ |
| Azpekaa+BEJITO MAMBO+zapas14 | 14 · 5 · 35,7 · 2,64 | ídem | ✓ |
| Azpekaa+Hylimichi+Krill1nt | 14 · 1 · 7,1 · 3,36 | ídem | ✓ |
| Hylimichi+Krill1nt+zapas14 | 13 · 2 · 15,4 · 3,77 | ídem | ✓ |
| Azpekaa+BEJITO MAMBO+TheCIutch | 11 · 1 · 9,1 · 2,91 | ídem | ✓ |
| Krill1nt+TheCIutch+zapas14 | 11 · 1 · 9,1 · 3,73 | ídem | ✓ |
| BEJITO MAMBO+Krill1nt+TheCIutch | 9 · 1 · 11,1 · 3,56 | ídem | ✓ |
| Azpekaa+Hylimichi+TheCIutch | 5 · 2 · 40,0 · 3,80 | ídem | ✓ |
| Azpekaa+BEJITO MAMBO+Krill1nt | 4 · 0 · 0,0 · 5,00 | ídem | ✓ |
| BEJITO MAMBO+Krill1nt+zapas14 | 4 · 2 · 50,0 · 2,00 | ídem | ✓ |
| Azpekaa+Krill1nt+TheCIutch | 3 · 0 · 0,0 · 3,33 | ídem | ✓ |

- Están todos los equipos con 3 o más partidas y ninguno con menos. El orden por partidas es descendente en los dos lados.
- El único empate de partidas en tríos (4) sale en distinto orden relativo; la spec no fija ese orden.
- Ningún trío incluye a elruffles: solo entran filas de miembros.

**Recuento Equipos: 15/15 dúos y 19/19 tríos (34/34).**

### 5. Temporada: Resumen (HTML y RSC de `/grupo`)

| Miembro | Columna | SQL | App | |
|---|---|---|---|---|
| Azpekaa | part · 1º · %1º · medio | 488 · 75 · 15,4 · 3,47 | 488 · 75 · 15,4 % · 3,47 | ✓ |
| | ganados (univ/challenge→max) | 63/63→63 | 63 | ✓ |
| | a la primera · % | 9 · 14,3 | 9 · 14,3 % | ✓ |
| | más 1º | Brand 5 (23 p) | Brand 5 × 1º | ✓ |
| BEJITO MAMBO | part · 1º · %1º · medio | 601 · 86 · 14,3 · 3,36 | 601 · 86 · 14,3 % · 3,36 | ✓ |
| | ganados | 77/77→77 | 77 | ✓ |
| | a la primera · % | 18 · 23,4 | 18 · 23,4 % | ✓ |
| | más 1º | AurelionSol 8 (23 p) | Aurelion Sol 8 × 1º | ✓ (alias) |
| Hylimichi | part · 1º · %1º · medio | 911 · 113 · 12,4 · 3,60 | 911 · 113 · 12,4 % · 3,60 | ✓ |
| | ganados | 108/108→108 | 108 | ✓ |
| | a la primera · % | 13 · 12,0 | 13 · 12,0 % | ✓ |
| | más 1º | Cassiopeia 3 (20 p) | Cassiopeia 3 × 1º | ✓ |
| Krill1nt | part · 1º · %1º · medio | 181 · 27 · 14,9 · 3,71 | 181 · 27 · 14,9 % · 3,71 | ✓ |
| | ganados | 27/27→27 | 27 | ✓ |
| | a la primera · % | 10 · 37,0 | 10 · 37,0 % | ✓ |
| | más 1º | Ornn 1 (16 p) (empate a 1º; desempata nº de partidas) | Ornn 1 × 1º | ✓ |
| TheCIutch | part · 1º · %1º · medio | 262 · 31 · 11,8 · 3,44 | 262 · 31 · 11,8 % · 3,44 | ✓ |
| | ganados | 31/31→31 | 31 | ✓ |
| | a la primera · % | 5 · 16,1 | 5 · 16,1 % | ✓ |
| | más 1º | Shyvana 1 (21 p) | Shyvana 1 × 1º | ✓ |
| zapas14 | part · 1º · %1º · medio | 283 · 29 · 10,2 · 3,55 | 283 · 29 · 10,2 % · 3,55 | ✓ |
| | ganados | **28/29→29** | 29 | ✓ |
| | a la primera · % | 4 · **14,3 sobre 28** (13,8 sobre 29) | 4 · 14,3 % | ✓ con nota |
| | más 1º | MasterYi 2 (10 p) | Maestro Yi 2 × 1º | ✓ (alias) |

**Nota sobre zapas14, % a la primera.** Es el único miembro con `challenge_value` (29) mayor que la lista verificada del universo (28). La app calcula el % como 4/28 = 14,3 %:
- Coincide con la definición existente (`computeRecords().firstTry.rate = count / won.length`, con `won` = campeones con algún 1º en las filas).
- Coincide con lo que muestra el perfil de zapas14, pestaña Estadísticas: "4 de 28 campeones ganados · 14,3 %" (capturado de `/euw/zapas14-EUW?tab=estadisticas`).

La spec pide reutilizar esa definición "sin redefinirlas" (Alcance, Bloque Temporada) y que cada valor coincida con el perfil (AC8). Por eso **no es un bug**. Sí es una incoherencia visual de la tabla de grupo: la columna contigua "Campeones ganados" muestra 29 y 4/29 sería 13,8 %. Se documenta como observación para el supervisor.

**Líderes** (`table.leaders` del RSC, comparados con el máximo, o el mínimo para el puesto medio, de la salida SQL):

| Columna | Líder |
|---|---|
| Partidas, 1º, Campeones ganados | Hylimichi |
| % 1º | Azpekaa |
| Medio, A la primera, Más 1º (8), Máx. daño, Kills | BEJITO MAMBO |
| % a la primera | Krill1nt |
| Daño recibido (243.048 frente a 243.038 de Krill1nt) | zapas14 |
| Racha de kills | Azpekaa |
| Muertes | TheCIutch |
| Racha de 1º (empate a 4) | Azpekaa, BEJITO MAMBO, Hylimichi, TheCIutch |
| Sin 1º (45) | zapas14 |

15/15 ✓.

**Recuento Resumen: 48/48 cuadran** (6 miembros × 8 columnas), con la nota de zapas14. **Líderes: 15/15.**

### 6. Temporada: Récords (payload RSC de `/grupo`)

Formato de cada celda: valor · match_id (campeón). Las rachas van como longitud · desde..hasta. El orden cronológico es `(game_creation, match_id)`; el empate de valor lo gana la partida más antigua y el de racha, la más reciente.

| Miembro | Récord | SQL | App | |
|---|---|---|---|---|
| Azpekaa | Daño | 157482 · EUW1_7885412389 (Brand) | ídem | ✓ |
| | Daño recibido | 174582 · EUW1_7979875621 (Alistar) | ídem | ✓ |
| | Kills | 29 · EUW1_7960100766 (Belveth) | ídem (Bel'Veth) | ✓ |
| | Racha kills | 27 · EUW1_7960100766 (Belveth) | ídem | ✓ |
| | Muertes | 17 · EUW1_7988030151 (Azir) | ídem | ✓ |
| | Racha 1º | 4 · EUW1_7960793096..EUW1_7960932005 | 4 · from 7960793096 to 7960932005 | ✓ |
| | Sin 1º | 21 · EUW1_7976967395..EUW1_7980976455 | ídem | ✓ |
| BEJITO MAMBO | Daño | 175057 · EUW1_7926916560 (AurelionSol) | ídem | ✓ |
| | Daño recibido | 224805 · EUW1_7986856513 (Zac) | ídem | ✓ |
| | Kills | 32 · EUW1_7940629369 (Smolder) | ídem | ✓ |
| | Racha kills | 19 · EUW1_7947189945 (Sivir) | ídem | ✓ |
| | Muertes | 18 · EUW1_7890681824 (Vayne) | ídem | ✓ |
| | Racha 1º | 4 · EUW1_7960793096..EUW1_7960932005 | ídem | ✓ |
| | Sin 1º | 27 · EUW1_7976510658..EUW1_7979403105 | ídem | ✓ |
| Hylimichi | Daño | 156312 · EUW1_7932690931 (Ahri) | ídem | ✓ |
| | Daño recibido | 182585 · EUW1_7941668205 (Zaahen) | ídem | ✓ |
| | Kills | 29 · EUW1_7989233112 (Corki) | ídem | ✓ |
| | Racha kills | 20 · EUW1_7904774891 (Swain) | ídem | ✓ |
| | Muertes | 21 · EUW1_7910152748 (Cassiopeia) | ídem | ✓ |
| | Racha 1º | 4 · EUW1_7960793096..EUW1_7960932005 | ídem | ✓ |
| | Sin 1º | 38 · EUW1_7974682682..EUW1_7978289943 | ídem | ✓ |
| Krill1nt | Daño | 130293 · EUW1_7980380080 (Aphelios) | ídem | ✓ |
| | Daño recibido | 243038 · EUW1_7910152748 (Sion) | ídem | ✓ |
| | Kills | 25 · EUW1_7989892627 (Swain) | ídem | ✓ |
| | Racha kills | 17 · EUW1_7989892627 (Swain) | ídem | ✓ |
| | Muertes | 16 · EUW1_7994613885 (Annie) | ídem | ✓ |
| | Racha 1º | 3 · EUW1_7989233112..EUW1_7989266290 | ídem | ✓ |
| | Sin 1º | 26 · EUW1_7890515797..EUW1_7964511614 | ídem | ✓ |
| TheCIutch | Daño | 161003 · EUW1_7989726795 (Belveth) | ídem | ✓ |
| | Daño recibido | 166589 · EUW1_7996938702 (Shyvana) | ídem | ✓ |
| | Kills | 26 · EUW1_7989726795 (Belveth) | ídem | ✓ |
| | Racha kills | 16 · EUW1_7996938702 (Shyvana) | ídem | ✓ |
| | Muertes | 25 · EUW1_7980871496 (Yone) | ídem | ✓ |
| | Racha 1º | 4 · EUW1_7974281288..EUW1_7974457396 | ídem | ✓ |
| | Sin 1º | 44 · EUW1_7897887537..EUW1_7971855988 | ídem | ✓ |
| zapas14 | Daño | 140208 · EUW1_7962126334 (MasterYi) | ídem (Maestro Yi) | ✓ |
| | Daño recibido | 243048 · EUW1_7967539387 (Garen) | ídem | ✓ |
| | Kills | 25 · EUW1_7986700616 (Udyr) | ídem | ✓ |
| | Racha kills | 17 · EUW1_7986700616 (Udyr) | ídem | ✓ |
| | Muertes | 17 · EUW1_7913465088 (MasterYi) | ídem | ✓ |
| | Racha 1º | 2 · EUW1_7997222696..EUW1_7997266811 | ídem | ✓ |
| | Sin 1º | 45 · EUW1_7922478129..EUW1_7965598465 | ídem | ✓ |

**Recuento Récords: 42/42 cuadran** (valor + partida, y desde/hasta en las rachas).

### 7. Badges en la cabecera del perfil (`/euw/<slug>`)

**Esperado (SQL).** Para cada miembro, unión de los titulares de los títulos del día 2026-09-30 y de la semana 2026-09-28 (bloques 1 y 2). Un título de dúo o de trío se reparte a cada uno de sus miembros.

| Perfil | Esperado (SQL) | Servido (HTML de la cabecera, junto a "Deidad de Arena") | |
|---|---|---|---|
| BEJITO MAMBO#1991 | El trol del día; Pareja mental boom del día; Equipo mental boom de la semana | Los mismos 3 (con su "por qué": 4,00 en 4; 4,33 en 3; 4,67 en 9) | ✓ 3/3 |
| Hylimichi#EUW | El pacifista del día; Pareja rota del día; Equipo roto, Equipo mental boom, Pareja rota y Pareja mental boom de la semana | Los mismos 6 (37.084 en 15; 1 en 11 (3,91); 2 en 10 (3,30); 4,67 en 9; 3 en 17 (3,29); 4,36 en 11) | ✓ 6/6 |
| Azpekaa#EUW | Equipo mental boom de la semana; Pareja mental boom de la semana | Los mismos 2 | ✓ 2/2 |
| TheCIutch#EUW | El D-d-d-diablo, Pareja rota y Pareja mental boom del día; El D-d-d-diablo, Equipo roto y Pareja rota de la semana | Los mismos 6 | ✓ 6/6 |
| zapas14#EUW | Equipo roto de la semana | El mismo 1 | ✓ 1/1 |
| Krill1nt#EUW | El trol de la semana; El pacifista de la semana | Los mismos 2 (3,88 en 8; 34.779 en 8) | ✓ 2/2 |
| elruffles#6485 (no miembro) | ninguno | Ninguno: 0 apariciones de "del día"/"de la semana" en el HTML, y tampoco tiene enlace `tab=grupo` | ✓ 0/0 |

En los 6 miembros, ningún badge sobra y ninguno falta. Los textos de "por qué" coinciden con los de `/grupo`.

**Recuento Badges: 20/20 badges y 7/7 perfiles cuadran.**

---

### Resumen de recuentos

| Bloque | Cuadran |
|---|---|
| Hoy (2026-09-30) | ranking 5/5 · títulos 7/7 (5 otorgados + 2 de trío no otorgados) · tabla del día 5/5 · equipos del loader 12/12 |
| Semana actual (2026-09-28) | ranking 6/6 · títulos 7/7 · tabla de la semana 13/13 · equipos del loader 20/20 |
| Semana pasada 2026-09-21 (+ día 09-24) | 40/40 (+ 29/29) |
| Extra: semana 09-14 + día 09-16; periodo vacío 07-20→07-19 + semana 07-20 | 87/87 |
| Dúos/Tríos de temporada | 15/15 + 19/19 |
| Temporada Resumen | 48/48 (nota de presentación: % a la primera de zapas14) |
| Temporada líderes | 15/15 |
| Temporada Récords | 42/42 |
| Badges | 20/20 badges, 7/7 perfiles (incluido elruffles sin badges) |

**Diferencias: ninguna.**

**Observación (no es bug según la spec).** En la tabla de Temporada, el "% a la primera" usa como denominador los campeones ganados de la lista del historial (`computeRecords`, igual que el perfil), no la columna "Campeones ganados" (que es el máximo con el contador oficial). Solo se nota en zapas14: muestra 4 · 14,3 % junto a 29 ganados (4/29 = 13,8 %). Decide el supervisor si basta con una aclaración visual.

**Veredicto AC11: CUMPLE.** Todos los valores servidos por la app cuadran con el SQL independiente en Hoy, en la Semana actual, en las semanas pasadas (incluida la 2026-09-21, con trío y desempate de Equipo roto), en Equipos, en la Temporada (Resumen, Récords y líderes) y en los badges de los 6 perfiles. elruffles no cuenta en nada y no muestra títulos.
