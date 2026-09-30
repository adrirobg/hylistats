# Think: hylistats
**Estado**: iter-04 cerrada — sin iteración activa
**Ultima sesion**: 2026-09-30
**Sesiones**: 2026-09-30 (grill de iter-04 sobre las ideas del grupo); 2026-09-29 (Webapp de estadísticas de perfil de jugador para trackear progreso en el modo Arena de LoL usando la Riot API (inspiración: lolalytics.com/arena, op.gg/lol/modes/arena, metasrc.com/lol/arena, arenasweats.lol, arena.trott.dev))
**Grill**: cerrado (2026-09-29) — gate confirmado; §1 cerrada; I1–I4 entregadas. El supervisor da paso a desarrollo (2026-09-29). Grill de iter-04 (2026-09-30): §2 cerrada (F15–F17); gate confirmado, pasa a Spec

*Contrato del template*: todo contenido `{...}` es placeholder pendiente — los consumidores deterministas (dev-context) lo ignoran como si la celda/campo no existiera; jamas se reporta como estado real. Los markers `<!-- MUST -->`/`<!-- SHOULD -->`/`<!-- MAY -->` marcan obligacion de seccion: un `{...}` dentro de una seccion MUST de un artefacto en uso es deuda visible; en SHOULD/MAY es omision legitima. El header (Estado/Ultima sesion) es MUST.

## Inputs procesados
- Semilla del supervisor en `/dev-setup` + respuesta a Pregunta 1 del grill (2026-09-29) -> conversación
- Ideas del grupo tras ver la v1 (2026-09-30), en `/dev-grill` → CAPTURED "Ideas del grupo tras ver la v1"
- Webs de referencia: [arenasweats.lol](https://arenasweats.lol/) (leaderboard OpenSkill, badges Arena God, stats augments/items), [arena.trott.dev](https://arena.trott.dev/) (tracker Arena God por sync de historial), lolalytics/op.gg/metasrc (meta agregado)

---

## CAPTURED — Ideas capturadas

### Ideas del grupo tras ver la v1 (2026-09-30) — capturada
Notas del supervisor, tomadas sobre la marcha en la sesión con Hylimichi, Azpekaa, TheCIutch, zapas14 y Krill1nt. Muchas se pueden combinar o complementar entre sí.
- Pestaña de estadísticas, y quizá otra de estadísticas de campeones ("es divertido").
- Rachas: máximo de victorias seguidas (1º = victoria) y mayor número de partidas sin victoria.
- Compañeros: victorias y winrate ya existen; falta calcularlos por trío.
- Logo propio de Hylistats. Icono de invocador del jugador (lo da la API).
- Al pasar de 60 campeones: badge ("la idea de badges saldrá más"), y el marcador de Arena God pasa al siguiente título: ganar Arena con todos los campeones.
- Menú ⋯ del cromo: opción que abra las páginas de builds.
- Frío/calor por campeón ("Nevera" / "modo diablo"): frío si su puesto medio es peor que tu puesto medio global y caliente si es mejor. Hace falta un mínimo de partidas (empezar por 5) y un margen apreciable. Idea por pulir.
- Comparar lo personal con el grupo: competición, comparativas, piques.
- Récords personales: máximo de daño, de daño recibido, de kills, de racha de kills y de muertes en una partida; victorias sin morir; victoria con más muertes; día con mejor y con peor puesto medio.
- Stats de todos: campeón con más victorias, nº de victorias a la primera, mejor % de victorias a la primera.
- Rankings por día o semana (¿mes es demasiado?) que otorguen títulos o badges visibles, sobre todo vergonzantes, para generar piques: "El trol del día" (peor puesto medio diario), "El pacifista" (menos daño en el día o en una partida), "El D-d-d-diablo" (más daño en el día), "Equipo roto" (el trío que más ha ganado junto) y "Equipo mental boom" (peor trío del día).

### hylistats — capturada
Webapp de apoyo para el grupo de amigos del supervisor en el modo Arena de LoL. Hoy el grupo combina varias webs para: progreso, campeones con los que han ganado (ninguna fuente 100% fiable), win ratio y win ratio junto a otros jugadores. Uso típico: abierta en la pantalla secundaria mientras se juega, como ayuda para elegir campeón (marcar campeones objetivo, ver los ya ganados para no repetir). Una sección de campeón (meta) ayudaría a no cambiar de web, pero replicaría op.gg/lolalytics — dudosa.

---

## ORGANIZED — Ideas organizadas

### Función — organizada
Mezcla de perfil público (buscar un Riot ID y ver sus stats) y tracker persistente (el perfil queda registrado y sus stats se mantienen sin re-analizar el historial en cada visita). Capacidades nombradas por el supervisor: progreso, campeones ganados (1º puesto), win ratio, win ratio con otros jugadores, ayuda a elegir campeón (objetivos marcados + ya ganados). Meta agregado por campeón: candidato fuera de v1.

Flujo imaginado por el supervisor: entras → introduces tu Riot ID → tu perfil con stats. Cada miembro del grupo tiene "su" perfil guardado (abierto siempre en pantalla secundaria) y puede buscar el de otros amigos o jugadores; ver stats ajenas es secundario. Perfiles compartibles.

Hechos de dominio (2026-09-29):
- Arena Season 2 (parche 26.10, mayo 2026) pasó a **tríos**: 6 equipos de 3 ([AltChar](https://www.altchar.com/game-news/league-of-legends-patch-26.10-expands-arena-with-3v3v3v3v3v3-format-az48b0A2Z97G)); activo en 26.19 ([Blitz](https://blitz.gg/lol/tierlist/arena-trios)). El historial mezcla partidas 2v2 (queue 1700/1710) y 3v3 (queueId por verificar). Arena rota: puede no estar disponible todo el año.
- Arena tríos = `queueId` **1750** (VERIFICADO en I1; no figura en `queues.json`). **Corrección 2026-09-29**: también **1740**, mismo formato (`CHERRY`, mapa 30, 6×3) y misma temporada, en paralelo a la 1750; cuenta para `602002` (1750 ∪ 1740 = 75 y el paso a MASTER cae en el campeón nº 60 de la unión). Ver F14 y `archive/iter-01/verify-report.md` § AC4. `placement==1` es el 1º (`win` es true del 1º al 3º). Compañeros = mismo `playerSubteamId`. Challenge `602002` del supervisor = 75 (VERIFICADO); la API no expone fechas de temporada → `SEASON_START` como configuración.
- PUUID cifrado por proyecto/key: conseguir la Personal key antes de persistir datos reales (I2 §5).
- Match-V5 retiene ~2 años de historial ([Riot](https://www.riotgames.com/en/DevRel/match-history-retention-Change)): victorias antiguas de Arena son irrecuperables por API.
- Challenge `602002` "Adapt to All Situations" (Arena God, 1º con 60 campeones distintos) en Challenges-V1: da contador, no lista. **Es por temporada** (confirmado por el supervisor: 75 campeones en la season actual, no cuenta anteriores). La temporada actual (desde 26.10, 2026-05-13) cae entera dentro de la retención de Match-V5.
- La lista exacta de campeones ganados solo la expone la LCU (API local del cliente) → solo accesible desde app de escritorio ([arena-companion](https://github.com/donglecum/arena-companion)).
- Claves Riot ([portal](https://developer.riotgames.com/docs/portal)): development (caduca 24 h), **personal** (no caduca, para uno mismo o comunidad pequeña, "may not run your application for public consumption"), production (requiere prototipo y revisión; 500/10 s). Personal y development: 20 req/s, 100 req/2 min → backfill de una temporada (~cientos de partidas, 1 req por partida) tarda minutos por perfil; partidas compartidas entre amigos del mismo trío se descargan una vez.
- [OPGG.py](https://github.com/ShoobyDoo/OPGG.py): librería no oficial sobre la API interna de op.gg; 18★, último push 2026-01-13. Frágil y de ToS dudoso.

### iter-04: stats personales y detalles rápidos — organizada (2026-09-30)
Corte de F15. Lo resuelto hasta ahora:
- **Dónde se ven** (P2): una pestaña nueva "Estadísticas" (récords de partida, rachas, mejor y peor día). Frío/calor va en el álbum de Campeones: marca en el cromo, filtro u orden y dato en el panel de campeón. La pestaña de estadísticas de campeones queda fuera de iter-04.
- **Frío/calor** (P3–P4): ver F16. Se implementa la versión de temporada (opción A), se prueba con el grupo y se ajusta según el uso.
- **Día de juego** (P5): ver F17.
- **Pestaña Estadísticas** (P6, lista cerrada; todo de la temporada, y cada récord de partida enlaza a su partida): récords de partida (máximo de daño a campeones, de daño recibido `totalDamageTaken`, de kills, de racha de kills `largestKillingSpree` y de muertes); victorias sin morir (número de 1º con 0 muertes y su lista); victoria con más muertes; racha más larga de 1º consecutivos; racha más larga de partidas sin 1º; mejor y peor día (F17); victorias a la primera (campeones ganados en la primera partida con ellos, en número y en % sobre los ganados); campeón con más 1º. Fuera: más récords del JSON (curación, escudos, multikill) hasta que un título de iter-05 los pida.
- **Badge y meta siguiente** (P7): al llegar a 60 ganados (lista verificada, o contador oficial si es mayor) aparece el badge **"Deidad de Arena"** junto al nombre en la cabecera, sencillo pero pensado como primera pieza del sistema de badges de iter-05. La barra pasa entonces a la meta **"Dios de Arena"**: "X / todos los campeones", con las mismas tres capas; el total sale de los datos estáticos del juego (un campeón nuevo sube la meta sin tocar código). Nombres del supervisor (corrigen "Arena God" / "Panteón completo"). Descartado: barra fija en 60 con "+N".
- **Detalles rápidos** (P8): icono de invocador en la cabecera (Summoner-V4 `profileIconId`, 1 petición a `euw1` por perfil en cada sync, imagen de los datos estáticos). Menú ⋯ en todos los cromos con los enlaces de builds del panel de campeón; marcar a mano solo donde aplica. Logo: tarea de iter-04 con 3 propuestas en SVG vistas sobre la app; el supervisor elige o pide ajustes, y de la elegida salen el logo de la cabecera y el favicon.
- **Criterio de terminado y recorte** (P9): ver §2.
- **Hechos**: las 1192 partidas guardadas tienen `rawGz`, así que el daño recibido, la racha de kills y otros campos se derivan sin volver a pedir las partidas. El icono de invocador necesita Summoner-V4 (`euw1`, 1 petición por perfil). El JSON trae `totalDamageTaken`, `largestKillingSpree` y `largestMultiKill` (comprobado). `602002` termina en MASTER = 60 y el valor sigue subiendo después, sin más umbrales ni título oficial. Los enlaces de builds ya existen (`champion-links.ts`, panel de campeón).

*Glosario lazy*: si `dev-grill` descubre terminos reales que reducen ambiguedad, crear aqui `## Glosario del proyecto <!-- MAY -->`; no provisionar una seccion vacia.

---

## DISTILLED — Decisiones tomadas

| ID | Decision | Valor | Estado | Fuente |
|----|----------|-------|--------|--------|
| F1 | Usuario objetivo | Grupo de amigos del supervisor; app de apoyo en pantalla secundaria, no producto público masivo | Cerrada | Supervisor, grill P1 |
| F2 | Persistencia de perfiles | Búsqueda por Riot ID + perfil registrado con datos persistidos (sync incremental, no re-análisis por visita). Implica almacenamiento propio | Cerrada | Supervisor, grill P1 |
| F3 | Alcance v1 | Registro por Riot ID + sync incremental; resumen (partidas, winrate 1º, top-N, puesto medio, evolución); checklist de campeones (ganado/jugado/sin jugar) con objetivos marcables; stats con compañeros (tríos: 2 compañeros por partida); enlaces por campeón a op.gg/lolalytics/etc. Fuera: meta agregado propio, augments/items más allá del detalle de partida, rankings | Cerrada | Supervisor, grill P2 |
| F4 | Criterio de terminado v1 | El grupo tiene sus perfiles sincronizados y en una sesión real de Arena elige campeón y consulta stats/compañeros sin abrir otra web; el recuento de campeones ganados cuadra con el contador Arena God del cliente o la app explica la diferencia | Cerrada | Supervisor, grill P2 |
| F5 | Identidad sin login (modelo op.gg) | Sin cuentas. URL pública por jugador (región + Riot ID) = perfil guardado y enlace compartible. Servidor persiste datos de todo jugador buscado. El navegador recuerda "mi perfil" (landing directa) y amigos favoritos/recientes. Riot Sign On descartado en v1 (requiere production key aprobada) | Cerrada | Supervisor, grill P3 |
| F6 | Datos personales del usuario en navegador | Objetivos marcados (y "mi perfil"/favoritos) viven solo en el navegador (`localStorage`) + exportar/importar; nadie más puede modificarlos. Post-v1: token secreto de edición para sync entre dispositivos, sobre esta base | Cerrada | Supervisor, grill P4 |
| F7 | Fuente de verdad de campeones ganados (3 capas) | (1) Lista verificada: 1º puestos del historial Match-V5, enlazados a su partida; (2) control: contador oficial del challenge `602002` (por temporada) vs lista, con aviso de diferencia; (3) marcado manual en navegador (F6) para cubrir huecos, visualmente distinguido. Descartado: app escritorio LCU (cambia el producto; post-v1 si el hueco duele) y solo historial (el problema actual) | Cerrada | Supervisor, grill P5 |
| F8 | Ámbito temporal | Checklist y stats centrados en la temporada actual de Arena (foco). Selector de temporadas pasadas solo si es poco trabajo (recortable de v1) | Cerrada | Supervisor, grill P6 |
| F9 | Clave Riot y exposición | Personal API key (no caduca, sin revisión, 100 req/2 min). Web publicada pero no publicitada (`noindex`, se comparte por enlace en el grupo). Código de acceso común solo si el enlace se filtra. Production key descartada en v1. **Revisión 2026-09-29**: la Personal key exige registrar el producto (como la de producción) y de momento no es posible → desarrollo con development key (caduca cada 24 h); registrar el producto cuando exista un prototipo | Cerrada (revisada) | Supervisor, grill P7 + aviso posterior |
| F10 | Región | Solo EUW (todo el grupo) | Cerrada | Supervisor, gate |
| F12 | Entorno y publicación | Desarrollo 100 % local; hosting/publicación se decide después (Heroku no convence del todo). Stack de I3 adoptado salvo hosting: Next.js 16 + Drizzle + Postgres (local) + worker en proceso + cliente Riot propio + dev key rotable desde `/admin`. Código de acceso común se decide con el hosting | Cerrada | Supervisor, 2026-09-29 |
| F13 | Diseño base | Brief I4 + maqueta (`research/design-mock.html`): recomendaciones D1–D13 adoptadas por defecto, revisables por el supervisor tras ver la maqueta | Cerrada (revisable) | Supervisor, 2026-09-29 |
| F14 | Colas de Arena sincronizadas | Backfill, incremental y stats cubren las colas **1750 y 1740** (las dos Arena tríos de la temporada); el álbum cuadra con `602002`. Entra como T01 de iter-02 (cambio de alcance de la spec de #1, que fijó `queue=1750`) | Cerrada | Supervisor, 2026-09-29 (gate de iter-02) |
| F15 | Orden post-v1 | iter-04: stats personales y detalles rápidos (icono, logo, builds en el menú ⋯, badge a los 60). iter-05: capa de grupo (definir qué es el grupo, comparativas, tríos, rankings y títulos), con su propio grill. Descartado ir directo al grupo: cada título tendría que inventar su métrica y la definición de grupo se resolvería a la vez | Cerrada | Supervisor, grill 2026-09-30 P1 |
| F16 | Frío/calor por campeón | Solo campeones **sin 1º** en la temporada (los ya ganados no llevan marca); la media global del jugador sí usa todas sus partidas. Media del campeón ajustada: `(n·media_campeón + 5·media_global) / (n + 5)`; mínimo 5 partidas; 🔥 "modo diablo" si la media ajustada es ≥0,4 puestos mejor que la global, ❄️ "Nevera" si es ≥0,4 peor, y neutro en el resto. Ámbito: toda la temporada. Descartado: umbral sin ajustar (marca por rachas cortas) y estado "descongelándose" por campeón (con los datos de 2026-09-30, casi ningún campeón sin ganar llega a 10 partidas; sería ruido). Con los datos de 2026-09-30 da 1–4 ❄️ por jugador y 🔥 casi nunca. Se ajusta tras los primeros usos | Cerrada (revisable con uso) | Supervisor, grill 2026-09-30 P3–P4 |
| F17 | Día de juego | De 06:00 a 06:00, hora de Europe/Madrid (fija, igual para todo el grupo, no la del navegador). Cada partida cuenta en el día en que empezó (`gameStartTimestamp`). Para "mejor/peor día" hacen falta al menos 3 partidas ese día (se sube si da ruido). Vale para las stats diarias de iter-04 y para los títulos diarios de iter-05. Descartado: cortar a medianoche (parte las sesiones nocturnas) y agrupar por sesiones (más difícil de explicar) | Cerrada (mínimo revisable) | Supervisor, grill 2026-09-30 P5 |
| F18 | Validación manual agrupada | iter-05 se implementa, verifica y **mergea con los gates manuales pendientes** (como en iter-02 a iter-04), y la aceptación manual se hace en **una sola sesión real de Arena con el grupo al terminar iter-05**: valida a la vez AC11 de #7 (iter-04), AC5 de #3, AC8 de #2 y los gates de iter-05. Descartado: sesión antes del grill (retrasa iter-05) y dejar la PR de iter-05 abierta hasta la sesión (bloquea iter-06). Riesgo aceptado: si la sesión encuentra un fallo en las métricas de iter-04, se corrige en la base y lo heredan ambas | Cerrada | Supervisor, 2026-10-01 (opción A) |
| F11 | Investigación previa a Spec | Stack, backfill, Riot API y diseño UI/UX se resuelven con investigaciones dedicadas (I1–I4) antes de abrir Spec; la de Riot API produce además una skill de uso | Cerrada | Supervisor, gate |

---

## EXPRESSED — Especificaciones cerradas

### §1 — hylistats v1: perfil Arena de apoyo para el grupo CERRADA

Webapp sin login (F5) que, dado un Riot ID, muestra y mantiene las stats de Arena del jugador para la temporada actual (F8), pensada para estar abierta en pantalla secundaria durante sesiones del grupo (F1).

**Capacidades v1** (F3):
1. Búsqueda por Riot ID → URL pública del perfil; primer acceso lanza backfill de la temporada con progreso visible; después sync incremental (al entrar o botón "actualizar") (F2, F9).
2. Resumen: partidas, winrate (1º), top-N, puesto medio y evolución.
3. Checklist de campeones (ganado / jugado sin ganar / sin jugar) con modelo de 3 capas (F7): lista verificada Match-V5 + control contra challenge `602002` + marcado manual. Objetivos marcables y filtro "objetivos no ganados" para elegir campeón.
4. Compañeros: winrate y puesto medio por compañero (tríos: 2 por partida; historial puede mezclar 2v2).
5. Enlaces por campeón a op.gg / lolalytics / etc.
6. En navegador (F6): "mi perfil" (landing directa), favoritos/recientes, objetivos y marcas manuales; exportar/importar.

**Fuera de v1**: meta agregado propio, augments/items más allá del detalle de partida, rankings, cuentas/login, sync de datos personales entre dispositivos, LCU/app escritorio, datos de terceros (OPGG.py). Selector de temporadas pasadas: recortable.

**Criterio de terminado** (F4): perfiles del grupo sincronizados; en una sesión real de Arena cada uno elige campeón y consulta stats/compañeros sin abrir otra web; el recuento de campeones ganados cuadra con el contador `602002` o la app explica la diferencia.

**Región**: EUW (F10).

**Para Spec**: consume los resultados de I1–I4 (F11): Riot API (queueIds, campos Arena, semántica/fin de temporada de `602002`, datos estáticos), estrategia de backfill, stack/persistencia/hosting y propuesta UI/UX.

**Entorno** (F12): desarrollo local; stack de I3 sin hosting. **Diseño** (F13): brief I4 + maqueta.

**Destino inmediato**: Pasa a Spec (I1–I4 entregadas). `spec.md` debe consumir esta §1.

### §2 — iter-04: stats personales y detalles rápidos CERRADA

Primer corte post-v1 (F15), sacado de las ideas del grupo (CAPTURED, 2026-09-30). Todo es de la temporada actual (F8) y cubre las colas 1750 y 1740 (F14).

**Alcance**:
1. **Pestaña "Estadísticas"** (nueva, junto a Campeones, Resumen, Compañeros y Partidas). Récords de una partida: máximo de daño a campeones, de daño recibido, de kills, de racha de kills y de muertes. Victorias sin morir (número y lista). Victoria con más muertes. Racha más larga de 1º consecutivos y de partidas sin 1º. Mejor y peor día (F17). Victorias a la primera (número y % sobre los ganados). Campeón con más 1º. Cada récord de partida enlaza a su partida.
2. **Frío/calor en el álbum** (F16): marca ❄️ "Nevera" / 🔥 "modo diablo" en el cromo, filtro u orden en el álbum y dato en el panel de campeón. Solo campeones sin 1º.
3. **Badge "Deidad de Arena" y meta "Dios de Arena"**: badge en la cabecera al llegar a 60; después la barra pasa a "X / todos los campeones" (total de los datos estáticos), con las mismas tres capas. Los textos "Arena God" de la UI pasan a "Deidad de Arena".
4. **Icono de invocador** en la cabecera (Summoner-V4 `profileIconId`, 1 petición a `euw1` por perfil en cada sync).
5. **Builds en el menú ⋯** de todos los cromos (los enlaces que ya salen en el panel de campeón); "marcar a mano" solo donde aplica.
6. **Logo**: 3 propuestas en SVG vistas sobre la app; el supervisor elige y de la elegida salen el logo de la cabecera y el favicon.

**Fuera de iter-04**: capa de grupo (definición de grupo, comparativas, stats por trío, stats de todos, rankings y títulos: iter-05, F15); pestaña de estadísticas de campeones; evolución del frío/calor y forma del jugador (hilo abierto); más récords del JSON (curación, escudos, multikill).

**Criterio de terminado**:
- **Automático**: cada estadística tiene tests con partidas de prueba que cubren los casos límite (empates en un récord, racha que llega hasta hoy, día que cruza medianoche o que no llega a 3 partidas, campeón justo en el umbral de frío/calor). En Verify, los valores de la app de los 6 perfiles del grupo cuadran con consultas SQL directas a la BD local.
- **Aceptación**: en una sesión real de Arena el grupo abre Estadísticas y el álbum con las marcas, y nadie encuentra un valor que contradiga su partida (se comprueba con el enlace de cada récord). Esa misma sesión sirve para cerrar AC5 de #3 y AC8 de #2.

**Recorte si hiciera falta** (plan de contingencia, no se espera usar): primero el logo, luego el mejor y peor día, luego las victorias a la primera. No se recortan: récords y rachas, frío/calor, badge y meta, icono y builds.

**Datos**: sin nuevas descargas de partidas. Los campos nuevos (`totalDamageTaken`, `largestKillingSpree`) salen del `rawGz` guardado (1192/1192 partidas); si pasan a columnas, se rellenan desde ese JSON.

**Destino inmediato**: pasa a Spec (gate confirmado por el supervisor el 2026-09-30). `spec.md` consume esta §2.

*Regla de handoff*: Spec consume `think.md` cuando el artefacto esta en estado `cerrado`. Cada §N de `EXPRESSED` debe dejar explicito si pasa a Spec o si queda cerrada/deferida.

---

## Investigaciones
- [I1 Riot API para Arena](research/riot-api.md) — estado: cerrada (2026-09-29). Skill: `.claude/skills/riot-api/`. Resultado esperado: `.dev/research/riot-api.md` (endpoints Account/Match/Challenges para EUW, queueIds Arena 2v2 y tríos, campos de participante Arena, semántica y fin de temporada de `602002`, rate limits y routing, datos estáticos DDragon/CDragon, reglas de la personal key) + skill de proyecto `riot-api` (uso, tips, reglas). Verificación contra la API real.
- [I2 Backfill y sync](research/sync-strategy.md) — estado: cerrada (2026-09-29). Resultado esperado: `.dev/research/sync-strategy.md` (presupuesto de peticiones, cola, dedupe entre amigos, incremental, dónde corre el trabajo).
- [I3 Stack](research/stack.md) — estado: entregada, pendiente de revisión del supervisor (decisiones D1–D12 del stack; incluye GitHub Student Pack y rotación de dev key). Resultado esperado: `.dev/research/stack.md` (framework + blueprint/scaffolding base, persistencia, hosting y coste, ajustado al perfil de uso).
- [I4 Referencias](research/reference-sites.md) y [diseño UI/UX](research/design-brief.md) — estado: entregada, pendiente de revisión del supervisor (decisiones D1–D13 del brief). Maqueta interactiva: `research/design-mock.html` (Claude Design no disponible desde esta sesión: 422 al crear el lienzo, aunque el login de DesignSync funciona). Resultado esperado: `.dev/research/reference-sites.md` (análisis visual de las 5 webs: qué muestran y cómo) + propuesta de diseño final.

---

## Hilos abiertos <!-- SHOULD -->

| Hilo | Owner | Siguiente accion |
|------|-------|-------------------|
| Ideas de la sesión inicial con el grupo (2026-09-30): capturadas y grilladas. iter-04 → EXPRESSED §2. La capa de grupo va a iter-05 (F15): definir qué es el grupo, comparativas personal frente al grupo, stats por trío, stats de todos (campeón con más victorias, victorias a la primera y su %), rankings por día o semana (¿mes?) y títulos o badges vergonzantes (trol del día, pacifista, D-d-d-diablo, equipo roto, equipo mental boom) | Supervisor | iter-04 cerrada (PR #8 mergeada el 2026-09-30, archivo `archive/iter-04/`): parte personal consumida. Siguiente: `/dev-grill` de iter-05 sobre la capa de grupo, que monta sobre `src/domain/records.ts` y el componente `Badge` |
| Hosting/publicación y código de acceso (Heroku, Railway, Fly, Azure…) | Supervisor | Tras v1 en local. Los datos del grupo ya están en el Postgres local (6 perfiles registrados y sincronizados el 2026-09-30, 1186 partidas, 587 descargadas en ~1 h con 0 × 429): se llevan al hosting con `pg_dump`/restore, sin volver a descargar |
| Pulido y mejora de la UI base (D1–D13 aplicadas por defecto en iter-02; el supervisor prefiere prototipar ya, 2026-09-29) | Supervisor | Tras v1. Deuda concreta de iter-02 (payload RSC del polling, raíl de 380 px inalcanzable, desviaciones de la maqueta): `archive/iter-02/learn.md` → Deuda y gaps. De iter-03 (texto de perfil ajeno, tope de "Ver todos", eje de la curva a 375 px, ETA de cola compartida aproximada): `archive/iter-03/learn.md` → Deuda y gaps. De iter-04 (tooltip del badge sin apertura por foco, `data.ts` en 679 líneas): `archive/iter-04/learn.md` → Deuda y gaps |
| AC5 de #3 pendiente (criterio de terminado de la v1, F4): en una sesión real de Arena el grupo elige campeón y consulta stats y compañeros sin abrir otra web; el recuento cuadra con el contador oficial o la app explica la diferencia. La PR #6 se mergeó con este gate abierto | Supervisor | Próxima sesión de Arena con el grupo (dev key vigente: caduca a las 24 h de renovarla); si falla, issue de corrección. Dato de apoyo (2026-09-30): con los 6 perfiles del grupo sincronizados, 5 cuadran exactos con `602002` y zapas14 muestra "Falta 1 campeón" (28 frente a 29) con su explicación. La sesión inicial en la que el grupo vio la app no fue una partida real, así que el gate sigue abierto |
| AC11 de #7 pendiente (aceptación manual de iter-04): en una sesión real de Arena el grupo abre Estadísticas y el álbum con las marcas ❄️/🔥 y nadie encuentra un valor que contradiga su partida. La PR #8 se mergeó con este gate abierto | Supervisor | Sesión conjunta al terminar iter-05 (F18), junto con AC5 de #3, AC8 de #2 y los gates de iter-05 (dev key vigente); recoger si el grupo echa en falta 🔥 (1 🔥 frente a 16 ❄️ en los 6 perfiles; constantes F16 en `src/lib/config.ts`). Si falla, issue de corrección |
| AC8 de #2 pendiente: aceptación manual en una partida real (elegir campeón desde "Objetivos sin ganar"); la PR #5 se mergeó por delegación con este gate abierto | Supervisor | Próxima partida de Arena; si falla, issue de corrección |
| Registro del producto en el portal de Riot para obtener Personal key (requisitos, cuándo es viable) | Supervisor | Tras tener prototipo con dev key. La dev key se renovó en `/admin` el 2026-09-30 hacia las 15:07 UTC: caduca a las 24 h, y la de `.env.local` no se usa mientras haya una en la BD |
| Qué cuenta como "public consumption" con Personal key para web accesible por URL (I1 §11) | Supervisor | Revisar en Spec; F9 prevé código de acceso si hace falta |
| Sync de datos personales entre dispositivos (token secreto de edición / verificación por icono) | Supervisor | Post-v1, volver sobre ello |
| Evolución temporal del frío/calor por campeón (estado "descongelándose", peso de lo reciente) e indicador de forma del jugador (últimas 20 frente a la temporada) | Supervisor | Tras los primeros usos de F16, cuando haya campeones sin ganar con 20+ partidas; el indicador de forma del jugador puede entrar en el grill de iter-05 como título de grupo |
| Sección de campeón con datos de terceros (OPGG.py o similares) post-v1 | Supervisor | Post-v1; enlaces externos ya en v1 (F3) |

---

## Principios del proyecto

{Opcional. Se completa cuando emergen principios transversales que guian decisiones futuras.}
