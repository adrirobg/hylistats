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
