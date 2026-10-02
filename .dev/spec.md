# Spec: hylistats — iter-09 ELO del grupo
**Estado**: aprobada (issue [#18](https://github.com/adrirobg/hylistats/issues/18), aprobada por el supervisor, 2026-10-02, con las dos inferencias: el cambio del periodo sigue al bloque Hoy / Semana y el desglose muestra el cambio base real)
**Consume**: think.md §4 (alcance, fuera y criterio de terminado) y decisiones F24 y F25 como referencia y restricción; ORGANIZED "ELO del grupo" (P1–P11); F8 (temporada), F14 (colas 1750 y 1740), F17 (día de juego), F18 (validación manual agrupada), F19 (grupo) y F20 (semana); iteraciones 01–08 (`.dev/archive/`), en especial la capa de grupo de iter-05 (`src/domain/group-view.ts`, `group-titles.ts`, `src/app/grupo/`) y la curva de `won-curve-chart.tsx`
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

Un ELO interno de Arena para los miembros del grupo, decidido con el grupo en el grill del 2026-10-02 (F24, F25). Sirve para picarse: cada partida suma o resta a la vista y el ranking se mueve en cada sesión. Se ve en una Clasificación en `/grupo`, en la cabecera del perfil, en el historial de partidas y en una gráfica de evolución.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Cálculo del rating** (F24). Es un módulo puro, recalculado al leer y sin guardar nada en la BD.
  - **Partidas**: las de los miembros (F19) en la temporada actual (F8, `SEASON_START`) y en las colas 1750 y 1740 (F14), en orden cronológico (`gameStartTimestamp`; desempata `matchId`). Todos empiezan en **1500**.
  - **Cambio base por partida**: `puntos[puesto] − 44·(E − 0,5)`, con `E = 1 / (1 + 10^((1500 − R) / 400))` y R el rating del jugador antes de la partida.

    | Puesto | 1º | 2º | 3º | 4º | 5º | 6º |
    |---|---|---|---|---|---|---|
    | Puntos | +25 | +12 | +2 | −5 | −15 | −19 |

  - **Multiplicador por desconocidos**: un desconocido es un compañero de equipo (`playerSubteamId`) que no es miembro del grupo; desconocidos = 3 − miembros del equipo. Se aplica al cambio base según su signo:

    | Desconocidos | Si el cambio base es positivo | Si es negativo |
    |---|---|---|
    | 0 | ×1 | ×1 |
    | 1 | ×1,15 | ×0,75 |
    | 2 | ×1,30 | ×0,50 |

  - **Partidas con miembros rivales**: cada miembro puntúa por el puesto de su equipo, sin trato especial.
  - **Precisión**: el rating se guarda con decimales en memoria y se muestra redondeado a entero. En el desglose de una partida, el cambio se muestra con un decimal cuando no es entero (−2,5).
  - **Provisional**: un miembro con menos de **10 partidas** en la temporada está *provisional*.
  - **Constantes**: puntos, pendiente (44), escala (400), rating inicial, multiplicadores, cortes de liga y mínimo de provisional van en `src/lib/config.ts`, como las de F16 y F21.
- **Ligas** (F25). Se deciden por el rating redondeado:

  | Liga | Rating |
  |---|---|
  | Hierro | < 1450 |
  | Bronce | 1450–1479 |
  | Plata (salida) | 1480–1509 |
  | Oro | 1510–1539 |
  | Platino | 1540–1569 |
  | Diamante | ≥ 1570 |

- **Cambio del periodo**: suma de los cambios de las partidas del periodo, en el **día de juego** (F17, `gameDay`) y en la **semana** (F20, `gameWeek`). Se usa el mismo periodo que muestra el bloque Hoy / Semana (`displayedPeriod`: si en el actual no ha jugado ningún miembro, el último con partidas), con la misma etiqueta. Un miembro que no jugó en el periodo tiene cambio "—".
- **Bloque "Clasificación"** en la vista del grupo (`/grupo` y la pestaña Grupo), **encima** de los bloques actuales, que no cambian:
  - Columnas por miembro: posición, miembro, liga, rating, cambio del día, cambio de la semana y partidas de la temporada.
  - **Orden**: por rating de mayor a menor. Los empates de rating redondeado comparten posición.
  - Los *provisionales* entran en el orden con su marca.
  - En la pestaña Grupo, la fila del dueño del perfil va destacada, como en los demás bloques.
  - Una nota breve explica la regla (puntos por puesto, multiplicadores, ligas) y cómo se calcula.
- **Cabecera del perfil** de los miembros: liga y rating junto al nombre ("Oro · 1526", con la marca *provisional* si aplica), como **texto**, no como `Badge`. Los perfiles que no son del grupo no muestran nada.
- **Historial de partidas** de los miembros (pestaña Partidas):
  - **Fila**: el cambio de rating de la partida, con signo ("+29", "−14").
  - **Detalle**: el desglose: puesto, cambio base, multiplicador con el número de desconocidos (si los hay), cambio final y rating tras la partida.
  - Solo las partidas que cuentan para el rating llevan cambio. Los perfiles que no son del grupo no muestran nada.
- **Gráfica de evolución del rating** en la pestaña Resumen del perfil de los miembros, junto a la curva de campeones ganados:
  - Rating tras cada partida a lo largo de la temporada, con las franjas o líneas de liga como referencia.
  - Se hace con `recharts` y `ui/chart.tsx`, como `won-curve-chart.tsx`.
  - Si no hay partidas, un estado vacío. Los perfiles que no son del grupo no la muestran.

**No incluye** <!-- SHOULD -->:
- Títulos de ELO (más ganado y más perdido en la semana).
- El "Clásico" cara a cara entre miembros.
- Reinicios por mes o semana.
- Ajuste por compañeros (OpenSkill).
- ELO para perfiles que no son del grupo.
- Cambios en los bloques actuales de `/grupo` (Hoy / Semana, Equipos, Temporada, Títulos).
- Guardar ratings en la BD o calcularlos fuera de la lectura.
- Indicador de forma del jugador (hilo abierto).
- Pulido de la UI base ajeno a estos ficheros.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Dominio del ELO | Módulo puro `src/domain/elo.ts` con constantes en `config.ts`: rating, historial por partida con su desglose, liga, provisional y cambio del día y de la semana. Tests |
| 2 | Carga del ELO | La vista del grupo incluye la Clasificación. Además, una carga del ELO de un perfil (cabecera, historial y gráfica) en un módulo propio, sin hacer crecer `src/app/euw/[slug]/data.ts` |
| 3 | Bloque Clasificación | Componente en la vista del grupo, en `/grupo` y en la pestaña Grupo |
| 4 | Liga en la cabecera | Texto de liga y rating en la cabecera del perfil de los miembros |
| 5 | Cambio en el historial | Cambio por partida en la fila y desglose en el detalle |
| 6 | Gráfica de rating | Gráfica de evolución en la pestaña Resumen |
| 7 | Verificación | `.dev/verify-report.md` con tests, recálculo independiente y capturas |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Cálculo.** Hay tests con partidas de prueba para:
  - los 6 puestos con rating 1500 (+25 / +12 / +2 / −5 / −15 / −19 exactos);
  - la pendiente con un rating distinto de 1500, en los dos sentidos;
  - los multiplicadores con 0, 1 y 2 desconocidos, con cambio base positivo y negativo;
  - un no miembro del equipo (aunque sea un perfil registrado) cuenta como desconocido;
  - una partida con miembros en equipos rivales, en la que cada uno puntúa por su puesto;
  - el orden cronológico y que el rating de cada partida usa el de antes de ella;
  - que las partidas anteriores a `SEASON_START` y de otras colas no cuentan;
  - el *provisional* con 9 y con 10 partidas.
- [ ] **AC2 — Ligas y periodos.**
  - Hay tests de los cortes de liga en sus bordes (1449/1450, 1479/1480, 1509/1510, 1539/1540, 1569/1570) con el rating redondeado.
  - El cambio del día y de la semana suma las partidas del periodo, con tests en los cortes (05:59 y 06:00; lunes 05:59 y 06:00).
  - Con el periodo actual vacío, el cambio es el del periodo que muestra el bloque Hoy / Semana.
- [ ] **AC3 — Clasificación.**
  - El bloque está encima de los actuales en `/grupo` y en la pestaña Grupo, con los mismos valores en los dos sitios.
  - Muestra posición, miembro, liga, rating, cambio del día y de la semana y partidas.
  - Va ordenado por rating; los empates comparten posición y los *provisionales* llevan su marca.
  - En la pestaña Grupo, la fila del dueño va destacada.
  - Se ve sin scroll horizontal de página a 375 px.
- [ ] **AC4 — Cabecera.**
  - El perfil de cada miembro muestra liga y rating como texto junto al nombre, con el mismo valor que su fila de la Clasificación.
  - El perfil de un no miembro no muestra nada de ELO.
  - La cabecera no se rompe a 375 px con los badges de títulos.
- [ ] **AC5 — Historial.**
  - Cada partida de la temporada de un miembro muestra en su fila el cambio con signo y en el detalle el desglose (puesto, cambio base, multiplicador y desconocidos, cambio final y rating tras la partida).
  - Los valores coinciden con el dominio.
  - Las partidas que no cuentan y los perfiles de no miembros no muestran nada.
- [ ] **AC6 — Gráfica.**
  - La pestaña Resumen de cada miembro muestra la evolución del rating de la temporada, con las ligas como referencia, legible a 375 px y en escritorio.
  - El último punto coincide con el rating de la cabecera.
  - Sin partidas, muestra un estado vacío; en un no miembro no aparece.
- [ ] **AC7 — Recálculo independiente.** En Verify, un actor independiente, con un script propio (SQL y otro lenguaje, sin reutilizar el TypeScript de la app), recalcula sobre la BD local:
  - el rating final, las partidas y la liga de cada miembro;
  - el cambio del día y de la semana mostrados;
  - el cambio de al menos 20 partidas, con casos de 0, 1 y 2 desconocidos y de miembros rivales.

  Todo coincide con lo que sirve la app (±0,01 antes de redondear), o cada diferencia se explica y se corrige.
- [ ] **AC8 — Aceptación manual (gate del supervisor, F18).**
  - En una sesión real de Arena, tras cada partida, cada miembro ve su cambio en el historial y lo entiende (puesto, desconocidos y multiplicador).
  - Nadie encuentra un cambio que contradiga la regla.
  - La Clasificación y la liga de la cabecera se actualizan durante la sesión.
  - Se valida en la próxima sesión conjunta, junto con los gates manuales abiertos. La PR se mergea con este gate abierto.

## Riesgos y restricciones <!-- MAY -->

- **Sin datos nuevos**: no se descarga nada ni hacen falta columnas. Todo sale de `participants` (`placement`, `playerSubteamId`), `matches` y `group_members`, con las filas que ya carga `loadMemberRows` (`src/domain/group-view.ts`).
- **Coste de lectura**: el perfil de un miembro necesita las partidas de todos los miembros para contar los desconocidos y el periodo mostrado. Ya pasa con los títulos (`loadProfileTitles`). La carga del ELO del perfil reutiliza esa misma lectura en vez de duplicarla. Con ~3000 filas por temporada, el cálculo es trivial.
- **`data.ts` (716 líneas) y `group-titles.ts` (743)** son deuda de iter-04 y iter-05: lo nuevo va en módulos propios.
- **Cabecera justa a 375 px** (deuda de iter-05): la liga va como texto corto. Si no cabe, se resuelve en la tarea, sin quitar los badges de títulos.
- **El "cambio base" no es la tabla de puntos**: con un rating distinto de 1500, la pendiente lo mueve (+23,4 en vez de +25). El desglose muestra el valor real, no la tabla.
- **Redondeo**: el rating mostrado no siempre es la suma de los cambios redondeados. Se acepta: manda el valor con decimales.
- **El cambio del periodo sigue al bloque Hoy / Semana**: si hoy no ha jugado nadie, se muestra el del último día jugado con su etiqueta. Resulta de aplicar P8 con la misma regla que se ratificó para los badges en iter-05. Ratificado por el supervisor al aprobar la spec (2026-10-02).
- **Constantes revisables**: puntos, multiplicadores y cortes pueden cambiar tras la sesión conjunta (F18); por eso van en `config.ts`.

## Estrategia de implementacion <!-- SHOULD -->

Orden por dependencias:
1. **Dominio del ELO** (T01), con tests. No depende de la UI.
2. **Carga** (T02): la vista del grupo y un loader del ELO de un perfil.
3. **UI en paralelo**: Clasificación (T03), cabecera (T04), historial (T05) y gráfica (T06).
4. **Verificación** (T07).

`.dev/tasks/index.json` es tracking operativo local derivado de esta spec y del issue. Cada cláusula de cada AC se asigna a un criterio de task (lección de iter-04). Los prompts de task citan la regla de negocio de esta spec, no atajos técnicos sin comprobar. La implementación se delega en subagentes con el modelo y el nivel de razonamiento que pida cada task (no siempre Sonnet); el orquestador coordina y revisa.

**Recorte si hiciera falta** (plan de contingencia, no se espera usar): la gráfica (T06). No se recortan el cálculo, la Clasificación, la cabecera ni el historial.
