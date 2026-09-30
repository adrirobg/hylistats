# Spec: hylistats — iter-04 stats personales y detalles rápidos
**Estado**: aprobada (issue [#7](https://github.com/adrirobg/hylistats/issues/7), aprobada por el supervisor, 2026-09-30)
**Consume**: think.md §2 (alcance, criterio de terminado y recorte) y decisiones F15, F16 y F17 como referencia y restricción; F8 (temporada) y F14 (colas 1750 y 1740); `.dev/research/riot-api.md` (Summoner-V4, datos estáticos, `602002`); `.dev/research/design-brief.md` y `design-mock.html` como lenguaje visual (no hay maqueta de la pestaña nueva); iteraciones 01–03 (`.dev/archive/`)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

Primer corte post-v1 con las ideas del grupo: una pestaña de Estadísticas personales, el frío/calor por campeón en el álbum y cuatro detalles rápidos (badge y meta nueva, icono de invocador, builds en el menú ⋯ y logo). Las métricas personales quedan listas para que iter-05 monte encima la capa de grupo (F15).

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Pestaña "Estadísticas"** (`?tab=estadisticas`, entre Resumen y Compañeros). Todo es de la temporada actual, colas 1750 y 1740.
  - Récords de una partida: máximo de daño a campeones (`totalDamageDealtToChampions`), de daño recibido (`totalDamageTaken`), de kills, de racha de kills (`largestKillingSpree`) y de muertes. Cada uno muestra valor, campeón y fecha, y enlaza a su partida (`?tab=partidas&partida=`).
  - Victorias especiales: número de victorias sin morir (1º con 0 muertes), con su lista enlazada, y victoria con más muertes.
  - Rachas: la racha más larga de 1º consecutivos y la racha más larga de partidas sin 1º, en orden cronológico, con fechas de inicio y fin. Si la racha sigue abierta en la última partida, se marca "en curso".
  - Días (F17): mejor y peor día por puesto medio. Un día de juego va de 06:00 a 06:00 en Europe/Madrid, cada partida cuenta en el día en que empezó y hacen falta ≥3 partidas ese día. Se muestra la fecha, el puesto medio y el nº de partidas.
  - Victorias a la primera: nº de campeones ganados en su primera partida y % sobre los campeones ganados. Reutiliza la definición de `firstTry` de `domain/summary.ts`, que ya pinta los chips "Ganados a la primera" del Resumen.
  - Campeón con más 1º: campeón, nº de 1º y nº de partidas; enlaza a su panel.
  - Desempates: en un récord gana la partida más antigua (quien lo marcó primero); en rachas y días, la más reciente.
- **Frío/calor en el álbum** (F16). Solo campeones sin ningún 1º verificado en la temporada, con ≥5 partidas. Media ajustada `(n·media_campeón + 5·media_global) / (n + 5)`, donde la media global usa todas las partidas del jugador. 🔥 "Modo diablo" si la media ajustada es ≥0,4 puestos mejor que la global; ❄️ "Nevera" si es ≥0,4 peor. Se muestra así:
  - Marca en el cromo, con texto accesible.
  - Orden nuevo del álbum, "Frío/calor": 🔥, después neutros y después ❄️. Se añade como orden y no como filtro porque el control segmentado de filtros ya tiene 5 opciones.
  - En el panel de campeón: estado, media del campeón, media ajustada, media global y nº de partidas.
  - Constantes en `config.ts` (mínimo de partidas, peso del ajuste y umbral), para poder ajustarlas tras el uso.
- **Badge "Deidad de Arena" y meta "Dios de Arena"**.
  - Con ≥60 campeones ganados (lista verificada, o contador oficial `602002` si es mayor), el badge aparece junto al nombre en la cabecera. Es un componente reutilizable como primera pieza del sistema de badges de iter-05.
  - Con el badge conseguido, la barra de tres capas cambia de meta a "Dios de Arena: X / N", donde N es el nº de campeones de los datos estáticos de la versión en uso. Las marcas manuales siguen contando solo en "mi perfil", como hoy.
  - Los textos visibles "Arena God" pasan a "Deidad de Arena". La curva del Resumen conserva el umbral de 60 con la etiqueta nueva.
- **Icono de invocador**. Summoner-V4 `by-puuid` (`euw1`) da el `profileIconId`, que se guarda en `profiles`. Se pide en cada sync (backfill e incremental). Si falla, no bloquea el sync y la cabecera usa el placeholder actual. La imagen sale de Data Dragon (`profileicon`) y se muestra en la cabecera.
- **Builds en el menú ⋯**. El menú aparece en todos los cromos. Lleva los mismos enlaces que el panel de campeón (`lib/champion-links.ts`: op.gg, LoLalytics, METAsrc, u.gg y Blitz), que se abren en pestaña nueva. "Marcar / quitar ganado a mano" sigue apareciendo solo donde aplica (`manualActionFor`).
- **Logo**. 3 propuestas en SVG, en `.dev/research/logo/`, cada una vista sobre la cabecera de la app (capturas). El supervisor elige una o pide ajustes. De la elegida salen el logo de la cabecera y el favicon (`src/app/icon.svg`).
- **Datos**. Nuevas columnas `participants.total_damage_taken` y `participants.largest_killing_spree`, con migración de Drizzle. Un script idempotente las rellena desde `rawGz` para las partidas ya guardadas, y la ingesta las rellena desde ahí en adelante. No se vuelve a descargar ninguna partida. Nueva columna `profiles.profile_icon_id`.

**No incluye** <!-- SHOULD -->:
- La capa de grupo: definición de grupo, comparativas, stats por trío, stats de todos, rankings y títulos (iter-05, F15).
- Una pestaña de estadísticas de campeones.
- Evolución del frío/calor ("descongelándose") y forma del jugador (hilo abierto en `think.md`).
- Más récords del JSON (curación, escudos, multikill).
- Hosting, sync entre dispositivos, tema claro y deuda de pulido UI de iter-02/03 sin relación con estos ficheros.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Columnas y relleno | Migración (`total_damage_taken`, `largest_killing_spree`, `profile_icon_id`), ingesta actualizada y script idempotente de relleno desde `rawGz` |
| 2 | Dominio de estadísticas | Módulo puro en `src/domain/` con récords, victorias especiales, rachas, días (F17), victorias a la primera y campeón con más 1º. Tests con partidas de prueba |
| 3 | Dominio de frío/calor | Módulo puro (F16) con constantes en `config.ts` y tests de umbral |
| 4 | Pestaña Estadísticas | `?tab=estadisticas`, carga bajo demanda como el resto de pestañas, estados vacíos y enlaces a partida y panel |
| 5 | Frío/calor en UI | Marca en el cromo, orden "Frío/calor" y bloque en el panel de campeón |
| 6 | Deidad y Dios de Arena | Badge en la cabecera, cambio de meta de la barra y textos renombrados |
| 7 | Icono de invocador | Llamada a Summoner-V4 en el cliente Riot y en el sync, e icono en la cabecera |
| 8 | Menú ⋯ con builds | Menú en todos los cromos con los enlaces de builds |
| 9 | Logo | 3 propuestas SVG con capturas, elección del supervisor, logo en la cabecera y favicon |
| 10 | Verificación | `.dev/verify-report.md` con tests, cruce SQL de los 6 perfiles del grupo y capturas |

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1 — Tras la migración y el script de relleno, `total_damage_taken` y `largest_killing_spree` no son nulos en ninguna de las partidas guardadas (1192 a 2026-09-30), coinciden con el JSON en una muestra, y el script se puede repetir sin cambiar nada.
- [ ] AC2 — El dominio de estadísticas tiene tests para: empate en un récord (gana la más antigua), racha en curso hasta la última partida, partida a las 01:30 de Madrid que cuenta en el día anterior, día con 2 partidas excluido de mejor/peor día, jugador sin ningún 1º y cambio de horario de verano/invierno en el corte de las 06:00.
- [ ] AC3 — El dominio de frío/calor tiene tests para: campeón con 4 partidas (sin marca), campeón justo en ±0,4 de la media ajustada (con marca), campeón con algún 1º (sin marca aunque cumpla el umbral) y media global calculada con todas las partidas.
- [ ] AC4 — Para los 6 perfiles del grupo, los valores de la pestaña Estadísticas y el recuento de ❄️/🔥 cuadran con consultas SQL directas a la BD local. Las consultas y las salidas quedan en el verify-report.
- [ ] AC5 — `?tab=estadisticas` se abre por URL directa y cada récord enlaza a una partida que muestra ese mismo valor en su detalle. Se ve bien a 375 px y en escritorio, y funciona con teclado.
- [ ] AC6 — Un perfil con ≥60 ganados muestra el badge "Deidad de Arena" y la barra "Dios de Arena: X / N" (N = campeones de los datos estáticos). Un perfil con <60 mantiene la barra hacia 60 con la etiqueta "Deidad de Arena". No queda ningún texto visible "Arena God".
- [ ] AC7 — La cabecera muestra el icono de invocador de los perfiles sincronizados. Si Summoner-V4 falla (error simulado en test), el sync termina igual y se ve el placeholder.
- [ ] AC8 — El menú ⋯ aparece en cromos ganados, sin ganar y sin jugar. Los enlaces de builds abren la web correcta para los slugs límite ya probados (Wukong, Nunu, Renata, Bel'Veth, Kai'Sa). "Marcar a mano" solo aparece donde aplicaba antes.
- [ ] AC9 — Hay 3 propuestas de logo con capturas en `.dev/research/logo/`, y la elegida por el supervisor está en la cabecera y como favicon. (Recortable según §2; si se recorta, se deja como hilo abierto.)
- [ ] AC10 — `npm run lint && npm test && npm run build` pasan y el CI está en verde.
- [ ] AC11 (aceptación manual del supervisor, gate de merge) — En una sesión real de Arena, el grupo abre Estadísticas y el álbum con las marcas y nadie encuentra un valor que contradiga su partida. En esa sesión se intentan cerrar también AC5 de #3 y AC8 de #2.

## Riesgos y restricciones <!-- MAY -->

- **Zona horaria (F17)**: el corte de las 06:00 se calcula en Europe/Madrid con `Intl`, sin librerías nuevas. Los tests cubren el cambio de hora.
- **Datos estáticos**: el total de campeones de "Dios de Arena" depende de la versión de Data Dragon cargada. Si la versión cambia, la meta cambia sola; está bien que sea así.
- **Presupuesto Riot**: el icono de invocador añade 1 petición a `euw1` por sync, que es independiente del límite de peticiones de `europe`. No afecta a los backfills.
- **Dev key**: si caduca durante el verify, las AC que dependen de la API real (AC7) se paran y se avisa al supervisor.
- **Recorte** (§2, contingencia): primero el logo (AC9), luego mejor/peor día y después victorias a la primera.

## Estrategia de implementacion <!-- SHOULD -->

Orden por dependencias: primero los datos (1), después los dominios puros con sus tests (2, 3), luego la UI que los consume (4, 5), después los detalles independientes (6, 7, 8) y al final el logo (9), que depende de una elección del supervisor. Por eso el logo puede ir en paralelo desde el principio: las propuestas se preparan pronto, para que la elección no bloquee el merge. Los dominios son funciones puras sobre las filas del jugador que ya carga `data.ts`, igual que `domain/stats.ts` y `domain/summary.ts`, sin consultas nuevas por métrica. Implementación delegada a subagentes Sonnet por task (regla global de delegación); el orquestador revisa el diff y ejecuta lint, tests y build en cada task.
