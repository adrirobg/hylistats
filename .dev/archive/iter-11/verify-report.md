# Verify Report: hylistats — iter-11 cabecera del perfil: vitrina
**Fecha**: 2026-10-03
**Consume**: commits `1c9f7d6` (T01), `be70ecb` (T02), `4b2ad31` (T03) y el ajuste de T04 en `feat/27-cabecera-vitrina`; AC1–AC13 de `spec.md`
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

- AC1 banner (1280 y 375 px) · AC2 splash · AC3 trofeo Liga · AC4 trofeo Dios de Arena · AC5 títulos · AC6 escalera · AC7 Deidad · AC8 barra fija · AC9 no miembros · AC10 carga · AC11 calidad · AC12 verificación visual.
- AC13 (aceptación del grupo tras la release) queda abierta para el supervisor.

## Entorno <!-- SHOULD -->

- macOS (Darwin 25.5), Node 24, Next.js 16 en dev (`WORKER_ENABLED=false next dev -p 3005`, worktree `feat-27`).
- BD local de Docker (puerto 5433) con los datos del grupo; navegador del panel de Claude a 1280×900 y 375×812.

## Checks ejecutados <!-- MUST -->

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Navegador (orquestador, T04): `/euw/Hylimichi-EUW` a 1280 y 375 px (con scroll hasta la escalera), `/euw/elruffles-6485` (no miembro) a 375 px; `document.querySelectorAll('#refresh-profile').length`; `scrollWidth` frente a `innerWidth`; consola.

Navegador (worker, T03): Hylimichi, BEJITO MAMBO, zapas14, Krill1nt y TheCIutch a 1280, 720 y 375 px; miembro sin títulos simulado (`rows={[]}`, revertido); splash roto simulado por JS; "Sincronizar" en elruffles.

## Resultados observados <!-- MUST -->

- **Calidad**: Biome sin avisos (246 archivos), tipos OK, **73 archivos y 1498 tests** en verde, `next build` OK.
- **AC1**: a 1280 px, identidad a la izquierda, frescura + Actualizar + ⋯ arriba a la derecha, trofeos gemelos (204 px de alto), Títulos y Escalera en dos columnas, como la C2. A 375 px todo apilado; `scrollWidth` 375 = `innerWidth` 375 (Hylimichi y elruffles).
- **AC2**: splash de Nocturne (último 1º de Hylimichi en la BD local) con el tratamiento oscuro; Galio en elruffles; con la imagen rota quedan el degradado de la liga y sin velo. El texto se lee en los splashes probados; para Galio (claro) T03 añadió sombra bajo la barra y `text-shadow` en la frescura.
- **AC3**: Hylimichi (BD local): Platino 1544, "2º de 6", hoy +17, semana +116, "a 34 de Krill1nt · a 26 de Diamante"; coincide con su fila de la escalera (Krill1nt 1578).
- **AC4**: anillo 112/173 (65 %), oficial 112, "faltan 61", hitos "Deidad · 60" en oro y "Dios · 173", aviso "Cuadra con el contador oficial". En elruffles: meta 60 ("Deidad de Arena", 2/60, "después, Dios") y aviso de descuadre con "Sincronizar" y "Qué significa". "Sincronizar" pulsó Actualizar (pasó a "Comprobando…" con progreso).
- **AC5**: Hylimichi → 4 filas (Equipo roto, Equipo mental boom, Pareja rota, Pareja mental boom), "2 de honor · 2 de vergüenza", HOY/SEM, compañeros ("con TheCIutch y zapas14"), turquesa y rosa; Pareja mental boom con 3 líneas por empates de dúo. Estado vacío visto en la simulación de T03.
- **AC6**: 6 miembros, empate de posición (4, 4, 6), fila propia destacada, cambio del día en verde/rojo, pie "A 34 de Krill1nt".
- **AC7**: sello de corona en el avatar y chip "Deidad de Arena" (Hylimichi); sin sello en elruffles (2 ganados).
- **AC8**: al hacer scroll a 375 px queda la barra compacta (avatar, nombre, escudo, 1544, Actualizar, ⋯); un solo `#refresh-profile`. Reintentar no se pudo probar: ningún perfil local estaba en error (el componente es el mismo `Notice` de antes).
- **AC9**: elruffles: solo el trofeo de Dios de Arena; sin "Liga del grupo" ni "Escalera" (comprobado en el texto de la página).
- **AC10**: el esqueleto de carga tiene banner, dos tarjetas y el bloque Títulos + Escalera (visto al recargar a 1280 px).
- **Consola**: solo errores del websocket de HMR de un servidor anterior ya parado; ninguno de la app.

## Juicio de coherencia y sentido <!-- MUST -->

- Las decisiones del supervisor (C2, turquesa, splash del último 1º, tratamiento oscuro, barra fija) están todas; las inferencias I1–I5 e I7–I10 se aplican como dice la spec.
- **I6 se aplicó con un matiz** (T03): la barra se compacta cuando sale la fila de identidad, no el banner entero. Tiene sentido: si no, frescura y botones transparentes quedarían encima de los trofeos durante 300–600 px de scroll.
- **El «por qué» repetía el periodo** ("Semana: Más 1º juntos de la semana…"): el `why` del dominio ya lo trae. Corregido en T04 (`titleLineText` sin prefijo; las marcas HOY/SEM ya dicen qué periodos lleva).
- **El splash queda muy apagado**, sobre todo arriba en móvil, con el tratamiento oscuro más la sombra añadida por contraste. Es la opción elegida; se anota para que el supervisor lo vea en uso.
- Los datos de la BD local no son los de producción (Hylimichi en Platino 1544 aquí; Plata 1492 en producción el 2026-10-03): los valores se cruzaron dentro de la misma BD.

## Revision de calidad del codigo <!-- SHOULD -->

- Sin duplicación: la lógica de la barra Arena God se extrajo a `arena-god-notice.tsx` antes de borrar la barra; las reglas de títulos, escalera y liga viven en `vitrina-view.ts` (puro, con tests).
- `data.ts` crece 28 líneas (508 en total): solo el cableado de `profileVitrina`. La `GroupView` no viaja al cliente; Liga, Títulos y Escalera son componentes de servidor.
- **Large class**: `vitrina.tsx` tiene 561 líneas (cliente: barra fija, banner, identidad, avisos, toast); hereda casi todo de `header.tsx` (391). Se deja anotado como deuda.

## Replay / validacion independiente <!-- SHOULD -->

No aplica: la iteración es de presentación sin cálculos nuevos sobre la BD (las cifras salen de `ProfileElo`, la Clasificación y los títulos ya validados en iter-05 e iter-09). Los derivados nuevos (distancias, agrupado) tienen tests unitarios.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| El «por qué» repetía el periodo ("Semana: … de la semana") | resuelto | N/A | `titleLineText(line)` sin prefijo + test; commit de T04 |
| Reintentar sin probar en navegador (ningún perfil en error) | diferido | Supervisor | AC13 en producción; es el mismo `Notice` de antes |
| Splash muy apagado con el tratamiento oscuro + sombra de contraste | diferido | Supervisor | AC13: ver en uso; ajustable en `vitrina.tsx` (velo) |
| `vitrina.tsx` de 561 líneas | diferido | Orquestador | Hilo de pulido de la UI (think.md) |
| Jobs incrementales `pending` en la BD local por las visitas de la comprobación | diferido | N/A | Comportamiento existente; los procesa el próximo worker local |

## Conclusion <!-- MUST -->

**PASS**

AC1–AC12 cumplidos; AC13 (aceptación del grupo) queda abierta para el supervisor tras la release.

---

## Revisión v4/v5 (2026-10-12) <!-- SHOULD -->

**Consume**: commits `2cdcd4f` (T05), `bd71f96` (T06), `734b48d` (T08), `3948eaf` (T09), `dd0750a` (T10) y el merge de `develop` (`49559b6`, PR #26: reglas de títulos y filtro Frío/calor); AC14–AC22 de `spec.md` (revisiones v4, v5 y v5b).

**Checks**: `npm run lint && npm run typecheck && npm test && npm run build` tras el merge → Biome 252 archivos sin avisos, tipos OK, **76 archivos y 1550 tests**, build OK. Servidor reiniciado tras el merge (la vista del grupo memoizada en `globalThis` sobrevive al HMR).

**Navegador** (orquestador, T07; panel de Claude, BD local, hoy 2026-10-12 sin partidas de nadie, key de Riot caducada). Capturas en `.dev/research/cabecera/verify-v4/`:

| Perfil · ancho | Pestañas (`[role=tablist]`) | Scroll horizontal | Observado |
|---|---|---|---|
| Hylimichi · 1440×860 | **662 px** (antes 858) | 0 | Identidad en una línea + línea de liga; El grupo hoy en «—» y atenuado («sin partidas hoy»); Dios de Arena con barra 112/173, Deidad ✓, últimos 5 conquistados; títulos en 2 columnas con chips de compañero; pila: pausa + Arena. `hylimichi-1440.jpg` |
| Hylimichi · 700 | 1181 px | 0 | El grupo hoy y Dios de Arena apilados; la tabla con todas las columnas, sin desborde. `hylimichi-700.jpg` |
| Hylimichi · 375 | **1214 px** (antes 1732) | 0 | Tabla sin rating ni últimas; pila: pausa + «+1 aviso». `hylimichi-375.jpg` |
| Krill1nt · 1440 | — | 0 | Diamante 1578, «1º de 6 · líder por 34»; meta 60 (30/60, final en Deidad); título individual sin chips. `krill1nt-1440.jpg` |
| elruffles · 1440 | 413 px | 0 | No miembro: sin línea de liga, El grupo hoy ni títulos; Dios de Arena a su medida con el rastro «! no cuadra con el oficial (3)»; pila: pausa + Dios de Arena (Sincronizar, Qué significa) + «+1 aviso». `elruffles-1440.jpg` |

Un solo `#refresh-profile` en todos. Consola: solo un error de HMR del servidor anterior (import ya inexistente durante la edición de T10); ninguno con el servidor nuevo. Workers (T06, T08–T10): avisos cerrados sin mover el contenido (medido antes y después a 1440 y 375), cierre persistente de Dios de Arena y Arena tras recargar, «Marcar a mano» y «Sincronizar» desde la pila, «Qué significa» abriendo la explicación en la tarjeta, enlaces de los últimos conquistados al panel de campeón, tabla rellenada a mano sin desborde a 685 y 1060 px.

**Resultados por criterio**:
- **AC14** — 662 ≤ 700 a 1440×860: cumple. 375 px: 1214 > 1000, **no cumple**; el supervisor lo acepta ("No importa, déjalo así", 2026-10-06; móvil apenas se usa).
- **AC15** — orden de Clasificación, enlaces, «—» y atenuado sin partidas hoy (hoy estricto), sin desborde de 380 a 1440: cumple. El cambio de ELO solo se pinta con partidas hoy (la Clasificación usa el último día con partidas).
- **AC16** — línea de liga con liga, rating, hoy/semana, «Nº de N» y distancia/«líder por N»; nada en no miembros: cumple.
- **AC17** — títulos agrupados por compañero con chips enlazados, mismo dúo hoy y semana en una línea, sin recuento: cumple.
- **AC18 / AC22** — todos los avisos y toasts en la pila global; nada empuja; prioridad, plegado «+N», cierre persistente y rastro en la tarjeta: cumple. El toast de /grupo no se vio (botón deshabilitado por la pausa); usa el mismo `show`.
- **AC19** — tests de lo puro (hoy estricto, últimos 5, títulos por compañero, textos cortos, barra, conquistados, semana, prioridad y plegado de la pila, firmas de cierre): cumple.
- **AC20** — capturas a 1440, 700 y 375 de miembro, otro miembro y no miembro: cumple.
- **AC21** — barra con capas y marcas, «+N esta semana» (oculto hoy: 0), últimos 5 enlazados, alto igual a El grupo hoy a 1440: cumple.

**Juicio**:
- Las decisiones del supervisor (B ordenada por rating, «—» si nadie juega, avisos que se cierran, compañeros enlazados, todo flotante, Dios de Arena variante 1) están aplicadas. Diseño del orquestador por delegación: Dios de Arena a su medida en no miembros, error de actualización oculto con la key caducada (engañaría), un aviso por familia en la pila.
- **«Hoy» no es igual en todas partes**: El grupo hoy es estricto; los títulos HOY y el cambio de ELO de la Clasificación caen al último día con partidas. Con nadie jugando hoy se ve la tabla vacía y títulos «de hoy» del 2 oct. El supervisor lo deja así ("si eso lo cambiamos").
- **El aviso flotante dice «Dios de Arena» aunque la meta del perfil sea «Deidad de Arena»** (elruffles, Krill1nt): menor, anotado.

**Calidad del código**: lo nuevo puro vive en módulos propios con tests (`group-today.ts`, `vitrina-view.ts`, `god-bar.ts`, `floating-notices.ts`, `floating-stack.ts`); `data.ts` sin crecer (508). `vitrina.tsx` pasa de 561 a 597 líneas (deuda ya anotada); `floating.tsx` 429.

| Hallazgo | Disposicion | Dueno | Destino / evidencia |
|----------|-------------|-------|---------------------|
| AC14 en móvil: 1214 px > 1000 | diferido (aceptado) | Supervisor | Decisión del 2026-10-06; móvil apenas se usa |
| «Hoy» estricto solo en El grupo hoy | diferido | Supervisor | think.md (hilo de títulos) |
| Título del aviso «Dios de Arena» con meta «Deidad de Arena» | diferido | Orquestador | Pulido de la UI |
| Toast de /grupo y «Reintentar» sin contador oficial no vistos en navegador | diferido | Supervisor | AC13 en producción |
| Memo de la vista del grupo sobrevive al HMR en dev | diferido | Orquestador | Reiniciar el servidor tras cambios en `GroupView`; anotado en learn |

**Conclusión de la revisión**: **PASS** (AC14 en móvil aceptado por el supervisor). AC13 sigue abierta tras la release.
