---
name: riot-api
description: Usar cuando haya que llamar a la Riot API, leer partidas de Arena (Match-V5), el challenge 602002 o datos estáticos (Data Dragon, CommunityDragon) en hylistats. Contiene routing EUW, queueIds, campos Arena, rate limits y reglas de la API.
disable-model-invocation: false
allowed-tools: Read Bash Grep
---

# Riot API en hylistats

Detalle, evidencia y fuentes: `.dev/research/riot-api.md` (verificado 2026-09-29 contra la API real). Etiquetas: **V** = verificado, **D** = documentado, **I** = inferido.

## Autenticación (sin filtrar la key)
- Key en `.env.local` (`RIOT_API_KEY`, ignorado por git). Solo lectura en shell así:
  `KEY=$(sed -n 's/^RIOT_API_KEY=//p' .env.local)` y `curl -s -H "X-Riot-Token: $KEY" URL`.
- **Nunca** imprimir, loguear, escribir en ficheros/docs ni pasar la key por query string. No usar `curl -v` ni `set -x`.
- La key solo en servidor, jamás en frontend. HTTPS siempre.
- Los **PUUID están cifrados por proyecto/key** (D): tras cambiar de dev key a Personal key, re-resolver puuids desde el Riot ID. Guardar Riot ID como identidad y puuid como caché.

## Routing EUW (V)
| Host | APIs |
|---|---|
| `https://europe.api.riotgames.com` (regional) | Account-V1, Match-V5 |
| `https://euw1.api.riotgames.com` (plataforma) | Summoner-V4, Challenges-V1 |

Los contadores de rate limit son independientes por host.

## Endpoints usados
- Riot ID → puuid: `GET europe/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` (codificar espacios `%20`). Devuelve `puuid, gameName, tagLine`.
- Icono/nivel: `GET euw1/lol/summoner/v4/summoners/by-puuid/{puuid}` → solo `puuid, profileIconId, revisionDate, summonerLevel` (ya no hay `id`/`name`).
- Ids: `GET europe/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={1750|1740}&start=0&count=100[&startTime=&endTime=]` (una petición por cola; `queue` admite un solo valor).
  `count` 0–100 (101 → 400); más reciente primero; `start` fuera de rango → `[]`; `startTime/endTime` en **segundos** epoch; `type=normal` incluye Arena (no sirve para filtrar Arena, usar `queue`).
- Detalle: `GET europe/lol/match/v5/matches/{matchId}` (id `EUW1_<n>`). 404 = no existe o expirado (`match file not found`): no reintentar.
- Challenges: `GET euw1/lol/challenges/v1/player-data/{puuid}` (≈41 KB) y `…/challenges/602002/config`.

## queueIds de Arena
- **1750** = Arena actual, tríos (6 equipos × 3, 18 participantes), `gameMode "CHERRY"`, `mapId 30` (V). **No está en `queues.json` oficial**: no depender de él.
- **1740** = también Arena tríos de la temporada actual (V, 2026-09-29): mismo formato (`CHERRY`, `mapId 30`, `MATCHED_GAME`, 6×3, puestos 1–6) y mismos parches que la 1750, jugada en sesiones separadas. **Cuenta para `602002`**. Qué distingue una cola de otra: no se sabe. Tampoco está en `queues.json`. Ver `.dev/archive/iter-01/verify-report.md` § AC4 y F14 en `think.md`.
- **1700 / 1710** = Arena antigua, "Arena" en `queues.json` (1710 "16 player lobby") (D). Sin partidas de ese tipo en los historiales probados; asignación 1700=4 equipos / 1710=8 equipos **no verificada**.
- Backfill y sync: listar **las dos colas**, 1750 y 1740 (`ARENA_QUEUE_IDS` en `src/lib/config.ts`). Tríos empiezan con el patch 26.10 (mayo 2026, `gameVersion` 16.10; fuentes discrepan 12/13-may) (D/V).

## Leer los campos Arena (participante)
- `placement` (1..6) = puesto del equipo; `subteamPlacement` es igual (V). **1º puesto = `placement === 1`**.
- **`win` NO es 1º**: `true` para placement 1–3, `false` para 4–6 (V). No usarlo para winrate de 1º.
- **Compañeros** = mismos `playerSubteamId` (1..6, etiqueta arbitraria, no orden de puesto); siempre 2 compañeros (V). `teamId` solo separa mitades (100 = puestos 1–3, 200 = 4–6). **No usar `info.teams[]`** (trae `teamId` 100 y 0, nada útil).
- `championId` numérico (usar para mapear), `championName` puede diferir del id de Data Dragon (`FiddleSticks` ↔ `Fiddlesticks`).
- `playerAugment1..6`: ids de augment; `0` = vacío; suelen ser 4 (1–6 observado).
- `item0..item5`, `item6` (amuleto); ids `2xxxxx`/`4xxxxx` son variantes de Arena (existen en `item.json` de DDragon, V en 16.19.1).
- Identidad: `puuid`, `riotIdGameName`, `riotIdTagline` (`summonerName` viene vacío).
- `gameDuration` en segundos; `gameCreation/gameStartTimestamp/gameEndTimestamp` en ms.
- Snippet de referencia: sección 5.5 del informe. Si aparecen `endOfGameResult` ≠ `GameComplete`, `wasAfk`, remakes o empates, decidir su tratamiento explícitamente (no observados aún).

## Challenge 602002 "Adapt to All Situations" (Arena God)
- `player-data` → `challenges[].challengeId == 602002` → `value` (float), `level`, `percentile`, `achievedTime` (ms). Muestra de prueba: `value 75.0`, MASTER (V), = lo que dice el supervisor.
- Umbrales: Iron 3, Bronze 6, Silver 12, Gold 20, Platinum 32, Diamond 45, Master 60 (V). `config` **no trae fechas ni temporada** (`state`, `leaderboard`, `thresholds`): la API no dice cuándo empieza/acaba/reinicia la temporada.
- `achievedTime` coincide con el `gameCreation` de una partida en 1º (V; con 1750 ∪ 1740, el paso a MASTER cae en el campeón nº 60 de la unión). Significado exacto (último cambio de nivel vs. último incremento): abierto.
- Uso previsto: **control**, no fuente de verdad. Comparar con `distinct(championId | placement==1, queue ∈ {1750, 1740}, desde inicio de temporada)`. Guardar snapshots `(fecha, value)`: una bajada indica reinicio (I). Comparación ejecutada en iter-01 (V): solo 1750 da 70; 1750 ∪ 1740 da 75 = `value`.
- `602001` "Arena Champion Ocean" = campeones **jugados** (jugador de prueba: 133); alcance temporal no verificado.

## Datos estáticos (sin key, sin límite de Riot)
- Data Dragon: versión en `https://ddragon.leagueoflegends.com/api/versions.json` (hoy `16.19.1`); campeones `…/cdn/{ver}/data/{locale}/champion.json` (173; `data[x].key` numérico = `championId`); iconos `…/cdn/{ver}/img/champion/{id}.png`; ítems `…/data/{locale}/item.json`. Mapear por `key`, no por nombre.
- Augments (CommunityDragon, **no oficial**, cachear):
  - Catálogo completo (usar este): `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json` (array `{id, augmentNameId, nameTRA, augmentSmallIconPath, rarity kSilver|kGold|kPrismatic}`; cubre 205/205 ids vistos; mezcla Arena y ARAM Mayhem). Icono: `augmentSmallIconPath` en **minúsculas**, quitando `/lol-game-data/assets/` y prefijando `…/global/default/assets/` (p. ej. `…/default/assets/ux/cherry/augments/icons/adapt_small.png`).
  - `…/cdragon/arena/en_us.json` (`{augments:[{id,name,desc,rarity,iconSmall…}]}`) trae descripciones pero **le faltan 36/205 ids** actuales. Icono: `https://raw.communitydragon.org/latest/game/` + `iconSmall`.
- Mapeo: `playerAugmentN` → `byId[id]`. Si un id no existe, degradar a "augment #id" sin romper.

## Rate limits y buenas prácticas
- Personal key: **20 req/s y 100 req/2 min** (cabecera observada `X-App-Rate-Limit: 100:120,20:1`), por host. Gobierna el de 100/2 min; los de método (Match-V5 `2000:10`, Account `1000:60`, Summoner `2000:60`, Challenges `20000:10`) no son el cuello.
- Backfill de N partidas ≈ ceil(N/100) + N peticiones (504 partidas ≈ 510 ≈ 10 min). Prever cola con limitador propio, reanudable.
- Leer `X-App-Rate-Limit-Count` y frenar antes de llegar al tope. **429** (D): esperar `Retry-After` segundos (cabecera `X-Rate-Limit-Type` indica cuál); no reintentar en bucle. 5xx: backoff exponencial con tope.
- **Las partidas son inmutables**: cachear el JSON (o los campos derivados) por `matchId`; no volver a descargar una partida ya guardada; una partida compartida entre amigos se descarga una sola vez (dedupe por `matchId`).
- Sync incremental: `startTime` = fin de la última partida conocida (con margen), una petición de ids por cola (1750 y 1740), y comparar contra ids ya guardados.
- Al hacer pruebas: pocas peticiones, pausas ≥0,5 s, sin bucles; muestrear en vez de recorrer todo.
- Retención (D): ~2 años para partidas, 1 año para timelines. Un 404 en un id conocido = retirado; marcarlo y no reintentar.

## Reglas / ToS (D; ver informe §11)
- **Personal key**: para el desarrollador o "a small private community"; **no** para apps de consumo público (incluye alphas/betas abiertas). Una webapp de amigos con acceso restringido encaja; abierta al público no (confirmar con Riot). Producto debe registrarse.
- Mostrar el descargo "[Producto] isn't endorsed by Riot Games and doesn't reflect the views…" (texto completo en `https://developer.riotgames.com/policies/general`).
- No crear alternativas al ranking oficial (MMR/ELO); winrate, puesto medio y top-N son estadísticas, un "skill score" compuesto no.
- No de-anonimizar jugadores más allá de lo que trae la partida; no exponer/compartir la key; no revender el acceso a datos.

## Gotchas
- `win` ≠ 1º puesto. `placement === 1` es la única señal de 1º.
- Arena tríos son **dos colas** (1750 y 1740) y ninguna está en `queues.json`; `type=normal` incluye Arena; `teams[]` inútil; `summonerName` vacío; `teamId` 100/200 no son equipos de trío.
- `gameVersion` = `16.N`, parche público "26.N" (I); Data Dragon usa `16.N.1`.
- Ids de Match-V5 no son densos: no sondear ids al azar. Un id inexistente y uno expirado dan el mismo 404.
- `startTime`/`endTime` en **segundos**, timestamps de la partida en **ms**.
- `count` máx 100; `start` fuera de rango devuelve `[]`.
- Las respuestas de `player-data` pesan ~41 KB: llamar solo cuando haga falta (sync) y cachear.
