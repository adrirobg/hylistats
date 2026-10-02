# Task T07 — Incremental sin partidas nuevas sin 602002 ni icono

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un incremental que no encuentra partidas nuevas no pide `602002` (`getPlayerData`) ni el icono (`getSummonerByPuuid`); el backfill y los incrementales con partidas nuevas siguen pidiéndolos.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Incremental sin partidas, sin llamadas de más"; **AC7** completo; Riesgos → "Retraso del contador `602002`".
- think.md: ORGANIZED "iter-10" → P1 (parte barata de E) y P3 (coste de un incremental vacío: 1 petición).
- Código:
  - `src/worker/steps.ts:725-800` `closeJob` (su comentario explica por qué hoy se pide siempre: comparar el contador oficial con la lista verificada, F7) y `:494` `incrementalStartTime`, `:525` `listPage`.
  - `src/worker/worker.test.ts` (cliente de Riot simulado).
  - `profiles.challengeCheckedAt`, `challengeValue`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Antes de implementar**, comprueba si el contador `602002` puede llegar con retraso respecto a la partida que lo sube: en la BD local, para 1º con campeón nuevo, compara `challengeCheckedAt`/valor tras el job que trajo la partida con el valor posterior (o busca documentación en `.dev/research/riot-api.md`). Si hay indicios de retraso, **para y descríbelo** con los datos: la spec prevé escalarlo (p. ej. seguir pidiéndolo mientras `challengeCheckedAt` sea anterior a la última partida + un margen).
2. Si no hay indicios: en `closeJob`, para un job `incremental` sin partidas nuevas, no llames a `getPlayerData` ni a `getSummonerByPuuid`; `lastSyncedAt` y el cierre del job, igual. Actualiza el comentario de `closeJob`.
3. Tests del worker: incremental vacío sin esas llamadas; incremental con partidas y backfill con ellas.

Reglas comunes (todas las tasks de código):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, route handlers, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras con tests (la UI no tiene jsdom: la lógica de cliente va en módulos puros, como `auto-refresh-policy.ts`); textos de UI en español; comentarios con la densidad y el tono del código que tocas.
- No hagas crecer `src/app/euw/[slug]/data.ts` (720 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Una sola instancia de la app (AGENTS.md): el estado en memoria vive en `globalThis`, con el mismo patrón que la señal de despertar de `src/worker/queue.ts:46-70` (las rutas de Next y el worker comparten proceso pero no siempre el mismo módulo cargado).
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. Si otras tasks corren en paralelo en el mismo árbol, avisa en el informe en vez de pelear con fallos ajenos (fricción #23). No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Comprobación previa del retraso del 602002 documentada en el informe.
- [x] Incremental sin partidas nuevas sin `getPlayerData` ni `getSummonerByPuuid` (AC7).
- [x] Backfill e incremental con partidas, con ellas; tests del worker (AC7).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Commit `e01c12c` (worker Sonnet en worktree), integrado con `ace9e20`.
- **Paso 1 (retraso del 602002)**: no concluyente con la BD local; sin indicios de retraso. Solo se guarda la última lectura (`challengeValue`, `challengeCheckedAt`), así que no se puede comparar el valor tras la partida con el posterior. Hoy el oficial cuadra con el recuento propio en 5 de 7 perfiles; en los otros 2 el oficial va 1 **por encima** (dirección contraria a un retraso; no investigado). Nada sobre latencia en `riot-api.md` ni en el archivo de iter-02. Propuesta para medirlo en producción: loguear el valor antes y después en el incremental que trae un 1º con campeón nuevo y en el siguiente.
- `closeJob`: `needsCloseCounters` decide si se piden `getPlayerData` y `getSummonerByPuuid`: backfill, incremental con `totalIds > 0` y **(desviación; el supervisor decide mantenerla, 2026-10-02)** perfil con alguna partida guardada que terminó después de su `challengeCheckedAt` (o sin lectura previa). Motivo: un incremental cuyo perfil ganó una partida que ya descargó un amigo trae `totalIds = 0` (la cola solo incluye ids no guardados) y con la regla literal su 602002 se quedaría sin leer. Un incremental vacío de verdad no pide nada y no pisa los valores guardados ni sube la versión (T02).
- Tests en `worker.test.ts` (incremental vacío solo `matchIds`×2 y conserva valores; con partida nueva pide las dos; partida compartida pide una vez y el siguiente es ligero; `challengeCheckedAt` nulo pide) y ajuste en `data-version.test.ts`.
- lint, typecheck, test (68 ficheros, 1403) y build (Turbopack) en verde en el worktree; tests del worker (66) en verde tras integrar.
