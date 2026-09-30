# Task T07 — Icono de invocador (Summoner-V4) en la cabecera

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

El sync guarda el `profileIconId` de cada perfil desde Summoner-V4 y la cabecera muestra el icono; si la llamada falla el sync termina igual (AC7).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Icono de invocador"; Entregable 7; AC7; Riesgos (presupuesto `euw1`, dev key).
- `.dev/research/riot-api.md` y skill `riot-api` (`.claude/skills/riot-api/`): Summoner-V4 `GET /lol/summoner/v4/summoners/by-puuid/{puuid}` en host `euw1`, campo `profileIconId`. Icono en Data Dragon: `https://ddragon.leagueoflegends.com/cdn/{version}/img/profileicon/{id}.png`.
- Código:
  - `src/lib/riot/client.ts:70`: interfaz `RiotApi` (añadir método), `RIOT_HOSTS`, `RiotEndpoint` (l. 27, límites por endpoint), implementación en `createRiotClient`.
  - `src/lib/riot/schemas.ts`: DTOs zod.
  - `src/worker/steps.ts:~731` `closeJob`: ya pide `getPlayerData` (euw1) al cerrar cada job y trata errores no-auth como no bloqueantes (`closeError`). El icono va en el mismo sitio y con el mismo patrón.
  - Columna `profiles.profileIconId` (T01).
  - `src/lib/ddragon.ts`: `DDRAGON_URL` y cómo se construyen URLs con versión.
  - `src/app/euw/[slug]/header.tsx`.
  - Tests del worker: `src/worker/worker.test.ts` con un `RiotApi` falso.

## Prompt / instrucciones para worker <!-- MUST -->

1. `SummonerDto` en `schemas.ts` (al menos `profileIconId: int`). Método `getSummonerByPuuid(puuid, priority)` en `RiotApi` e implementación (host `euw1`, endpoint nuevo en `RiotEndpoint` con su límite de método documentado en `riot-api.md`; si no está documentado, usa el de Summoner-V4 de la skill).
2. `closeJob`: tras `getPlayerData`, pide el summoner; si va bien, guarda `profileIconId`; si falla por algo que no es la key (`RiotAuthError` sí se propaga, igual que ahora), añade `summoner: …` a `closeError` y cierra el job igualmente.
3. Actualiza todos los `RiotApi` falsos de los tests.
4. Cabecera: `<img>` redondo con el icono (versión de DDragon en uso) y `alt` vacío si es decorativo junto al nombre; sin icono → el placeholder/estado actual de la cabecera.
5. Tests: sync con summoner OK guarda el id; summoner con 500 → job `done`, `lastError` contiene "summoner", perfil sin icono; auth error se propaga como hoy.
6. Con la dev key vigente, lanza un incremental de un perfil real y comprueba en la cabecera; si la key ha caducado (401/403), para y anótalo en Evidencias para el orquestador. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] `getSummonerByPuuid` en el cliente con su endpoint en `euw1`.
- [x] El sync guarda `profileIconId`; un fallo no-auth no rompe el job (test).
- [x] Cabecera con icono o placeholder.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Cliente:
  - `getSummonerByPuuid(puuid, priority)` en `RiotApi` pide `GET euw1 /lol/summoner/v4/summoners/by-puuid/{puuid}`.
  - El endpoint `summoner` está en `RiotEndpoint`, con límite de método 2000:60 según `riot-api.md` §1.7/§8.
  - El limitador solo modela ventanas por host y no hace falta tocarlo.
  - `SummonerDto` está en `schemas.ts`.
- `closeJob`: después de `getPlayerData` hay un `try` independiente para el summoner.
  - `RiotAuthError` se propaga.
  - Cualquier otro error va a `lastError` como `summoner: …` (junto a `player-data: …` si también falla) y el job se cierra en `done`.
  - El icono solo se escribe si la llamada va bien; si falla, se conserva el anterior.
- Cabecera: `profileIconUrl(version, id)` (`ddragon.ts`) monta la URL con la versión del catálogo en uso. Es un `<Image>` redondo con `alt=""`. Sin icono, o si la imagen no carga, se ven las iniciales.
- Tests:
  - 4 del worker: OK guarda el id; un 500 deja el job `done` con «summoner» en `lastError` y el perfil sin icono; un fallo posterior no borra el icono; un 403 pausa el worker como hoy.
  - Del cliente, de `ddragon` y de `data.ts`.
  - Se ajustaron los conteos de llamadas del cierre (+1 `summoner` en `euw1`).
- API real, con la dev key vigente y el preview `hylistats-dev` con worker: los incrementales en cola (jobs 95–98) cerraron `done` sin `last_error` y guardaron el icono. Iconos guardados:
  - Azpekaa 539
  - BEJITO MAMBO 7176
  - Hylimichi 7146
  - TheCIutch 4070
  - zapas14 7027

  Krill1nt y elruffles quedan a la espera de su próximo sync.
- Navegador: la cabecera de Hylimichi carga `https://ddragon.leagueoflegends.com/cdn/16.19.1/img/profileicon/7146.png` (redondo). Mientras se sincronizaba, zapas14 mostraba el placeholder de iniciales.
- `npm run lint && npm run typecheck && npm test && npm run build`: en verde (50 ficheros, 1100 tests).
