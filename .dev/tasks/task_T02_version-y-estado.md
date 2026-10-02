# Task T02 — Versión de datos y petición de estado con frescura dentro

**Owner**: worker:opus
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Existen las versiones de datos en memoria (por perfil y del grupo, con id de arranque), suben solo cuando se guarda algo que se ve, y hay una petición de estado barata que devuelve la versión y el estado de la sincronización para un perfil (y su grupo si es miembro) y aplica la frescura con el guardia de 2 min, compartida entre visores.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Versión de datos", "Estado barato", "Frescura dentro del estado" (dentro de "Un solo poller por página") y "Guardia de frescura a 2 min"; **AC1** completo; de **AC2** la primera cláusula (el estado no calcula el grupo ni las stats); de **AC3** la segunda y la tercera (frescura en el estado, una vez cada 30 s por perfil; `STALE_AFTER_MS` = 2 min); Riesgos → "Una sola instancia", "La versión se pierde al reiniciar", "El estado sigue consultando la BD".
- think.md: **F26**; ORGANIZED "iter-10" → P2 (qué sube la versión) y P3.
- research: `.dev/research/carga-y-refrescos.md` §2.3 (hallazgos 1, 6) y §4.A.
- Código:
  - `src/worker/queue.ts:22` `STALE_AFTER_MS`; `:46-70` señal de despertar en `globalThis` (patrón a copiar); `:248` `ensureFreshOnView`.
  - `src/worker/steps.ts`: `:395` `resolveAccount` (perfil resuelto, `status: "not_found"` en ~`:425`, update en ~`:470`); `:626` `fetchMatch` → `storeMatch` (partida guardada: subir la versión de **cada perfil registrado** cuyo `puuid` participa, no solo el del job); `:734` `closeJob` (602002 e icono: subir solo si el valor cambió; `lastSyncedAt` solo **no** sube la versión).
  - `src/domain/ingest.ts:90` `storeMatch`.
  - `src/domain/group-sync.ts`: `ensureGroupFresh`, `refreshGroup`, `countActiveGroupSyncs`.
  - `src/app/admin/actions.ts:60` `addGroupMemberAction`, `:81` `removeGroupMemberAction` (suben la versión del grupo).
  - Estado de sincronización actual del perfil: `src/app/euw/[slug]/data.ts:124-150` (`SyncQueue`, `SyncProgress`), `:317-500` (`loadRetry`, `loadQueue`, `loadSyncProgress`, `loadLastJobError`), y en `ProfileView` (`:195-260`) los campos `lastSyncedAt`, `sync`, `lastJobError`, `paused`. Del grupo: `GroupView.oldestSync` (`src/domain/group-view.ts:104`) y `countActiveGroupSyncs`.
  - Server actions de hoy: `src/app/euw/[slug]/actions.ts` (`ensureFreshOnViewAction`, `refreshAction`), `src/app/grupo/actions.ts`.
  - `src/app/api/health/route.ts`: ejemplo de route handler con `force-dynamic` y `no-store`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Versiones** en un módulo propio (p. ej. `src/lib/data-version.ts`): id de arranque + contador por perfil (`profileId`) + versión del grupo, en `globalThis`. API mínima: subir la de unos perfiles (y la del grupo si alguno es miembro, o pasar la lista de miembros), subir la del grupo, leer la de un perfil y la del grupo como cadena opaca que incluye el id de arranque. Tests unitarios.
2. **Puntos de subida** en el worker y en `/admin`, según el Contexto. Para una partida guardada, resolver los perfiles registrados entre sus participantes con una consulta por partida (por `puuid`). Un incremental sin partidas nuevas no sube nada. El backfill de un perfil ajeno al grupo no toca la versión de los miembros ni la del grupo salvo partidas compartidas. Tests de BD del worker para cada caso de **AC1**.
3. **Estado del perfil y del grupo**: extraer a un módulo propio (fuera de `data.ts`, que solo se recablea) la carga del estado de sincronización que hoy forma parte de `loadProfilePage` (`sync`, `lastJobError`, `paused`, `lastSyncedAt`) para que la usen la página y la petición de estado sin duplicar código. Para el grupo: jobs activos de miembros y sincronización más antigua. Nada de `loadProfileGroupData`, `loadGroupView` ni `getProfileStats` aquí.
4. **Petición de estado**: route handler (p. ej. `GET /api/estado?perfil=<slug>` y, para la vista del grupo, el mismo con un indicador; elige la forma tras leer la guía de route handlers) con `no-store`. Devuelve: versión del perfil, versión del grupo si es miembro, estado de sincronización (lo del paso 3) y `now` del servidor. Serializable y pequeño; sin `puuid`, sin texto de errores (como hoy).
5. **Frescura dentro**: la misma petición aplica `ensureFreshOnView` al perfil y, si es miembro y se mira el grupo, `ensureGroupFresh`; como mucho una vez cada 30 s por perfil, con un registro en memoria compartido entre visores (`globalThis`). Si encola algo, el estado lo refleja en esa misma respuesta o en la siguiente. Una petición a un slug no registrado o `not_found` no encola nada (mantener las reglas de `ensureFreshOnView`).
6. **`STALE_AFTER_MS` = 2 min** y tests de la cola actualizados.
7. No toques el cliente (`AutoRefresh`, `GroupFreshness`, `useRefresh`): lo hace T04. Deja documentado en tu informe el contrato del JSON (tipos exportados) para T04.

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

- [ ] Versiones por perfil y del grupo con id de arranque; tests (AC1).
- [ ] Subidas en worker y `/admin` solo con datos visibles; incremental sin partidas no sube; backfill ajeno no afecta al grupo salvo partidas compartidas; tests de BD (AC1).
- [ ] Petición de estado con versión y sincronización, sin cálculo del grupo ni stats (AC2, primera cláusula).
- [ ] Frescura dentro del estado, una vez cada 30 s por perfil compartida entre visores (AC3).
- [ ] `STALE_AFTER_MS` = 2 min con tests (AC3).
- [ ] Contrato del JSON exportado y descrito para T04.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

{Se completa al cerrar.}
