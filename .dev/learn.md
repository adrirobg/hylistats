# Learn: hylistats — iter-01 motor de datos
**Fecha**: 2026-09-29
**Consume**: todos los artefactos de la iteracion
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

La iteración 01 construyó el motor de datos completo (scaffolding, BD, cliente Riot, worker con cola persistente, dominio, `/admin`, `/api/health` y página mínima de perfil; T01–T10). Se verificó contra la API real con un único backfill de 508 partidas: `kill -9` y reanudación sin duplicados, incremental con 1 petición de ids, pausa y rotación de key sin reiniciar y 0 fugas de la key. Veredicto **PASS**. AC4 destapó la **cola 1740**, una segunda cola de Arena fuera de `queue=1750`, que explica exactamente el 70 frente a 75 de `602002`.

## Que funciono <!-- MUST -->

- **Orquestador + subagentes con prompts autocontenidos** (ruta del task file, API existente con firmas, reglas comunes): T07 y T08 (Sonnet) salieron a la primera, sin re-trabajo del orquestador. Solo hizo falta revisar el diff y pasar los cuatro checks (259 → 299 tests).
- **Fixtures reales anonimizadas + `RiotApi` falso**: 299 tests sin API. El E2E real no encontró ningún bug en worker ni cola: AC3, AC5, AC6 y AC7 se comportaron como en los tests.
- **Cola persistente paso a paso en BD** (`sync_jobs.matchIds` + `match_fetch` global): el `kill -9` a mitad repitió 1 sola petición y el advisory lock se liberó solo al caer la conexión.
- **Máquina de estados de la key**: la pausa no gasta peticiones (0 en 25 s) y la reanudación ocurre en el mismo proceso. `POST /api/admin/key` permitió rotar desde el shell con la key y el token leídos sin imprimirlos (`-H @<(printf …)` y cuerpo por stdin); AC8 dio 0 apariciones en build, logs, árbol, historial git y respuestas.
- **El challenge como control y no como fuente de verdad**: el `achievedTime` de `602002` y el umbral de MASTER (60) permitieron localizar la causa de la diferencia con precisión al milisegundo, sin gastar un segundo backfill (sondeo de 89 peticiones).
- **Vigilante en background** para el `kill -9` a una mitad exacta (≥ 254/508), con captura de `/api/health` justo antes: prueba de caída determinista y documentable.

## Que ajustar <!-- MUST -->

- **Premisa de la research incompleta**: I1 dio la 1750 como la única cola Arena relevante tras comprobar solo 1700 y 1710. La 1740 existía y, como la 1750, no figura en `queues.json`. Para colas no documentadas, listar sin filtro de cola y clasificar por `queueId` **antes** de fijar un filtro en la spec.
- **Explicación codificada antes de verificarla**: el texto de la página para la diferencia ("solo ve el historial Match-V5 de esta temporada") salió del task file de T08, escrito en planificación, y resultó falso. No meter en la UI hipótesis sin verificar.
- **Limitador solo en memoria**: tras un reinicio arranca con la ventana vacía mientras Riot aún cuenta la anterior, y provocó un 429 (gestionado, pero evitable).
- **Verificación de UI en cliente desplazada**: al subagente de T08 le denegaron el navegador integrado, así que el buscador, el polling y los estados del botón se vieron por primera vez en T10. En tasks de UI, planificar esa verificación en el propio orquestador.
- **Fricción del entorno (no de dev-system)**: el clasificador de auto mode se quedó sin veredicto unas 15 veces en la sesión y frenó comandos Bash, sobre todo los de SQL inline. Mitigación útil: SQL en fichero del scratchpad y comandos cortos.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| `queue=1750` como único filtro de backfill, incremental y stats (spec) | Pendiente de revisión (supervisor) | Correcta para "Arena tríos", pero deja fuera la 1740 (80 partidas del jugador; 5 campeones con 1º solo ahí), que sí cuenta para `602002` |
| `SEASON_START = 2026-05-12T00:00:00Z` | Ratificada | 1750 ∪ 1740 desde esa fecha da exactamente 75 y reproduce el umbral 60 en el `achievedTime`: `602002` se comporta como un reto por temporada (si arrastrara 2024–2025 sería mayor) |
| `602002` como control, no como fuente de verdad | Ratificada | Detectó un hueco real de cobertura en vez de ocultarlo |
| Todas las llamadas a Riot desde el worker, salvo la validación de `/admin` | Ratificada | AC6: sin llamadas en pausa; la validación usa el mismo limitador |
| Cola en BD con `matchIds` por job y `match_fetch` único global | Ratificada | AC3 (dedupe) y AC7 (reanudación) sin duplicados |
| Refrescar `602002` en cada incremental (+1 petición a `euw1`) | Ratificada | Coste marginal (otra ventana) y contador siempre fresco |
| Postgres en Docker (puerto 5433), BD dev desechable | Ratificada | E2E reproducible (`db:reset -- --yes` conserva `settings`) |

## Deuda y gaps <!-- MAY -->

- **Limitador tras reinicio** (dueño: orquestador; destino: backlog técnico, baja): sembrar la ventana con `X-App-Rate-Limit-Count` de la primera respuesta para evitar el 429 post-reinicio.
- **Texto de diferencia con `602002`** (dueño: orquestador; destino: UI de #2): depende de la decisión sobre la 1740.
- **Calidad** (dueño: orquestador; destino: #2): `formatDate` duplicado en `/admin` y en el perfil; `normalizeRiotId` debería vivir en `src/lib/riot-id.ts` (es puro).
- **UI mínima** (destino: #2): un perfil `not_found` no tiene reintento desde la página; no se avisa si el último job acabó en `error`.
- **`602001`** (jugados, 133 según el fixture del 29-sep) frente a 113 jugados en la 1750: la 1740 aporta campeones jugados, pero no se ha cuadrado. Solo importa si #2/#3 muestran "jugados".
- Tras AC6, la key real queda guardada en `settings` de la BD dev (fuente `db`), como prevé el diseño. La próxima renovación va por `/admin` o `POST /api/admin/key`, no por `.env.local` (la de BD manda).

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Decidir si la cola 1740 entra en backfill, incremental y stats (partidas, 1º, campeones verificados) antes de #2; con evidencia del verify-report (1750 ∪ 1740 = 75) | think.md (hilo nuevo) / issue #2 | alta |
| Ajustar el texto de la diferencia con `602002` según esa decisión | issue #2 (UI) | media |
| Sembrar el limitador con `X-App-Rate-Limit-Count` tras un reinicio | backlog técnico | baja |
| Refactor de `formatDate` y `normalizeRiotId` al rehacer las páginas | issue #2 | baja |
| Ship: PR contra main con `Closes #1`, merge delegado por el supervisor (dogfood #13) y cierre de iter-01 en main | dev-ship (tramos A y C) | alta |

## Hallazgos para dev-system <!-- MAY -->

- El patrón **orquestador + subagentes + task files autocontenidos** (Contexto + Prompt + AC + notas de relevo entre tasks) funcionó en uso real durante 10 tasks. Es candidato a documentarse como "modo orquestador" en dev-system, junto con el patrón "issue = spec aprobada" (dogfood #9).
- Siguen confirmadas en uso real las fricciones #10, #12 y #13: `dev-ship` y `dev-task` sin invocación por modelo (mutación de `index.json` y del mirror con un helper propio) y merge delegado sin modo documentado.
- La tabla de Hallazgos del verify-report (disposición + dueño + destino) resolvió bien un AC que "no cuadra pero queda explicado" (AC4) sin inventar un veredicto intermedio. La fricción #11 (gates manuales) sigue abierta para #2.
- Cosecha de las fricciones abiertas del log (#1–#4, #6–#13) al `think.md` de dev-system, hilo "Dogfood hylistats".

## Candidatos a vault <!-- MAY -->

- 2026-09-29 — Un contador oficial opaco sirve de oráculo de control: cruzar el recuento propio con su `achievedTime` y sus umbrales localiza la fuente de datos que falta (aquí, una cola no documentada) — destino: nota-atomica
