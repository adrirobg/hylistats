# Propuesta de diseño — hylistats v1

**Investigación**: I4 · **Fecha**: 2026-09-29 · **Estado**: propuesta para revisión del supervisor
**Entradas**: `think.md` §1 (F1–F11), `reference-sites.md`.
**Salida hacia**: Spec y propuesta visual (Claude Design).

Referencias abreviadas: **LOL** = LoLalytics · **MS** = METAsrc · **OPGG** = OP.GG · **AS** = Arena Sweats · **TR** = arena.trott.dev.

---

## 0. Concepto: "el álbum del coliseo"

Arena God consiste en **completar una colección**: quedar 1º con N campeones distintos. La metáfora que ordena todo el diseño es un **álbum de cromos**:

- **Cromo pegado** (a color, con sello dorado) = ganado y verificado.
- **Cromo a lápiz** (contorno discontinuo) = marcado a mano.
- **Hueco con intentos apuntados** = jugado sin ganar.
- **Hueco vacío** = sin jugar.
- **Chincheta naranja** = objetivo.

La parte estadística se presenta como un **marcador de estadio**: cifras grandes, condensadas, legibles a dos metros.

Qué debe quedar en la memoria del usuario: **de un vistazo, en la pantalla de al lado, sabes a quién te falta ganar y a quién vas a sacar**. Ni TR (dos estados), ni OPGG (vacío en la temporada actual), ni AS (ranking) lo resuelven.

La dirección evita la estética *gaming* recargada de AS y LOL (splash de fondo, fantasía, anuncios) y también el minimalismo genérico de TR. Es sobria, con un único color "caliente" reservado para lo que el usuario quiere hacer: sus objetivos.

---

## 1. Principios

| # | Principio | Consecuencia en diseño | Origen |
|---|---|---|---|
| P1 | **Legible de reojo** (pantalla secundaria a 60-100 cm, atención parcial) | Cuerpo ≥ 16 px; KPIs ≥ 40 px; nombres de campeón ≥ 13 px; nunca información solo en iconos de 16 px; contraste AA+ | Se aparta de LOL/OPGG (densidad extrema); se acerca a MS |
| P2 | **La pregunta principal va primero**: "¿a quién saco?" | La pestaña por defecto del perfil es **Campeones** con el filtro de objetivos; las stats van en segundo plano | Hueco común en todas las referencias |
| P3 | **Victoria = 1º puesto, escrito en pantalla** | Etiqueta visible "1º" en vez de "Win"; top-3 y puesto medio como métricas aparte, con nombre propio | MS (métricas correctas); antipatrón LOL/OPGG |
| P4 | **Honestidad del dato** | Nº de partidas junto a cada %; aviso de muestra pequeña; origen verificado/manual visible; frescura visible; mejor no mostrar una cifra que mostrarla mal | LOL/MS (muestra), AS (frescura); antipatrón AS (datos incoherentes) |
| P5 | **Densidad controlada** | Densidad media: más aire que OPGG y más información que TR. Una sola columna de trabajo + raíl lateral opcional | Término medio MS/TR |
| P6 | **Cero ruido** | Sin anuncios, pop-ups, modales de bienvenida obligatorios ni gamificación ajena al objetivo | Antipatrón de todas salvo TR |
| P7 | **Todo enlazable** | Perfil, pestaña, vista, filtro y partida expandida viven en la URL | OPGG, LOL (`?view=`), MS (pestañas con URL) |
| P8 | **Reactivo** | Lo que se sincroniza aparece sin recargar: checklist, KPIs y compañeros se actualizan en vivo | Antipatrón TR |
| P9 | **Tema oscuro único en v1** | Tokens preparados para un tema claro, pero sin implementarlo | Todas las referencias son oscuras; uso junto al cliente de LoL (oscuro) |

---

## 2. Arquitectura de información

### Mapa de pantallas

```
/                                  Landing / búsqueda
│   └─ si hay "mi perfil" en el navegador → redirige a su URL (F5)
│      (?inicio fuerza la landing)
│
└─ /euw/{nombre}-{tag}             Perfil (URL pública, F5)
      ├─ ?tab=campeones   (por defecto)   Álbum / checklist
      │     ├─ ?vista=album | lista
      │     ├─ ?filtro=objetivos | sin-ganar | sin-jugar | ganados | todos
      │     └─ ?campeon={slug}        Panel de campeón (lateral / hoja)
      ├─ ?tab=resumen                  KPIs, distribución, forma, evolución
      ├─ ?tab=companeros               Tabla de compañeros
      └─ ?tab=partidas                 Historial
            └─ ?partida={matchId}      Partida expandida (inline)
```

- **Sin páginas de campeón propias.** La "vista de campeón" es un **panel** con las stats personales del jugador con ese campeón y los enlaces externos (F3: sin meta propio). Se aparta de LOL/MS/OPGG, que tienen páginas completas de meta.
- **El detalle de partida se expande inline** (OPGG/AS) con deep link `?partida=` (OPGG "Copy Link"). No es una página aparte.
- **En pantallas anchas (≥ 1100 px)**, Resumen y Compañeros **también** se ven en un raíl lateral junto al álbum (ver §3.2): la pantalla secundaria muestra todo a la vez sin cambiar de pestaña.
- **Ajustes locales** (exportar/importar, olvidar "mi perfil", limpiar marcas) en un menú del header, no en una pantalla (F6).

### Nombres de sección (UI en español)

Campeones · Resumen · Compañeros · Partidas. Métricas: **Partidas**, **1º** (victorias), **% 1º**, **Top 3**, **Puesto medio**.

---

## 3. Layout por pantalla

*Cifras de los wireframes: las del marcador vienen de lo observado en AS para el perfil de prueba; las de compañeros y campeones son ilustrativas.*

### 3.1 Landing / búsqueda (`/`)

Solo la ve quien no tiene "mi perfil" o entra con `?inicio`.

```
┌──────────────────────────────────────────────────────────┐
│ hylistats                                        [EUW]   │
│                                                          │
│        ¿Quién eres?                                      │
│        ┌──────────────────────────────────┬──────┐       │
│        │ Nombre#TAG                       │  Ir  │       │
│        └──────────────────────────────────┴──────┘       │
│        Victoria = 1º puesto · temporada actual de Arena  │
│                                                          │
│        [ Recientes | Favoritos ]                         │
│        ★ Hylimichi #EUW        hace 2 h            ✕     │
│          TheCIutch #EUW        ayer                ✕     │
└──────────────────────────────────────────────────────────┘
```

**Prioridad**:
1. Campo único `Nombre#TAG`, que acepta también `Nombre-TAG` y pegar la URL de OPGG. Región fija EUW como etiqueta estática (F10), sin selector: se aparta de OPGG, que sí lo tiene.
2. Recientes/Favoritos con estrella y ✕ (OPGG).
3. Una línea de definición (P3).

**Autocompletado** entre perfiles ya conocidos por el servidor (OPGG autocompleta con el rango). Aquí se muestra el nº de partidas sincronizadas o "nuevo".

Al entrar en un perfil que no es "mi perfil" y no existe "mi perfil" todavía, se muestra un aviso discreto con el botón **"Este soy yo"** (fija la landing directa).

### 3.2 Perfil — escritorio ancho (≥ 1100 px), disposición "cabina"

```
┌───────────────────────────────────────────────────────────────────────────┐
│ HEADER (pegajoso)                                                         │
│ [icono] BEJITO MAMBO #1991 ★ ◉mi perfil   Arena · Temporada actual  [⌕]   │
│         Última partida hace 12 min · comprobado hace 1 min  [↻ Actualizar]│
├───────────────────────────────────────────────────────────────────────────┤
│ BARRA DE PROGRESO ARENA GOD                                               │
│ ███████████████▓▓░░░░░░░░░   23 verificados + 2 manuales · oficial 27    │
│ ⓘ Faltan 2 por identificar  [Ver qué significa]                          │
├──────────────────────────────────────────────┬────────────────────────────┤
│ [Campeones] Resumen  Compañeros  Partidas    │ RAÍL (≥1100 px)            │
│                                              │ ┌ Marcador ──────────────┐ │
│ [⌕ Buscar campeón…]  Objetivos sin ganar ▾   │ │ 450   67    56 %   3,33│ │
│ Orden: estado ▾      Vista: ▦ álbum ☰ lista  │ │ part. 1º   top3  medio │ │
│                                              │ │ ▇▆▅▄▃▂ distribución    │ │
│ ── OBJETIVOS SIN GANAR (6) ─────────────────  │ └────────────────────────┘ │
│ [cromo][cromo][cromo][cromo][cromo][cromo]   │ ┌ Forma (20) ────────────┐ │
│                                              │ │ ①③⑤②④⑥①③③②⑤④②⑥③①… │ │
│ ── JUGADOS SIN GANAR (41) ──────────────────  │ └────────────────────────┘ │
│ [cromo][cromo][cromo]…                       │ ┌ Compañeros ────────────┐ │
│                                              │ │ Hylimichi  38p 18% 3,1 │ │
│ ── SIN JUGAR (103) ─────────────────────────  │ │ TheCIutch  22p 14% 3,4 │ │
│ …                                            │ │ zapas14     4p ⚠pocas  │ │
│ ── GANADOS (25) ────────────────────────────  │ └────────────────────────┘ │
└──────────────────────────────────────────────┴────────────────────────────┘
```

**Prioridad de bloques**:
1. **Header**: identidad, frescura y acción. Inspirado en OPGG (identidad + Update + Last updated) y AS (última partida sincronizada).
2. **Barra de progreso Arena God** con las 3 capas y el aviso de descuadre. Diseño propio: no tiene referente.
3. **Álbum** agrupado en bandas por estado con cabecera y contador (MS: bandas de tier). La banda "Objetivos sin ganar" solo aparece si hay objetivos, y va arriba (P2).
4. **Raíl**: marcador (MS: métricas; LOL: distribución), forma (OPGG/AS: tira de 20) y top de compañeros.

Con el raíl visible, las pestañas Resumen y Compañeros siguen existiendo para la versión completa: gráfica de evolución y tabla con todas las columnas.

### 3.3 Perfil — pestaña Resumen

```
┌ Marcador ───────────────────────────────────────────────────────────┐
│  PARTIDAS   1º          % 1º     TOP 3     PUESTO MEDIO             │
│   450       67          14,9 %   56 %      3,33                     │
│  Victoria = 1º puesto (de 6 equipos) ⓘ                              │
│  Distribución  1º ▇▇▇ 15 %  2º ▇▇▇ …  6º ▇ …   (barra apilada 1–6)  │
└─────────────────────────────────────────────────────────────────────┘
┌ Forma: últimas 20 ─────────────────────────────────────────────────┐
│ ① ③ ⑤ ② ④ ⑥ ① ③ ③ ② ⑤ ④ ② ⑥ ③ ① ② ④ ③ ①   (tooltip: campeón +   │
│                                              compañeros + hace X)  │
└────────────────────────────────────────────────────────────────────┘
┌ Evolución ─────────────────────────────────────────────────────────┐
│ Campeones ganados acumulados en la temporada (línea escalonada,     │
│ con el umbral del challenge como línea horizontal)                  │
│ + puesto medio móvil (últimas 10) como segunda serie opcional       │
└────────────────────────────────────────────────────────────────────┘
┌ Destacados (tipo TR) ──────────────────────────────────────────────┐
│ Ganados a la primera · Más intentados sin ganar · Mejor % 1º (3+)  │
│ (chips de campeón con nº de partidas; clic → panel de campeón)     │
└────────────────────────────────────────────────────────────────────┘
```

- La tira de **forma** reutiliza el patrón de OPGG/AS, con el número dentro del chip para no depender del color.
- La **evolución** principal es la curva hacia Arena God. Es la evolución que importa para el objetivo del grupo y ninguna referencia la tiene: AS muestra rating por día y LOL tendencias de meta. Ver decisión D4.
- Los **destacados** vienen de las Stats de TR y se muestran como chips que llevan al álbum filtrado.

### 3.4 Perfil — pestaña Compañeros

```
Mostrar: [≥3 partidas ▾]    Modo: [Por compañero | Por trío]   (trío = D5)
┌─────────────────────────────────────────────────────────────────────────┐
│ Compañero          Partidas  1º    % 1º    Top 3   Puesto medio  Última │
│ ★ Hylimichi #EUW   38        7     18 %    61 %    3,1           hoy    │
│   TheCIutch #EUW   22        3     14 %    55 %    3,4           ayer   │
│   zapas14 #EUW      4        1     25 %⚠   50 %    3,3⚠          hace 9d│
│ (sin compañero / cola 2v2 se indica con etiqueta de cola)               │
└─────────────────────────────────────────────────────────────────────────┘
```

- Columnas de MS (1º, Top 3, puesto medio, partidas). Contenido de TR (Riot ID, partidas, winrate).
- **⚠ Muestra pequeña** cuando hay menos de 5 partidas (umbral configurable en D6), con los valores en tono atenuado. Inspirado en el problema de muestras de MS/LOL.
- Cada compañero enlaza a **su perfil en hylistats** si existe (★ si está en favoritos). Es la navegación del grupo.
- **Diferenciación 2v2/3v3**: el historial puede mezclar colas (think.md). Por defecto se usa solo la temporada actual (tríos) y, si aparecen partidas 2v2, se muestran con una etiqueta de cola.
- **Orden por defecto**: partidas juntos (desc). Ordenable por cabecera (LOL/MS).

### 3.5 Perfil — pestaña Partidas + detalle

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Ahri]  ①  1º    Hylimichi · TheCIutch    22 min · hace 2 h  ★nuevo  │ ← fila
│ [Swain] ④  4º    Hylimichi · zapas14      19 min · hace 3 h      ▾   │
└──────────────────────────────────────────────────────────────────────┘
  ▾ expandida (?partida=EUW1_…)
  ┌ 1º Raptor ─────┐┌ 2º Poros ──────┐┌ 3º Sentinel ───┐
  │ ▓ TU EQUIPO ▓  ││ campeón · jug. ││ …              │   6 equipos × 3,
  │ Ahri   BEJITO… ││ …              ││                │   el propio siempre
  └────────────────┘└────────────────┘└────────────────┘   resaltado
  ┌ 4º Scuttles ───┐┌ 5º Krugs ──────┐┌ 6º minions ────┐
  └────────────────┘└────────────────┘└────────────────┘
  KDA, daño, oro por jugador · augments/items solo si hay datos · [Copiar enlace]
```

- **Fila compacta**: campeón, chip de puesto, compañeros de trío, duración y hace cuánto. Marca "★ nuevo" si fue el **primer 1º con ese campeón**, es decir, la partida que lo verifica en el álbum. Desde el álbum, un cromo verificado enlaza a esta partida (F7: "enlazados a su partida").
- **Expansión 6×3** (AS/OPGG), con el propio equipo resaltado aunque quede 5º o 6º (corrige a OPGG).
- **Augments/items ausentes → no se pintan** y aparece una línea "sin datos de augments" (antipatrón OPGG).
- Filtros: campeón (texto), puesto (solo 1º, top 3), compañero. Sin paginación infinita pesada: bloques de 50.

### 3.6 Panel de campeón (`?campeon={slug}`)

Hoja lateral en escritorio y hoja inferior en móvil. No es una página.

```
┌ AHRI ─────────────────────────────────────────── ✕ ┐
│ [retrato]  ESTADO: Ganado · verificado ✓            │
│            1º el 12 sep · [ver partida]             │
│ ◎ Objetivo  [ quitar ]                              │
│                                                     │
│ Tus partidas: 7 · 1º: 2 · Top 3: 57 % · medio: 2,9  │
│ Distribución: ▇▂▅▁▁▂ (1º…6º)                        │
│ Últimas: ① ④ ③ ② ① ⑥ ③                              │
│                                                     │
│ Builds y meta ↗  op.gg · lolalytics · metasrc ·     │
│                  u.gg · blitz                       │
│                                                     │
│ Marcar como ganado a mano…   (solo si no verificado)│
└─────────────────────────────────────────────────────┘
```

- Bloque de stats + distribución de puestos = patrón de hero de campeón de LOL/MS, **con datos del jugador**, no del meta.
- Los **enlaces externos se agrupan aquí** y no en la carta: se aparta de TR, que muestra 4 píldoras siempre visibles y ensucia la cuadrícula. En la carta se accede con clic derecho / menú "↗". Plantillas en §4.9.
- **Marcado manual** con confirmación ligera y texto explicativo (F7 capa 3). Desmarcar también se confirma.

---

## 4. Componentes clave

### 4.1 Header de perfil
Identidad (icono de invocador, `Nombre` + `#TAG` atenuado como en OPGG), ★ favorito, indicador **"mi perfil"** (o botón "Este soy yo"), etiqueta de temporada y buscador compacto (atajo `/`). A la derecha, frescura en dos líneas ("Última partida hace X" / "Comprobado hace Y") y botón **Actualizar** con progreso interno (OPGG).

Al terminar, **toast con resultado**: "+3 partidas · nuevo 1º con Ahri" o "Sin partidas nuevas". Corrige a OPGG.

### 4.2 Barra de progreso Arena God (3 capas)
- Barra segmentada: **dorado sólido** = verificados, **dorado rayado / azul acero discontinuo** = manuales, **marca vertical** = contador oficial, **meta** = umbral del challenge (dato de I1, no se escribe en el código).
- Texto: `23 verificados + 2 manuales · oficial 27 · objetivo T`.
- Tooltip `?` (AS) que explica las tres capas en dos frases.

### 4.3 Aviso de descuadre con el contador oficial
Tres estados, en el color de "fiabilidad" (azul acero). Nunca en rojo: no es un error del usuario.

| Caso | Mensaje | Acción |
|---|---|---|
| oficial = verificados + manuales | "Cuadra con el contador oficial" (icono check, discreto, sin banner) | — |
| oficial > verificados + manuales | "El contador oficial dice 27 y aquí hay 25. Faltan 2 campeones que el historial no muestra (partidas no devueltas por la API o no sincronizadas)." | [Sincronizar] [Marcar a mano] [Qué significa] |
| oficial < verificados | "Aquí hay más victorias verificadas (27) que en el contador oficial (25). Puede que el contador de Riot aún no se haya actualizado." | [Qué significa] |
| sin dato oficial | "No se pudo leer el contador oficial (hace X)." | [Reintentar] |

Sin referente en las webs analizadas; el diseño es propio. Cumple F4: "la app explica la diferencia".

### 4.4 Cromo de campeón (celda del álbum)
Retrato cuadrado (DDragon), nombre de visualización debajo (nunca `Velkoz`; antipatrón TR) y badges en las esquinas:

| Estado | Tratamiento del retrato | Badge | Dato secundario |
|---|---|---|---|
| **Ganado · verificado** | Color completo, borde dorado 2 px | Sello dorado "1º" (sup. dcha.) | Nº de 1º si > 1 |
| **Ganado · manual** | Color completo, borde **discontinuo azul acero** | Icono de lápiz | "manual" |
| **Jugado sin ganar** | Desaturado 60 %, brillo 70 % | — | "×4 · mejor 2º" (intentos + mejor puesto) |
| **Sin jugar** | Silueta muy atenuada (brillo 25 %) | — | — |
| **+ Objetivo** (ortogonal) | Anillo naranja señal | Chincheta/diana (sup. izq.) | — |

- Tamaño mínimo 72 px de retrato. Cuadrícula `auto-fill, minmax(84px, 1fr)`.
- Las **tres dimensiones** (estado, origen, objetivo) se distinguen **por forma, además de por color**: sello, lápiz, chincheta y saturación.
- Interacción: clic abre el panel; botón diana en hover/foco (atajo `o`) conmuta el objetivo sin abrir el panel; el menú "↗" lleva a los enlaces.
- Animación única con sentido: cuando llega un nuevo 1º durante la sincronización, el cromo pasa de gris a color con un "sellado" breve (300 ms) y se mueve a su banda. Es el momento de satisfacción del producto. Respeta `prefers-reduced-motion`.

### 4.5 Controles del álbum
- **Buscador** con foco automático al pulsar `/` o al empezar a escribir. Pensado para la selección de campeón: escribes "ahr" y ves el estado de Ahri a lo grande.
- **Filtro** (segmentado): Objetivos sin ganar · Sin ganar · Sin jugar · Ganados · Todos. Por defecto: **Objetivos sin ganar** si hay objetivos; si no, **Todos** agrupado por bandas.
- **Orden**: estado (bandas), alfabético, más intentados (TR "Most tried, never won"), mejor puesto, último jugado.
- **Vista**: Álbum (cuadrícula) / Lista (tabla densa con columnas partidas, 1º, top 3, medio, último). Es el patrón de vistas conmutables de LOL/MS guardado en `?vista=`.
- Filtro por clase de campeón (MS): **fuera de v1** salvo que sea trivial con los datos estáticos (D8).

### 4.6 Marcador (tarjeta resumen)
Cinco cifras en tipografía display: Partidas, 1º, % 1º, Top 3, Puesto medio. Leyenda fija "Victoria = 1º de 6 equipos" y barra apilada de distribución 1º…6º (LOL). Top-N fijo en 3 (D3).

### 4.7 Tira de forma
20 chips circulares con el número de puesto dentro: 1º oro, 2º-3º verde agua, 4º-6º pizarra. Tooltip con campeón, compañeros y hace cuánto; clic abre la partida. Patrón de OPGG/AS, con el número siempre visible por accesibilidad.

### 4.8 Tabla de compañeros
Ver §3.4. Muestra mínima configurable, ⚠ para muestras pequeñas y enlace al perfil del compañero en hylistats.

### 4.9 Enlaces externos por campeón
Plantillas (a verificar los slugs de casos límite; ver huecos en `reference-sites.md`):

- op.gg: `https://op.gg/lol/modes/arena/{slug}/build` [obs]
- LoLalytics: `https://lolalytics.com/lol/{slug}/arena/build/` [obs]
- METAsrc: `https://www.metasrc.com/lol/arena/champions/{slug}/build` [obs] (TR usa `/lol/arena/build/{slug}`)
- u.gg: `https://u.gg/lol/champions/arena/{slug}-arena-build` [obs vía TR]
- Blitz: `https://blitz.gg/lol/champions/{Nombre}/arena` [obs vía TR]

### 4.10 Progreso de sincronización
- **Backfill (primer acceso)**: banda bajo el header, "Descargando la temporada: 212 / 504 partidas · ~3 min". El álbum y el marcador **se van llenando en vivo** (TR hace N de M + ETA, pero sin reactividad). Se puede cerrar la pestaña y el proceso sigue en el servidor; al volver se ve el progreso. Se aparta de TR, que sincroniza en el cliente.
- **Incremental**: dentro del botón Actualizar (OPGG) + toast de resultado.
- **Cola compartida**: "En cola: posición 2 · empieza en ~1 min". La personal key es compartida (F9).

### 4.11 Selector de temporada (opcional, F8)
Chip en el header "Temporada actual ▾" → temporadas pasadas con `?temporada=`. Si se recorta de v1, el chip queda como etiqueta estática de contexto (patrón de chips de LOL).

### 4.12 Menú local (F6)
Exportar / Importar (JSON), olvidar "mi perfil", borrar objetivos y marcas. **Todo lo destructivo pide confirmación escribiendo o con doble paso** (antipatrón "Clear" de TR).

---

## 5. Estados

| Estado | Dónde | Tratamiento |
|---|---|---|
| **Vacío: jugador sin partidas de Arena esta temporada** | Perfil | Mensaje con el porqué ("No hay partidas de Arena desde el inicio de la temporada actual [fecha]") + qué hacer (jugar, o ver temporada pasada si existe D7). Nunca un "No matches" mudo (antipatrón OPGG) |
| **Vacío: sin objetivos** | Filtro "Objetivos sin ganar" | "Marca objetivos con ◎ en cualquier campeón para verlos aquí" + atajo al álbum completo |
| **Vacío: sin compañeros ≥ N partidas** | Compañeros | Indicar el umbral y ofrecer bajarlo |
| **Cargando backfill** | Perfil | Banda de progreso + datos parciales en vivo; cromos no procesados con esqueleto (AS no tiene esqueletos; se corrige) |
| **Cargando navegación** | Todas | Esqueletos del layout final; nunca spinner a pantalla completa (antipatrón OPGG al cambiar de cola) |
| **Riot ID no encontrado** | Landing | Error inline bajo el campo, sugiriendo revisar el `#TAG`; se mantiene lo escrito |
| **Error de la API de Riot** | Header | Los datos existentes se mantienen visibles + aviso "No se pudo actualizar (Riot no responde). Datos de hace X." + reintento |
| **Rate limit / cola** | Header / banda de sync | "Límite de peticiones alcanzado: la sincronización se reanuda sola en ~2 min". Lenguaje llano, sin códigos. Progreso congelado pero visible |
| **Arena fuera de rotación** | Header | Etiqueta "Arena no está disponible ahora mismo · última partida el X", para que no parezca un fallo de sincronización (think.md: Arena rota) |
| **Contador oficial no disponible** | Barra Arena God | Ver §4.3, fila "sin dato oficial" |
| **Datos incompletos** (augments, etc.) | Detalle de partida | Ocultar + "sin datos"; nunca iconos vacíos |
| **Perfil ajeno** | Perfil | Objetivos y marcas manuales **no se muestran** (son del navegador de su dueño, F6); solo datos verificados + oficial. Etiqueta "Viendo el perfil de X" |

---

## 6. Dirección visual

### 6.1 Paleta (tokens)

Fondo tinta cálida en lugar de negro puro (TR `#0a0a0a`) o carbón azulado (OPGG), para reducir el deslumbramiento junto al cliente. Texto hueso. Un solo acento caliente.

```css
:root {
  /* superficies */
  --bg:            #0F1013;  /* tinta */
  --surface-1:     #17191E;  /* tarjetas */
  --surface-2:     #20232A;  /* hover, raíl */
  --line:          #2C3038;
  /* texto */
  --text:          #ECE6D9;  /* hueso */
  --text-muted:    #A29D92;
  --text-faint:    #625E57;

  /* semántica de puesto (tira de forma, distribución, chips) */
  --place-1:       #E8B64C;  /* oro — 1º = victoria */
  --place-top:     #4FB3A3;  /* verde agua — 2º-3º */
  --place-low:     #5B616D;  /* pizarra — 4º-6º (neutro, no rojo) */

  /* estado del álbum */
  --won:           var(--place-1);
  --won-deep:      #8F6A1F;  /* sello, borde */
  --played:        #7C8088;  /* jugado sin ganar (retrato desaturado) */

  /* fiabilidad: manual, descuadre, info de datos */
  --trust:         #7FA3D1;  /* azul acero */
  --trust-bg:      #16202C;

  /* intención del usuario: objetivos */
  --target:        #FF7A45;  /* naranja señal — único acento caliente */

  /* sistema */
  --danger:        #E5534B;  /* solo errores reales */
  --ok:            #6CC08B;
}
```

**Reglas**:
- **Oro** solo significa 1º.
- **Naranja** solo significa objetivo.
- **Azul acero** solo significa "información sobre la fiabilidad del dato" (manual y descuadre comparten familia visual).
- **Rojo** solo para errores.
- 4º-6º en **pizarra neutra, no rojo**: en Arena el 83 % de las partidas no son 1º y teñirlas de rojo (OPGG/AS) llena la pantalla de alarma. Se aparta de OPGG/AS a propósito.
- **Contraste**: todos los textos ≥ 4,5:1 sobre `--surface-1`; el oro, el verde agua y la pizarra se distinguen también en luminancia, y los chips siempre llevan número.

### 6.2 Tipografía

- **Display / cifras**: **Big Shoulders Display** (600-800). Condensada, de rotulación de estadio: cifras grandes que caben en el raíl y se leen a distancia. Para KPIs, puestos, contador Arena God y cabeceras de banda.
- **Texto / UI**: **Atkinson Hyperlegible Next**. Diseñada para legibilidad con baja atención o baja visión, que es justo el uso de pantalla secundaria (P1). Para nombres de campeón, Riot IDs, tablas y mensajes.
- **Cifras en tablas**: `font-variant-numeric: tabular-nums` (verificar el soporte de la fuente; alternativa: IBM Plex Mono solo para columnas numéricas).
- **Escala**: 13 / 16 / 20 / 28 / 44 / 64 px. Cuerpo 16, KPIs 44-64.
- Se aparta de LOL (DIN condensada diminuta) y OPGG (sistema). No se usa Inter/Roboto.

### 6.3 Iconografía e imágenes

- **UI**: iconos de línea (familia tipo Lucide), 20 px, trazo 1,75. Glifos propios solo para las marcas del álbum: sello 1º, lápiz y chincheta/diana. Nunca candados ni blur (antipatrón AS).
- **Campeones**: **retrato cuadrado de Data Dragon** como elemento principal (LOL, OPGG, TR: *portrait-first*). **No se usan splash arts en la cuadrícula** (TR): pesan mucho con 173 cartas y recortan mal. Splash difuminado solo en el panel de campeón como fondo, con opacidad baja.
- **Icono de invocador** en el header y avatares pequeños en compañeros.
- **Textura**: grano sutil (ruido SVG al 3-4 %) sobre `--bg` para dar atmósfera sin distraer. Sin splash de fondo (LOL/AS).
- **Nombres de equipo** (Raptor, Poros…): se muestran en el detalle de partida como etiqueta secundaria (OPGG/AS); el dato principal es el puesto.

---

## 7. Responsive

Contextos reales:
- (a) monitor secundario completo 1920 px
- (b) media pantalla de 1920 = 960 px (lo más probable)
- (c) monitor vertical 1080 × 1920
- (d) portátil 1440 px
- (e) móvil entre partidas

| Ancho | Layout |
|---|---|
| **≥ 1600** | Cabina: álbum + raíl de 360 px; cuadrícula de 12-16 columnas |
| **1100-1599** | Cabina: álbum + raíl de 320 px |
| **640-1099** (media pantalla, vertical) | Una columna; pestañas arriba; el marcador se convierte en una **franja compacta** de 5 cifras bajo la barra Arena God, visible en todas las pestañas (patrón de franja de KPIs constante de MS) |
| **< 640** (móvil) | Header reducido (Riot ID + ↻), barra Arena God, pestañas como barra inferior, cromos de 64 px, panel de campeón como hoja inferior, tablas de compañeros como lista de tarjetas |

- Se usan **container queries** para el raíl y los cromos, porque la misma pantalla vive en anchos muy distintos.
- Todo es operable con teclado: `/` busca, `o` marca objetivo, `Esc` cierra el panel, flechas recorren el álbum.
- Sin scroll horizontal en ningún ancho (a diferencia de las franjas horizontales de iconos de LOL).

---

## 8. Decisiones abiertas para el supervisor

| ID | Qué se decide | Opciones | Recomendación | Descartado y por qué |
|---|---|---|---|---|
| **D1** | Pestaña/vista por defecto del perfil | Campeones con filtro "Objetivos sin ganar" / Resumen (como OPGG) | **Campeones**; "Objetivos sin ganar" si hay objetivos, si no "Todos" por bandas | Resumen primero: es lo que hace OPGG, pero no responde a "¿a quién saco?" (P2) |
| **D2** | Layout cabina con raíl en ≥ 1100 px | Raíl con marcador + forma + compañeros / solo pestañas | **Raíl**: en la pantalla secundaria evita cambiar de pestaña a mitad de partida | Solo pestañas: más simple, pero obliga a interactuar |
| **D3** | Top-N | Fijo en 3 / configurable (2-4) | **Fijo en 3**: coincide con MS/OPGG/AS y con la mitad alta de 6 equipos | Configurable: más UI y estado sin demanda demostrada ("solo lo pedido") |
| **D4** | Qué es "evolución" | Curva de campeones ganados acumulados + umbral / puesto medio móvil / ambas | **Curva de ganados acumulados** como principal; puesto medio móvil como segunda serie si cabe | Rating por día (AS): no hay rating en hylistats |
| **D5** | Estadística por **trío** (pareja de compañeros juntos) además de por compañero | Incluir como modo de la tabla / dejar para post-v1 | **Post-v1**, salvo que la Spec lo vea trivial. F3 pide "por compañero"; el trío es una expansión | Incluir ya: amplía el alcance |
| **D6** | Umbral de "muestra pequeña" | 3 / 5 / 10 partidas | **< 5** con ⚠ y valores atenuados; filtro por defecto ≥ 3 | 10: escondería a casi todos los compañeros esporádicos |
| **D7** | Selector de temporada (F8, recortable) | Implementar / etiqueta estática | **Etiqueta estática en v1**, con URL preparada (`?temporada=`) | Implementar: depende de I1/I2 (retención, coste de backfill) |
| **D8** | Filtro por clase de campeón (MS) | v1 / post-v1 | **Post-v1**, salvo que los datos estáticos lo den gratis | — |
| **D9** | Panel de campeón con stats personales o solo enlaces | Panel con stats + enlaces / menú de enlaces | **Panel con stats personales** (ya calculadas para el álbum; no es meta) | Solo enlaces: pierde "¿cómo me va con Ahri?" sin salir de la app |
| **D10** | Auto-refresco mientras la pestaña está abierta | Comprobar al enfocar + cada 5 min si visible / solo manual | **Al enfocar + cada 5 min visible**, sujeto al presupuesto de I2 | Solo manual: contradice el uso pasivo en la segunda pantalla. Continuo tipo AS: coste de API |
| **D11** | Tema claro | v1 / nunca / post-v1 | **Post-v1** (los tokens ya lo permiten) | v1: trabajo sin demanda |
| **D12** | Mostrar objetivos/marcas en perfiles ajenos | No (F6 lo implica) / sí, si el navegador tiene marcas sobre ese perfil | **No**: solo capa verificada + oficial para perfiles ajenos | Mostrar: confunde de quién es la marca |
| **D13** | Dirección visual "álbum del coliseo" (tinta + oro + naranja señal, Big Shoulders + Atkinson) | Aceptar / explorar alternativas en Claude Design | **Aceptar como base** y validar en Claude Design con 2 variantes de cromo | Estética *gaming* de AS/LOL: ruido y fatiga en la segunda pantalla |

---

## 9. Trazabilidad rápida (decisión → referencia)

| Decisión de diseño | Viene de | Se aparta de |
|---|---|---|
| URL `/euw/{nombre}-{tag}` + query | OPGG | AS (modal), TR (local) |
| Recientes/Favoritos + "mi perfil" | OPGG | — (OPGG no tiene "mi perfil") |
| Métricas 1º / Top 3 / medio / partidas | MS | LOL (Win = top-3), OPGG (Victory) |
| Distribución 1º…6º | LOL | MS (no la muestra) |
| Tira de forma de 20 | OPGG, AS | — (número dentro del chip, 4º-6º no rojo) |
| Álbum con estados + progreso N/total | TR | TR (2 estados, sin origen) |
| Bandas por estado con contador | MS (bandas de tier) | — |
| Aviso de descuadre y marcado manual | Propio | Ninguna referencia lo tiene |
| Compañeros con puesto medio + ⚠ muestra | TR (contenido), MS/LOL (honestidad) | AS (bloqueado), TR (sin puesto medio) |
| Detalle 6×3 con equipo propio siempre | AS, OPGG | OPGG (omite #5/#6) |
| Sync con N/M + ETA + incremental | TR | TR (cliente, no reactivo) |
| Progreso dentro de Actualizar + toast | OPGG | OPGG (sin confirmación) |
| Frescura en dos líneas | AS | OPGG (una línea poco fiable) |
| Enlaces externos en el panel | TR (plantillas) | TR (4 píldoras siempre visibles) |
| Retrato cuadrado, sin splash en cuadrícula | OPGG, LOL | TR (splash) |
| Sin anuncios, pop-ups ni gating | TR | LOL, MS, OPGG, AS |
