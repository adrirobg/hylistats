# Verify Report: hylistats — iter-09 ELO del grupo
**Fecha**: 2026-10-02
**Consume**: commits de `feat/18-elo-del-grupo` (T01–T06 y la corrección `da0de81`), AC1–AC8 de `.dev/spec.md` (issue [#18](https://github.com/adrirobg/hylistats/issues/18))
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

Los ocho criterios de `spec.md`, contra la app en local sobre la BD dev (6 miembros de F19; elruffles registrado pero fuera del grupo).

- spec.md AC1: cálculo (tabla por puesto, pendiente, multiplicadores, desconocidos, rivales, orden, temporada y colas, provisional).
- spec.md AC2: cortes de liga y cambio del día y de la semana, con el periodo mostrado.
- spec.md AC3: bloque Clasificación en `/grupo` y la pestaña Grupo, a 375 px y en escritorio.
- spec.md AC4: liga y rating en la cabecera de los miembros; nada en elruffles.
- spec.md AC5: cambio en la fila y desglose en el detalle del historial.
- spec.md AC6: gráfica de rating en Resumen.
- spec.md AC7: recálculo independiente frente a la app (anexo A).
- spec.md AC8: **gate de merge**, aceptación manual del grupo en una sesión real (F18).

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), Node 26.9.0, `next` 16.3.7 (Turbopack), `vitest`, Biome, `recharts`.
- Postgres en Docker (`hylistats-postgres-1`): BD `hylistats` (dev, datos de la dev key hasta el 2026-10-01: 1222 partidas que cuentan, 2784 partidas-miembro) para E2E y AC7; `hylistats_test` para los tests.
- Preview `hylistats-dev-noworker` (`WORKER_ENABLED=false`): la BD no cambia durante la verificación.
- Navegador integrado del desktop app, con el viewport emulado (375×812 y escritorio).

## Checks ejecutados <!-- MUST -->

```bash
# Checks locales (tras cada task y sobre da0de81)
npm run lint && npm run typecheck && npm test && npm run build

# AC7: valores de la app (solo vuelca JSON; no calcula)
NODE_OPTIONS=--conditions=react-server npx tsx --env-file-if-exists=.env.local scripts/_elo-dump.ts 2026-10-02T14:39:15Z
#   (script temporal: loadGroupView(getDb(), now) → standings e historial; retirado tras usarlo)
# AC7: recálculo independiente (Python stdlib + psql, sin leer el TypeScript de la app)
python3 elo-independiente.py   # scratchpad de la sesión → elo-independiente.json
# Comparación: script Python que cruza los dos JSON con tolerancia ±0,01

# AC3–AC6: navegador en /grupo, /euw/BEJITO%20MAMBO-1991 (?tab=resumen, ?tab=partidas&partida=…) y /euw/elruffles-6485
```

## Resultados observados <!-- MUST -->

- **Checks**: lint, typecheck, `npm test` (63 ficheros, 1355 tests) y build en verde sobre `da0de81`.
- **AC1 — PASS.** `src/domain/elo.test.ts` (38 tests) cubre los 6 puestos a 1500 (+25/+12/+2/−5/−15/−19 exactos), la pendiente a 1600, 1525 y 1400, los multiplicadores con 0, 1 y 2 desconocidos y base positiva y negativa, un no miembro como desconocido, miembros rivales, el orden cronológico con el rating previo, el desempate por `matchId` y el provisional con 9 y 10, además de una temporada sintética de 7 partidas calculada aparte. `group-view.test.ts` cubre que no cuentan las partidas anteriores a `seasonStart` ni las de otra cola (`queueId` 420).
- **AC2 — PASS.** Tests de los cortes de liga en sus bordes con el redondeado (1449,4 → Hierro; 1449,5 → Bronce), del día a las 05:59 y 06:00 y de la semana el lunes a las 05:59 y 06:00 en Madrid, y del periodo vacío. En la app, con `now` del 2 de octubre sin partidas, la columna del día muestra "Día 1 oct" (el último día jugado) y la semana es la actual, igual que el bloque Hoy / Semana.
- **AC3 — PASS.** La Clasificación está encima de Hoy / Semana en `/grupo` y en la pestaña Grupo (mismo componente, `GroupViewPanel`):
  | # | Jugador | Liga | Rating | Día 1 oct | Semana | Partidas |
  |---|---|---|---|---|---|---|
  | 1 | BEJITO MAMBO | Platino | 1549 | +49 | −55 | 608 |
  | 2 | Krill1nt | Oro | 1526 | −8 | −63 | 191 |
  | 3 | zapas14 | Oro | 1521 | −15 | −26 | 295 |
  | 4 | Azpekaa | Oro | 1520 | +3 | −69 | 491 |
  | 5 | Hylimichi | Plata | 1501 | +26 | +72 | 933 |
  | 6 | TheCIutch | Bronce | 1453 | −66 | −50 | 266 |

  Coincide con la simulación del grill (P5 y P6). La nota de la regla saca las cifras de `config.ts`. A 375 px la página no tiene scroll horizontal (`scrollWidth` = 375); la tabla se desplaza 19 px por dentro (ver Hallazgos).
- **AC4 — PASS.** La cabecera de BEJITO muestra "Platino · 1549" como texto en la línea del nombre, con los tres badges de títulos debajo y sin desbordar a 375 px; el valor es el de su fila. elruffles no muestra liga ni rating.
- **AC5 — PASS.** Cada fila del historial de un miembro lleva su cambio ("Kassadin, 2º, +13 de rating…"). El detalle de `EUW1_8000730540` muestra "Puesto 2º · Cambio base +11,2 · Multiplicador ×1,15 · 1 desconocido · Cambio final +12,8 · Rating tras la partida 1526", igual que el recálculo independiente (11,1558 / ×1,15 / 12,8291 / 1526,1682). elruffles no muestra cambios ni desglose. Tests de `eloRowChange` y `eloBreakdown` en `matches-view.test.ts`.
- **AC6 — PASS (tras corrección).** Box "Rating" en Resumen con la línea de la temporada, eje Y de 1400 a 1650, franjas de liga con fronteras discontinuas y nombres en un eje derecho, y el último punto etiquetado "1549", igual que la cabecera. elruffles no tiene la gráfica. Primera versión: los nombres de liga se amontonaban sobre la línea y el eje iba de 1300 a 1700. Se corrigió el eje y se sacaron los nombres a un segundo eje, que no se pintaba porque recharts solo pinta las marcas de un eje con una serie asociada; lo resolvió el orquestador con una serie invisible (`da0de81`). Tests en `rating-view.test.ts`.
- **AC7 — PASS.** Anexo A: 0 diferencias.
- **AC8 — ABIERTO** (gate manual F18): se valida en la próxima sesión conjunta de Arena.

## Juicio de coherencia y sentido <!-- MUST -->

- El ELO es lo que decidió el grupo en el grill (F24, F25): el ranking se mueve en cada sesión (cambios del día de −66 a +49) y el desglose explica cada partida.
- **Comportamiento que puede sorprender**: con el rating alto, un 3º puede restar (BEJITO, ~1540, Braum 3º: −1, porque +2 − 3 de pendiente). Es la regla aprobada en P4 ("si vas alto ganas menos"), pero conviene avisarlo en la sesión conjunta.
- Los valores de la app son los de la simulación del grill, así que lo que vio el grupo al decidir es lo que verá en la app.
- La BD de verificación es la local (datos de la dev key hasta el 2026-10-01). En producción (Personal key, datos más recientes) las cifras serán algo distintas. La regla es la misma.

## Revision de calidad del codigo <!-- SHOULD -->

- Dominio puro y aislado (`src/domain/elo.ts`, 310 líneas) con las constantes en `config.ts`. La carga reutiliza la lectura de los títulos (`loadProfileGroupData`: una sola lectura para títulos y ELO; desaparece `loadProfileTitles`).
- `data.ts` solo crece en el cableado (+4 líneas). `group-titles.ts` no se toca.
- Tests de view-model para la Clasificación, el historial y la gráfica.
- La serie invisible de `rating-chart.tsx` es un apaño de recharts, documentado en un comentario.

## Replay / validacion independiente <!-- SHOULD -->

Un subagente independiente (Opus), sin acceso al TypeScript de la app, recalculó el ELO desde la BD con SQL y Python siguiendo solo la regla de la spec. Ver anexo A.

## Hallazgos <!-- MAY -->

| Hallazgo | Severidad | Acción |
|---|---|---|
| A 375 px la tabla de Clasificación se desplaza 19 px por dentro y la columna Partidas queda cortada; la cabecera "Día 1 oct" ocupa tres líneas | Baja (sin scroll de página; AC3 cumple) | Deuda de UI: compactar columnas o abreviar la liga |
| A 375 px las fechas del eje X de la gráfica de rating quedan juntas ("1 ago 1 sept 1 oct"); usa las mismas marcas que la curva de campeones | Baja | Deuda de UI: menos marcas en estrecho |
| Un 3º con rating alto puede restar puntos | Informativo (regla de P4) | Avisar en la sesión conjunta; revisar con el uso (F24 es revisable) |
| La cabecera sticky del perfil ocupa ~345 px a 375 px (deuda de iter-05) y tapa media pantalla al bajar a la gráfica | Baja, previa | Sigue en el hilo de pulido de UI |

## Conclusion <!-- MUST -->

**PASS** de AC1–AC7. AC8 queda abierto como gate manual (F18) para la próxima sesión conjunta de Arena. La PR se mergea con ese gate abierto, como dice la spec.

## Anexo A — AC7: recálculo independiente frente a la app

- **Recálculo**: `elo-independiente.py` (Python stdlib + `psql`) con la regla de la spec. `now` = 2026-10-02T14:39:15Z; `SEASON_START` = 2026-05-12T00:00:00Z (`.env.local`). Cuentan 1222 partidas (2784 partidas-miembro), 108 con miembros en equipos rivales. Día mostrado: 2026-10-01 (el actual está vacío); semana mostrada: la actual, del lunes 28-09 a las 06:00 al 05-10 a las 06:00 (Madrid).
- **Valores de la app**: `loadGroupView(getDb(), now)` con el mismo `now`, volcado a JSON sin cálculo propio.
- **Comparación** (±0,01 antes de redondear):
  - Por miembro (6): rating, redondeado, partidas, liga, provisional, posición y cambios del día y de la semana. 0 diferencias.
  - Partidas-miembro (58): una muestra de 40 (0 desconocidos: 21 con base negativa y 3 con positiva; 1: 3 y 7; 2: 3 y 3; 4 partidas con miembros rivales), más las 3 últimas de cada miembro. Se compararon puesto, desconocidos, rating antes, base, multiplicador, delta y rating después. 0 diferencias.
  - Total de partidas-miembro: 2784 en los dos.
- **Lecturas del verificador**: todos los equipos de las colas 1740 y 1750 de la temporada tienen 3 jugadores (así que "3 − miembros" es seguro); no hay `game_start_timestamp` repetidos (el desempate por `matchId` no llegó a usarse); el caso de base = 0 no se da en los datos.
