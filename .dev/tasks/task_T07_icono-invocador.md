# Task T07 — Icono de invocador (Summoner-V4) en la cabecera

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] `getSummonerByPuuid` en el cliente con su endpoint en `euw1`.
- [ ] El sync guarda `profileIconId`; un fallo no-auth no rompe el job (test).
- [ ] Cabecera con icono o placeholder.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
