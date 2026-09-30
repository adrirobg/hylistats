# Verify Report: hylistats — iter-02 perfil y álbum de campeones
**Fecha**: 2026-09-30
**Consume**: commits de `feat/2-perfil-y-album` (T01–T10), AC1–AC8 de `.dev/spec.md` (issue [#2](https://github.com/adrirobg/hylistats/issues/2)), T11
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

Los ocho criterios de `spec.md`, contra la app real (`next build && next start` sobre la BD dev, dev key vigente) y con un **único re-backfill** de temporada de `BEJITO MAMBO#1991` lanzado con la UI abierta:

- spec.md AC1: `lint`, `typecheck`, `test` y `build` en verde, con tests de la capa de navegador y del parser de Riot ID; además, 0 fugas de key y de `puuid`.
- spec.md AC2: con "mi perfil" guardado, `/` redirige; sin él, landing; `?inicio` la fuerza.
- spec.md AC3: el álbum muestra los 4 estados y el objetivo; filtro, búsqueda, orden y vista en la URL.
- spec.md AC4: la barra Arena God y el aviso cubren los 4 casos de §4.3 (tests).
- spec.md AC5: durante un backfill, el álbum y el marcador se rellenan sin recargar.
- spec.md AC6: sin scroll horizontal a 375, 960, 1440 y 1920 px.
- spec.md AC7: colas 1750 y 1740 en backfill, incremental y stats; verificados = `602002` con aviso "Cuadra"; incremental sin partidas nuevas = 2 peticiones de ids y 0 de detalle.
- spec.md AC8: aceptación manual del supervisor. **Gate de merge**: no la puede cumplir el orquestador.
- Alcance, "accesibilidad": contraste AA, teclado y `prefers-reduced-motion`.

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), `next` 16.3.7, `vitest`, Biome 2.4.2.
- Postgres 17-alpine en `docker compose` (puerto 5433): BD `hylistats` (dev) para el E2E y `hylistats_test` para tests y para verificar T05–T10.
- `.env.local` sin `WORKER_ENABLED` ni `SEASON_START`, así que se usan los valores por defecto: worker activo y temporada desde `2026-05-12T00:00:00Z`. Key vigente en `settings` (fuente `db`). La key y los `puuid` solo se cargaron en variables del shell, nunca impresos: solo se imprimieron longitudes y recuentos.
- Navegador integrado del desktop app (Chromium), viewport emulado con `resize_window`.
- Log del servidor en el scratchpad de la sesión (`server-t11.log`) y respuestas HTTP guardadas en `http/`.

## Checks ejecutados <!-- MUST -->

```bash
# AC1 (tras el último cambio de código, el token --text-faint)
npm run lint && npm run typecheck && npm test && npm run build

# E2E
npm run db:migrate
npm run build
npm start > "$SCRATCH/server-t11.log" 2>&1 &
curl -s localhost:3000/api/health

# AC2/AC3/AC6 y accesibilidad: navegador integrado sobre http://localhost:3000 (resize_window 375/960/1440/1920)

# AC5 + AC7: perfil abierto a 1440 px, observador JS en la página (1 s) y después:
npm run sync:season -- "BEJITO MAMBO#1991"
# … y "Actualizar" pasado el cooldown (60 s)

# SQL independiente (psql en el contenedor, fichero en el scratchpad)
select m.queue_id, count(*), count(*) filter (where p.placement = 1),
       count(distinct p.champion_id) filter (where p.placement = 1)
from participants p join matches m using (match_id) join profiles pr on pr.puuid = p.puuid
where pr.riot_id_norm = 'bejito mambo#1991'
  and m.game_creation >= extract(epoch from timestamptz '2026-05-12T00:00:00Z') * 1000
group by rollup (m.queue_id);

# AC4
npx vitest run src/domain/arena-god.test.ts --reporter=verbose

# Fugas (key de settings y de .env.local, y puuid del perfil, en variables del shell)
grep -rlF -- "$V" .next/static | wc -l ; grep -rlF -- "$V" .next | wc -l
grep -rlF --exclude-dir={node_modules,.next,.git} --exclude=.env.local -- "$V" . | wc -l
git rev-list --all | xargs git grep -lF -- "$V" | wc -l
grep -lF -- "$V" "$SCRATCH"/http/*.txt "$SCRATCH"/*.log | wc -l

# Contraste: script en el scratchpad (fórmula WCAG 2.x sobre los tokens de globals.css)
python3 "$SCRATCH/contrast.py"
```

## Resultados observados <!-- MUST -->

### AC1 — PASS

- Tras el último cambio (`--text-faint`, ver Hallazgos):
  - Biome: 121 ficheros sin avisos.
  - `tsc --noEmit`: OK.
  - Tests: **36 ficheros, 623 tests** en verde.
  - `next build`: OK (`ƒ /euw/[slug]`, `ƒ /api/health`, `ƒ /admin`).
- Capa de navegador y parser de Riot ID cubiertos por `src/lib/local-store.test.ts` (sin storage, JSON corrupto, import/export, versión), `use-local-store.test.ts` y `riot-id.test.ts` (`parseRiotIdInput`).
- **Fugas**: 0 en todos los sitios revisados, para las tres variables (key de `settings`, key de `.env.local` y `puuid` del perfil; key de 42 caracteres y `puuid` de 78):

  | Dónde | Apariciones |
  |---|---|
  | `.next/static` | 0 |
  | `.next` completo | 0 |
  | Árbol de trabajo sin `.env.local`, `node_modules`, `.next` ni `.git` | 0 |
  | Historial git (todas las ramas) | 0 |
  | Log del servidor | 0 |
  | Respuestas HTTP de `/`, `/?inicio`, perfil (álbum y lista), `/admin`, `/api/health` y `/robots.txt` | 0 |

  - Cadenas con forma de `puuid` (78 caracteres) en esas respuestas: 0.
  - 200 `puuid` de compañeros (participantes) en `.next/static`: 0.
  - El único `RGAPI-` del árbol es la key falsa de ceros citada en `.dev/archive/iter-01/verify-report.md`.
  - Todas las respuestas llevan `X-Robots-Tag: noindex, nofollow`.

### AC2 — PASS

1. Con `localStorage` vacío, `/` muestra la landing: "¿Quién eres?", el buscador y "Aún no has visitado ningún perfil".
2. Al buscar "BEJITO MAMBO#1991" se navega a `/euw/BEJITO%20MAMBO-1991`.
3. "Este soy yo" guarda `{"myProfile":{"gameName":"BEJITO MAMBO","tagLine":"1991"}}` y el chip pasa a "Mi perfil".
4. Con eso, `/` redirige a `/euw/BEJITO%20MAMBO-1991`.
5. `/?inicio` muestra la landing con el acceso "Ir a mi perfil (BEJITO MAMBO#1991)" y el perfil en Recientes.

### AC3 — PASS

- **Marcas**: objetivos en Darius (sin jugar), Aatrox (jugado sin ganar) y Jinx (ganado verificado), más Ambessa marcada a mano (⋯ → "Marcar como ganado a mano…" → Marcar).
  - `localStorage`: `targets [122, 266, 222]`, `manual [799]`.
  - `aria-label` resultantes: "Darius, sin jugar, objetivo" · "Aatrox, jugado sin ganar, 2 partidas, mejor puesto 3º, objetivo" · "Jinx, ganado verificado, 1 primer puesto, objetivo" · "Ambessa, ganado a mano".
- **Captura** del álbum con los 4 estados y los objetivos:
  - bandas "Objetivos sin ganar", "Jugados sin ganar", "Sin jugar" (retratos atenuados) y "Ganados";
  - los verificados llevan sello de moneda y Ambessa un borde discontinuo con lápiz y la nota "manual";
  - Jinx lleva la diana naranja.
- **Por defecto**: con objetivos, la vista es "Objetivos sin ganar" (D1).
- **URL**: cada cambio queda reflejado.
  - Filtro "Sin ganar" → `?filtro=sin-ganar`.
  - Escribir "ja" → `?filtro=todos&q=ja`: al buscar con un filtro distinto de `todos` se pasa a `todos`, como la maqueta y T08. Salen Jarvan IV, Jax, Janna y Jayce.
  - Orden "Mejor puesto" → `&orden=mejor`.
  - Vista Lista → `?vista=lista&…`: tabla con Janna, Jayce, Jarvan IV y Jax.
- **Recarga** con `?filtro=todos&q=ja&orden=mejor&vista=lista`: se restauran el buscador ("ja"), el `select` (`mejor`), `aria-pressed` en "Todos" y "Lista" y la tabla con 4 filas.

### AC4 — PASS (tests) y un caso distinto de "Cuadra" en vivo

- `src/domain/arena-god.test.ts`: **31 tests en verde**. Cubren:
  - los 4 casos de §4.3: cuadra, faltan (con y sin marcas manuales), sobran (por verificados o por marcas) y sin dato oficial;
  - la escala, los textos en singular y plural y las acciones de cada caso.
- **En vivo**, con la marca manual de Ambessa tras el re-backfill: barra "78 de 60 · 77 verificados + 1 manual · oficial 77" y aviso "Tus marcas manuales (1) hacen que aquí haya más victorias (78) que en el contador oficial (77). Revísalas." con [Qué significa].
- **Antes del re-backfill**, el caso "faltan": "El contador oficial dice 77 y aquí hay 72. Faltan 5 campeones que el historial no muestra…", con [Sincronizar], [Marcar a mano] y [Qué significa].

### AC5 — PASS

- **Preparación**: perfil abierto a 1440 px. Un observador JS en la página registraba cada segundo el marcador, la banda, la barra y los cromos sellados (`li.stamp`), y una marca en `window` comprobaba que no había recarga.
- **Contexto previo**: la visita encoló el incremental automático, job 5: 2 peticiones de ids, 8 partidas 1750 nuevas jugadas desde ayer y `602002` subió a 77. Terminó antes de lanzar `sync:season` (job 6, 00:25:13 UTC).
- Secuencia observada **sin recargar**: la marca de `window` siguió intacta y hubo 0 navegaciones.

  | Hora (UTC) | Banda | Marcador (partidas · 1º · % 1º · top 3 · medio) | Barra | Sellados |
  |---|---|---|---|---|
  | 00:25:09 | — | 517 · 81 · 15,7% · 55% · 3,34 | 72 de 60 · oficial 77 | — |
  | 00:25:30 | "Descargando la temporada: 577 / 597 partidas · ~1 min" | 577 · 84 · 14,6% · 55% · 3,36 | 75 | Aphelios, Gnar, Jayce |
  | 00:25:33 | 589 / 597 | 589 · 85 · 14,4% · 54% · 3,37 | 76 | Malphite |
  | 00:25:36 | 590 / 597 | 590 · 85 · 14,4% · 54% · 3,36 | 76 | — |
  | 00:26:00 | 593 / 597 | 593 · 85 · 14,3% · 54% · 3,36 | 76 | — |
  | 00:26:04 | — (terminado) | **597 · 86 · 14,4% · 55% · 3,36** | **77 de 60 · 77 verificados · oficial 77** | Sona |

- **Capturas**: a 589/597 (banda, barra en 76, aviso "Falta 1 campeón" y marcador en 589) y al terminar ("Cuadra con el contador oficial.", marcador en 597).
- La banda apareció unos 17 s después de encolar el job, porque sin job activo el polling es de 30 s (ver Hallazgos). Con el job activo, el polling fue de 3 s.

### AC6 — PASS

`document.documentElement.scrollWidth === clientWidth` en las 8 combinaciones de página y ancho:

| Ancho | Landing (`/?inicio`) | Perfil `BEJITO MAMBO` |
|---|---|---|
| 375 | 375 = 375 | 375 = 375 (franja de 5 cifras en dos filas bajo la barra) |
| 960 | 960 = 960 | 960 = 960 (franja bajo la barra; raíl oculto; forma al final) |
| 1440 | 1440 = 1440 | 1440 = 1440 (raíl de 340 px) |
| 1920 | 1920 = 1920 | 1920 = 1920 (raíl de 340 px, ver Hallazgos) |

Hay capturas a 375, 960, 1440 y 1920. El raíl y la franja se verificaron también en T10 con la BD de tests (960 y 375 con una fila; 1440 con la distribución y los 11 chips).

### AC7 — PASS

- **Decisión del supervisor** (cambio de alcance, 2026-09-29, F14): la cola 1740 entra en backfill, incremental y stats. **La 1740 no es la temporada anterior**. Lo mostró un sondeo de iter-01/iter-02 (4 peticiones, 0 × 429):
  - 80 partidas 1740, del 19-jul al 23-sep de 2026, en los parches 16.14–16.19, los mismos que la 1750 en esas fechas;
  - ninguna de las dos colas tiene partidas anteriores a `SEASON_START`;
  - formato idéntico: `CHERRY`, `mapId` 30, `MATCHED_GAME`, 18 jugadores en 6 tríos y puestos 1–6;
  - los días de 1740 casi no hay 1750, así que son sesiones separadas;
  - qué distingue una cola de la otra no se sabe.
- **Re-backfill** (job 6, `backfill`, encolado por `npm run sync:season -- "BEJITO MAMBO#1991"`), según el log:
  - listado: "cola 1750 completa (517 ids)", luego la 1740, y "listado completo, 597 partidas en cola";
  - solo se descargaron las 80 que faltaban: "terminado (backfill, 597 partidas, 602002 = 77)".
- **SQL independiente** tras el re-backfill, desde `SEASON_START`:

  | Cola | Partidas | 1º | Campeones con 1º |
  |---|---|---|---|
  | 1740 | 80 | 5 | 5 |
  | 1750 | 517 | 81 | 72 |
  | **1750 ∪ 1740** | **597** | **86** | **77** |

  - `602002` = 77 (MASTER).
  - Los campeones con 1º **solo** en la 1740 son Sona (25-jul), Malphite (12-ago), Aphelios (2-sep), Gnar (16-sep) y Jayce (23-sep). Son exactamente los 5 previstos por el sondeo de iter-01 y los 5 cromos que se sellaron en vivo.
  - Rangos: 1740 del 19-jul al 23-sep (6 versiones); 1750 del 16-may al 29-sep.
  - Integridad: `matches` 597, `participants` 10 746 (= 18 × 597), `count(distinct match_id)` 597 y `match_fetch` 597 `done`.
- **Página**: "77 de 60 · 77 verificados + 0 manuales · oficial 77" y **"Cuadra con el contador oficial."** (captura).
- **Incremental sin partidas nuevas**: "Actualizar" pasado el cooldown (job 7). Log: "cola 1750 completa (1 ids)", "listado completo, 0 partidas en cola" y "terminado (incremental, 0 partidas, 602002 = 77)".

  | Momento | `matchIds` | `match` | `playerData` |
  |---|---|---|---|
  | Tras el incremental automático (job 5) | 2 | 8 | 1 |
  | Tras el re-backfill (job 6) | 9 (+7) | 88 (+80) | 2 (+1) |
  | Tras "Actualizar" sin partidas nuevas (job 7) | **11 (+2)** | **88 (+0)** | 3 (+1) |

  Da **1 petición de ids por cola (2) y 0 de detalle**. El `player-data` de cada sync refresca `602002`, por diseño (iter-01).

### Accesibilidad — PASS, tras un ajuste

- **Contraste** (WCAG 2.x, `contrast.py`) de los tokens de texto sobre `--bg` / `--surface-1`:

  | Token | Ratio | Resultado |
  |---|---|---|
  | `--text` | 15,30 / 14,14 | AA |
  | `--text-muted` | 7,04 / 6,51 | AA |
  | `--place-1` | 10,17 / 9,40 | AA |
  | `--place-top` | 7,53 / 6,96 | AA |
  | `--trust` | 7,30 / 6,75 | AA |
  | `--target` | 7,36 / 6,80 | AA |
  | `--ok` | 8,65 / 8,00 | AA |
  | `--danger` | 5,14 / 4,75 | AA |

  - Número de los chips de forma sobre su fondo: 1º 10,17, 2º–3º 7,53 y 4º–6º 5,00.
  - **`--text-faint` (#6e6a62, de la maqueta) daba 3,53 / 3,27, por debajo de AA**. Se usa en 22 sitios de texto secundario: tag del Riot ID, notas de las cajas, escalas y "sin jugar". Se subió a **#858179: 4,90 / 4,53**, el mínimo que cumple AA en los dos fondos con el mismo tono (ver Hallazgos).
  - `--played` no se usa como color de texto.
- **Teclado**, en el perfil:
  - `/` fuera de un campo enfoca el buscador sin escribir la barra.
  - Flechas: → pasa de Aatrox a Darius y ↓ baja a Aurora.
  - `o` pone y quita el objetivo sobre el cromo enfocado (`targets` +893 y −893) y el foco se queda en el cromo.
  - Enter en "Más acciones: Aurora" abre el menú con el foco en "Marcar como ganado a mano…". `Esc` lo cierra y devuelve el foco al ⋯.
  - Dentro del buscador, `Esc` tiene el comportamiento nativo de `type=search`: limpia y no saca el foco.
- **`prefers-reduced-motion`**: 3 bloques en `globals.css`, también presentes en el CSS del build.
  - Uno anula `animation`, `transition` y `scroll-behavior` en todo.
  - Otro anula el brillo `.shimmer`.
  - El sellado (`useStamped`) tampoco se anima con la preferencia activa (T09).

### AC8 — Gate de merge (aceptación manual del supervisor)

En una partida real de Arena, el supervisor elige campeón desde el álbum con el filtro "Objetivos sin ganar". El orquestador no puede cumplirlo. Se copia a la PR como checklist.

### Presupuesto Riot

Del proceso `next start` (`/api/health`):
- `matchIds` 11: 2 del incremental automático, 7 del re-backfill (6 páginas de la 1750 y 1 de la 1740) y 2 de "Actualizar";
- `match` 88: 8 partidas nuevas de la 1750 y 80 de la 1740;
- `playerData` 3;
- `account` 0 y `validate` 0;
- **0 × 429, 0 reintentos**.

Total: 102 peticiones. Es un único re-backfill, que solo descarga lo que falta, así que no es un segundo backfill completo.

## Juicio de coherencia y sentido <!-- MUST -->

- **Canon ↔ instancias**:
  - Los ocho AC de #2 / `spec.md` tienen evidencia directa: AC4 por test, como fija la spec, más un caso en vivo; AC8 como gate.
  - T01–T10 cubren los entregables, y las Evidencias de cada `task_*.md` cuadran con lo observado aquí. Por ejemplo, T01 preveía "solo descarga lo que falta" y T10 "sube en vivo con `AutoRefresh`", y así fue.
  - Se respetan F1–F14 y D1–D13: D1 (objetivos por defecto), D2 (raíl ≥ 1100 px) y D3 (Top 3 fijo). La 1740 entra por F14.
- **Sentido en el dominio**:
  - El re-backfill no es un ajuste a posteriori. Predijo antes de ejecutarse las 80 partidas y los 5 campeones concretos (el sondeo de iter-01 los nombró), y así fue.
  - Además, `602002` subió de 75 a 77 por dos 1º nuevos en la 1750 jugados el 29-sep (72 = 70 + 2), y el recuento propio lo sigue al día: 72 + 5 = 77.
  - 14,4 % de 1º (azar en 6 equipos: 16,7 %) y un puesto medio de 3,36 (azar: 3,5) son verosímiles para un jugador frecuente.
  - La forma, con 20 chips y la más reciente a la izquierda, refleja las 8 partidas de ayer.
- **Mismatch spec ↔ código**: la spec pide "contraste AA" en su Alcance y el token de la maqueta no lo cumplía. Se corrigió el valor del token (mismo tono, dentro del alcance) y no la jerarquía visual: `faint` sigue por debajo de `muted` (7,04).

## Revision de calidad del codigo <!-- SHOULD -->

Pasada sobre el diff de la iteración (68 ficheros de `src/`, unas 10 000 líneas añadidas, más de la mitad tests):

- **Deuda de iter-01 saldada**:
  - `formatDate` duplicado desaparece: `src/lib/format.ts` es el único sitio de formato `es-ES`.
  - `normalizeRiotId` vive en `src/lib/riot-id.ts`.
- **Feature envy / sitio del dato** (menor): `TONE_BG`, el mapa de familia de puesto a clase de fondo, se exporta desde el componente `scoreboard.tsx` y lo importa `form-strip.tsx`. Encajaría junto a `placeTone` o en un módulo de tokens de puesto.
- **Large class** (vigilar): `album.tsx` (513 líneas) mezcla controles, bandas, teclado y foco. La lógica pura ya está fuera (`album-view.ts`, `album-interaction.ts`, probadas); si #3 añade más interacción, conviene partir los controles.
- **Duplicated DOM (deliberado)**: el marcador existe dos veces, en el raíl y en la franja, siempre uno con `display: none`. Es más simple que reubicarlo con JS, y como está oculto no hay doble lectura en lectores de pantalla.
- Sin generalidad especulativa, middle man ni cadenas de mensajes relevantes. Las fronteras de datos siguen con listas blancas (`ProfileView` sin `puuid`; `form` es `RecentGame` sin `puuid`).

## Replay / validacion independiente <!-- SHOULD -->

- **Aplica al riesgo principal** (AC7: cuadrar con un contador oficial opaco). El SQL independiente recuenta sobre la BD, fuera del pipeline de stats de la app, y se cruza con la predicción previa del sondeo de iter-01, hecho contra Riot con un script aparte: 80 partidas y los 5 campeones nombrados. Dos fuentes independientes coinciden.
- **AC5** se observó con un observador en la propia página, que anota el DOM cada segundo, en lugar de con capturas sueltas. Descarta que la página se hubiera recargado y fecha cada transición.
- **No aplica** un replay completo por otro actor: sería un segundo backfill completo, y el presupuesto de la spec lo prohíbe. La integridad (18 × partidas, `match_fetch` único, sin duplicados) se comprobó por SQL.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| `--text-faint` (#6e6a62, de la maqueta) daba 3,53:1 sobre `--bg`, por debajo del AA que pide la spec, en 22 textos secundarios | resuelto | N/A | Token a `#858179` (4,90:1 / 4,53:1) en `src/app/globals.css`, commit `fix(ui)`. Checks en verde tras el cambio |
| Payload RSC del perfil: 83 kB (14,6 kB gzip) en cada `router.refresh()` (cada 30 s sin job y cada 3 s con job). Cada refresco repite además el prefetch de `/?inicio` (5,4 kB) | diferido | Orquestador | Mejora post-v1 (hilo "Pulido UI"): reconstruir `portraitUrl` en cliente y no prefetch del logo. `learn.md` → Deuda |
| Un job lanzado fuera de la página (CLI) se ve con hasta 30 s de retraso (polling de la BD propia sin job activo); aquí, 17 s | diferido | Supervisor | Aceptable para el prototipo: el caso normal (Actualizar o visita) pasa a 3 s al instante. `learn.md` |
| Raíl de 380 px (≥ 1500 px de contenedor) inalcanzable: el contenedor raíz mide 1480 px y a 1920 el raíl mide 340 (T06) | diferido | Supervisor | Hilo "Pulido y mejora de la UI base" de `think.md` |
| Desviaciones menores de la maqueta: "Qué significa" abre un panel en línea en vez de un toast (T07); rejilla móvil `minmax(64px,1fr)` y lista compacta < 640 px (T08); "1º" y "% 1º" en oro, y cifras del raíl en `flex` en vez de 5 columnas iguales para que quepan en 340 px (T10) | diferido | Supervisor | Hilo "Pulido UI". Decisiones conscientes de prototipo ("no sobrediseñar") |
| Foco: si un cromo sale de la vista al conmutar, el foco cae en `body`; unas 3 paradas de Tab por cromo, sin roving tabindex (T09) | diferido | Orquestador | Mejora de accesibilidad post-v1. `learn.md` → Deuda |
| La franja < 1100 px solo lleva las 5 cifras: la barra 1º–6º solo existe en el raíl (T10, como pide la task) | diferido | Supervisor | Hilo "Pulido UI" |

## Conclusion <!-- MUST -->

**PASS**

- **AC1**: checks en verde (623 tests) y 0 fugas.
- **AC2**: redirección y `?inicio`.
- **AC3**: 4 estados, objetivos y URL restaurable.
- **AC4**: 31 tests y un caso "sobran por marcas" en vivo.
- **AC5**: marcador, barra y sellos subiendo en vivo sin recargar.
- **AC6**: 8 de 8 sin scroll horizontal.
- **AC7**: re-backfill 1750 ∪ 1740 → 77 = `602002`, "Cuadra", e incremental con 2 peticiones de ids y 0 de detalle.
- **Accesibilidad**: AA tras subir `--text-faint`.
- **AC8** queda como gate de merge: aceptación manual del supervisor en una partida real.
