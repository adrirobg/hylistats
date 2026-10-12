# Learn: hylistats — iter-12 estabilizar el ELO del grupo
**Fecha**: 2026-10-12
**Consume**: `spec.md` (AC1–AC12), `tasks/index.json` (T01–T04 en done), `verify-report.md` (PASS), grill F28 y §6 de `think.md`
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

El ELO del grupo ya aplica F28: K×0,5, multiplicador por desconocidos más suave, racha de 1º que cruza días y liga con margen de ±10. La racha se ve en el historial, en la pila de avisos y con 🔥 en la Clasificación.

Con datos reales de PRO, la liga cambia una vez al día (mediana 1,0, media 1,11) en los días de 10 o más partidas, frente a 5,5 de media antes. El recálculo independiente coincide en las 3203 partidas. Verify da PASS y la aceptación del grupo (AC12) queda abierta.

## Que funciono <!-- MUST -->

- **El grill sobre un research con números**: las 9 preguntas se cerraron en una sesión porque cada una tenía la tabla simulada delante. La única recomendación que el supervisor rechazó (P5, la racha cortada por el día) era de criterio, no de datos.
- **La validación independiente partida a partida**: `elo.py::run_f28` frente a `computeGroupElo` con `compare_app.ts` (tsx) sobre el mismo `rows.json`. Comparar solo el estado final no probaba nada sobre la racha, porque todas las rachas en curso eran 0. Al comparar las 3203 partidas (cambio y racha) salieron 0 diferencias y 68 partidas con bonificación.
- **Las inferencias explícitas en la spec (I1–I8)**: el supervisor las aprobó de una vez y los workers no tuvieron que decidir nada fuera del contrato.
- **Un worker reanudado con su contexto**: un límite de uso cortó a mitad a T01 (Opus). Al reanudarlo con su transcript terminó sin rehacer nada, y el árbol quedó coherente.
- **La pila flotante de iter-11 (D8–D12)**: el aviso de racha cupo como un aviso más, con prioridad y cierre persistente, sin componente nuevo.

## Que ajustar <!-- MUST -->

- **AC9 mezcló dos estadísticos**: la línea base del research (5,5) es una media, pero el criterio de la spec pedía la mediana ≤ 1,5. Se cumple con las dos (1,0 / 1,11), pero la próxima vez el criterio debe usar el mismo estadístico que la línea base.
- **El handover llegó desfasado**: decía que `think.md` y el research estaban sin commit, cuando ya estaban en `d98a041`. No costó nada, pero un handover se escribe después del último commit, o lo menciona.
- **La BD local no tenía todos los casos visuales**: no había una racha de 1 ni una racha con desconocidos a la vez. Esos casos quedaron cubiertos solo por tests. Si se quiere ver todo en pantalla, hace falta una fixture de partidas en la BD de test.
- **La inflación (+30,9) quedó por encima de la previsión (+24)**: el research la estimó con datos hasta el 2026-10-06. No era el objetivo, pero conviene vigilarla.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F24: constantes del ELO (+25…−19, pendiente 44, ×1,15/×0,75 y ×1,30/×0,50) | Corregida por F28 | Ruido de ±38 frente a ligas de 30 y una inflación de +35 por los desconocidos |
| F25: ligas por el rating redondeado, sin histéresis | Corregida por F28 (margen ±10) | 5,5 cambios de liga al día; los cortes no cambian |
| F28: racha que cruza días (decisión del supervisor contra la recomendación del agente) | Ratificada | En los datos solo afecta a 4 de 48 rachas y el criterio "ganar seguido es lo difícil" es más fácil de explicar |
| F24, P9: se recalcula al leer y no se guarda nada | Ratificada | El cambio de reglas no necesitó migración y el recálculo de la temporada fue gratis (F28, P8) |

## Deuda y gaps <!-- MAY -->

- Inflación de +30,9 frente a +24 previstos. Diferido de Verify; dueño: el supervisor; destino: revisar las constantes con el uso (hilo "Mejoras del ELO tras usarlo").
- AC12: aceptación del grupo en sesiones reales tras la release (F18).
- Sin fixture visual para la racha de 1 ni para la racha con desconocidos: solo tests.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| AC12: el grupo valida en sus sesiones que la liga ya no va y viene y que entiende la racha. Contar el recálculo en el grupo al publicar la release | Supervisor, tras la release | alta |
| Revisar la inflación y las constantes tras una o dos semanas de uso (`check_f28.py` reproduce las métricas) | think.md, hilo "Mejoras del ELO tras usarlo" | media |
| Que los criterios numéricos usen el mismo estadístico que la línea base del research | Práctica del grill y de la spec (`dogfood-log`) | baja |

## Hallazgos para dev-system <!-- MAY -->

- **#36 del `dogfood-log`**: un worker cortado por un límite de uso deja cambios a medias en el árbol sin informe. Reanudar con su transcript funcionó, pero el contrato de task no pide ir dejando checkpoints.
- **Se repite #14**: abrir la iteración (cabecera, spec y `index.json`) sigue siendo manual.

## Candidatos a vault <!-- MAY -->

- 2026-10-12 — En un ranking entre jugadores muy igualados, la estabilidad de la liga se consigue antes con histéresis (un margen al cambiar de liga) que con anchos de liga mayores o ratings más lentos — destino: nota-atomica
