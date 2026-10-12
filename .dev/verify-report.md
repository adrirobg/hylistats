# Verify Report: hylistats — iter-12 estabilizar el ELO del grupo
**Fecha**: 2026-10-12
**Consume**: commits `069efbb` (T01), `021b2a1` (T02), `4c941f6` y `968a14e` (T03) en `feat/29-elo-estabilidad`; AC1–AC12 de `spec.md`
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

- AC1 cálculo · AC2 racha · AC3 liga con margen · AC4 historial · AC5 aviso de racha · AC6 🔥 en la Clasificación y en El grupo hoy · AC7 nota de la regla · AC8 recálculo independiente · AC9 estabilidad · AC10 calidad · AC11 verificación visual.
- AC12 (aceptación del grupo tras la release) queda abierta para el supervisor (F18).

## Entorno <!-- SHOULD -->

- macOS (Darwin 25.5), Node 26 local (CI y Render: 24), Next.js 16 en dev con `WORKER_ENABLED=false` (`hylistats-dev-noworker`, puerto 3000).
- BD local de Docker (5433) con los datos del grupo; panel de navegador a 1280×900 y 375×812.
- Datos reales: `rows.json` de PRO (Supabase, solo lectura, consulta de `research/elo-estabilidad.md`), 3203 filas hasta el 2026-10-12. No se commitea.

## Checks ejecutados <!-- MUST -->

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

```bash
# AC8 y AC9 (desde .dev/research/elo-estabilidad/, con ROWS apuntando al rows.json de PRO)
ROWS=rows.json python3 check_f28.py
ROWS=rows.json npx tsx compare_app.ts > app.json   # computeGroupElo de la app, partida a partida
```

Navegador (orquestador):
- `/euw/Krill1nt-EUW`, que tiene una racha en curso de 3 en la BD local, a 1280 px: cabecera, El grupo hoy y la pila.
- `?tab=partidas`: filas con racha y el desglose de `?partida=EUW1_8001514663`.
- `?tab=grupo`: Clasificación y nota.
- El mismo perfil a 375 px: «Este soy yo» → aviso en 2ª persona → cerrar → recargar.
- `/euw/elruffles-6485` (no miembro) a 375 px.
- `scrollWidth` frente a `innerWidth`.
- `localStorage` restaurado al terminar.

## Resultados observados <!-- MUST -->

- **AC10**: Biome sin avisos (252 archivos), tipos OK, **76 archivos y 1591 tests** en verde (eran 1498 en iter-11) y `next build` OK.
- **AC1–AC3 y AC7**: cubiertos por tests en `elo.test.ts` y `clasificacion-model.test.ts` (T01). La nota en pantalla:
  - Tabla: "1º +12,5 · 2º +6 · 3º +1 · 4º −2,5 · 5º −7,5 · 6º −9,5".
  - Racha: "2 primeros seguidos: ×1,5; 3 o más: ×2 … sigue aunque cambie el día".
  - Margen: "de Plata se pasa a Oro con 1520 y se vuelve con 1500".
  - Las cifras salen de `config.ts`.
- **AC8**:
  - Los 6 miembros coinciden en rating (±0,01), liga y racha en curso.
  - **Partida a partida, 3203 cambios y rachas comparados: 0 diferencias.**
  - Racha máxima de 4; 68 partidas con bonificación.
- **AC9**: en los 94 días-jugador con 10 o más partidas desde el 2026-09-01, los cambios de liga dentro del día tienen **mediana 1,0 y media 1,11**. Con las reglas de antes, la media era 5,5.
  - Diferencia entre el rating más alto y el más bajo del día (mediana): 34 (antes, 65).
  - Inflación: +30,9.
- **AC4**: en el historial de Krill1nt aparecen `Yasuo +22 🔥×2` y `Swain +21 🔥×1,5`, y las partidas sin racha se ven como antes. El desglose de la partida de Yasuo cuadra con la regla:
  - Cambio base +10,9.
  - Multiplicador ×1.
  - Racha "3 primeros seguidos · ×2".
  - Cambio final +21,7.
  - Rating 1574.
- **AC5**: a 1280 px, el aviso "Racha" sale en la pila con el texto "Krill1nt lleva 3 primeros seguidos: su próximo 1º vale ×2", por debajo del aviso de la key caducada (prioridad I4).
  - A 375 px, tras «Este soy yo», sale "Llevas 3 primeros seguidos: tu próximo 1º vale ×2", plegado en "+2 avisos".
  - Al cerrarlo con ✕ se guarda `hylistats:aviso-cerrado:racha:krill1nt#euw` y, al recargar, no vuelve.
  - En el no miembro no sale.
- **AC6**: `🔥3` con `title` "3 primeros seguidos" junto a Krill1nt en El grupo hoy y en la Clasificación de `?tab=grupo`. El resto de miembros (racha 0) no lo lleva.
- **AC3 en la UI**: Krill1nt tiene 1574 y sigue en **Platino**. Diamante empieza en 1570, pero con el margen hay que llegar a 1580 para subir.
- **AC11**: sin scroll horizontal a 1280 px (1265/1280) ni a 375 px (375/375). El 🔥3 cabe junto al nombre a 375 px. La consola no muestra errores de la app (el único error viene del script de inspección inyectado).

## Juicio de coherencia y sentido <!-- MUST -->

- **Coherencia con el canon**: la implementación sigue F28 y §6 de `think.md` y no toca nada que §6 deje fuera:
  - Los cortes de liga no cambian.
  - No hay contrapartida para las rachas de 6º.
  - No hay aviso de recálculo.
  - `eloLeague` sin margen se queda para las bandas de la gráfica (I2).
- **Sentido en el dominio**:
  - Con datos reales, la liga cambia de media una vez al día de juego largo.
  - La racha es rara (68 de 3203 partidas) y, cuando llega, devuelve un 1º "entero" (+21,7), como se decidió en el grill.
  - Ejemplo del margen con datos reales: Hylimichi queda en Platino con 1537,5, porque no ha caído a 1530. Con `eloLeague` estaría en Oro.
- **Inflación**: es de +30,9, por encima de los +24 que preveía el research, que tenía datos hasta el 2026-10-06. No afecta a la estabilidad, que es lo que medía el objetivo. Queda anotado para revisar las constantes con el uso (F28: "revisables con uso").

## Revision de calidad del codigo <!-- SHOULD -->

Pasada sobre el diff (18 archivos de `src/`). Sin smells relevantes:
- La lógica de presentación está en funciones puras con tests, y los componentes solo pintan.
- `formatMultiplier` se exporta desde `matches-view.ts` para no duplicar el formato en `floating-notices.ts`.
- `streakBadge` se reutiliza en las dos tablas.
- `eloLeagueStep` es pura e itera sobre `ELO_LEAGUES` sin escribir cifras a mano.
- El cableado nuevo es mínimo: `ProfileElo.streak` y la prop `streak` de `Vitrina`. `data.ts` no crece.

## Replay / validacion independiente <!-- SHOULD -->

Aplica, porque el cambio es de reglas de cálculo sobre datos reales.
- **Actor**: el orquestador.
- **Fuente canónica**: F28 en `think.md`.
- **Cálculo independiente**: `elo.py::run_f28` en Python, que no reutiliza el TypeScript.
- **Datos**: PRO en solo lectura.
- **Resultado**: 3203 partidas sin diferencias (ver AC8).

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| Inflación de +30,9 frente a los +24 previstos | diferido | Supervisor | Revisar las constantes con el uso (F28); hilo "Mejoras del ELO tras usarlo" |
| La racha de 1 y la combinación de desconocidos y racha no se han visto en pantalla (la BD local no tiene esos casos) | resuelto | N/A | Cubiertas por los tests de T02 (`streakNoticeText` con 1 y línea "Racha" con desconocidos) |

## Conclusion <!-- MUST -->

**PASS**. AC1–AC11 se cumplen con evidencia. AC12 (aceptación del grupo tras la release) queda abierta y la PR se puede mergear con ella abierta (F18).
