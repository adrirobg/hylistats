# Task T08 — Script de sesión simulada y medición del antes

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Existe un script propio en `scripts/` (sin dependencias nuevas, `fetch` de Node vía `tsx`, con script npm) que simula N visores contra una URL base y mide 502, tiempos p50/p95 por pestaña y por estado; y está medido el "antes" sobre `develop` en local.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Script de sesión simulada"; **AC8** (medición local antes); **AC10** (se usará contra producción tras la release).
- research: `carga-y-refrescos.md` §2.2 (tiempos de producción por pestaña), §2.4 (estimación de carga), "Cómo verificarlo sin repetir el incidente".
- Código: `scripts/*.ts` y `package.json` → `scripts` (patrón `tsx --env-file-if-exists=.env.local scripts/…`); rutas del perfil `/euw/<slug>?tab=resumen|partidas|estadisticas|companeros|grupo`; slugs de los miembros con `profileSlug` (o se pasan por argumento); "Actualizar grupo" es una server action (no se puede llamar con `fetch` simple: usar en su lugar la petición de estado o documentar cómo se dispara, p. ej. pidiéndolo a mano en una pestaña real a mitad de la prueba).

## Prompt / instrucciones para worker <!-- MUST -->

1. Script con argumentos: URL base, número de clientes (5), duración (15 min), slugs de miembros, y modo: `antes` (imita el comportamiento actual: `router.refresh()` = GET de la página entera cada 30 s, dos veces en la pestaña Grupo, y comprobación cada 60 s) o `despues` (consulta el estado de T02 cada 10 s y pide la página solo si cambia la versión). Cada cliente cambia de pestaña cada ~30 s.
2. Para al primer 502 (o 5xx) y lo informa. Resumen final: peticiones por tipo, 5xx, p50/p95 por pestaña y por estado, renders de página por minuto.
3. El modo `despues` depende del contrato de T02: si T02 no ha terminado, implementa primero `antes` y deja `despues` para cuando exista.
4. Medición **antes** en local: build de producción de `develop` (`npm run build && npm run start` con la BD local), 5 clientes en la pestaña Grupo, 5 min en reposo. Anota renders/min y tiempos en tu informe (van al verify-report).
5. No lo lances contra producción: eso es AC10, con el sí del supervisor.

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

- [x] Script y script npm sin dependencias nuevas, modos `antes`/`despues`, para al primer 5xx.
- [x] Medición "antes" en local con 5 clientes en la pestaña Grupo (AC8).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Commit `88f05b1` (worker Sonnet en worktree), integrado con `dc6265b`. El orquestador enchufó después el contrato de T02 al modo `despues` (`STATUS_CONTRACT`: `/api/estado?perfil={slug}{grupo}`, versión = `kind,version,groupVersion`).
- Uso: `npm run sim:session -- --base-url <url> --slugs "Nombre#TAG,..." [--clients 5] [--duration 15] [--mode antes|despues] [--start-tab grupo] [--switch-every 30|0]`. Para al primer 5xx, fallo de red o timeout (código 2). Resumen: peticiones por tipo, estados, renders/min por minuto, p50/p95/max por tipo y pestaña. "Actualizar grupo" (server action) se pulsa a mano desde una pestaña real. `scripts/simulate-session.ts`, `scripts/session-sim-model.ts` (puro) y `tests/session-sim.test.ts`.
- **Medición "antes"** (código de `develop`, build de producción local, BD local con 1222 partidas y 6 miembros, worker en pausa; 5 clientes en la pestaña Grupo, 5 min en reposo, `--switch-every 0`):
  - 105 peticiones (5 cargas + 100 refrescos), 0 × 5xx.
  - **21,0 renders de página/min** (25, 20, 20, 20, 20): 5 clientes × 2 pollers × 2/min. Tamaño medio de respuesta 188 KB.
  - Carga HTML (5 en frío a la vez) p50 830 ms / p95 846 ms; refresco RSC p50 191 ms / p95 214 ms / max 339 ms.
  - CPU del proceso Next: 21 s en 5 min (~4,2 s/min, ~7 % de un núcleo del Mac).
- lint, typecheck, build y tests en verde en el worktree (65 ficheros, 1382); tras enchufar el contrato, 15 tests del script en verde.
