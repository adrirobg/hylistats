# Task T04 — Poller único por página y UI de sincronización desde el estado

**Owner**: worker:opus
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Cada página (perfil en cualquier pestaña, pestaña Grupo, perfil no encontrado) tiene un único mecanismo de cliente que consulta el estado de T02 cada 10 s (5 s con sincronización en marcha), solo con la pestaña visible, y llama a `router.refresh()` solo si cambió la versión, como mucho una vez por consulta. Todo lo que es estado de sincronización se pinta desde ese JSON.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Un solo poller por página" (con su sublista de lo que se pinta desde el JSON); **AC2** (segunda a cuarta cláusula) y **AC3** (primera cláusula); Riesgos → "`useRefresh` y su toast dependen hoy de las props renovadas por el polling".
- think.md: ORGANIZED "iter-10" → P2 (10 s / 5 s, propagación, un refresh por consulta).
- research: `carga-y-refrescos.md` §2.3 hallazgos 1 y 2, §3, §4.A y §4.B.
- Código (todo lo que hoy relee la página):
  - `src/app/euw/[slug]/auto-refresh.tsx` y `auto-refresh-policy.ts` (+ test): política pura actual (3 s / 30 s, latido 60 s).
  - `src/app/grupo/group-freshness.tsx` (+ `freshness-model.ts`, `group-freshness-section.tsx`): segundo poller, botón "Actualizar grupo" (`refreshGroupAction` con `revalidatePath`), aviso de antigüedad, `activeLabel`.
  - `src/app/euw/[slug]/use-refresh.tsx`: botón Actualizar del perfil, vigilancia cada 3 s hasta 90 s, toast de resultado con `refresh-outcome.ts` (`advanceWatch`, `refreshOutcome`).
  - `src/app/euw/[slug]/profile-states.tsx:78` `NotFoundCard`: polling cada 3 s durante 25 s tras "Reintentar" (~`:99`).
  - `src/app/euw/[slug]/page.tsx`: `:91` `<AutoRefresh active={data.sync !== null}>`; `:135` `syncBandModel(data.sync, data.paused, …)` y `:167` `SyncBand`; `:146-147` cabecera con `lastSyncedAt` y `sync`; `:275,319,357,399,441` `emptyState({ syncing, lastSyncedAt })` por pestaña; `:479` `GroupFreshnessSection`.
  - `src/app/euw/[slug]/header.tsx` (`lastSyncedAt`, `useRefresh`, `dataAgePhrase`), `sync-band.tsx`, `arena-god.tsx` (barra Deidad de Arena sincronizando, botones [Sincronizar]/[Reintentar] que pulsan `REFRESH_BUTTON_ID`).
  - Contrato del estado: el que deje T02 (tipos exportados).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Política pura** (nuevo módulo con tests, sustituye a `auto-refresh-policy.ts`): intervalos 10 s / 5 s solo con la pestaña visible; consulta inmediata al montar y al volver a la pestaña; decide `refresh` solo si la versión (perfil y, si aplica, grupo) cambió respecto a la que pintó la página; como mucho un refresh por consulta.
2. **Un proveedor de cliente por página** que consulta el estado, aplica la política y expone el JSON a los componentes (contexto de React). La versión inicial con la que se pintó la página llega por props desde el servidor, para no repintar al montar.
3. Pasan a leer del estado (no de las props del servidor): botón Actualizar ocupado y barra de progreso, `SyncBand`, barra Deidad de Arena sincronizando, "sincronizado hace…"/`dataAgePhrase`, aviso de antigüedad y botón "Actualizar grupo" ocupado. El primer render usa los datos del servidor (sin parpadeo ni desajuste de hidratación).
4. `useRefresh`: la vigilancia deja de tener su propio `setInterval`; el resultado (+N partidas / nuevo 1º / "Sin partidas nuevas") se decide cuando el estado dice que el job terminó, comparando con la foto previa. Si hubo partidas, la versión cambia y la página se repinta; si no, el toast sale igual sin repintar.
5. `GroupFreshness`: sin polling ni latido propios; el botón sigue llamando a `refreshGroupAction` (quita `revalidatePath("/grupo")`; T05 borra la página). `NotFoundCard`: su relectura pasa por el mismo mecanismo (5 s mientras espera).
6. Elimina `AutoRefresh` y cualquier `setInterval` con `router.refresh()` fuera del mecanismo (comprobar con `grep`). Ajusta los comentarios que mencionan `AutoRefresh` (`summary-panel.tsx:20`, `scoreboard.tsx:8`, `form-strip.tsx:14`, `page.tsx:492`, `data.ts:262`, `header.tsx:41`).
7. Verifica en el navegador (build de producción en local, dos pestañas): lo que pulsa una se ve en la otra en ≤ 10 s; un backfill de un perfil nuevo sigue mostrando el progreso y los datos creciendo; "Sin partidas nuevas" sale.

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

- [x] Política pura 10 s / 5 s, solo visible, un refresh por consulta y solo si cambia la versión, con tests (AC2).
- [x] Un solo mecanismo por página; ningún `setInterval` con `router.refresh()` fuera de él (AC3).
- [x] Botones, barras, avisos, "sincronizado hace…" y toast de resultado desde el estado, como hoy (AC2).
- [ ] Propagación ≤ 10 s entre pestañas comprobada en el navegador (AC2).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Commit `bc571ef` (worker Opus en worktree), integrado con `47fdc3f`.
- Nuevos en `src/app/euw/[slug]/`: `status-policy.ts` (+ test; 10 s / 5 s con job del perfil o `group.active > 0`, intervalo desde la vuelta de la última consulta, consulta inmediata al montar y al volver a la pestaña, sin temporizador oculta, `router.refresh()` solo si cambian `kind`/`version`/`groupVersion` y no hay otro en curso, nunca dos consultas a la vez), `status-provider.tsx` (proveedor + `usePageStatus`), `page-status.ts` (+ test; estado inicial desde el render), `sync-empty.tsx`.
- Borrados: `auto-refresh.tsx`, `auto-refresh-policy.ts` (+ test), `grupo/group-freshness-section.tsx`, server actions `ensureFreshOnViewAction` y `ensureGroupFreshAction`.
- Versiones iniciales: `loadProfilePage` lee `profileVersion`/`groupVersion` antes del `Promise.all` (`ProfileView.versions`); `page.tsx` construye `initial` sin consultas nuevas (en Grupo, `loadGroupSyncState`). Primer render del cliente = HTML del servidor.
- Toast: la vigilancia de `useRefresh` sin `setInterval` (solo tope de 90 s); "Sin partidas nuevas" sale cuando el estado dice que el job terminó, sin repintar; "+N" espera a que los datos repintados correspondan a la versión del estado. `NotFoundCard` dentro de un `StatusProvider`, mismo mecanismo (5 s con job, tope 25 s). Añadido: los estados vacíos de las pestañas leen el estado (`SyncEmpty`), para que un perfil sin partidas no quede en esqueleto fijo.
- `grep` de `setInterval`/`router.refresh`: solo `status-provider.tsx:137` refresca; los otros `setInterval` son la animación del sorteo y `use-now.ts` (reloj).
- lint, typecheck, test (69 ficheros, 1409) y build en verde en el worktree; tras integrar T03+T04: 71 ficheros, 1437 tests, lint, typecheck y build en verde.
- Pendiente para T10: comprobación en navegador (propagación ≤ 10 s entre pestañas, toasts, backfill, hidratación).
