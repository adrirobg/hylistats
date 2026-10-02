# Task T09 — Comprobar si Spectator-V5 expone las partidas de Arena

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Queda documentado en `.dev/research/riot-api.md` si `/lol/spectator/v5/active-games/by-summoner/{puuid}` devuelve una partida de Arena en curso (y con qué `gameQueueConfigId` y campos), para decidir en una iteración futura si sincronizar al terminar la partida.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Investigación de Spectator-V5"; Estrategia, paso 8 (se hace antes de cerrar la iteración).
- think.md: ORGANIZED "iter-10" → P1 y P3 (Spectator fuera del alcance de producto).
- `.dev/research/riot-api.md:38` (Spectator en `euw1`, no usado); skill `riot-api`.
- Key: Personal key en `.env.local` (`RIOT_API_KEY`); nunca en logs ni en el chat.

## Prompt / instrucciones para worker <!-- MUST -->

1. Con un miembro jugando Arena (preguntar al supervisor cuándo), llamar a Spectator-V5 por `puuid` (host `euw1`) con la Personal key, desde un script o `curl` que no imprima la key.
2. Anotar en `riot-api.md`: si devuelve la partida, `gameQueueConfigId`, campos útiles (participantes, inicio) y coste (1 petición). Si no la devuelve (404), anotarlo igual.
3. Sin código de producto.

## Criterios de aceptacion <!-- MUST -->

- [ ] Resultado documentado en `.dev/research/riot-api.md`, sea positivo o negativo.

## Evidencias <!-- MUST -->

{Se completa al cerrar.}
