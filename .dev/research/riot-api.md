# Riot API para hylistats — informe de investigación

> Fecha: 2026-09-29. Autor: investigador técnico (agente). Alcance: stats de **Arena** (LoL) para un grupo de amigos en **EUW**.
> Convención de etiquetas: **[VERIFICADO]** = comprobado contra la API/CDN real en esta sesión; **[DOCUMENTADO]** = lo dice una fuente citada (URL en §14); **[INFERIDO]** = deducción mía a partir de lo anterior, no confirmada.
> Presupuesto de peticiones a la API de Riot: ~51 (límite fijado ~60). Todas de solo lectura. La API key no aparece en este documento.

---

## 0. Resumen ejecutivo

1. **Routing EUW**: Account-V1 y Match-V5 van por el host **regional** `europe.api.riotgames.com`; Summoner-V4 y Challenges-V1 por el host de **plataforma** `euw1.api.riotgames.com`. Los contadores de rate limit son independientes por host. [VERIFICADO]
2. **La Arena actual (tríos, 6 equipos de 3, 18 participantes) es `queueId` 1750**, `gameMode: "CHERRY"`, `mapId: 30`. **1750 NO aparece en el `queues.json` oficial** (que solo lista 1700 y 1710, ambos "Arena", el segundo "16 player lobby"). Para el jugador de prueba hay 504 partidas 1750 (la más antigua 2026-05-16, `gameVersion` 16.10); **no hay ninguna 1700/1710** en su historial ni en el de un compañero. [VERIFICADO / DOCUMENTADO]
3. **1º puesto = `placement == 1`** (idéntico a `subteamPlacement`). **`win` NO significa 1º**: es `true` para los puestos 1–3 (medio cuadro) y `false` para 4–6. Comprobado en 15 partidas × 18 participantes sin excepciones. [VERIFICADO]
4. **Compañeros de trío** = participantes con el mismo `playerSubteamId` (1..6, etiqueta arbitraria, no el puesto). `teamId` solo separa mitades (100 = puestos 1–3, 200 = 4–6); el array `teams[]` es inútil en Arena (trae `teamId` 100 y 0). [VERIFICADO]
5. **Challenge 602002 "Adapt to All Situations"**: `player-data` devuelve `value = 75.0`, nivel MASTER, `achievedTime` 2026-09-19 21:30:14 UTC — **coincide con los 75 del supervisor**; ese `achievedTime` es, al milisegundo, el `gameCreation` de una partida 1750 en 1º puesto (Syndra), lo que confirma que el reto se alimenta de esas partidas. Umbrales 3/6/12/20/32/45/60 (Iron→Master). El `config` **no contiene ninguna fecha ni indicación de temporada** (solo `state`, `leaderboard`, `thresholds`). [VERIFICADO]
6. **No existe en la API una forma de saber cuándo empieza/acaba/reinicia la temporada de Arena.** El inicio del tríos (patch 26.10, mayo 2026) es dato de prensa/wiki, con fuentes discrepantes (12 vs 13 de mayo; una wiki dice 26.11). La detección del reinicio del challenge habrá que hacerla por observación (ver §7.4). [VERIFICADO (ausencia) / DOCUMENTADO]
7. **Rate limits observados** (cabecera `X-App-Rate-Limit: 100:120,20:1`, compatibles con Personal key): 20 req/s y 100 req/2 min por host. Límites por método: Match-V5 (ids y detalle) `2000:10`, Account by-riot-id `1000:60`, Summoner by-puuid `2000:60`, Challenges `20000:10,1200000:600`. **El cuello de botella es el de 100/2 min**: un backfill de 504 partidas ≈ 510 peticiones ≈ 10 min. [VERIFICADO]
8. **Match-V5 by-puuid**: `count` máx **100** (101 → 400), orden más reciente primero, `start` fuera de rango → `[]` (no error), `queue=1750`, `startTime`/`endTime` (epoch segundos) y `type=normal` funcionan; **`type=normal` incluye Arena**. Ids inexistentes → 404 `match file not found`. [VERIFICADO]
9. **Datos estáticos**: Data Dragon `16.19.1` (173 campeones; mapear por `championId` ↔ `key`, no por nombre: `FiddleSticks` ≠ `Fiddlesticks`). Augments: `cdragon/arena/en_us.json` está **incompleto** (faltan 36 de los 205 ids vistos en partidas reales); `plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json` cubre los 205. Todos los ítems de la muestra existen en `item.json` de DDragon. [VERIFICADO]
10. **Políticas**: una **Personal key no puede usarse en una app de consumo público** (sí "small private community"); hay que mostrar el descargo "isn't endorsed by Riot Games…"; prohibido crear alternativas al ranking oficial (MMR/ELO). Los **PUUID están cifrados por proyecto/clave**: los obtenidos con la dev key pueden no valer con la Personal key. [DOCUMENTADO]

---

## 1. Metodología y presupuesto

- Lectura de la key desde `.env.local` (`RIOT_API_KEY`) por cabecera `X-Riot-Token`; nunca impresa ni escrita.
- Peticiones a la API de Riot: **~51**, secuenciales, con pausas ≥0,5 s entre ráfagas; **ningún 429** (no se provocó a propósito; el comportamiento de 429 es DOCUMENTADO, no verificado).
- Desglose aproximado: Account 1 · Summoner 1 · Match ids 19 (incl. 1 `400` provocado, paginado de 1750, consultas de cola, ventana de fechas, `type`) · Match detalle 27 (19 partidas 1750, 3 antiguas/no-Arena, 5 sondeos de ids inexistentes/retención; total Riot = 51) · Challenges 3 (`config` 602002, `config` global, `player-data`).
- Fuera del presupuesto Riot (otros hosts, sin key): Data Dragon, CommunityDragon, npm/PyPI/GitHub API, páginas de docs.
- Cuenta de prueba: `BEJITO MAMBO#1991` (EUW, `euw1` / `europe`). PUUID (recortado): `wcQ0ngp6TYK4…` — es específico de la clave usada (ver §11).

---

## 2. Routing (plataforma vs regional)

| Concepto | Valor EUW | Notas |
|---|---|---|
| Plataforma | `euw1` → `https://euw1.api.riotgames.com` | Summoner-V4, Challenges-V1 (también Spectator —probado con Arena en §7b—, League… no usados) |
| Región (cluster) | `europe` → `https://europe.api.riotgames.com` | Account-V1, Match-V5 |
| Prefijo de `matchId` | `EUW1_<n>` | Match-V5 se consulta en `europe` aunque el id lleve el prefijo de plataforma |

- [DOCUMENTADO] Riot agrupa servicios por plataforma o por región; qué routing usa cada endpoint se ve en la spec. Fuente: <https://developer.riotgames.com/docs/lol> y el esquema OpenAPI comunitario (`x-route-enum`): Challenges y Summoner = `platform`; Match-V5 by-puuid = `regional` (americas/asia/europe/sea); Account by-riot-id = `regional` (americas/asia/europe).
- [VERIFICADO] Todas las llamadas de la tabla de §3 respondieron 200 con esos hosts.
- [VERIFICADO] Los contadores `X-App-Rate-Limit-Count` son **independientes por host**: tras ~20 llamadas seguidas a `europe`, la primera llamada a `euw1` reportó `3:120` (solo las suyas). Coincide con lo documentado: los límites se aplican por región. Fuente: <https://developer.riotgames.com/docs/portal#web-apis_rate-limiting>.

---

## 3. Tabla de endpoints

Límites: `N:S` = N peticiones cada S segundos. Límite de app (todas las llamadas, por host): `100:120,20:1`. Los de método son los observados en las cabeceras de la respuesta.

| Método | URL (ruta) | Routing | Límite método (observado) | Uso en hylistats |
|---|---|---|---|---|
| GET | `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | `europe` | `1000:60` | Alta de perfil: Riot ID → `puuid`. `gameName` con espacios se codifica `%20` |
| GET | `/lol/summoner/v4/summoners/by-puuid/{puuid}` | `euw1` | `2000:60` | Icono (`profileIconId`) y nivel (`summonerLevel`) |
| GET | `/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=1750&start=&count=&startTime=&endTime=` | `europe` | `2000:10` | Listar ids: backfill paginado y sync incremental |
| GET | `/lol/match/v5/matches/{matchId}` | `europe` | `2000:10` | Detalle de partida (inmutable → cachear) |
| GET | `/lol/challenges/v1/player-data/{puuid}` | `euw1` | `20000:10,1200000:600` | Valor del challenge 602002 (y 602001) para el control |
| GET | `/lol/challenges/v1/challenges/{id}/config` | `euw1` | `20000:10,1200000:600` | Umbrales/estado de 602002 (casi estático) |
| GET | `/lol/challenges/v1/challenges/config` | `euw1` | `20000:10,1200000:600` | Config de todos (405 retos). No necesario en v1 |
| GET | `/lol/match/v5/matches/{matchId}/timeline` | `europe` | (no probado) | **No usado** (retención 1 año, no aporta a las stats pedidas) |
| GET | `https://ddragon.leagueoflegends.com/api/versions.json` | CDN | sin key | Última versión de Data Dragon |
| GET | `https://ddragon.leagueoflegends.com/cdn/{ver}/data/{locale}/champion.json` | CDN | sin key | Campeones (`key` numérico ↔ `id`/`name`) |
| GET | `https://ddragon.leagueoflegends.com/cdn/{ver}/img/champion/{id}.png` | CDN | sin key | Iconos de campeón |
| GET | `https://ddragon.leagueoflegends.com/cdn/{ver}/data/{locale}/item.json` | CDN | sin key | Ítems |
| GET | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json` | CDN | sin key | Augments (nombre, rareza, icono) |

Códigos de respuesta [DOCUMENTADO] (<https://developer.riotgames.com/docs/portal#web-apis_rate-limiting>): 400 parámetro inválido, 401 sin key, 403 key inválida/lista negra o ruta no permitida, 404 recurso inexistente, 429 límite excedido (cabecera `Retry-After` en segundos y `X-Rate-Limit-Type`), 5xx transitorios. [VERIFICADO] 400 (count=101), 404 (id inexistente), 200.

---

## 4. Account-V1 y Summoner-V4

**Account-V1** [VERIFICADO]: `GET europe/riot/account/v1/accounts/by-riot-id/BEJITO%20MAMBO/1991` → 200

```json
{"puuid":"wcQ0ngp6TYK4…(recortado)","gameName":"BEJITO MAMBO","tagLine":"1991"}
```

- El `puuid` es el identificador estable; el Riot ID (`gameName#tagLine`) puede cambiar → guardar puuid y refrescar el Riot ID (endpoint `accounts/by-puuid/{puuid}`: **no probado**).
- En los participantes de Match-V5 vienen `riotIdGameName` y `riotIdTagline` (y `summonerName` llega **vacío** en Arena). [VERIFICADO]

**Summoner-V4** [VERIFICADO]: `GET euw1/lol/summoner/v4/summoners/by-puuid/{puuid}` → 200, solo estos campos: `puuid`, `profileIconId` (7176), `revisionDate` (epoch ms), `summonerLevel` (869). **Ya no devuelve `id`, `accountId` ni `name`.** Iconos de perfil: `https://ddragon.leagueoflegends.com/cdn/{ver}/img/profileicon/{profileIconId}.png` [DOCUMENTADO en estructura de DDragon; PNG del icono no descargado].
- En el detalle de partida, `profileIcon` y `summonerLevel` del participante son los valores **en el momento de la partida**, no los actuales.

---

## 5. Match-V5

### 5.1 `GET /lol/match/v5/matches/by-puuid/{puuid}/ids` (regional `europe`)

| Parámetro | Comportamiento | Estado |
|---|---|---|
| `count` | 0–100 (defecto 20). `count=101` → `400 {"status":{"message":"Bad Request - invalid parameter value 101, must be between 0 and 100"}}` | [VERIFICADO] |
| `start` | índice de inicio (defecto 0). Fuera de rango → `200 []` (no es error) | [VERIFICADO] |
| `queue` | entero, filtra por `queueId`. `queue=1750` OK | [VERIFICADO] |
| `type` | `ranked`/`normal`/`tourney`/`tutorial` (documentado). **`type=normal` devolvió partidas de Arena (1750)** | [VERIFICADO] |
| `startTime` / `endTime` | epoch en **segundos**; filtran por fecha de partida. Funcionan solos o combinados | [VERIFICADO] |
| Orden | más reciente primero (ids descendentes) | [VERIFICADO] |
| Respuesta | array de strings `EUW1_<n>` | [VERIFICADO] |

Fuente de la definición de parámetros: esquema OpenAPI comunitario (<https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.min.json>) + verificación.

### 5.2 Ids recientes y `queueId`

Ids del jugador de prueba sin filtro (primeros 100, más recientes): **84 de 100 son `queue=1750`**; el resto (16) son de otras colas (no identificadas una a una para ahorrar presupuesto).

Con `queue=1750`, paginando de 100 en 100: 100 + 100 + 100 + 100 + 100 + 4 = **504 partidas**; la última página (`start=500`) devuelve 4 ids y `start=600` devuelve `[]`.

| Consulta | Resultado | Estado |
|---|---|---|
| `queue=1750` | 504 ids, de 2026-05-16 (`EUW1_7856104816`, `gameVersion` 16.10.776) a 2026-09-29 (16.19.x) | [VERIFICADO] |
| `queue=1700` (jugador de prueba) | `[]` | [VERIFICADO] |
| `queue=1710` (jugador de prueba) | `[]` | [VERIFICADO] |
| `queue=1700` / `1710` (un compañero de trío) | `[]` | [VERIFICADO] |
| `endTime=2026-05-13` sin filtro de cola | 74 ids (más reciente `EUW1_7772666376`: queue 400, CLASSIC, 2026-03-10; más antiguo `EUW1_7670001209`: queue 400, CLASSIC, 2026-01-03) | [VERIFICADO] |

Conclusiones:
- **1750 = Arena tríos actual** [VERIFICADO]: `gameMode CHERRY`, `gameType MATCHED_GAME`, `mapId 30`, 18 participantes, `playerSubteamId` ∈ {1..6}, `endOfGameResult: GameComplete`.
- **1700 y 1710 = Arena antigua** [DOCUMENTADO]: `queues.json` oficial los lista como "Arena" (map "Rings of Wrath"); 1710 con nota "16 player lobby". Historia del formato (2v2v2v2 de 4 equipos → 8 equipos de 2 desde V14.9) según la wiki (<https://wiki.leagueoflegends.com/en-us/Arena>). **La asignación exacta 1700 = 4 equipos / 1710 = 8 equipos NO está verificada** (no hay ninguna partida 1700/1710 en los historiales consultados).
- **1750 no figura en `queues.json`** [VERIFICADO contra <https://static.developer.riotgames.com/docs/lol/queues.json>]: no se puede depender del fichero oficial para reconocer la cola actual.
- [INFERIDO] Para hylistats basta `queue=1750` en backfill y sync. Si algún amigo tuviera historial 2v2 dentro de retención, aparecería con 1700/1710; el filtro por `queue` de la Arena antigua y su tratamiento (8 equipos, `placement` 1–8) queda como pregunta abierta (§13).

> **Nota 2026-09-29 — la inferencia anterior era incompleta: también existe la cola 1740** [VERIFICADO]. El jugador de prueba tiene 80 partidas `queue=1740` en esta temporada (19-jul → 23-sep de 2026, parches 16.14 → 16.19, los mismos que la 1750 en esas fechas). El formato es idéntico: `CHERRY`, `mapId 30`, `MATCHED_GAME`, 18 jugadores en 6 tríos, puestos 1–6. No hay partidas de ninguna de las dos colas anteriores a `SEASON_START`. En los días con 1740 casi no hay 1750, así que son sesiones separadas; qué distingue una cola de otra **no se sabe**. La 1740 no está en `queues.json` y **cuenta para `602002`**: solo 1750 da 70 campeones con 1º, 1750 ∪ 1740 da 75 = `value`, y el paso a MASTER cae en el campeón nº 60 de la unión. Backfill, incremental y stats cubren las dos colas desde iter-02 (F14). Evidencia: `.dev/archive/iter-01/verify-report.md` § AC4 y F14 en `think.md`.

### 5.3 `GET /lol/match/v5/matches/{matchId}` — estructura

Top-level [VERIFICADO]: `metadata {dataVersion "2", matchId, participants[18 puuids]}` e `info {endOfGameResult, gameCreation, gameDuration (segundos), gameEndTimestamp, gameId, gameMode, gameName, gameStartTimestamp, gameType, gameVersion, mapId, participants[], platformId, queueId, teams[], tournamentCode}`.

Un participante tiene ~170 claves (todas las de LoL clásico, la mayoría a 0 en Arena). **Relevantes en Arena** [VERIFICADO]:

| Campo | Significado en Arena tríos |
|---|---|
| `puuid`, `riotIdGameName`, `riotIdTagline` | Identidad. `summonerName` viene vacío |
| `participantId` | 1..18, orden interno |
| `placement` | **Puesto final del equipo, 1..6** (1 = ganador) |
| `subteamPlacement` | Igual que `placement` en las 270 filas comprobadas |
| `playerSubteamId` | Id del trío al que pertenece (1..6). **Etiqueta arbitraria**, no orden de puesto |
| `teamId` | 100 para los subteams que quedan 1º–3º, 200 para 4º–6º (mitades) |
| `win` | `true` ⇔ `placement` ∈ {1,2,3}. **No indica 1º puesto** |
| `championId`, `championName` | Campeón. `championId` numérico = `key` de Data Dragon. `championName` puede diferir del `id` de DDragon (`FiddleSticks` vs `Fiddlesticks`) |
| `playerAugment1..6` | Id numérico del augment elegido; `0` = hueco vacío. En la muestra (270 participantes, 15 partidas) hubo 1–6 augments rellenos: 4 (119), 3 (66), 5 (50), 2 (29), 6 (5), 1 (1) |
| `item0..item5`, `item6` | Ítems (`item6` = slot de amuleto, p. ej. 3348). Ids `2xxxxx`/`4xxxxx` son variantes de Arena. Todos los 1594 ítems no nulos de la muestra existen en `item.json` de DDragon 16.19.1 |
| `kills`, `deaths`, `assists`, `totalDamageDealtToChampions`, `goldEarned`, `champLevel`, `timePlayed` | Stats individuales |
| `eligibleForProgression` | `true` en todos los observados (significado exacto no documentado) |
| `individualPosition`, `teamPosition`, `lane`, `role`, `perks`… | Sin significado útil en Arena |

`info.teams[]` [VERIFICADO]: 2 entradas con `teamId` 100 y **0** (no 200), con `win` true/false, `bans` (18 entradas, muchas `-1`) y `objectives` casi vacíos. Los participantes usan `teamId` 100/200. **No usar `teams[]` en Arena.**

### 5.4 Cómo detectar 1º puesto y compañeros [VERIFICADO en 15 partidas 1750 + 1 del muestreo de fecha]

Para un `puuid` dado en una partida 1750:
1. `me = participants.find(p => p.puuid === puuid)`.
2. **1º puesto**: `me.placement === 1`. Top-N: `me.placement <= N`. Puesto medio: media de `placement`.
3. **Compañeros**: `participants.filter(p => p.playerSubteamId === me.playerSubteamId && p.puuid !== puuid)` → siempre 2.
4. **Resultado del trío**: `placement` es común a los tres (comprobado). `win` solo separa mitad superior/inferior.
5. Rivales: el resto (15).

Rango de datos observados en la muestra: `placement` 1..6 (todos aparecen; 2 primeros de 15 partidas del jugador de prueba).

### 5.5 JSON de ejemplo (recortado; sin datos inventados)

Partida `EUW1_7997222696` (queue 1750, 2026-09-27). Se muestran los 3 participantes del trío del jugador de prueba (este trío quedó **1º**, `playerSubteamId` 2; el jugador de prueba es el participante con su Riot ID visible). Los PUUID y Riot IDs de terceros se han sustituido por `<omitido>`; el resto de valores son los reales devueltos por la API. `teams` y el resto de campos se omiten.

```json
{
  "metadata": {
    "dataVersion": "2",
    "matchId": "EUW1_7997222696",
    "participants": "[18 puuids]"
  },
  "info": {
    "gameMode": "CHERRY",
    "gameType": "MATCHED_GAME",
    "queueId": 1750,
    "mapId": 30,
    "gameVersion": "16.19.821.7343",
    "gameCreation": 1790543187833,
    "gameStartTimestamp": 1790543272372,
    "gameEndTimestamp": 1790544893534,
    "gameDuration": 1621,
    "endOfGameResult": "GameComplete",
    "platformId": "EUW1",
    "participants": [
      {
        "participantId": 4,
        "teamId": 100,
        "playerSubteamId": 2,
        "subteamPlacement": 1,
        "placement": 1,
        "win": true,
        "championId": 901,
        "championName": "Smolder",
        "champLevel": 18,
        "kills": 26,
        "deaths": 4,
        "assists": 7,
        "totalDamageDealtToChampions": 133042,
        "goldEarned": 17275,
        "item0": 223031,
        "item1": 223158,
        "item2": 447103,
        "item3": 223033,
        "item4": 223072,
        "item5": 223026,
        "item6": 3348,
        "playerAugment1": 1328,
        "playerAugment2": 195,
        "playerAugment3": 48,
        "playerAugment4": 251,
        "playerAugment5": 0,
        "playerAugment6": 0,
        "eligibleForProgression": true,
        "riotIdGameName": "<omitido>",
        "riotIdTagline": "<omitido>",
        "puuid": "<omitido>",
        "summonerLevel": 540,
        "timePlayed": 1621
      },
      {
        "participantId": 5,
        "teamId": 100,
        "playerSubteamId": 2,
        "subteamPlacement": 1,
        "placement": 1,
        "win": true,
        "championId": 902,
        "championName": "Milio",
        "champLevel": 18,
        "kills": 3,
        "deaths": 4,
        "assists": 30,
        "totalDamageDealtToChampions": 34891,
        "goldEarned": 16255,
        "item0": 447105,
        "item1": 223107,
        "item2": 226617,
        "item3": 443062,
        "item4": 226621,
        "item5": 223158,
        "item6": 3348,
        "playerAugment1": 21,
        "playerAugment2": 151,
        "playerAugment3": 1420,
        "playerAugment4": 86,
        "playerAugment5": 1324,
        "playerAugment6": 0,
        "eligibleForProgression": true,
        "riotIdGameName": "BEJITO MAMBO",
        "riotIdTagline": "1991",
        "puuid": "<puuid del jugador, omitido>",
        "summonerLevel": 868,
        "timePlayed": 1621
      },
      {
        "participantId": 6,
        "teamId": 100,
        "playerSubteamId": 2,
        "subteamPlacement": 1,
        "placement": 1,
        "win": true,
        "championId": 53,
        "championName": "Blitzcrank",
        "champLevel": 18,
        "kills": 4,
        "deaths": 8,
        "assists": 22,
        "totalDamageDealtToChampions": 57453,
        "goldEarned": 16250,
        "item0": 223158,
        "item1": 447109,
        "item2": 223084,
        "item3": 223068,
        "item4": 223075,
        "item5": 223110,
        "item6": 3348,
        "playerAugment1": 152,
        "playerAugment2": 133,
        "playerAugment3": 193,
        "playerAugment4": 66,
        "playerAugment5": 0,
        "playerAugment6": 0,
        "eligibleForProgression": true,
        "riotIdGameName": "<omitido>",
        "riotIdTagline": "<omitido>",
        "puuid": "<omitido>",
        "summonerLevel": 290,
        "timePlayed": 1621
      }
    ],
    "teams": "(ver texto: 2 entradas teamId 100 y 0; sin datos de subteam)"
  }
}
```

---

## 6. Retención (~2 años) y ids antiguos (404)

- [DOCUMENTADO] Riot redujo la retención del historial de partidas de 3 a **2 años** (rolling) desde el 7-ago-2019; los **timelines** conservan **1 año**. Fuente: <https://www.riotgames.com/en/DevRel/match-history-retention-Change> (no dice nada de 404). Hay que tratar esa cifra como orientativa: el post es de 2019.
- [VERIFICADO] Un id inexistente devuelve `404 {"httpStatus":404,"errorCode":"NOT_FOUND","message":"Not Found","implementationDetails":"match file not found"}`.
- [VERIFICADO] Una partida de 2025-02-09 (`EUW1_7300000000`, queue 900) sigue disponible (~19,7 meses de antigüedad, coherente con 2 años). Los ids **no son densos** (`EUW1_7300000001` → 404), así que sondear ids al azar no sirve para medir la retención ni para distinguir "expirado" de "nunca existió".
- [INFERIDO] Un 404 de un id que salió antes de `by-puuid` es "expirado/retirado" (no hay manera de distinguir por la respuesta). Aplicación: tratar 404 en detalle como **permanente**, no reintentar, marcar la partida como no disponible.
- El historial completo devuelto para el jugador de prueba empieza el 2026-01-03; el ancho de retención real (2 años) no se pudo acotar con este jugador.
- Como la temporada actual de Arena empieza en mayo 2026 y la retención es ~2 años, **el backfill de la temporada actual cae dentro de retención**; el historial 2v2 antiguo puede estar parcialmente expirado.

---

## 7. Challenges-V1 y challenge 602002

### 7.1 `player-data` [VERIFICADO]

`GET euw1/lol/challenges/v1/player-data/{puuid}` → 200 (~41 KB, 364 retos). Claves: `totalPoints`, `categoryPoints`, `challenges[]`, `preferences`.

Entrada del challenge:

```json
{"challengeId":602002,"percentile":0.004,"level":"MASTER","value":75.0,"achievedTime":1789853414530}
```

- **`value = 75.0`** → coincide con el 75 que da el supervisor. Nivel MASTER (umbral 60). `achievedTime` = 2026-09-19 21:30:14 UTC (ver §8 sobre su significado).
- Retos Arena relacionados presentes: `602001` value 133 (PLATINUM), `602000` value 140 (DIAMOND), `601000`–`601006` (Arena Brawler…).

### 7.2 `config` [VERIFICADO]

`GET euw1/lol/challenges/v1/challenges/602002/config` → `{id, localizedNames{…}, state:"ENABLED", leaderboard:false, thresholds{IRON:3, BRONZE:6, SILVER:12, GOLD:20, PLATINUM:32, DIAMOND:45, MASTER:60}}`.
- `en_US`: nombre "Adapt to All Situations", descripción "Place first in Arena games with different champions" (en_GB, es_ES: "Gana partidas de Arena con campeones diferentes").
- `GET …/challenges/config` (todos): 405 retos; `state` ∈ {ENABLED 403, ARCHIVED 2}; **solo 1 de 405 trae un campo de fecha** (`endTimestamp` en el reto 600012). **No hay `startTimestamp` ni indicador de temporada en ningún reto.**
- `602001` "Arena Champion Ocean": "Play Arena games with different champions" (umbral MASTER 168) → cuenta campeones **jugados** (no ganados). El jugador tiene 133. No se ha verificado si es por temporada.

### 7.3 ¿Es por temporada? ¿Cuándo empieza/acaba la temporada de Arena?

- [DOCUMENTADO, parcial] El supervisor afirma que 602002 es **por temporada**. Las fuentes públicas que encontré **no lo confirman ni lo desmienten**: un dev blog de Riot de 2025 dice que el progreso de Arena God "se arrastra" desde la ejecución anterior de Arena (<https://www.leagueoflegends.com/en-us/news/dev/dev-arena-the-grand-reckoning/>), y otras búsquedas hablan de un reinicio de progresión con Season 3 sin fecha concreta. **Hay evidencia contradictoria en fuentes secundarias; solo tenemos la afirmación del supervisor.** Hay un tracker comunitario (<https://www.arenatracker.app/>) que dice usar "direct Riot Games API syncing" pero no documenta reinicios.
- [DOCUMENTADO] Inicio del tríos (Arena "Season 2"): patch **26.10**. Notas oficiales: publicación 2026-05-12 (<https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-10-notes/>); prensa/Leaguepedia: 2026-05-13 (<https://www.altchar.com/game-news/league-of-legends-patch-26.10-expands-arena-with-3v3v3v3v3v3-format-az48b0A2Z97G>, <https://lol.fandom.com/wiki/Patch_26.10>); la wiki oficial la lista como "Upcoming (V26.11)" (<https://wiki.leagueoflegends.com/en-us/Arena>, probablemente desactualizada). Nota: la temporada de Arena "corre 6 parches" según prensa (Season 2 de 2026), pero hoy (2026-09-29, patch 16.19) sigue habiendo partidas 1750, así que **no hay fecha de fin conocida**.
- [VERIFICADO] Numeración: `gameVersion` empieza por `16.N` (primera partida 1750 del jugador de prueba, 2026-05-16: `16.10.776…`; hoy `16.19.x`) y Data Dragon usa `16.19.1`. [INFERIDO] el parche público "26.N" corresponde a `16.N` en `gameVersion`/DDragon (dos observaciones coherentes con las fechas de 26.10 y de hoy; no hay documento oficial que lo diga).
- [VERIFICADO] **La API no expone ninguna fecha de temporada** (ni en `config` ni en `player-data`). Datos de Data Dragon `seasons.json` (`static.developer.riotgames.com/docs/lol/seasons.json`) son de temporadas de ranked; **no consultado** para Arena.

### 7.4 Cómo saber si el challenge se reinicia [INFERIDO]

No hay campo. Opciones a valorar en Spec (no elegir aquí):
- Guardar una **serie de snapshots** `(fecha, value)` de 602002 en cada sync; una **bajada** de `value` (o `level`) implica reinicio.
- Contrastar `value` con el recuento de 1º puestos únicos de la lista verificada dentro de una **ventana de temporada** configurable (fecha de inicio = parámetro de app, hoy 2026-05-13).
- Marcar la fecha de inicio de temporada como configuración manual del supervisor.

---

## 7b. Spectator-V5 y partidas de Arena en curso (comprobado 2026-10-02, iter-10 T09)

Prueba con la Personal key, host `euw1`, `GET /lol/spectator/v5/active-games/by-summoner/{puuid}` (PUUID del mismo proyecto que la key), con un miembro del grupo (BEJITO MAMBO) jugando Arena en ese momento:

- **Sí devuelve la partida de Arena**: `200` con `gameQueueConfigId: 1750`, `gameMode: "CHERRY"`, `mapId: 30`, `gameType: "MATCHED"`, `platformId: "EUW1"`, `gameId` (el número de la partida; el `matchId` de Match-V5 será `EUW1_<gameId>`), `gameStartTime` (epoch ms) y `gameLength` (s).
- **Participantes**: los 18, todos con `teamId: 100`: Spectator **no expone el equipo de Arena** (los subequipos de 2–3). Campos por participante: `puuid`, `riotId`, `championId`, `profileIconId`, `bot`, `spell1Id`, `spell2Id`, `perks`, `lastSelectedSkinIndex`, `gameCustomizationObjects`. También `bannedChampions` (18) y `observers.encryptionKey`.
- **Sin partida**: `404` (los otros 5 miembros, que no estaban jugando).
- **Seguimiento de la misma partida** (sondeo cada 60 s, partida `EUW1_8001920698`): `gameLength` avanza ~60 s por muestra (la primera repetición de 41 s fue al poco de empezar). Según Match-V5, la partida empezó a las 21:07:36 UTC y **terminó para todo el lobby a las 21:34:11** (`gameDuration` 1595 s), pero el jugador fue **eliminado antes**: `timePlayed` 1238 s, 4º puesto, es decir, a las ~21:28:14.
  - Tras la eliminación, Spectator **siguió devolviendo la misma partida** a ese jugador (200, `gameLength` creciendo) hasta las 21:31:28. A las 21:32:28 ya devolvía **otra partida** (`gameLength` negativo, en carga) porque el jugador entró en cola de nuevo. Nunca hubo un `404` entre las dos.
  - Match-V5 solo publica la partida **cuando termina todo el lobby**, no cuando cae el jugador: el incremental de las 21:36:17 la guardó (21:36:18), ~2 min después del final del lobby y ~8 min después de la eliminación (con la guardia de frescura de 2 min de la iter-10).
- **Coste**: 1 petición por perfil y consulta, en el límite de la app (`100:120,20:1`, compartido con el resto de llamadas).
- **Implicaciones para "sincronizar al terminar"**: el disparador no puede ser solo "200 → 404", porque un jugador eliminado que vuelve a la cola pasa de una partida a otra sin 404; hay que vigilar también el **cambio de `gameId`**. Además, aunque se detecte la eliminación, Match-V5 no tendrá la partida hasta que termine el lobby (en Arena, hasta ~5–6 min después de caer en 4º; más si se cae antes). Con la guardia de 2 min, la partida ya aparece ~2 min después del final del lobby, así que sondear Spectator (6 perfiles cada 1–2 min) ahorraría como mucho ese margen. Para la decisión de la iteración futura: probablemente no compensa.
- Sin código de producto (fuera del alcance de la iter-10, F26); queda como base para decidir en una iteración futura.

## 8. Comparación lista de 1º puestos (Match-V5) vs contador 602002

- **Coste de la comprobación completa**: 504 partidas 1750 desde 2026-05-16 → 6 páginas de ids ya hechas + **504 de detalle** = ~510 peticiones. Con el límite de 100 por 2 min: 5,1 ventanas ⇒ **≈ 8–10 minutos** de ejecución para un jugador (más si se comparte presupuesto). Es inviable dentro del presupuesto de esta investigación (~60). **No se ejecutó.**
- **Muestra hecha**: las 15 partidas más recientes (2026-09-27 a 2026-09-29) → el jugador quedó 1º en 2 (Milio, Poppy), 3º 4 veces, etc. Tasa 2/15 = 13 %. Una muestra así **no permite estimar ni confirmar el 75**.
- **Consistencia por necesidad** [INFERIDO]: 75 campeones distintos con 1º puesto exigen ≥ 75 partidas en 1º puesto. Sobre 504 partidas → tasa mínima ≥ 14,9 % (línea base de azar en 6 equipos = 16,7 %). Es compatible con lo observado (13 % en 15 partidas), pero **no es una verificación**.
**Hallazgo adicional sobre `achievedTime`** [VERIFICADO]: `achievedTime = 1789853414530` (2026-09-19 21:30:14.530 UTC) coincide **al milisegundo** con el `gameCreation` de la partida `EUW1_7989101136` (queue 1750, jugador en **1º puesto con Syndra**, `championId` 134, terminó 21:56:54). Se consultó la ventana 20:00–23:30 UTC de ese día (5 partidas, las 5 revisadas; las otras 4 terminaron 20:15 en 3º, 22:31 en 6º, 22:51 en 4º y 23:15 en 6º). Es decir, el challenge se alimenta de partidas 1750 con `placement == 1` y `achievedTime` usa el `gameCreation` de la partida que lo provocó (no el fin de partida). Lo que **no** se sabe: si `achievedTime` es "última vez que cambió el nivel" (entonces Syndra sería el campeón nº 60 y desde entonces el valor subió a 75 sin cambiar de nivel) o "última vez que subió el valor" (entonces no habría subido desde el 19-sep, aunque hay 1º puestos posteriores, p. ej. Milio y Poppy el 27-sep). [INFERIDO] lo primero es más coherente con un nivel MASTER estable, pero requiere el backfill completo para confirmarlo (comprobar que Syndra es el 60º campeón distinto con 1º puesto en orden cronológico).

**Plan recomendado de verificación** (para Spec/Verify, cuando exista la Personal key): backfill completo de 504+ partidas → calcular `distinct(championId | placement==1)` (por `queue==1750`, desde 2026-05-13) → comparar con 602002. Esperado si el modelo del supervisor es correcto: 75.

---

## 9. Datos estáticos

### 9.1 Data Dragon [VERIFICADO]

| Recurso | URL | Resultado |
|---|---|---|
| Versiones | `https://ddragon.leagueoflegends.com/api/versions.json` | 500 versiones; la última `16.19.1` |
| Realm EUW | `https://ddragon.leagueoflegends.com/realms/euw.json` | `v: 16.19.1`, `l: en_GB`, `cdn: https://ddragon.leagueoflegends.com/cdn` |
| Campeones | `.../cdn/16.19.1/data/es_ES/champion.json` (también `en_US`) | 173 campeones; `data[<id>]` con `key` (string numérico), `id`, `name`, `title`, `image.full` |
| Icono campeón | `.../cdn/16.19.1/img/champion/Neeko.png` | 200 |
| Ítems | `.../cdn/16.19.1/data/en_US/item.json` | 870 ítems; incluyen todos los ids de Arena de la muestra |

- **Mapear por `championId` ↔ `Number(data[x].key)`**. `championName` de Match-V5 y `id` de DDragon difieren en `FiddleSticks` ↔ `Fiddlesticks`; el nombre de imagen usa el `id` de DDragon. [VERIFICADO]
- Los campeones nuevos (p. ej. Zaahen id 904) están en 16.19.1; usar la última versión y refrescar cuando salga una nueva. Ids de campeón en la muestra: sin ninguno ausente en DDragon.
- Iconos de perfil: `img/profileicon/{id}.png` (patrón documentado, no descargado).

### 9.2 CommunityDragon — augments [VERIFICADO]

Hay **dos fuentes** y no son equivalentes:

| Fuente | URL | Estructura | Cobertura sobre los 205 ids distintos de augment vistos en 15 partidas 1750 |
|---|---|---|---|
| A (Arena, con textos) | `https://raw.communitydragon.org/latest/cdragon/arena/en_us.json` (también `es_es.json`) | `{ "augments": [ {id, apiName, name, desc, tooltip, rarity (0..4), calculations, dataValues, iconLarge, iconSmall} ] }`, 225 entradas, `id` máx. 405 | **169/205** (82 %). Faltan 36 (los nuevos de Season 2 y los "Kiwi") |
| B (datos del cliente) | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json` (también `global/es_es/v1/…`) | array plano de 554 objetos `{id, augmentNameId, nameTRA, simpleNameTRA, augmentSmallIconPath, rarity}`; rarity `kSilver`/`kGold`/`kPrismatic`/`kEventChoice` | **205/205** |

- `nameTRA` es el nombre mostrado (p. ej. `"Zealot"`, `"Rice and Pork"`). La fuente B **no trae descripción**. Localizada: `global/es_es/v1/cherry-augments.json` → 200.
- En la muestra, **117 de 1013 huecos de augment (~11,5 %)** apuntan a ids ausentes de la fuente A (36 ids distintos, 17,6 % de los 205). Además **la fuente B mezcla augments de Arena (`/UX/Cherry/…`) y de ARAM Mayhem (`/UX/Kiwi/…`, `augmentNameId` `ARAM_…`)**, y algunos de estos aparecen en partidas de Arena tríos (p. ej. 2009 "Zealot", 1320 "Upgrade Collector"). [INFERIDO] Season 2 comparte parte del catálogo con Mayhem.
- `latest`, `pbe` y `16.19` devolvieron ficheros byte-idénticos hoy (misma versión); en otros momentos `latest` puede adelantarse al parche live. [VERIFICADO hoy / INFERIDO en general]
- Mapeo `playerAugmentN` → augment: `byId[playerAugmentN]` (id numérico; `0` = vacío). Iconos:
  - Fuente A: `iconSmall` = `assets/ux/cherry/augments/icons/warmuproutine_small.png` → `https://raw.communitydragon.org/latest/game/` + ruta (200, 1770 bytes).
  - Fuente B: `augmentSmallIconPath` = `/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/X_small.png` → **minúsculas** y `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/` + ruta sin `/lol-game-data/assets/` (`…/default/assets/ux/cherry/augments/icons/adapt_small.png` → 200; `…/assets/ux/kiwi/augments/icons/zealot_small.png` → 200).
- **CommunityDragon no es un servicio oficial de Riot**: sin SLA ni garantías (recomendable cachear/versionar el JSON).
- Fuente de documentación de estructura: <https://github.com/communitydragon/docs/blob/master/assets.md> (enlazado desde <https://raw.communitydragon.org/>); no revisada a fondo.

### 9.3 Otros
- Ítems: también en `…/global/default/v1/items.json` de CDragon (870 entradas, con nombre p. ej. 223008 = "Gluttonous Greaves", 3348 = "Arcane Sweeper").
- `queues.json`, `maps.json`, `seasons.json`: <https://static.developer.riotgames.com/docs/lol/queues.json> (solo `queues.json` consultado).

---

## 10. Rate limits reales

Cabeceras observadas en respuestas 200 [VERIFICADO]:

| Cabecera | Valor | Lectura |
|---|---|---|
| `X-App-Rate-Limit` | `100:120,20:1` | 100 req/120 s y 20 req/s, por key y por host |
| `X-App-Rate-Limit-Count` | p. ej. `16:120,1:1` | Peticiones consumidas en cada ventana |
| `X-Method-Rate-Limit` | por endpoint (ver §3) | |
| `X-Method-Rate-Limit-Count` | p. ej. `4:10` | |

- La key del `.env.local` (development) muestra los **mismos** límites de app que una Personal key; **volver a leer las cabeceras cuando se use la Personal key** (esos límites pueden variar por key).
- Límites por método (observados): Account by-riot-id `1000:60`; Match-V5 ids y detalle `2000:10`; Summoner by-puuid `2000:60`; Challenges (player-data, config, config global) `20000:10,1200000:600`. **Nunca son el límite efectivo**: gobierna el de app (`100:120`).
- **429** [DOCUMENTADO]: `Retry-After` (segundos); `X-Rate-Limit-Type` = application | method | service; el de servicio puede no traer la cabecera. Sin 429 en esta sesión.
- Tres tipos de límite (aplicación, método, servicio), todos por región. Fuente: <https://developer.riotgames.com/docs/portal#web-apis_rate-limiting>.
- Presupuesto: 100 peticiones/2 min = 0,83 req/s sostenidos; ráfagas de hasta 20 req/s. Backfill de N partidas de un jugador ≈ ceil(N/100) + N peticiones.
- La cabecera `Set-Cookie: __cf_bm` de Cloudflare aparece en las respuestas; irrelevante.

---

## 11. Políticas relevantes

| Tema | Regla | Estado / fuente |
|---|---|---|
| Tipos de key | Development (caduca a las 24 h), **Personal** (20 req/s, 100 req/2 min; APIs estándar, sin Tournaments), Production (500/10 s, 30 000/10 min) | [DOCUMENTADO] <https://developer.riotgames.com/docs/portal> |
| Uso de Personal key | Pensada para "the developer or a small private community"; usos aceptables: bots, "your own personal stats", investigación personal | [DOCUMENTADO] mismo enlace |
| Consumo público | "You may not run your application for public consumption using a personal key", incluye alpha/beta abiertas | [DOCUMENTADO] mismo enlace |
| Registro | Todos los productos deben registrarse y ser auditados por Riot en el portal | [DOCUMENTADO] <https://developer.riotgames.com/policies/general> |
| Descargo legal | El producto debe indicar que no está respaldado por Riot: fórmula estándar «[Producto] isn't endorsed by Riot Games…» (texto completo en la política) | [DOCUMENTADO] <https://developer.riotgames.com/policies/general> |
| Ranking | Prohibido crear alternativas al ladder oficial ("MMR o ELO calculators") | [DOCUMENTADO] mismo enlace |
| De-anonimización | Prohibido revelar identidad de jugadores no identificables con información visible | [DOCUMENTADO] mismo enlace |
| Key | Una key por producto; no incluir la key en código distribuido; usar HTTPS; no cederla a terceros | [DOCUMENTADO] <https://developer.riotgames.com/policies/general>, <https://developer.riotgames.com/terms> |
| Revender | Cobrar por acceso a Game Information o revender/licenciar requiere aprobación previa de Riot | [DOCUMENTADO] <https://developer.riotgames.com/terms> |
| Datos | Licencia limitada y revocable para mostrar "Game Information" a usuarios finales; al terminar hay que borrar los datos. No se dice nada sobre cachear ni frecuencia de actualización | [DOCUMENTADO] <https://developer.riotgames.com/terms> |
| Cifrado de ids | PUUID/summonerId/accountId están **cifrados por proyecto**: un id obtenido con una key no vale con otra key de otro proyecto (error 400 "Exception decrypting") | [DOCUMENTADO] <https://riot-api-libraries.readthedocs.io/en/latest/ids.html>, <https://github.com/RiotGames/developer-relations/issues/20> |

**Implicaciones para hylistats** [INFERIDO]:
- Una webapp **para un grupo privado de amigos** encaja con la Personal key; una web abierta a cualquiera **no**. Si se publica, decidir acceso restringido (login/allowlist) o pedir Production key. Hay que **confirmar con Riot** (developer-relations) qué cuenta como "public consumption" para una web privada con URL accesible.
- Mostrar el descargo "not endorsed by Riot" en la UI (footer).
- **No** construir un rating tipo ELO/MMR de los amigos; winrate, puesto medio, top-N y evolución son estadísticas, no un sistema de rating alternativo (interpretación mía; confirmar si el diseño se acerca a un "skill score").
- Guardar el **Riot ID como identidad primaria** y el `puuid` como caché ligado a la key/proyecto; al pasar de la development key a la Personal key, **resolver los puuid otra vez** (Account-V1 por Riot ID).
- Los datos de terceros (compañeros/rivales de partidas) provienen de la misma respuesta de Match-V5; no de-anonimizar más allá de lo que trae la partida.
- La key nunca en el cliente (frontend); solo en el servidor. Si se despliega públicamente, tener en cuenta que la key es de un desarrollador individual.

---

## 12. Librerías cliente (solo informativo, sin elegir stack)

Datos consultados en npm/PyPI/GitHub API el 2026-09-29.

| Lenguaje | Librería | Versión | Última publicación | Repo (último push) | Notas |
|---|---|---|---|---|---|
| TypeScript | `twisted` | 1.83.0 | 2026-08-18 | `justadev-afk/twisted` (2026-09-11, 150★, MIT) | Activa. Su README marca LOL-CHALLENGES-V1 implementado. No verificado: constantes de Arena/`queueId` 1750 |
| TypeScript | `@fightmegg/riot-api` | 0.0.21 | 2025-07-28 | `fightmegg/riot-api` (2025-07-28, 98★) | Sin cambios >1 año; versión 0.0.x |
| TypeScript | `galeforce` | — | — | (el registro npm devolvió el paquete sin `dist-tags`; **no verificado**) | Estado incierto |
| Python | `riotwatcher` (Riot-Watcher) | 3.3.1 | 2025-03-08 | `pseudonym117/Riot-Watcher` (2025-09-04, 558★, MIT) | Cliente síncrono con rate limiter |
| Python | `pulsefire` | 2.0.30 | 2025-11-14 | `iann838/pulsefire` (redirige a `ianhco/pulsefire`; 2025-11-14, 52★) | Asíncrono (asyncio) |
| Python | `cassiopeia` | 5.2.0 | 2025-03-11 | `meraki-analytics/cassiopeia` (2026-02-05, 581★) | Capa de objetos "ORM"; más pesada |

- Comentario informativo: la superficie necesaria es pequeña (Account-V1, Match-V5 ×2, Challenges-V1 `player-data`); un cliente propio (fetch + limitador + reintentos con `Retry-After`) es factible, y ninguna librería consultada se ha verificado con Arena tríos.
- Alternativa de trabajo: la spec OpenAPI comunitaria (<https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.min.json>) sirve para generar tipos, pero no es oficial.

---

## 13. Preguntas abiertas

1. **Temporada**: ¿fecha exacta de inicio del tríos y del reinicio de 602002? Solo hay prensa/wiki, con discrepancias (12/13 de mayo; 26.10 vs 26.11). ¿Cómo se anuncia el fin de temporada de Arena (Season 3)? No hay campo en la API (§7.3).
2. **¿Cuenta 602002 solo `queue 1750`?** ¿Y los 1º puestos en partidas con menos de X minutos/`eligibleForProgression`/reinicios? Se responde con el backfill completo y comparando con 75.
3. **Significado de `achievedTime`** de 602002 (¿último cambio de nivel?, ¿última vez que subió el valor?). Ver §8.
4. **Colas antiguas**: ¿1700 = 4 equipos y 1710 = 8 equipos? No hay ninguna partida 1700/1710 en los historiales consultados; ¿algún amigo tiene 2v2 dentro de retención? ¿Se incluye la Arena antigua en hylistats o se descarta?
5. **Retención real** por id: no distinguible con la API entre "expirado" y "nunca existió".
6. **Personal key**: ¿cómo se solicita/aprueba, qué exige el registro del producto y qué cuenta como "public consumption" para una web privada con URL accesible? ¿El proyecto de la Personal key es el mismo que el de la dev key (afecta a la validez de los puuid guardados)?
7. **Límites reales de la Personal key**: las cabeceras de la dev key muestran los mismos números que documenta la Personal key; hay que releerlos al cambiar.
8. **Descargo legal**: texto exacto y ubicación aceptable en la UI (footer) — leer la política completa antes de la Spec.
9. **Augments**: ¿fuente canónica? A tiene textos pero falta ~18 % de ids únicos vistos; B cubre todos pero mezcla ARAM Mayhem y no trae descripciones. ¿Hace falta descripción en la UI?
10. **Participantes con `win`/`placement` atípicos**: no observadas partidas con `endOfGameResult` ≠ `GameComplete`, remakes, `wasAfk`, `placement` sin subteam, ni empates. Falta ver qué pasa con esas partidas en el cómputo.
11. **Campeones que cambian id/nombre** (`FiddleSticks`) y campeones nuevos entre parches: política de refresco de Data Dragon.
12. **Otras colas del jugador**: 16 de las 100 últimas partidas no son 1750 y no se identificaron (no necesario para hylistats, pero conviene filtrar por `queue=1750`).

---

## 14. Fuentes

Documentación Riot:
- <https://developer.riotgames.com/docs/portal> (tipos de key, límites, uso personal, rate limiting, códigos HTTP)
- <https://developer.riotgames.com/docs/lol> (routing, Data Dragon, constantes)
- <https://developer.riotgames.com/policies/general> (política general, descargo, ranking, de-anonimización)
- <https://developer.riotgames.com/terms> (términos de la API)
- <https://developer.riotgames.com/apis> (índice de APIs; el detalle de endpoints es dinámico)
- <https://static.developer.riotgames.com/docs/lol/queues.json> (cola 1700/1710 "Arena"; 1750 ausente)
- <https://www.riotgames.com/en/DevRel/match-history-retention-Change> (retención 2 años, timelines 1 año)
- <https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-10-notes/> (patch 26.10)
- <https://www.leagueoflegends.com/en-us/news/dev/dev-arena-the-grand-reckoning/> (Arena God progresión, 2025)

Comunidad / terceros:
- <https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.min.json> (spec OpenAPI comunitaria: routing y parámetros)
- <https://riot-api-libraries.readthedocs.io/en/latest/ids.html> y <https://github.com/RiotGames/developer-relations/issues/20> (ids cifrados por proyecto)
- <https://raw.communitydragon.org/> y <https://github.com/communitydragon/docs/blob/master/assets.md> (CommunityDragon)
- <https://wiki.leagueoflegends.com/en-us/Arena> (historia del formato Arena)
- <https://lol.fandom.com/wiki/Patch_26.10>, <https://www.altchar.com/game-news/league-of-legends-patch-26.10-expands-arena-with-3v3v3v3v3v3-format-az48b0A2Z97G> (fecha 26.10 = 13 mayo 2026)
- <https://leagueofchallenges.com/challenge.php?id=602002> (umbrales; leaderboard con valores hasta 173, sin nota de temporada)
- <https://www.arenatracker.app/> (tracker comunitario de Arena God)
- npm/PyPI/GitHub: `twisted` (<https://github.com/justadev-afk/twisted>), `@fightmegg/riot-api` (<https://github.com/fightmegg/riot-api>), `riotwatcher` (<https://github.com/pseudonym117/Riot-Watcher>), `pulsefire` (<https://pypi.org/project/pulsefire/>), `cassiopeia` (<https://github.com/meraki-analytics/cassiopeia>).

Endpoints reales consultados (sin key en la URL): hosts `europe.api.riotgames.com`, `euw1.api.riotgames.com`, `ddragon.leagueoflegends.com`, `raw.communitydragon.org`.
