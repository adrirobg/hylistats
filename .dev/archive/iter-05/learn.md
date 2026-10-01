# Learn: hylistats — iter-05 capa de grupo
**Fecha**: 2026-10-01
**Consume**: `spec.md` (AC1–AC12, issue #9), `tasks/` (T01–T10 en `done`), `verify-report.md` (PASS, gate manual AC12), commits `59c558d`…`f1b9a36`
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

iter-05 entrega la capa de grupo. Incluye:
- grupo fijo en BD, editable en `/admin`;
- `/grupo` y la pestaña Grupo con Hoy / Semana, los 7 títulos explicados, Equipos, Temporada y Títulos;
- badges en el perfil;
- frescura del grupo.

Verify da PASS en AC1–AC11, con un cruce SQL independiente sin ninguna diferencia. AC12 (sesión conjunta, F18) queda como gate de merge.

## Que funciono <!-- MUST -->

- **Dominio puro primero (T02, T03) y una sola carga (T04)**:
  - `/grupo`, la pestaña Grupo y los badges salen de la misma función (`groupPeriods` + `loadMemberRows`).
  - La tabla de Temporada sale de `computeSummary`, `computeRecords` y `wonChampionsCount`.
  - AC9 (12/12 textos idénticos) y AC6 (20/20 badges) cuadraron sin correcciones.
- **Prompts de task que citan la regla de negocio** (lección de iter-04) y **subagentes en paralelo cuando los ficheros no se pisan**:
  - Se lanzaron en paralelo T01‖T02, T06‖T08 y el arreglo de AC8‖T07.
  - Cada worker recibió qué ficheros tocaba el otro y quién ejecutaba el build.
- **Elegir el modelo por task**:
  - Opus para la lógica densa (T02: semanas con cambio de hora, empates y competencia) y para el verificador independiente (AC11).
  - Sonnet para el resto.
  - T02 y AC11 salieron sin una sola diferencia.
- **Revisar cada diff contra la spec antes de hacer commit**. Sacó a la luz:
  - el campeón con nombre interno en Temporada (AC8), corregido en `f59ba71` antes de Verify;
  - decisiones de presentación (cabecera sticky, columna de daño medio en el ranking), que se ratificaron o se llevaron al supervisor sin cambiar el alcance.
- **Evidencia por AC escrita al obtenerla** (notas en el scratchpad, propuesta de dogfood #17). Hizo barato escribir el verify-report y resistió el corte de un subagente por límite de uso.
- **Aislar un comportamiento extraño antes de tocar código**. El ciclo de peticiones cada 2 s se comprobó:
  - en `main` (worktree en :3002);
  - con `next start` (:3003);
  - y con `visibilitychange`.

  Resultó ser un artefacto del panel de navegador integrado, que conmuta la visibilidad, y no un bug de iter-05. No se tocó nada.
- **`puuid` sustituido por `memberKey(profileId)`** en la capa de carga: no sale del servidor y los tipos del dominio no se duplicaron.

## Que ajustar <!-- MUST -->

- **Los workers que verifican en el navegador comparten el dev server y `.next`**. Un `next build` de un worker con el dev server arrancado obligó a reiniciarlo. Los workers en paralelo no pueden ejecutar los dos el build. Se resolvió prompt a prompt; debería venir del template de task (ver dogfood #23).
- **Comparar HTML de páginas con streaming** (`loading.tsx`) dio falsos negativos: un `fetch` o una espera fija de 2,5 s truncan el contenido. Hay que esperar a que el DOM se estabilice o leer el payload RSC.
- **El navegador integrado no es un entorno fiel para lo que depende de la visibilidad**:
  - Pierde el foco o el hover al hacer capturas: el popup abierto no sale en la imagen.
  - Alterna `visibilityState`.
  - Dos clics de "Actualizar grupo" no llegaron al servidor. Hay que confirmarlo en una pestaña real (F18).
- **Un subagente terminó con error de cuota tras acabar su trabajo** (T03). Se resolvió verificando el árbol y los checks en vez de relanzar. Lo apunto como práctica: ante un fallo de infraestructura, primero `git status` y checks.
- **`data.ts` sigue creciendo** (679 → 716 líneas), aunque sea pegamento. Con `tab=grupo` las filas del grupo se cargan dos veces.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F19: grupo fijo en BD, editable en `/admin`; un perfil se añade si existe en `profiles` | Ratificada | AC1 en el navegador; el error del Riot ID no registrado se entiende |
| F20: semana del lunes 06:00 al lunes 06:00 en Madrid, construida sobre `gameDay` | Ratificada | Tests con cambio de hora y cruce SQL 0 diferencias. Retroceder por días de juego hereda la corrección de `gameDay` |
| F21: regla literal de los títulos, sin exigir un 1º para "roto" | Ratificada, revisable | Con datos reales se otorgó "Equipo roto del día" con 0 primeros. Lo decide el supervisor tras F18 (constantes en `config.ts`) |
| Puesto medio con 2 decimales en el "por qué" (la spec ponía "4,6" como ejemplo) | Ratificada | AC5 pide que el valor coincida con la tabla, y la app usa 2 decimales |
| Columna "Daño medio" en el ranking y tabla "Dúos y tríos del periodo" en el bloque Hoy / Semana | Ratificada | AC5: sin ellas, los títulos de daño, dúo y trío no tendrían fila con su valor |
| Badges vigentes con el periodo vacío (Riesgos de la spec) | Ratificada | El supervisor lo ratificó al aprobar la spec. AC6 cuadra con la vista |
| Un 0 no lidera en las columnas de "más alto" de Temporada | Ratificada | Si no, todos los miembros con 0 serían líderes de una columna sin datos |

## Deuda y gaps <!-- MAY -->

- **Gate manual AC12** (supervisor, sesión conjunta F18), junto con AC11 de #7, AC5 de #3 y AC8 de #2. Incluye confirmar "Actualizar grupo" en una pestaña real (hallazgo diferido del verify-report).
- **Presentación, la decide el supervisor tras F18**:
  - zapas14: "% a la primera" sobre 28 verificados, al lado de "Campeones ganados" 29 (oficial);
  - cabecera sticky del perfil de unos 345 px a 375 px con 7 badges (hilo "Pulido y mejora de la UI base").
- **Deuda técnica** (orquestador):
  - `group-freshness.tsx` duplica unas 40 líneas de la plomería de `auto-refresh.tsx`;
  - `group-titles.ts` tiene 743 líneas: periodos, ranking, equipos y títulos;
  - `data.ts` tiene 716 líneas y carga doble en `tab=grupo`.
- **Comportamiento previo, no de iter-05**: cada `visibilitychange` a visible dispara comprobación y `router.refresh()`. En un navegador real es razonable; en el panel integrado genera un ciclo cada 2 s.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Sesión conjunta de Arena (F18): AC12 de #9 + AC11 de #7 + AC5 de #3 + AC8 de #2, incluido "Actualizar grupo" en una pestaña real | think.md (hilos AC pendientes) / supervisor | alta |
| Revisar mínimos y reglas de F21 tras la sesión ("roto" con 0 primeros, mínimos 3/5/3) | think.md → spec de la iteración siguiente | media |
| Decidir la presentación de "% a la primera" frente a "Campeones ganados" y la cabecera sticky con muchos badges | think.md (hilo de pulido de UI) | media |
| Extraer la plomería común de `AutoRefresh` y `GroupFreshness`; dividir `group-titles.ts` si F21 cambia; adelgazar `data.ts` | think.md (deuda técnica) | baja |
| Registrar en el template de tasks quién ejecuta el build y cómo se verifica en el navegador cuando hay workers en paralelo | dogfood-log #23 → dev-system | media |

## Hallazgos para dev-system <!-- MAY -->

- Dogfood #23 (nuevo): el template de task asume ejecución en serie en un único árbol ("Al terminar: build en verde"). Con workers en paralelo el orquestador tuvo que reescribir esa regla en cada prompt.
- La propuesta de #17 (evidencia por AC escrita al obtenerla) funcionó en uso real: notas por AC en el scratchpad desde T01 y verify-report montado al final sin repetir pruebas.
- Siguen sin propagarse arreglos cosechados (#6): el template del verify-report de este repo aún no tiene el veredicto `PASS (gate manual pendiente)` de #11, y `dev-task` no es invocable por el modelo (#12). Se reutilizó el helper propio de iter-04.

## Candidatos a vault <!-- MAY -->

- 2026-10-01 — Un panel de navegador embebido que alterna `visibilityState` convierte el polling guiado por visibilidad en un ciclo caliente: hay que aislar el entorno (otra rama, build de producción, escuchar el evento) antes de tocar código — destino: nota-atomica
