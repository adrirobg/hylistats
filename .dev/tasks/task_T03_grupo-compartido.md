# Task T03 — Vista del grupo calculada una vez por versión, día y semana

**Owner**: worker:opus
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`GroupView` se calcula una sola vez por (versión del grupo, día de juego, semana) y lo comparten todos los visores, la pestaña Grupo y la cabecera del perfil (títulos y ELO). `tab=grupo` deja de calcular el grupo dos veces.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Grupo calculado una vez"; **AC4** completo; Riesgos → "Memo en memoria frente a la caché de Next 16", "Una sola instancia".
- think.md: **F26**; F17 (día de juego, corte 06:00 Madrid) y F20 (semana, lunes 06:00).
- research: `carga-y-refrescos.md` §2.2 (`loadProfilePage` con `tab=grupo` ~150 ms: el grupo dos veces), §2.3 hallazgos 3 y 4, §4.C.
- Código:
  - `src/domain/group-view.ts`: `:112` `GroupView`; `:139` `groupPeriods`; `:153` `loadMemberRows`; `:203` `loadGroupView(db, now, seasonStart, catalog)`; `:303` `profileEloOf`; `:340` `loadProfileGroupData` (títulos con `titlesOf(view.day.titles, key)` + semana, y `profileEloOf(view.elo, key)`: se puede derivar de la `GroupView` memorizada).
  - `src/app/euw/[slug]/data.ts:507` `loadProfilePage`: llama a `loadProfileGroupData` siempre (~`:541`) y a `loadGroupView` con `tab === "grupo"` (~`:575`).
  - `src/app/grupo/page.tsx` (se elimina en T05; no dependas de ella).
  - Clave de periodo: `gameDay` (`src/domain/records.ts:185`) y `gameWeek` (`src/domain/group-titles.ts:66`).
  - Versión del grupo: módulo de T02.
  - `GroupView` depende de `now` (periodos mostrados, "si hoy no ha jugado nadie, el último día jugado") y del catálogo de campeones (`championTotal`, iconos).

## Prompt / instrucciones para worker <!-- MUST -->

1. Memo en memoria (`globalThis`) de la última `GroupView` con clave = versión del grupo + día de juego + semana de `now` (+ versión del catálogo si cambia los iconos o el total). Solo una entrada. Si dos peticiones llegan a la vez con la misma clave, comparten la misma promesa (no dos cálculos).
2. `loadProfileGroupData` y la pestaña Grupo usan ese memo; para un no miembro no se calcula nada (como hoy). La pestaña Grupo obtiene la vista y los datos de cabecera de un único cálculo.
3. Un contador de cálculos (exportado para tests y para la medición de AC8, sin logs ruidosos en producción) permite comprobar "cálculos = cambios de versión".
4. **No uses** `"use cache"` ni `unstable_cache` (Riesgos de la spec).
5. Tests: misma clave → un cálculo para N llamadas (incluidas concurrentes); cambio de versión, de día (05:59 → 06:00 Madrid) y de semana → recálculo; títulos y ELO de la cabecera idénticos a los de hoy (los tests existentes de `group-view.test.ts` y `data.test.ts` siguen en verde).

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

- [ ] Memo por versión + día + semana con promesa compartida; contador de cálculos (AC4).
- [ ] Cabecera y pestaña Grupo desde el mismo cálculo; `tab=grupo` sin doble cálculo (AC4).
- [ ] Tests de invalidación por versión, día (06:00) y semana; valores sin cambios (AC4).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

{Se completa al cerrar.}
