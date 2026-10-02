# Task T05 — Quitar /grupo: redirect, barra y enlace de los badges

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La URL `/grupo` redirige a `/`, la barra superior ya no tiene "Grupo" y el enlace "Títulos" del tooltip de los badges lleva a la pestaña Grupo del mismo perfil. La vista sigue intacta en la pestaña Grupo.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Sin `/grupo`"; **AC5** completo.
- think.md: ORGANIZED "iter-10" → P7; F19 (revisado: la vista vive solo en la pestaña Grupo).
- Código:
  - `src/app/grupo/page.tsx` (la página; el resto de `src/app/grupo/` son componentes que usa la pestaña Grupo y se quedan).
  - `src/app/euw/[slug]/top-bar.tsx:8` (comentario) y `:23` (`<Link href="/grupo">`); "Sorteo" se queda.
  - `src/app/euw/[slug]/title-badges.ts:9-11` (`` href: `/grupo#${TITLES_ANCHOR}` ``) y `title-badges.test.ts`.
  - `src/app/grupo/group-view.tsx:64` (`` titlesHref = `#${TITLES_ANCHOR}` ``): ya es relativo dentro de la vista.
  - `src/app/grupo/actions.ts:36` `revalidatePath("/grupo", "page")`.
  - Buscar cualquier otro `/grupo` en `src/` (`grep -rn '/grupo' src`).

## Prompt / instrucciones para worker <!-- MUST -->

1. Redirect de `/grupo` a `/` (lee la guía de Next 16 de `redirects` en `next.config` o `redirect()`; elige lo más simple). Borra la página.
2. Quita el enlace "Grupo" de `top-bar.tsx` y ajusta su comentario.
3. El enlace del badge pasa a `?tab=grupo#titulos` del perfil en el que se pinta (el badge solo sale en miembros). Ajusta los tests.
4. Quita `revalidatePath("/grupo", …)`.
5. Comprueba que nada más enlaza a `/grupo` y que la pestaña Grupo conserva el apartado Títulos al final. Comprobación en el navegador: badge → apartado Títulos de la pestaña Grupo; `/grupo` → `/`.

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

- [x] `/grupo` redirige a `/` y la página ya no existe (AC5).
- [x] Sin "Grupo" en la barra superior; "Sorteo" sigue (AC5).
- [x] El enlace de los badges lleva a `?tab=grupo#titulos` del mismo perfil; tests (AC5).
- [x] Ningún otro enlace a `/grupo` (AC5).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Commit `063b90f` (worker Sonnet en worktree), integrado en la rama con `fa547a0`.
- Redirect en `next.config.ts` (`redirects()`, `permanent: false`): `curl -sI /grupo` → `307`, `location: /`; la query se conserva. `src/app/grupo/page.tsx` borrada.
- `top-bar.tsx` sin "Grupo"; "Sorteo" sigue. `TITLES_LINK.href` = `?tab=grupo#titulos` (relativo al perfil donde se pinta), con test.
- `revalidatePath("/grupo", "page")` quitado de `refreshGroupAction` (test ajustado). `grep` sin enlaces reales a `/grupo` (quedan comentarios en ficheros de T04).
- lint, typecheck, test (64 ficheros, 1369 tests) y build en verde en el worktree.
- Pendiente para T10: comprobación en navegador badge → apartado Títulos.
