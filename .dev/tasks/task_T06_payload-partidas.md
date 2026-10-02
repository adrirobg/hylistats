# Task T06 — Desglose ELO solo de las filas visibles en Partidas

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`MatchesPanel` recibe el desglose ELO solo de las partidas de `matches.rows` (el bloque de `?n`), sin cambios en lo que se ve, y el tamaño de la pestaña Partidas queda medido antes y después.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Desglose ELO solo de las filas visibles"; **AC6** completo.
- think.md: ORGANIZED "iter-10" → "Recorte de payload" (D).
- Código:
  - `src/app/euw/[slug]/page.tsx:369-374`: `<MatchesPanel … elo={data.elo?.matches ?? null} />` (toda la temporada).
  - `src/app/euw/[slug]/matches-panel.tsx:58-66` `MatchesPanelProps.elo: EloMatches | null`; `matches-view.ts:31` `BLOCK_SIZE = 50`, `:440` `EloMatches`.
  - `src/app/euw/[slug]/data.ts:167` `MatchesData` (`rows`, `total`, `limit`) y `:689` `loadMatches`.
  - `ProfileElo.matches` (`src/domain/group-view.ts:279-300`) lo usa también el detalle de partida (`?partida`): comprobar que la partida abierta conserva su desglose aunque no esté en el bloque visible.

## Prompt / instrucciones para worker <!-- MUST -->

1. Mide antes: tamaño de la respuesta de `/euw/<slug>?tab=partidas` de un miembro con muchas partidas (HTML gzip y payload RSC de un `router.refresh()`), en build de producción local.
2. Filtra el desglose a los `matchId` de `matches.rows` (y de la partida abierta, si la hay) en el servidor, sin tocar la UI.
3. Comprueba que el historial, "Ver más", los filtros y el detalle muestran lo mismo que antes.
4. Mide después y anota los dos tamaños en tu informe (van al verify-report).

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

- [ ] El desglose ELO que viaja es solo el de las filas visibles (y la partida abierta) (AC6).
- [ ] Historial, "Ver más", filtros y detalle sin cambios visibles (AC6).
- [ ] Tamaño antes y después medido (AC6).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

{Se completa al cerrar.}
