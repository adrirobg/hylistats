# Spec: hylistats — iter-05 capa de grupo
**Estado**: aprobada (issue [#9](https://github.com/adrirobg/hylistats/issues/9), aprobada por el supervisor, 2026-10-01)
**Consume**: think.md §3 (alcance, criterio de terminado y recorte) y decisiones F19, F20 y F21 como referencia y restricción; ORGANIZED "iter-05: capa de grupo" (P2–P11); F8 (temporada), F14 (colas 1750 y 1740), F17 (día de juego) y F18 (validación manual agrupada); `.dev/research/design-brief.md` y `design-mock.html` como lenguaje visual (no hay maqueta de `/grupo`); iteraciones 01–04 (`.dev/archive/`), en especial `src/domain/records.ts` y `src/components/hy/badge.tsx` de iter-04
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

Segundo corte post-v1 (F15): la capa de grupo. Una vista del grupo (en `/grupo` y como pestaña en el perfil de cada miembro) con el ranking del día y de la semana, títulos vergonzantes explicados, tablas de dúos y tríos y una comparativa de temporada entre jugadores, para generar piques durante las sesiones de Arena.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Grupo** (F19). Un único grupo fijo: una lista de perfiles guardada en el servidor (tabla nueva, migración de Drizzle). En `/admin`, tras el login actual, un apartado "Grupo" permite añadir un perfil ya registrado (por Riot ID) y quitar un miembro. Miembros iniciales: BEJITO MAMBO, Hylimichi, Azpekaa, TheCIutch, zapas14 y Krill1nt; elruffles queda fuera. Todo lo que sigue solo cuenta a los miembros, en la temporada actual (F8) y en las colas 1750 y 1740 (F14).
- **Vista del grupo**, un mismo componente que se muestra en dos sitios:
  - **`/grupo`**: URL propia para compartir, con un enlace "Grupo" en la cabecera de la app.
  - **Pestaña "Grupo"** (`?tab=grupo`) en el perfil de cada miembro, con la fila del dueño del perfil destacada. No aparece en perfiles que no son del grupo.
  - Con los mismos datos, las dos muestran los mismos valores.
- **Bloque Hoy / Semana** (F20), con un selector:
  - **Periodos**: el día es el día de juego de F17 (06:00 a 06:00, Europe/Madrid, `gameStartTimestamp`; se reutiliza `gameDay`). La semana va del lunes a las 06:00 al lunes siguiente a las 06:00, hora de Madrid, y debe ser correcta en los cambios de hora.
  - **Periodo vacío**: si en el periodo actual ningún miembro ha jugado, se muestra el último día (o la última semana) con partidas, indicando su fecha.
  - **Ranking**: miembros ordenados por puesto medio, con partidas, 1º y puesto medio. Los que no llegan al mínimo del periodo aparecen aparte como "sin mínimo". Los empates de puesto medio comparten posición.
  - **Títulos del periodo**: se muestran en el bloque.
- **Títulos** (F21). Los hay de día y de semana, cada uno con su periodo en el nombre visible ("El trol del día", "El trol de la semana").

  | Título | Métrica |
  |---|---|
  | El trol | Peor puesto medio |
  | El pacifista | Menos daño medio a campeones por partida (`totalDamageDealtToChampions`) |
  | El D-d-d-diablo | Más daño medio a campeones por partida |
  | Equipo roto | Trío con más 1º juntos; desempata el mejor puesto medio |
  | Equipo mental boom | Trío con peor puesto medio juntos |
  | Pareja rota | Dúo con más 1º juntos; desempata el mejor puesto medio |
  | Pareja mental boom | Dúo con peor puesto medio juntos |

  - **Trío**: tres miembros en el mismo equipo (`playerSubteamId`).
  - **Dúo**: dos miembros en el mismo equipo, sea el tercero miembro o no. Un trío de miembros aporta sus tres dúos.
  - **Mínimos**: 3 partidas en el día (`RECORD_DAY_MIN_GAMES`) y 5 en la semana para los títulos individuales; 3 partidas juntos en el periodo para los de dúo y trío. Van como constantes en `config.ts`.
  - **Competencia**: un título solo se otorga si hay al menos 2 clasificados (jugadores, dúos o tríos, según el título).
  - **Empates**: el título se comparte.
- **Explicación de los títulos** (P5):
  - **En cada título** (en la vista y en el badge): al pasar el ratón, hacer clic o enfocarlo con el teclado, se ve por qué lo tiene (métrica, valor y partidas; por ejemplo, "Peor puesto medio del día: 4,6 en 5 partidas") y un enlace al apartado Títulos.
  - **Apartado "Títulos"** en la vista: una lista fija con cada título, qué mide, sus periodos, el mínimo y las reglas comunes (al menos 2 clasificados, empates compartidos, cortes del día y de la semana).
- **Badges en el perfil** (P5). Los títulos vigentes de un miembro, los del periodo que muestra el bloque Hoy / Semana, salen como `Badge` junto a su nombre en la cabecera del perfil, al lado de "Deidad de Arena". Los títulos de dúo y de trío salen en el perfil de cada uno de sus miembros.
- **Tooltip del badge**: el `Badge` debe abrirse también al enfocarlo con el teclado. Esto resuelve la deuda de iter-04, que hoy anuncia la descripción por `aria-describedby` pero no se abre con el foco.
- **Bloque Equipos** (P6, P7). Dos tablas de toda la temporada, **Dúos** y **Tríos**, con partidas, 1º, % de 1º y puesto medio. Solo entran los equipos con 3 o más partidas juntos, ordenados por partidas.
- **Bloque Temporada** (P8). Tabla con una fila por miembro, ordenable por columna, con el líder de cada columna destacado (el valor más bajo en puesto medio y el más alto en el resto). Tiene dos pestañas:
  - **Resumen**: partidas, 1º, % de 1º, puesto medio, campeones ganados (el mismo valor que decide el badge "Deidad de Arena": lista verificada, o contador oficial si es mayor; nunca las marcas manuales), victorias a la primera (número y %) y campeón con más 1º.
  - **Récords**: máximo de daño, de daño recibido, de kills, de racha de kills y de muertes, más la racha más larga de 1º y la de partidas sin 1º. Cada valor enlaza a su partida en el perfil de su dueño (`/euw/<slug>?tab=partidas&partida=`).
  - Las cifras salen de `computeRecords` y de las definiciones existentes (`firstTryMatches`, `arenaGodGoal`), sin redefinirlas.
- **Frescura** (P9):
  - **Al abrir** `/grupo` o la pestaña Grupo, y en el latido de comprobación, se pide el incremental automático de cada miembro, con el mismo límite de 5 minutos por perfil (`requestRefresh` y `ensureFreshOnView`).
  - **Botón "Actualizar grupo"**: pide el incremental interactivo de todos los miembros, con el mismo límite que el botón Actualizar del perfil.
  - **Aviso de antigüedad**: la vista indica la última sincronización del miembro menos reciente.
  - **Sin almacenamiento de títulos**: rankings, títulos y badges se calculan al leer, a partir de la BD. No se guardan ni hay un proceso que los asigne.

**No incluye** <!-- SHOULD -->:
- Comparativa dentro del perfil fuera de la pestaña Grupo.
- Tríos con externos en la pestaña Compañeros.
- El mes como periodo.
- Navegar por días o semanas anteriores.
- Historial de títulos ganados.
- Títulos positivos individuales.
- Indicador de forma del jugador (hilo abierto).
- Agregado del grupo (el campeón con más 1º entre todos, los 1º totales).
- Sync periódica sin visitas.
- Varios grupos.
- Hosting y pulido de la UI base ajeno a estos ficheros.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Grupo en BD y `/admin` | Tabla de miembros con migración, consultas de la lista y apartado "Grupo" en `/admin` para añadir y quitar miembros |
| 2 | Dominio de periodos y títulos | Módulo puro en `src/domain/`: semana de juego, periodo vacío, ranking, los 7 títulos con mínimos, competencia y empates, y el texto de "por qué" de cada título. Tests con partidas de prueba |
| 3 | Dominio de equipos y temporada | Módulo puro: dúos y tríos de miembros (temporada y periodo) y tabla de temporada por miembro sobre `computeRecords`, con líderes por columna. Tests |
| 4 | Carga de datos del grupo | Consultas y carga de la vista del grupo en un módulo propio, sin hacer crecer `src/app/euw/[slug]/data.ts` |
| 5 | Vista del grupo | Componente con Hoy / Semana, Equipos, Temporada (Resumen y Récords) y Títulos, estados vacíos y enlaces; página `/grupo` y enlace en la cabecera |
| 6 | Pestaña Grupo | `?tab=grupo` en los perfiles de los miembros, con la fila del dueño destacada |
| 7 | Badges de títulos | Títulos vigentes en la cabecera del perfil con su explicación; `Badge` abierto también al enfocarlo |
| 8 | Frescura del grupo | Auto-refresco de los miembros al abrir la vista, botón "Actualizar grupo" y aviso de antigüedad |
| 9 | Verificación | `.dev/verify-report.md` con tests, cruce SQL independiente y capturas |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Grupo.** En `/admin`, tras el login, se puede añadir un perfil registrado por Riot ID y quitar un miembro. Un Riot ID no registrado da un error claro. Con los 6 miembros de F19 dados de alta, elruffles no cuenta en ninguna cifra de la vista del grupo.
- [ ] **AC2 — Periodos.** `gameDay` sigue siendo la única definición del día. La semana va del lunes a las 06:00 al lunes siguiente a las 06:00, hora de Madrid. Hay tests en los límites (lunes 05:59 y 06:00) y en las semanas del 2026-03-29 y del 2026-10-25, con cambio de hora. Con el periodo actual vacío, el bloque muestra el último día (o la última semana) con partidas, indicando su fecha.
- [ ] **AC3 — Ranking.** El ranking del periodo ordena a los miembros con el mínimo por puesto medio, con partidas, 1º y puesto medio. Los empates comparten posición. Los que no llegan al mínimo salen aparte como "sin mínimo".
- [ ] **AC4 — Títulos.** Cada uno de los 7 títulos cumple su métrica (tabla del Alcance) en el día y en la semana. Hay tests con partidas de prueba para cada caso:
  - empate que comparte el título;
  - un solo clasificado, en cuyo caso no se otorga;
  - jugador o equipo justo en el mínimo, y uno por debajo;
  - desempate de "Equipo roto" y "Pareja rota" por puesto medio;
  - trío con un externo, que no cuenta como trío pero sí genera su dúo;
  - dúo que forma parte de un trío.
- [ ] **AC5 — Explicación.**
  - Cada título, en la vista y en el badge, se abre al pasar el ratón, al hacer clic y al enfocarlo con el teclado (comprobado en el navegador).
  - Muestra la métrica, el valor y las partidas, y enlaza al apartado Títulos.
  - El valor coincide con el de la tabla de su bloque.
  - El apartado Títulos lista los 7 títulos con su métrica, periodos, mínimo y las reglas comunes.
- [ ] **AC6 — Badges en el perfil.**
  - El perfil de cada miembro muestra en la cabecera, como badge, exactamente los títulos que la vista del grupo le asigna en el día y en la semana que muestra.
  - Un título de dúo o de trío sale en el perfil de cada uno de sus miembros.
  - Un perfil que no es del grupo no muestra ningún badge de título.
- [ ] **AC7 — Equipos.**
  - Las tablas de Dúos y de Tríos (toda la temporada) muestran partidas, 1º, % de 1º y puesto medio de cada equipo con 3 o más partidas juntos, ordenados por partidas.
  - En Tríos solo aparecen tríos formados enteramente por miembros.
- [ ] **AC8 — Temporada.**
  - Las pestañas Resumen y Récords muestran las columnas del Alcance para cada miembro.
  - Cada valor coincide con lo que muestra el perfil de ese miembro: Resumen, Estadísticas y barra de Deidad o Dios de Arena, sin marcas manuales.
  - La tabla se ordena por cualquier columna.
  - El líder de cada columna está destacado.
  - Cada récord enlaza a su partida en el perfil de su dueño.
  - Se ve sin scroll horizontal de página a 375 px.
- [ ] **AC9 — Dos sitios, mismos datos.**
  - `/grupo` es accesible desde el enlace "Grupo" de la cabecera.
  - La pestaña Grupo aparece en los 6 perfiles de miembros y no en el de elruffles.
  - Muestra los mismos valores que `/grupo`, con la fila del dueño destacada.
- [ ] **AC10 — Frescura.**
  - Al abrir la vista se encola el incremental de los miembros sin job activo y fuera del límite de 5 minutos, y no se encola ninguno más (comprobado en `sync_jobs`).
  - El botón "Actualizar grupo" pide el incremental de todos los miembros.
  - La vista indica la última sincronización del miembro menos reciente.
  - Todo pasa por el limitador existente.
- [ ] **AC11 — Cruce independiente.** En Verify, un actor independiente, con SQL propio y sin reutilizar el TypeScript de la app, contrasta con la BD local los valores servidos:
  - Hoy y Semana (ranking y títulos) del día y de la semana actuales, y de al menos una semana pasada con partidas;
  - Equipos y Temporada;
  - los badges de los 6 perfiles.

  Todas las comparaciones cuadran, o cada diferencia se explica y se corrige.
- [ ] **AC12 — Aceptación manual (gate del supervisor, F18).**
  - En la sesión conjunta de Arena, el grupo tiene `/grupo` o la pestaña Grupo abiertos y ve cambiar los títulos del día con sus partidas.
  - Nadie encuentra un título o un valor que contradiga sus partidas.
  - Quien recibe un título entiende por qué leyendo su explicación.
  - Se valida junto con AC11 de #7, AC5 de #3 y AC8 de #2. La PR se mergea con este gate abierto.

## Riesgos y restricciones <!-- MAY -->

- **Sin datos nuevos**: no se descarga ninguna partida y no hacen falta columnas en `participants`. Todo sale de las filas guardadas.
- **Presupuesto Riot**: el auto-refresco del grupo puede encolar 6 incrementales a la vez. Todo pasa por el limitador y la cola existentes, y las partidas compartidas se descargan una sola vez.
- **`data.ts` ya tiene 679 líneas** (deuda de iter-04): la carga del grupo va en un módulo propio.
- **Badges vigentes con el periodo vacío**: el badge muestra los títulos del periodo que muestra el bloque Hoy / Semana. Si hoy no ha jugado nadie, siguen visibles los del último día jugado hasta que alguien juegue. Resulta de aplicar P3 y P5 a la vez, y el supervisor lo ratificó al aprobar la spec (2026-10-01).
- **Mínimos revisables**: los mínimos de F21 pueden cambiar tras la sesión conjunta (F18), por eso van como constantes en `config.ts`.

## Estrategia de implementacion <!-- SHOULD -->

Orden por dependencias:
1. **Grupo en BD y `/admin`.** Da de alta a los 6 miembros en la BD local.
2. **Dominio puro** (títulos y periodos; equipos y temporada), con tests. No depende de la UI.
3. **Carga de datos del grupo** en un módulo propio.
4. **Vista del grupo** en `/grupo` y el enlace de la cabecera.
5. **Pestaña Grupo.**
6. **Badges en el perfil**, junto con el foco del `Badge`.
7. **Frescura.**
8. **Verificación.**

`.dev/tasks/index.json` es tracking operativo local derivado de esta spec y del issue. Cada cláusula de cada AC se asigna a un criterio de task (lección de iter-04). Los prompts de task citan la regla de negocio de esta spec, no atajos técnicos sin comprobar.

**Recorte si hiciera falta** (plan de contingencia, no se espera usar), en este orden:
1. La pestaña Récords de Temporada.
2. El botón "Actualizar grupo" (la sincronización al abrir se queda).
3. La tabla de Dúos (los títulos de dúo se quedan).

No se recortan: `/grupo` y la pestaña Grupo con Hoy y Semana, los 7 títulos con su explicación y su badge, la tabla de Tríos, el Resumen de Temporada y la lista del grupo en `/admin`.
