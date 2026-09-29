# Análisis de webs de referencia — hylistats v1

**Investigación**: I4 (Referencias y diseño UI/UX) · **Fecha**: 2026-09-29
**Fuente**: exploración con navegador de 3 agentes (grupos *meta*, *opgg*, *trackers*) + síntesis. Perfil de prueba: `BEJITO MAMBO#1991` (EUW).
**Consumidor**: `design-brief.md` (propuesta v1) y Spec.

Convención: **[obs]** = observado por los exploradores · **[ded]** = deducción a partir de lo observado · **[op]** = opinión de diseño.

---

## Resumen ejecutivo

- **Nadie resuelve el caso de uso central de hylistats.** El único checklist de Arena God (arena.trott.dev) tiene dos estados (ganado / no), sin "jugado sin ganar" en la cuadrícula, sin contraste con el contador oficial, sin URL por jugador y con una sincronización de ~13 min en el cliente. op.gg devuelve "No matches recorded yet" para campeones de Arena en la temporada actual. Arena Sweats es un ranking competitivo, no un tracker.
- **"Victoria" significa cosas distintas en cada web.** LoLalytics llama *Win Rate* al top-3 [ded: 22,2+19,5+17,4 = 59,1 ≈ 59 %]; op.gg etiqueta *Victory* partidas terminadas en #2 y #3; METAsrc y op.gg (página de modo) separan *1st Place %* de *Win Rate/Top 3*. hylistats tiene que fijar "Victoria = 1º puesto" y mostrarlo en pantalla, no en un tooltip escondido.
- **Las estadísticas por compañero de trío no existen gratis en ningún sitio.** op.gg solo muestra nombres por partida (aunque los mismos 4 amigos se repiten en 20 partidas), Arena Sweats las tiene detrás de blur y candado, y trott cuenta "duos" como individuos incluso en 3v3. Ahí está el hueco más claro.
- **Patrones que se repiten y funcionan**: tira de puestos de las últimas 20 partidas con color por puesto (op.gg, Arena Sweats), detalle de partida como 6 equipos × 3 con tu equipo resaltado (op.gg, Arena Sweats), cuadrícula de retratos con estado (trott), métricas siempre con nº de partidas al lado (LoLalytics, METAsrc).
- **Identidad sin login**: el modelo de op.gg (URL `/{región}/{nombre}-{tag}`, recientes y favoritos locales con estrella y X) es el correcto para F5. Arena Sweats (perfil en modal sin URL) y trott (todo en `localStorage`) son los antipatrones.
- **La frescura del dato se comunica mal en todas partes.** El botón *Update* de op.gg tarda 30-40 s y no confirma nada. Trott no refresca la UI hasta recargar. Arena Sweats es lo más honesto ("Last synced match 2 hours ago"), pero el usuario no puede forzar la sincronización.
- **Ruido**: anuncios, CMP, pop-ups de idioma, muros de pago y densidad tipográfica muy alta en LoLalytics, op.gg, METAsrc y Arena Sweats. En una pantalla secundaria eso se nota mucho. Trott es el único limpio, y también el más pobre en información.
- **Volumen de referencia**: el perfil de prueba tiene 450 partidas de la temporada en Arena Sweats y 504 partidas encontradas por trott [obs]. Con ese volumen, listas, backfill y almacenamiento no se pueden tratar como casos triviales.

---

## 1. LoLalytics (Arena) — meta agregado

URL: https://lolalytics.com/arena/ · Páginas: home Arena, tier list (vistas List/Grid/Tier/Delta), página de campeón (Ahri), leaderboard por campeón (de Grieta), buscador.

**Qué muestra** [obs]
- Cabecera fija con chips de contexto (rango, parche 16.19, modo ARENA, región), winrate medio y partidas analizadas (1,37 M).
- Tier list de 173 campeones: Rank, Tier (S+…D), Win (con delta), Pick, Ban, Games. Cuatro vistas conmutables con `?view=`.
- Página de campeón: bloque de stats (Win 59 %, Pick, Tier, Rank 4/173, Ban, Games 9.671) y la **distribución de puestos 1º…Último** (22,2 / 19,5 / 17,4 / 15,7 / 14,3 / 11). Pestañas Build / Leaderboard / ProBuilds / Counters. Gráficas diarias. Secciones Counters, Synergy (compañeros por campeón con winrate conjunto y nº de partidas), Augments por tier y por posición de elección, Items.
- No tiene perfil de jugador propio: el buscador sugiere el Riot ID y envía a xdx.gg.

**Cómo lo agrupa**: barra superior pegajosa + franja de chips de contexto que persiste al navegar. La página de campeón es una columna muy larga con bloques apilados, cada uno con sus sub-pestañas. Las URL son limpias: `/lol/{slug}/arena/build/`.

**Estilo visual**: oscuro con splash art difuminado de fondo, paneles negro-azulados, acento dorado y azul, verde y rojo para deltas. Tipografía condensada tipo DIN, pequeña y muy densa. Los retratos son la columna principal de información. Mucha publicidad (huecos enormes, vídeo flotante).

**Fortalezas**
- La tira de distribución 1º…6º es la mejor síntesis en una línea del rendimiento de un campeón en Arena.
- Cada porcentaje lleva al lado el delta y el tamaño de muestra.
- Varias vistas de la misma lista sin cambiar de página, con la vista guardada en la URL.
- El contexto (parche, modo, región) está siempre visible.

**Debilidades**
- Densidad y tipografía pequeña que no se leen en una segunda pantalla.
- *Win* ambiguo (es top-3) y explicado solo en un tooltip `?` poco descubrible.
- Página de campeón interminable, sin índice ni anclas.
- Numeración de parche 16.19 frente a 26.19 en METAsrc para el mismo parche.
- En la vista List no hay filtro de texto.

---

## 2. METAsrc (Arena) — meta agregado

URL: https://www.metasrc.com/lol/arena · Páginas: portal del modo, tier list (List/Table + filtros), campeón Swain (build, synergies), Arena Comps.

**Qué muestra** [obs]
- Tier list con tres pestañas: campeones, composiciones de 3 y augments. Tabla con **Win % (1er puesto, ~16,5 %)**, **Top 3 %**, **Place (puesto medio)**, Pick, Ban, KDA, Games y columna *Duos* con iconos de los mejores compañeros.
- Vista List agrupada por bandas de tier, cada una con su rango de score explícito.
- Filtros: modal con parche, región y rango; filtro por clase (7 iconos); texto "Filter Champions…"; conmutador "vs Patch 26.18".
- Página de campeón: hero con retrato + resumen generado + franja de KPIs constante en todas sus pestañas (Build/Info/Counters/Synergies/Stats), cada una con URL propia.
- Arena Comps: top 5.000 tríos de campeones; se mezclan muestras de 30-50 partidas con otras de cientos.

**Cómo lo agrupa**: barra de modos y, dentro de Arena, una barra de sección propia. Hero, filtros plegables, pestañas de tipo de lista, controles y contenido en una sola columna.

**Estilo visual**: azul-gris oscuro sobrio, acento dorado/naranja y verde para los tiers altos. Sans moderna más espaciosa y legible que LoLalytics. Chips grandes, bordes redondeados, retratos pequeños con borde por tier.

**Fortalezas**
- **Usa las métricas correctas para Arena**: 1º %, Top 3 %, puesto medio y partidas. Coincide con la definición de hylistats.
- Agrupación por bandas con cabecera y rango, legible de un vistazo.
- Filtro de texto rápido + filtro por clase.
- Franja de KPIs constante y pestañas enlazables.
- Comparación contra el periodo anterior.

**Debilidades**
- El *Score* compuesto es opaco.
- Muestras pequeñas sin aviso de fiabilidad.
- El modal de filtros es lento y el estado de los filtros se ve poco.
- Sin perfil de jugador.
- Anuncios y ruido de muchos modos.
- No muestra la distribución completa de puestos.

---

## 3. OP.GG — perfil de jugador + modo Arena

URL: https://op.gg/lol/summoners/euw/BEJITO%20MAMBO-1991 · https://op.gg/lol/modes/arena

**Qué muestra** [obs]
- **Buscador**: selector de región + campo "Game name + #EUW", autocompletado con icono, Riot ID y rango. Sin texto, abre un desplegable con pestañas **Recent search / Favorites** (estrella para fijar, X para borrar; sin login son locales al navegador).
- **Cabecera de perfil**: icono con nivel, `BEJITO MAMBO #1991` con el tag atenuado, estrella, región, ladder rank, botón azul **Update** y debajo "Last updated: 39 minutes ago".
- **Arena es un filtro escondido** en el desplegable *Queue type* (`?queue_type=ARENA`), y la columna izquierda sigue mostrando soloQ.
- Tarjeta de Arena (últimas 20): "20G 12W 8L" con donut, KDA, top 3 campeones y **"Recent 20 Games Standing": 20 chips #1…#6 coloreados**. Su *W* no es 1º puesto (#2 aparece como *Victory*).
- Fila de partida: franja de color, hace cuánto, Victory/Defeat, duración, items, KDA, **puesto + nombre de equipo** ("#2 (Team Poros)") y mini-lista de equipos. Esa mini-lista **omite tu equipo si quedaste #5/#6**.
- Partida expandida: 6 equipos × 3 (Raptor, Poros, Sentinel, Scuttles, Krugs, minions) ordenados por puesto, con tu equipo resaltado en azul, "Copy Link", y augments como **círculos negros vacíos**.
- Pestaña Champions + Arena + Season 2026: **"No matches recorded yet"** (con 2025 sí hay filas).
- El botón *Update* muestra un spinner y luego una barra de progreso roja dentro del propio botón. Tarda 30-40 s, sin toast, y "Last updated" no cambia de forma perceptible.
- Página de modo Arena: sinergias de tríos y dúos con Avg. Place, 1st Place %, Win Rate y Pick Rate con nº de partidas.

**Cómo lo agrupa**: columna centrada de ~1080 px. Cabecera, pestañas de perfil, barra de colas y dos columnas (1/3 ranked, 2/3 resumen + partidas). Todo el estado va en la URL.

**Estilo visual**: carbón `#1c1c1f` con tarjetas gris azulado, azul `#4171d6` para lo positivo y las acciones, rojo para lo negativo. Filas de ~55 px, iconografía diminuta, retratos cuadrados redondeados con mini-badge. Mucho ruido: anuncios, cookies, idioma, promos, chips de IA.

**Fortalezas**
- URL de perfil determinista y compartible, con filtros en la query.
- Recientes y favoritos sin login.
- Cabecera con identidad + frescura + acción juntas.
- Tira de 20 puestos.
- Detalle de partida por equipos.
- Semántica de color simple y consistente.
- Progreso dentro del botón, sin saltos de layout.

**Debilidades**
- Arena como ciudadano de segunda.
- Sin checklist ni tabla de campeones en la temporada actual.
- *Victory* mezclado con puesto, sin puesto medio agregado.
- Sin agregado por compañero.
- Iconos vacíos cuando faltan datos.
- *Update* sin confirmación.
- Tu equipo desaparece de la vista colapsada.
- El estado vacío no explica nada.
- Ruido incompatible con una pantalla secundaria.

---

## 4. Arena Sweats — ranking competitivo 3v3

URL: https://arenasweats.lol/ · Páginas: home + leaderboard (pestañas SOLO Q, BRAVERY, ARENA GOD, OVERALL, CHAMPION, HIGH SCORES), perfil de un top y de `BEJITO MAMBO#1991`, historial con detalle, leaderboard de campeones.

**Qué muestra** [obs]
- Rating propio (OpenSkill). Perfil de prueba: rank #86.168 (top 10 %), 450 partidas, 67 victorias, Top 3 56 %, puesto medio 3,33, rachas, KDA, "Last synced match 2 hours ago".
- Overview: gráfica de rating por día, tiles de stats, **rejilla "Last 20 Games"** (verde top 3, rojo resto), logros y ~28 *High Scores* con percentil TOP x % y enlace a la partida.
- Champion Data: carrusel de una carta de campeón cada vez, con Games/Wins/Top 3, últimos 10 puestos e items/augments.
- **Best Teammates / Rival Opponents por jugador**: existen, pero borrosos y con candado ("Unlock at Tier VII").
- "Arena God" solo aparece como categoría de insignias del leaderboard. **No hay contador X/173.**
- Detalle de partida: 6 casillas de 3 campeones con nombre de monstruo, tu equipo resaltado y desglose del rating.

**Cómo lo agrupa**: página única con buscador + leaderboard. **El perfil es un modal sin URL**. Buscar a un jugador hace scroll hasta su fila, resaltada en dorado. Abajo hay un panel plegable (What's new / Help).

**Estilo visual**: oscuro con arte borroso, granate apagado + dorado, logo serif *fantasy*, emblemas, cartas de splash. Muy *gaming*, denso, con mucho gating visual (blur + candado).

**Fortalezas**
- Detalle 6×3 claro.
- Rejilla de forma legible.
- Frescura por jugador visible ("Last known match 17 hours ago" en hover).
- Botones `?` contextuales.
- Sincronización automática 0-15 min después de cada partida.

**Debilidades**
- No resuelve el progreso de Arena God.
- Muros de pago sobre justo los datos que necesitamos (compañeros).
- Sin URL de perfil.
- **Datos incoherentes** (Miss Fortune: 16 partidas, 1 victoria, Top 3 75 % y un histograma que suma 50; deltas absurdos como −2455).
- Huecos en el historial sin explicar.
- Render lento de las pestañas.
- Sobregamificación y monetización.

---

## 5. Arena God Tracker (arena.trott.dev) — tracker de checklist

URL: https://arena.trott.dev/ (código: GitHub `JustTrott/arena-god`) · Pestañas: Arena God Tracker, Match History, Stats.

**Qué muestra** [obs]
- **Checklist**: barra "Progress" + contador **"23 / 173 champions"**, buscador, orden por Completion / Alphabetically con botón de invertir, "Clear" en rojo.
- Carta de campeón cuadrada con splash, nombre, **check circular** (vacío / verde) y 4 píldoras de enlace a builds: u.gg, blitz, metasrc, op.gg.
- Match History: dos campos (Game Name + Tag Line con `#`) y *Update*. Sin región. Sincronización partida a partida: "Fetching match details… 2 of 504 (~13m 0s remaining)", resultados incrementales como cartas con pastilla `#N` y borde dorado en los 1º. Se puede reanudar desde la caché. Filtros All/2v2/3v3 y "#1 Only". Botón **"Sync to Tracker"** que vuelca las victorias al checklist.
- Stats (124 partidas): KPIs (GAMES, WINS, WIN RATE 20 %, CHAMPS, WON WITH) + **Most Wins** (podio), **Highest Winrate (3+ games)**, **Won on first try**, **Most tried, never won** (chips con nº de partidas), **Most played duos** y **Best duos by winrate** con Riot ID, victorias, partidas y %.
- Modal *What's new* con changelog la primera vez.

**Cómo lo agrupa**: una columna centrada, tres botones-pestaña, cuadrícula de 5 columnas. Sin cuenta ni URL. Todo el estado vive en `localStorage` (Riot ID, PUUID, caché de partidas de ~5 KB/partida, `firstPlaceChampions`).

**Estilo visual**: casi negro `#0a0a0a`, sans limpia, azul de acento, podios dorado/plata/bronce, verde para el check. Sin publicidad. Minimalista, con aspecto de proyecto personal.

**Fortalezas**
- El checklist visual con progreso N/total es el más directo de todos.
- Enlaces por campeón a mano.
- Sincronización con N de M + ETA + resultados incrementales + reanudable.
- Las secciones de Stats encajan casi exactamente con las preguntas del grupo ("¿con quién no he ganado nunca aunque lo haya intentado?", "¿con quién gano más?").

**Debilidades**
- Solo 2 estados.
- La UI **no es reactiva** (el checklist y las Stats necesitan recargar; la pestaña activa se desincroniza).
- ~13 min de sincronización en el cliente, y se pierde al cambiar de navegador.
- Sin contraste con el contador oficial ni distinción verificado/manual.
- Dúos contados como individuos en 3v3, sin estadística de trío.
- "Clear" sin confirmación visible.
- Nombres internos (`Velkoz`) frente a nombres de visualización.

---

## Tabla comparativa por capacidad de hylistats v1

| Capacidad v1 | LoLalytics | METAsrc | OP.GG | Arena Sweats | trott | Mejor referente y por qué |
|---|---|---|---|---|---|---|
| **Perfil por URL** | ✗ (delega a xdx.gg) | ✗ | ✓ `/euw/NOMBRE-TAG` + query | ✗ (modal) | ✗ (localStorage) | **OP.GG**: URL determinista, compartible y con estado en la query. Es el modelo de F5. |
| **Resumen / métricas** | Distribución 1º…6º por campeón | 1º %, Top 3 %, puesto medio, games | Donut W/L (W ≠ 1º) | Games, Wins, Top 3, media, rachas | Games, Wins, WR, champs | **METAsrc** en definición de métricas + **LoLalytics** en distribución de puestos. Ninguno lo hace para un jugador; hylistats los combina. |
| **Forma / evolución** | Tendencias diarias (meta) | "vs parche anterior" | Tira de 20 chips | Rejilla 20 + gráfica de rating | ✗ | **OP.GG / Arena Sweats**: la tira de puestos se lee en un segundo. |
| **Historial** | — | — | Lista + expansión 6×3, Copy Link | Lista + expansión 6×3 | Cartas con `#N` | **OP.GG** por estructura (fila + expansión + enlace); **Arena Sweats** por el resaltado del propio equipo sin perderlo nunca. |
| **Checklist de campeones** | — | — | "No matches recorded yet" | ✗ | ✓ grid + check + N/173 | **trott**, único que existe, aunque con 2 estados y sin fiabilidad. hylistats debe superarlo (3 estados + objetivo + origen). |
| **Contraste con contador oficial** | — | — | — | — | — | **Nadie.** Diseño propio sin referente. |
| **Compañeros de trío** | Synergy por campeón | Duos por campeón | Solo nombres por partida | Best Teammates (bloqueado) | Best duos (individuos) | **trott** por contenido (Riot ID + partidas + WR), **METAsrc/LoLalytics** por la honestidad de la muestra. Nadie calcula puesto medio por compañero ni tríos reales. |
| **Sync / carga** | — | — | *Update* 30-40 s sin confirmar | Auto 0-15 min, silenciosa | N de M + ETA + incremental + reanudable, sin reactividad | **trott** en feedback de progreso, **Arena Sweats** en frescura automática, **OP.GG** en progreso dentro del botón. Ninguno completo. |
| **Búsqueda / recientes / favoritos** | Buscador global | Solo campeones | Autocompletado + Recent/Favorites locales | Busca y salta a la fila, estrella | Formulario con 2 campos | **OP.GG**: autocompletado por Riot ID + desplegable con pestañas + estrella/X sin login. |
| **Enlaces por campeón** | URL limpia `/lol/{slug}/arena/build/` | `/lol/arena/champions/{slug}/build` | `/lol/modes/arena/{slug}/build` | — | 4 píldoras siempre visibles | **trott** por idea (enlaces en la carta), pero en un menú discreto. |
| **Definición de métricas** | `?` escondido | Texto explicativo | Ambigua | Botones `?` | — | **METAsrc** (métricas separadas y nombradas) + **Arena Sweats** (ayuda contextual). |
| **Legibilidad en 2ª pantalla** | Baja | Media-alta | Baja | Baja | Alta (poca info) | **METAsrc** en tipografía y espaciado, **trott** en ausencia de ruido. |

---

## Patrones a adoptar

1. **URL de perfil `/euw/{nombre}-{tag}` con estado en la query** (`?tab=`, `?view=`, `?filtro=`) — OP.GG, y la vista en la URL de LoLalytics.
2. **Recientes + Favoritos locales con estrella y X**, más un "Mi perfil" explícito que OP.GG no distingue — OP.GG.
3. **Métricas de Arena bien separadas**: 1º %, Top-3 %, puesto medio y partidas, con "Victoria = 1º" escrito en la tarjeta — METAsrc.
4. **Distribución de puestos 1º…6º** como barra en el resumen y por campeón — LoLalytics.
5. **Tira de puestos de las últimas 20 partidas** con color por puesto y número dentro del chip — OP.GG / Arena Sweats.
6. **Cuadrícula de retratos con estado y progreso N/total**, orden por completado y buscador — trott.
7. **Nº de partidas junto a cada porcentaje** y aviso de muestra pequeña — LoLalytics / METAsrc (y la carencia de Arena Comps).
8. **Detalle de partida 6×3 con tu equipo resaltado y siempre visible** — Arena Sweats / OP.GG (corrigiendo la omisión de #5/#6).
9. **Progreso de sincronización N de M + ETA + resultados incrementales + reanudable** — trott, pero reactivo.
10. **Frescura visible**: "Última partida hace X · comprobado hace Y" — Arena Sweats.
11. **Progreso dentro del botón *Actualizar*** sin saltos de layout — OP.GG, más una confirmación final que OP.GG no tiene.
12. **Filtro de texto + vistas conmutables** (cuadrícula / lista) — METAsrc / LoLalytics.
13. **Secciones de insight de trott** ("Más intentados sin ganar", "Ganados a la primera", "Mejor winrate con 3+ partidas") convertidas en órdenes y filtros del checklist.
14. **Ayuda `?` contextual** para métricas y fiabilidad — Arena Sweats.

## Antipatrones a evitar

1. **"Win" ambiguo** (top-3 en LoLalytics, *Victory* en OP.GG) sin explicación visible.
2. **Perfil sin URL** (modal de Arena Sweats) o **estado solo en el navegador** (trott).
3. **Arena enterrado** bajo un filtro o mezclado con soloQ (OP.GG).
4. **Muros de pago, blur y candados** (Arena Sweats) y cualquier publicidad, pop-up o banner (todos salvo trott).
5. **UI no reactiva** que exige recargar tras sincronizar (trott).
6. **Acción larga sin confirmación** (*Update* de OP.GG) y **acción destructiva sin confirmar** ("Clear" de trott).
7. **Iconos vacíos** cuando faltan datos (augments de OP.GG): ocultar o poner "sin datos".
8. **Estados vacíos mudos** ("No matches recorded yet") que no explican el porqué ni qué hacer.
9. **Muestras pequeñas presentadas como fiables** (Arena Comps de METAsrc, compañeros).
10. **Datos incoherentes publicados** (histograma de Arena Sweats): mejor no mostrar una cifra que mostrarla mal.
11. **Densidad tipográfica extrema** (LoLalytics, OP.GG): incompatible con leer de reojo.
12. **Omitir el propio equipo** en vistas compactas de partida (OP.GG #5/#6).
13. **Nombres internos** (`Velkoz`, `TwistedFate`) en la UI (trott).

---

## Huecos del análisis

- **Grupos cubiertos**: los tres esperados (*meta*, *opgg*, *trackers*). No falta ninguno. Quedan fuera **u.gg, Blitz y Mobalytics** (solo se conocen sus patrones de URL por trott) y **xdx.gg** (el destino de perfiles de LoLalytics, no abierto).
- **No hay referente para el contraste con el contador oficial** (challenge `602002`) ni para el **marcado manual distinguido**. Es diseño propio sin validar con usuarios.
- **Ningún sitio se probó en móvil** ni en anchos de pantalla secundaria (media pantalla, monitor vertical).
- **Definición de "victoria" en el cliente para tríos**: no se verificó si el juego considera victoria el top-3. Lo de LoLalytics es una deducción [ded] y sus tooltips no se pudieron abrir.
- **Nomenclatura de temporada y parche inconsistente**: el brief dice "Arena Season 2 (26.10)" y Arena Sweats "2026 Season 3 3v3". LoLalytics/OP.GG usan "16.19" y METAsrc "26.19". hylistats necesita su propio etiquetado, que depende de I1.
- **Patrones de URL externos sin validar del todo**: METAsrc aparece como `/lol/arena/champions/{slug}/build` (observado) y como `/lol/arena/build/{slug}` (enlaces de trott), así que puede haber redirección o un formato antiguo. Faltan los slugs de casos límite (Wukong/`monkeyking`, Nunu & Willump, Renata Glasc, Kai'Sa, Bel'Veth). Hay que verificarlos antes de la Spec.
- **trott**: no se probó el marcado manual (las cartas parecen conmutables), ni "Sync to Tracker", ni la sincronización completa. **Arena Sweats**: las insignias de Arena God son imágenes sin texto y no se pudo saber su semántica. **OP.GG**: no se visitaron Style, Mastery ni Live game, y no se sabe si los augments vacíos son un fallo de OP.GG o del navegador integrado.
- **Umbral del challenge**: la exploración no aporta el número objetivo de Arena God de la temporada actual. think.md recoge "60 campeones distintos" y "75 en la season actual" y hay que resolverlo en I1. El diseño no lo fija en el código.
- **Efectos colaterales**: el navegador integrado quedó con caché de trott en `localStorage` y se pulsó una vez *Update* en OP.GG. No afecta al análisis.
