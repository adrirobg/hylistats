# Fixtures de la Riot API

Respuestas **reales** de la Riot API, anonimizadas, para que todos los tests funcionen sin key ni red.
Las graba `scripts/record-fixtures.ts` (`npm run fixtures:record`); las valida `tests/fixtures.test.ts`.

> **No regrabar sin necesidad.** Cada grabación gasta presupuesto de la Riot API (14 peticiones) y,
> como el mapa real -> anónimo vive solo en memoria, una regrabación renumera los jugadores anónimos
> (`anon-puuid-NNN`) y puede invalidar tests que dependan de ellos.

Fecha de grabación: **2026-09-29** (patch `16.19`). Jugador de prueba: `BEJITO MAMBO#1991`.

## Contenido y petición que lo produjo

| Fichero | Petición |
|---|---|
| `account.json` | `GET europe/riot/account/v1/accounts/by-riot-id/BEJITO%20MAMBO/1991` |
| `match-ids.json` | `GET europe/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=1750&startTime=1778544000&start=0&count=10` (1778544000 = 2026-05-12T00:00:00Z). Más reciente primero |
| `matches/<matchId>.json` | `GET europe/lol/match/v5/matches/{matchId}` para las partidas de `match-ids.json` en orden. Respuesta completa (~170 campos por participante), guardada compacta (una línea, sin sangría) |
| `match-404.json` | `GET europe/lol/match/v5/matches/EUW1_7300000001` (id inexistente). Se guarda `{ status, body }` |
| `player-data.json` | `GET euw1/lol/challenges/v1/player-data/{puuid}`, recortado (ver abajo) |

Total: 14 peticiones (1 account + 1 ids + 10 detalles + 1 de 404 + 1 player-data), sin 429.

## Anonimización

Se aplica en memoria antes de escribir nada a disco:

- Todo `puuid` (en `account.json`, `metadata.participants`, `info.participants[].puuid`) se sustituye de forma
  determinista por orden de aparición: el jugador de prueba es `anon-puuid-self`, el resto `anon-puuid-001`,
  `anon-puuid-002`… (mismo real -> mismo sustituto en todos los ficheros grabados en la misma ejecución).
- `riotIdGameName`/`riotIdTagline` de todo participante que no sea el jugador de prueba pasan a `PlayerNNN`/`ANON`
  (el mismo `NNN` que su puuid). El jugador de prueba conserva `BEJITO MAMBO#1991`.
- `summonerName` -> `""`; `summonerId`/`accountId` -> `"anon"`; `profileIcon` -> `0`.
- Antes de escribir, el script comprueba que ningún puuid real, Riot ID de tercero ni la key aparece en el contenido
  serializado, y que no queda ninguna cadena con forma de puuid (>= 70 caracteres base64url); si algo falla, no escribe nada.
- Los ids de partida (`EUW1_…`) y los datos de juego (campeones, ítems, augments, puestos) no se tocan.

## Recorte de `player-data.json`

Se conservan `totalPoints`, `categoryPoints` y solo las entradas de `challenges` con `challengeId` en
602000–602002 y 601000–601006. Se elimina `preferences`. `602002` ("Adapt to All Situations") vale `75` (MASTER).

## Partidas grabadas

10 partidas Arena tríos (`queueId 1750`, 18 participantes cada una, 2026-09-28 18:08 a 2026-09-29 11:51 UTC).
`Compañeros` = participantes con el mismo `playerSubteamId` que el jugador de prueba (siempre 2).

| matchId | placement | campeón | playerSubteamId | compañeros |
|---|---|---|---|---|
| `EUW1_7997909147` | 5 | Rakan | 2 | 013, 152 |
| `EUW1_7997941195` | 3 | Blitzcrank | 2 | 115, 013 |
| `EUW1_7997977102` | 3 | Zaahen | 3 | 115, 013 |
| `EUW1_7998150879` | 3 | Rakan | 2 | 046, 013 |
| `EUW1_7998171444` | 5 | Teemo | 3 | 046, 013 |
| `EUW1_7998206870` | 6 | Yuumi | 1 | 046, 013 |
| `EUW1_7998227781` | 4 | Varus | 1 | 046, 013 |
| `EUW1_7998254564` | 4 | Thresh | 1 | 046, 013 |
| `EUW1_7998494554` | 2 | Thresh | 2 | 022, 013 |
| `EUW1_7998513907` | 2 | Thresh | 1 | 012, 013 |

(Los compañeros se indican por el sufijo de su `anon-puuid-NNN`.)

- **La muestra no contiene ningún 1º puesto del jugador** (son las 10 partidas más recientes en el momento de
  grabar; sus puestos van de 2 a 6). En cada partida sí hay exactamente 3 participantes con `placement === 1`
  (el trío ganador, con el mismo `playerSubteamId`). Los tests que necesiten un 1º del jugador deben
  **sintetizarlo en memoria** a partir de una partida real (p. ej. cambiando el `placement` de su trío) o
  **usar el trío ganador real** de la partida. El recuento real de 1º puestos se verifica en el E2E contra la API (AC4).
- Compañero recurrente: `anon-puuid-013` está en las 10 partidas; `anon-puuid-046` en 5 (`7998150879`…`7998254564`,
  consecutivas); `anon-puuid-115` en 2; `012`, `022` y `152` en 1.
- `win` es `true` para los puestos 1–3 y `false` para 4–6 (no indica 1º puesto).
- Campeones del jugador: 7 distintos (Rakan x2, Thresh x3, Blitzcrank, Zaahen, Teemo, Yuumi, Varus).
