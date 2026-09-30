# Learn: hylistats — iter-04 stats personales y detalles rápidos
**Fecha**: 2026-09-30
**Consume**: todos los artefactos de la iteracion
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

Primer corte tras la v1, con las ideas del grupo:
- pestaña Estadísticas personales: récords, victorias especiales, rachas, días F17, a la primera y campeón con más 1º;
- frío/calor F16 en el álbum y en el panel;
- badge «Deidad de Arena» y meta «Dios de Arena»;
- icono de invocador;
- builds en el menú ⋯;
- logo «Sello 1º».

Verify **PASS**:
- 1110 tests en verde.
- AC4 cruzado con SQL independiente: 90/90 comparaciones y 17/17 marcas.
- AC5: 30/30 récords coinciden con su partida.
- AC7 probado contra Riot.

AC11 (sesión real del grupo) queda como gate manual, junto con AC5 de #3 y AC8 de #2.

## Que funciono <!-- MUST -->

- **Revisar cada diff del subagente contra la spec, y no solo sus checks.** Así salieron cuatro defectos con todos los tests en verde, corregidos antes del commit de cada task:
  - fechas Madrid/UTC distintas entre el récord y su partida (T04);
  - cromos manuales con 🔥/❄️ (T05);
  - ticks de la escala solapados con la meta 173 (T06);
  - la desviación de T02, correcta porque aplicaba la regla de la spec frente al atajo del prompt.
- **Verificar en el navegador con datos reales y no con fixtures.** El solape de la escala solo aparece con un N real (173). El fixture de Thresh daba siempre neutral en frío/calor.
- **Validación independiente de AC4 por otro actor**: un subagente con SQL propio, sin reutilizar el TS de la app y comparando con el HTML servido. Resultado: 90/90 comparaciones, con desempates ejercitados por empates reales en 5 perfiles. Da confianza sin revisar la lógica línea a línea.
- **Comprobar AC5 siguiendo los 30 enlaces reales** (fetch del récord → detalle → fila del jugador). Así apareció el hueco del detalle que ninguna task cubría.
- **`SendMessage` al mismo subagente para las correcciones de revisión** (T05, T06): conserva el contexto y cada corrección cuesta ~1 min en lugar de una task nueva.
- **Adelantar el gate del supervisor (logo)**: las propuestas, con captura a 16/32/64 px, se prepararon en cuanto acabó la implementación, y la elección fue una sola pregunta.
- **Una definición compartida por concepto**: `firstTryMatches`, `championLinks`, `computeHeat` (calculado una vez para álbum y panel) y `arenaGodGoal`. Evita que Resumen, Estadísticas, cromo y panel diverjan.

## Que ajustar <!-- MUST -->

- **Los prompts de task no deben fijar atajos técnicos que contradigan la regla de la spec.** T02 decía `gameStartTimestamp − 6 h`, que falla en los cambios de hora; la spec dice «06:00 a 06:00 hora de Madrid». El worker lo detectó y siguió la spec, pero pudo colarse. En las tasks hay que citar la regla de negocio y dejar la implementación al worker, o comprobar el atajo antes de escribirlo.
- **Una cláusula de AC quedó sin task.** AC5 exige que el detalle de la partida «muestre ese mismo valor», pero T04 no lo recogía y el detalle no enseñaba daño recibido ni racha. Salió en Verify y hubo que añadir un commit de corrección (`77607d9`). Al descomponer la spec, hay que mapear cada cláusula de cada AC a un criterio de task, no solo cada AC.
- **El prompt de T04 inducía la zona horaria equivocada** («fechas con `Intl` Europe/Madrid») sin mirar la convención de `@/lib/format` (UTC en toda la app). Antes de dar instrucciones de formato, hay que revisar las convenciones existentes.
- **Pregunté al supervisor cuándo hacer Learn**, algo que el bucle ya fija (Verify → Learn → Ship). Cuesta una ronda de ida y vuelta y erosiona la autonomía. Al cerrar Verify hay que releer el runbook y encadenar las fases.
- **Visitar perfiles con el servidor dev encola incrementales**, y con el worker activo se ejecutan contra Riot. Fue útil para AC7, pero hay que tenerlo presente para no gastar cuota sin querer (sigue la lección de iter-03).
- **El tooltip del badge usa Popover `openOnHover`**: se abre con hover, clic y Enter, pero no con el foco solo. El subagente afirmó que sí se abría con el foco. Hay que verificar en el navegador las afirmaciones de accesibilidad del informe del worker.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F17: día de juego de 06:00 a 06:00 Europe/Madrid, sin librerías de fechas | Ratificada y precisada | `Intl` con la hora local; la resta sobre el instante queda descartada por los cambios de hora (tests del 29-mar y 25-oct) |
| F16: frío/calor con media ajustada (K = 5), mínimo 5 partidas, umbral 0,4 y solo campeones sin 1º | Ratificada para la prueba del grupo | 1 🔥 y 16 ❄️ en los 6 perfiles. Es coherente, pero hay pocos 🔥: se revisa tras AC11 (constantes en `config.ts`) |
| F16 + marcas manuales: un cromo marcado a mano cuenta como «con 1º» | Añadida (orquestador) | La marca manual es el jugador diciendo que lo ganó. El panel sigue explicando el cálculo sobre partidas verificadas |
| Fechas de partida en UTC en toda la app (`@/lib/format`) | Ratificada | El récord y la partida a la que enlaza deben mostrar el mismo día |
| «Dios de Arena: X / N» se muestra como «Dios de Arena · temporada actual» + «X de N» | Ratificada (orquestador) | Misma información en el formato existente de la barra. Se cambia en una línea si el supervisor lo prefiere literal |
| El badge cuenta verificados u oficial, nunca las marcas manuales | Ratificada | Las marcas viven en el navegador y solo en «mi perfil» |
| Logo: propuesta A «Sello 1º» | Ratificada (supervisor, 2026-09-30) | Es la pieza más reconocible del producto y la más legible a 16 px |

## Deuda y gaps <!-- MAY -->

- **Gates manuales pendientes** (dueño: supervisor; destino: `think.md` §Hilos abiertos): AC11 de #7, AC5 de #3 y AC8 de #2. Los tres se cierran en la misma sesión real de Arena.
- **Casos sin datos reales** (dueño: supervisor; destino: AC11): no hay racha «en curso» ni victoria sin morir en ningún perfil. Solo los cubren los tests unitarios.
- **Tooltip del badge sin apertura por foco** (dueño: supervisor; destino: hilo «Pulido UI»): la condición se anuncia por `aria-describedby`.
- **`data.ts` sigue creciendo: 679 líneas** (dueño: orquestador; destino: backlog técnico, baja). Se suma a la deuda de iter-03 de partir la carga de sync.
- **Test de renombrado que lee `.tsx` sin comentarios** (`arena-god.test.ts`). Es frágil ante refactors (dueño: orquestador; baja).
- **Iconos de Krill1nt y elruffles**: se rellenan en su próximo sync. Comportamiento esperado, sin acción.
- **Dev key**: renovada a las 15:07 UTC del 2026-09-30; caduca el 2026-10-01 hacia las 15:07 UTC. Para AC11 hace falta una key vigente.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Sesión real de Arena con el grupo: AC11 de #7, AC5 de #3 y AC8 de #2; recoger impresiones sobre la cantidad de 🔥/❄️ | Supervisor / think.md §Hilos abiertos | alta |
| `/dev-grill` de iter-05 (capa de grupo, F15): qué es el grupo, comparativas, tríos, rankings y títulos, sobre las métricas de `records.ts` y el `Badge` | think.md (Think de iter-05) | alta |
| Al descomponer la spec en tasks, mapear cada cláusula de cada AC a un criterio de task; en los prompts, citar la regla de negocio y no un atajo técnico sin comprobar | Runbook `research/orquestacion-v1.md` (paso 4) | media |
| Al cerrar Verify, encadenar Learn → Ship sin consultar (memoria `bucle-iteracion-orden-fases`) | Runbook `research/orquestacion-v1.md` (pasos 6–9) | media |
| Revisar las constantes F16 si el grupo echa en falta 🔥 | `src/lib/config.ts` tras AC11 | baja |
| Partir la carga de sync de `data.ts` | Backlog técnico | baja |

## Hallazgos para dev-system <!-- MAY -->

- **Bucle reproducido en una cuarta iteración**: 10 tasks, ninguna escalada, 4 correcciones de revisión y 1 corrección en Verify. La revisión del orquestador contra la spec y el navegador es donde se aporta valor; los checks verdes no bastan.
- **Nueva fricción #20** en `dogfood-log.md`: la cobertura de las ACs por las tasks se comprueba por AC entero y no por cláusula, y un hueco llegó hasta Verify.
- **Nueva fricción #21**: el briefing y el handover no dicen qué fase sigue tras Verify PASS, y el orquestador preguntó el orden Learn/Ship al supervisor.
- Siguen confirmadas en uso real:
  - #12: `dev-task` sin invocación por modelo; mutaciones de `index.json` a mano con un helper inline;
  - #14: abrir una iteración sin paso determinista;
  - #17: esta vez la evidencia se escribió en las Evidencias de cada task según se obtenía, y eso alimentó el verify-report sin depender del transcript.
- **Merge delegado (#18)**: esta vez la autorización llegó en un mensaje del supervisor en la propia sesión, que es el patrón que pide #18.

## Candidatos a vault <!-- MAY -->

- 2026-09-30 — Revisar el trabajo delegado contra la especificación y en el entorno real encuentra defectos que los tests del propio implementador no ven, porque los tests codifican su misma interpretación — destino: nota-atomica
- 2026-09-30 — Una validación independiente vale en la medida en que el verificador no reutiliza el razonamiento ni el código del implementador (SQL propio frente a la lógica TS) — destino: nota-atomica
