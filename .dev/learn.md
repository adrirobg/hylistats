# Learn: hylistats — iter-11 cabecera del perfil: vitrina
**Fecha**: 2026-10-03
**Consume**: todos los artefactos de la iteracion
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

La cabecera del perfil pasa a ser la vitrina C2 (splash del último 1º, trofeos de Liga y Dios de Arena, títulos agrupados con tono y escalera del grupo, barra fija reducida). Se llegó en tres rondas de maquetas con el supervisor y se implementó en tres tasks delegadas; Verify PASS con AC13 abierta.

## Que funciono <!-- MUST -->

- **Decidir sobre maquetas navegables con datos reales** (artifact con selector de perfil, tono y ancho): el supervisor descartó y combinó propuestas en dos vueltas y pidió ver el splash antes de decidir; la prueba con splash reales evitó elegirlo a ciegas.
- **Mirar el peor caso real** (Hylimichi con 8 títulos + Deidad en producción) cambió el diseño: agrupar día y semana en una fila acota el bloque a 7 filas.
- **T01 ∥ T02 sin archivos compartidos** y T03 después: sin choques en el árbol; las notas de cada worker (`server-only` del vista-modelo, contenedor del trofeo) pasaron a T03 como avisos y evitaron dos fallos de build/maquetación.
- **Extraer antes de borrar**: la lógica de la barra Arena God pasó a `arena-god-notice.tsx` en T02, así T03 pudo borrar la barra sin perder comportamiento.

## Que ajustar <!-- MUST -->

- **El «por qué» con prefijo de periodo** se diseñó en la maqueta con textos inventados ("Hoy: 4,80…"); con los textos reales del dominio ("… del día: …") duplicaba el periodo. Al pasar de maqueta a spec, comprobar los textos reales del dominio que se van a pintar.
- **I6 (barra fija) se especificó a nivel de mecanismo** ("IntersectionObserver sobre el banner") y el worker tuvo que desviarse por un efecto visual que la spec no previó. En specs de UI, describir el resultado esperado ("la barra se compacta cuando se va el nombre grande") y dejar el mecanismo al worker.
- **Verificación en el panel del navegador**: el ancho emulado se pierde al cambiar el ancho del panel y `preview_start` lee el `launch.json` del checkout principal, no el del worktree (se añadió una config con `cd` al worktree).

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| C2 con honor turquesa, splash del último 1º y tratamiento oscuro (supervisor) | Ratificada | Implementada tal cual; AC13 la valida en uso |
| I6: barra fija al salir el banner | Corregida | Se compacta al salir la fila de identidad, para no dejar botones transparentes sobre los trofeos |
| «Por qué» con prefijo "Hoy:/Semana:" | Corregida | El texto del dominio ya trae el periodo |
| I1–I5, I7–I10 | Ratificadas | Aplicadas sin incidencias |

## Deuda y gaps <!-- MAY -->

- `vitrina.tsx` con 561 líneas (barra fija, banner, identidad, avisos, toast): candidata a partir en el hilo de pulido de la UI.
- El splash queda muy apagado con el tratamiento oscuro + la sombra añadida por contraste; revisar con el supervisor tras usarlo.
- Reintentar del trofeo sin probar en navegador (ningún perfil en error).
- PR #26 (títulos) abierta en paralelo: cuando se mergee, integrar `develop` y revisar que las filas de títulos usen los textos nuevos.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| AC13: aceptación del grupo tras la release | think.md (Hilos abiertos) | alta |
| ~~Integrar `develop` tras el merge de #26 y revisar títulos~~ (hecho el 2026-10-12, `49559b6`) | rama / PR de iter-11 | alta |
| Revisar intensidad del velo del splash con el supervisor | think.md (hilo de pulido de la UI) | media |
| Partir `vitrina.tsx` | think.md (hilo de pulido de la UI) | baja |

## Revisión v4/v5 (2026-10-12) <!-- SHOULD -->

**Qué funcionó**
- **Captura anotada del supervisor sobre la app real** → maqueta con la **línea del pliegue** y la altura medida de las pestañas: convirtió "ocupa mucho" en un número (858 → 662 px) y en un criterio de aceptación.
- **Maquetas a tamaño real junto a su vecino** (Dios de Arena al lado de El grupo hoy): enseñó el hueco que una maqueta aislada no enseñaba.
- **Criterio explícito en vez de lista de casos** ("nada que aparece solo ocupa espacio; lo que abre el usuario, sí"): resolvió de una vez avisos, toasts y la explicación del trofeo.

**Qué ajustar**
- **La maqueta v4 desbordaba en anchos intermedios** (el supervisor lo vio a ~700 px): probar las maquetas también en el rango 640–1000, no solo escritorio y móvil.
- **«Hoy» con dos semánticas** (estricto en El grupo hoy; último día con partidas en títulos y Clasificación): al añadir un dato "de hoy" nuevo, revisar cómo definen "hoy" los vecinos que se pintan al lado.
- **El memo de la `GroupView` en `globalThis` sobrevive al HMR**: tras cambiar la forma de `GroupView` el perfil falla en dev hasta reiniciar el servidor. Reiniciar el servidor de verificación tras cambios de dominio.
- **Layout a 0 en pestañas del panel en segundo plano**: medir solo con la pestaña al frente (o tras una captura).
- **La revisión creció por rondas** (v4 → v5 → v5b, 6 tasks más) dentro de la misma iteración y PR: aceptable con el supervisor presente, pero la PR deja de ser pequeña.

**Decisiones**

| Decision | Accion | Razon |
|----------|--------|-------|
| Propuesta B (El grupo hoy, ordenada por rating) | Ratificada (supervisor) | Lo que más se mira al entrar en sesión |
| Trofeo Liga y Escalera | Corregidas | La liga sube a la identidad; la escalera se fusiona en El grupo hoy |
| Dios de Arena con anillo | Corregida | Barra con hitos + últimos conquistados (variante 1, supervisor) |
| Avisos en banda / en el flujo | Corregida | Pila flotante global; error de actualización oculto con la key caducada |

**Deuda nueva**: título del aviso «Dios de Arena» con meta «Deidad de Arena»; altura en móvil (1214 px, aceptada); `vitrina.tsx` 597 líneas.

## Candidatos a vault <!-- MAY -->

(sin candidatos)
