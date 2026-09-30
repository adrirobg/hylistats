# Task T05 — Pestaña Partidas: filas, "nuevo 1º", filtros, bloques de 50 y detalle 6×3

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La pestaña Partidas (§3.5) lista las partidas de la temporada en filas compactas:
- cada fila lleva campeón, chip de puesto, compañeros de trío, duración y hace cuánto;
- "★ nuevo 1º" en la partida que verifica al campeón (su primer 1º);
- filtros por campeón (texto), puesto (1º o top 3) y compañero, en bloques de 50.

`?partida={matchId}` expande esa partida inline con el detalle 6×3: el propio equipo siempre resaltado, KDA, daño y oro, y augments e items solo si hay datos. La tira de forma y el cromo verificado enlazan a su partida.

## Contexto <!-- SHOULD -->

- spec.md:
  - Entregable 5 y AC2;
  - "Decisiones técnicas" → "URL": `?q` (campeón), `?puesto=1|top3`, `?companero={Nombre-TAG}` (nunca `puuid`), `?n` (bloques de 50) y `?partida`;
  - "Carga bajo demanda": el detalle (18 participantes) solo con `?partida`.
- Brief:
  - §3.5 (maqueta de fila y del 6×3; "sin datos de augments" en una línea; [Copiar enlace]);
  - §4.7 (chip de forma: clic abre la partida);
  - §5 ("Datos incompletos" → ocultar + "sin datos", nunca iconos vacíos);
  - F7 (cromo verificado "enlazado a su partida").
- BD (`src/db/schema.ts` l. 83–133):
  - `matches`: `gameCreation`, `gameDuration` (s) y `queueId`;
  - `participants`: `riotIdGameName`, `riotIdTagline`, `championId`, `championName`, `placement`, `playerSubteamId`, `augments int[]` (0 = vacío), `items int[]` (item0..item6, item6 = amuleto; 0 = vacío), `kills`, `deaths`, `assists`, `totalDamageDealtToChampions`, `goldEarned` y `champLevel`.

  No hace falta migración.
- Dominio:
  - `getPlayerRows` y `getTeammateRows` (`src/domain/queries.ts`) acotan a temporada y colas (`ARENA_QUEUE_IDS`, `gameCreation >= seasonStart`). El primer 1º de cada campeón es `AlbumEntry.firstWinMatchId` (`src/domain/album.ts`) o `verifiedChampions` (`stats.ts`).
  - `puuid` es interno: nunca a la UI, URLs ni HTML. Identifica al propio jugador comparando en el servidor, y a la UI solo le pasas `isSelf`/`isOwnTeam`.
- Andamiaje (T03): `loadProfilePage(db, …, view)`, `ProfileView.matches?` y `tabHref`. Compañeros (T04): `profileSlug`.
- Colores de puesto:
  - `placeTone` está en `src/domain/scoreboard.ts` y `TONE_BG` en `src/app/euw/[slug]/scoreboard.tsx` (lo importa `form-strip.tsx`);
  - **mueve `TONE_BG` junto a `placeTone`** a un módulo sin JSX (p. ej. `src/domain/place-tone.ts`, o déjalo en `scoreboard.ts`) y actualiza los imports (deuda de iter-02);
  - chip: 1º oro, 2º–3º verde agua, 4º–6º pizarra, nunca rojo.
- Retratos: el catálogo (`AlbumEntry.portraitUrl`/`name` por `championId`). Augments e items: iconos de CommunityDragon o Data Dragon si ya hay utilidad. Si no, **números no**: muestra el recuento ("4 augments · 6 objetos") o nada. No añadas llamadas de red nuevas en tests.
- Avisos de UI: `text-muted-foreground`/`text-faint` (no `text-muted`), `tabular-nums` fuera de `font-display`, contraste ≥ 4,5:1, container queries de `Cabin` y sin scroll horizontal a 375 px. `!important` exige `biome-ignore`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Consultas** (`src/domain/queries.ts` o `src/domain/matches.ts` + tests contra `hylistats_test` con `tests/helpers/matches.ts`):
   - `getMatchList(db, puuid, seasonStart, { q, puesto, companero, limit })`: partidas del jugador, la más reciente primero. Cada una con `matchId`, `gameCreation`, `gameDuration`, `championId`, `championName`, `placement`, los 2 compañeros de trío (`gameName`, `tagLine`) y `total` (recuento con filtros) para "Mostrar 50 más".
     - `q` casa con el nombre (sin acentos ni mayúsculas) contra el nombre de visualización o el `championName`. Se puede resolver pasando al SQL la lista de `championId` que casan en el catálogo.
     - `puesto=1` o `top3`. `companero` = Riot ID normalizado (`normalizeRiotId`) de un compañero del mismo subteam.
   - `getMatchDetail(db, puuid, matchId, seasonStart)`: `null` si la partida no es del jugador o está fuera de temporada o cola. Devuelve los 6 equipos ordenados por puesto, con 3 participantes cada uno: nombre, tag, campeón, K/D/A, daño, oro, nivel, augments ≠ 0 e items ≠ 0. `isOwnTeam` marca el propio equipo y `isSelf` al jugador.
2. **Carga**: con `tab === "partidas"`, `loadProfilePage` rellena `matches: { rows, total, limit }`, con `limit = 50 × n` (tope razonable, p. ej. 500), y `matchDetail` si hay `?partida` válido. Sin `puuid` en nada. Tests en `data.test.ts`.
3. **"Nuevo 1º"**: la fila cuyo `matchId` es el `firstWinMatchId` de su campeón lleva "★ nuevo 1º" (texto, no solo icono).
4. **UI** (`matches-panel.tsx` y `match-detail.tsx`):
   - Filtros en la URL: texto de campeón con debounce, como el álbum, segmentado "Todos · 1º · Top 3" y selector de compañero con los compañeros con ≥ 3 partidas (`?companero`).
   - Filas como enlaces que conmutan `?partida` (expandir y contraer) sin scroll. `aria-expanded`.
   - Detalle 6×3 en rejilla (3 columnas; 2 por debajo de 960 px; 1 por debajo de 640 px), con cabecera "1º", "2º"… y el tono del puesto. El propio equipo resaltado aunque quede 5º o 6º.
   - Si todos los augments o items están vacíos, "sin datos de augments" / "sin datos de objetos" en una línea.
   - [Copiar enlace] (`navigator.clipboard` con la URL absoluta del perfil + `?tab=partidas&partida=…`) con toast (`useToast`, `src/components/hy/toast.tsx`).
   - "Mostrar 50 más" incrementa `?n`. Vacío con filtros: "Ninguna partida con estos filtros" + "Quitar filtros".
5. **Enlaces a la partida**:
   - Los chips de `FormStrip` pasan a ser enlaces a `?tab=partidas&partida={matchId}` (vía `tabHref`), con el mismo `aria-label` más "· abrir partida".
   - En el cromo verificado, añade "Ver partida" al menú/tooltip del cromo, o como enlace en la vista lista, hacia su `firstWinMatchId`. Elige lo menos invasivo y no rompas la interacción de T09 de iter-02 (flechas, `o`, menú ⋯).
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si arrancas un servidor: `WORKER_ENABLED=false`, solo la BD de tests, y lo paras al terminar.

## Criterios de aceptacion <!-- MUST -->

- [x] Filas con campeón, chip de puesto, compañeros, duración y hace cuánto; "★ nuevo 1º" en el primer 1º de cada campeón.
- [x] Filtros `?q`, `?puesto` y `?companero` y bloques de 50 (`?n`) en la URL, con total y vacío con filtros.
- [x] `?partida=` abre por URL directa el detalle 6×3 con el propio equipo resaltado; augments e items ausentes no se pintan ("sin datos").
- [x] Forma y cromo verificado enlazan a su partida; `TONE_BG` junto a `placeTone`.
- [x] Sin `puuid` en HTML ni URL (test de `data.test.ts`); consultas probadas contra `hylistats_test`; los cuatro checks en verde.
- [x] (Orquestador) Sin scroll horizontal a 375, 960 y 1440 px con una partida expandida.

## Notas de implementacion <!-- MAY -->

- **Dominio** (`src/domain/matches.ts`):
  - `getMatchList(db, puuid, seasonStart, { championIds?, puesto?, companero?, limit })` devuelve `{ rows (con trio), total }`; el total sale de `count(*) over ()`.
  - `getMatchDetail` devuelve los 6 equipos por puesto con `isOwnTeam`/`isSelf`.
  - `getProfileMatches` resuelve el `puuid` dentro, así que `data.ts` sigue sin leerlo.
  - El filtro de compañero casa por el `puuid` del Riot ID, igual que la pestaña Compañeros, e incluye las partidas de antes de un cambio de nombre.
- **Datos estáticos** (`src/lib/game-data.ts`, server-only): objetos de DDragon `item.json` (es_ES) y augments de CDragon `cherry-augments.json` (es_es). Caché de 24 h y nunca lanza. Solo se pide con `?tab=partidas&partida=`.
- **Vista**:
  - `matches-view.ts` (puro, 43 tests), `matches-panel.tsx`, `match-detail.tsx` y `match-parts.tsx`.
  - `?q` se resuelve a `championIds` con el plegado del álbum.
  - Cambiar un filtro pone `n` a 1 y cierra la partida.
  - Si `?partida` no está en la lista (otro filtro o fuera del bloque), se pinta aparte encima con una nota.
  - `?n` va de 1 a 10 bloques (500 como máximo).
- **Colores de puesto**: `TONE_BG` y `CHIP_TEXT` pasan a `src/domain/scoreboard.ts`, junto a `placeTone` (deuda de iter-02).
- **Enlaces a la partida**:
  - Los chips de la forma son `Link` a `?tab=partidas&partida=…`, con URL limpia que no conserva `?campeon`.
  - Cromo verificado: el sello "1º" enlaza a `firstWinMatchId`. En la vista lista sale "Ganado · ver partida".
- **Payload**: 50 filas añaden unos 12–15 kB al RSC de la pestaña Partidas.

## Evidencias <!-- MUST -->

- **Checks (orquestador)**:
  - `npm run lint`: OK, 141 ficheros;
  - `npm run typecheck`: OK;
  - `npm test`: 41 ficheros y 792 tests en verde (+99);
  - `npm run build`: OK.
- **Navegador integrado** (orquestador, `hylistats-testdb`, semilla `synced 30000`):
  - `/euw/Jugador%20Uno-EUW?tab=partidas&partida=EUW1_DEMO_FIRST` por URL directa:
    - 11 filas;
    - la expandida es "Blitzcrank ★ nuevo 1º · con Player115 · Player013 · 23 min · hace 20 min";
    - 6×3 con "1º · tu equipo" resaltado en oro;
    - K/D/A, nivel, daño y oro por jugador, e iconos de augments y objetos (DDragon y CDragon);
    - "Copiar enlace" presente;
    - sin `anon-puuid` en el HTML.
  - Sin scroll horizontal con la partida abierta: `scrollWidth` ≤ `innerWidth` a 1440, 960 y 375 px.
  - Forma: 11 chips `a` con `href` `?tab=partidas&partida=…` y `aria-label` "Blitzcrank · 1º · hace 20 min · abrir partida".
- **Commit**: ver `git log` (`feat(ui): pestaña Partidas con filtros, nuevo 1º y detalle 6×3`).
