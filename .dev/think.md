# Think: hylistats
**Estado**: iter-02 cerrada — sin iteración activa
**Ultima sesion**: 2026-09-30
**Sesiones**: 2026-09-29 (Webapp de estadísticas de perfil de jugador para trackear progreso en el modo Arena de LoL usando la Riot API (inspiración: lolalytics.com/arena, op.gg/lol/modes/arena, metasrc.com/lol/arena, arenasweats.lol, arena.trott.dev))
**Grill**: cerrado (2026-09-29) — gate confirmado; §1 cerrada; I1–I4 entregadas. El supervisor da paso a desarrollo (2026-09-29)

*Contrato del template*: todo contenido `{...}` es placeholder pendiente — los consumidores deterministas (dev-context) lo ignoran como si la celda/campo no existiera; jamas se reporta como estado real. Los markers `<!-- MUST -->`/`<!-- SHOULD -->`/`<!-- MAY -->` marcan obligacion de seccion: un `{...}` dentro de una seccion MUST de un artefacto en uso es deuda visible; en SHOULD/MAY es omision legitima. El header (Estado/Ultima sesion) es MUST.

## Inputs procesados
- Semilla del supervisor en `/dev-setup` + respuesta a Pregunta 1 del grill (2026-09-29) -> conversación
- Webs de referencia: [arenasweats.lol](https://arenasweats.lol/) (leaderboard OpenSkill, badges Arena God, stats augments/items), [arena.trott.dev](https://arena.trott.dev/) (tracker Arena God por sync de historial), lolalytics/op.gg/metasrc (meta agregado)

---

## CAPTURED — Ideas capturadas

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
| Hosting/publicación y código de acceso (Heroku, Railway, Fly, Azure…) | Supervisor | Tras v1 en local |
| Pulido y mejora de la UI base (D1–D13 aplicadas por defecto en iter-02; el supervisor prefiere prototipar ya, 2026-09-29) | Supervisor | Tras v1. Deuda concreta de iter-02 (payload RSC del polling, raíl de 380 px inalcanzable, desviaciones de la maqueta): `archive/iter-02/learn.md` → Deuda y gaps |
| AC8 de #2 pendiente: aceptación manual en una partida real (elegir campeón desde "Objetivos sin ganar"); la PR #5 se mergeó por delegación con este gate abierto | Supervisor | Próxima partida de Arena; si falla, issue de corrección |
| Registro del producto en el portal de Riot para obtener Personal key (requisitos, cuándo es viable) | Supervisor | Tras tener prototipo con dev key |
| Qué cuenta como "public consumption" con Personal key para web accesible por URL (I1 §11) | Supervisor | Revisar en Spec; F9 prevé código de acceso si hace falta |
| Sync de datos personales entre dispositivos (token secreto de edición / verificación por icono) | Supervisor | Post-v1, volver sobre ello |
| Sección de campeón con datos de terceros (OPGG.py o similares) post-v1 | Supervisor | Post-v1; enlaces externos ya en v1 (F3) |

---

## Principios del proyecto

{Opcional. Se completa cuando emergen principios transversales que guian decisiones futuras.}
