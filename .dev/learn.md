# Learn: hylistats — iter-09 ELO del grupo
**Fecha**: 2026-10-02
**Consume**: todos los artefactos de la iteracion (`spec.md`, `tasks/` T01–T07, `verify-report.md`, think §4, F24 y F25)
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

El ELO interno del grupo (F24, F25), del grill con el grupo presente a la verificación en un día: dominio puro recalculado al leer, Clasificación en `/grupo`, liga en la cabecera, cambio y desglose en el historial y gráfica de rating. Verify da PASS en AC1–AC7, con un recálculo independiente sin diferencias. AC8 (aceptación del grupo en una sesión real) queda abierto según F18.

## Que funciono <!-- MUST -->

- **Grill con el grupo delante y simulaciones con datos reales.** Cada decisión (escala, multiplicadores, ligas) se tomó viendo cómo quedaría cada uno con su temporada. El grupo pidió cambios con números delante (suavizar el 2º y el 5º, proteger más las pérdidas con desconocidos) y la app da exactamente los valores de la simulación que vieron.
- **Spec precisa (fórmula, tabla y cortes) → dominio sin idas y vueltas.** T01 salió a la primera, con 38 tests, y el recálculo independiente dio 0 diferencias en 6 miembros y 58 partidas-miembro.
- **Modelo por task** (corrección del supervisor): Opus para el núcleo del cálculo y el verificador independiente; Sonnet para el cableado y la UI. Ninguna task falló.
- **Reutilizar la lectura de la capa de grupo.** `loadProfileGroupData` hace una sola lectura para títulos y ELO (antes eran dos consultas para los títulos), y `data.ts` solo crece +4 líneas.
- **Tasks de UI en serie en un único árbol**, porque todas tocan `page.tsx` y `next build` comparte `.next`. Se evitó la fricción de builds que se pisan (dogfood #23).
- **Volcado de los loaders con `NODE_OPTIONS=--conditions=react-server npx tsx`** (aprendido en iter-05): comparar la app con el recálculo independiente con decimales costó minutos.

## Que ajustar <!-- MUST -->

- **La gráfica pasó los tests y el build, pero estaba mal en pantalla.** Los nombres de liga se amontonaban encima de la línea, el eje Y era demasiado ancho y, tras la corrección, el eje de ligas no se pintaba (recharts solo pinta las marcas de un eje con una serie asociada). Los view-models con tests no detectan problemas de layout: en las tasks de gráficas, el orquestador tiene que mirar el navegador antes de dar la task por hecha, no en Verify.
- **Formato inconsistente entre workers.** La Clasificación mostraba el rating como "1526" y el historial como "1.552" (`formatCount`). Se unificó a mano. Las reglas de formato que cruzan tasks (cómo se escribe un rating) deberían ir en la spec o en el contexto común de las tasks desde el principio.
- **Los workers no comprueban en el navegador** (sin servidores, para no pisarse). Todo lo visual cae en el orquestador. Es asumible, pero hay que contarlo en el plan.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F24: ELO contra el campo, por puesto, con pendiente y multiplicadores por desconocidos | Ratificada (pendiente de AC8) | El recálculo independiente cuadra y los valores son los de la simulación del grill. Queda por ver en uso si el grupo entiende el desglose |
| F25: 6 ligas cada 30 puntos, provisional < 10, cuatro piezas de UI | Ratificada | Al cierre del día el grupo ocupa 4 ligas (Platino, Oro, Plata, Bronce); la cabecera cabe a 375 px |
| Recalcular al leer, sin guardar ratings | Ratificada | ~2800 partidas-miembro por temporada; sin impacto observable en la carga |
| El cambio del periodo sigue al bloque Hoy / Semana (inferencia ratificada en la spec) | Ratificada | Con el día actual vacío, la columna muestra "Día 1 oct", coherente con los títulos |
| Delegar siempre en Sonnet (regla global y runbook) | Corregida | El supervisor pidió elegir modelo y razonamiento según la task; CLAUDE.md global y `orquestacion-v1.md` actualizados (dogfood #28) |

## Deuda y gaps <!-- MAY -->

- **AC8 abierto** (gate manual F18): la aceptación del grupo en una sesión real de Arena, junto con AC12 de #9, AC11 de #7, AC5 de #3, AC8 de #2 y AC9 de #13.
- **UI a 375 px** (Hallazgos del verify-report): la tabla de Clasificación se desplaza 19 px por dentro y corta la columna Partidas, y la cabecera "Día 1 oct" ocupa tres líneas. Las fechas del eje X de la gráfica de rating quedan juntas (son las mismas marcas que la curva de campeones).
- **Regla que puede sorprender**: con el rating alto, un 3º puede restar (−1 con ~1540). Es la regla de P4; hay que avisarlo en la sesión y revisarlo con el uso.
- **Apaño de recharts**: una serie invisible en `rating-chart.tsx` para que se pinte el eje de ligas (documentada en un comentario).
- **Cifras de producción**: Verify usó la BD local (dev key, hasta el 01-10). En producción (Personal key, datos más recientes) los números cambian; la regla es la misma.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Sesión conjunta de Arena (F18): AC8 de #18 junto con los gates abiertos (AC12 de #9, AC11 de #7, AC5 de #3, AC8 de #2, AC9 de #13). Avisar de que un 3º con rating alto puede restar, y recoger si el desglose del historial se entiende | think.md (hilo AC12 de #9) | alta |
| Revisar constantes del ELO tras las primeras sesiones (escala, multiplicadores, cortes) y las mejoras del hilo (títulos de ELO, "Clásico", ajuste por compañeros) | think.md (hilo "Mejoras del ELO tras usarlo") | media |
| Compactar la Clasificación a 375 px y reducir las marcas del eje X en estrecho (gráficas de rating y de campeones) | think.md (hilo de pulido de UI) | baja |
| En tasks de gráficas o layout, revisión visual del orquestador antes de cerrar la task; reglas de formato comunes en el contexto de las tasks | `.dev/research/orquestacion-v1.md` | baja |

## Hallazgos para dev-system <!-- MAY -->

- Dogfood #28: el modelo y el razonamiento por task no tienen sitio en el template de task ni en `index.json`.
- Dogfood #29: numeración de iteraciones con grills `no-init` intercalados.
- Se repite #14: la apertura de iteración (cabecera de `think.md`, spec en `draft`, `index.json`) volvió a ser manual.
- Se confirma #23: se ejecutó en serie a propósito para no pisar `.next`. Aun así, un worker ejecutó `next build` con el dev server del orquestador arrancado (sin consecuencias visibles).

## Candidatos a vault <!-- MAY -->

- 2026-10-02 — Un ELO para un modo sin rivales conocidos (FFA por equipos, rivales anónimos) se reduce a un rating contra un "campo" fijo: en la práctica es una media móvil ponderada del puesto, así que mide forma, no nivel — destino: nota-atomica
- 2026-10-02 — En decisiones de diseño con un grupo, simular con sus propios datos antes de cada pregunta convierte opiniones en ajustes concretos ("suavizad el 2º") y evita discusiones abstractas — destino: nota-atomica
