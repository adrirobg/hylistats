---
name: dev-ship
description: 'Materializar la transición rama→develop al final de una iteración dev-system: commit y push de la rama, PR con
  `Closes #N` contra `develop`, gate de merge del supervisor, cierre de la iteración en develop (`/dev-close-iter`) tras el
  merge y oferta de release a `main`. Usar cuando Verify tiene PASS y learn.md está cerrado. Re-entrante: se invoca de nuevo
  tras el merge y continúa donde tocaba.'
disable-model-invocation: true
argument-hint: '[#N]'
allowed-tools: Read Edit Bash Glob Grep
---


## IDENTITY

Esta skill es **invocable**: `/dev-ship [#N]`.

Operacionaliza el flujo de cierre que el supervisor de la prueba de fuego
ejecutó a mano 7 veces (F-01): learn cerrado en la rama → push → PR → merge →
cierre. No es un flujo nuevo: es ese, verificado paso a paso.

**Adaptación local de hylistats** (F27, cambio deliberado pedido por el
supervisor; dogfood #32): la rama de integración es `develop`, no `main`.
`main` es producción (Render la despliega en cada push) y solo recibe releases
y hotfixes. La PR va contra `develop`, el cierre se hace en `develop` y, al
terminar, la skill **ofrece** la release (runbook en `docs/deploy.md` →
"Releases y hotfixes"); no la hace sin el sí del supervisor.

**Regla de único-escritor (F-17)**: la rama de iteración es el único escritor
de los artefactos per-iteración (`spec.md`, `verify-report.md`, `tasks/`,
`learn.md`); `develop` es lector hasta el ship. Nunca se escriben artefactos de
iteración en paralelo en ambas ramas — el estado llega a `develop` solo vía el
merge que esta skill materializa.

La skill es **re-entrante**: cada invocación detecta el estado real
(¿hay PR?, ¿está mergeada?) y ejecuta solo el tramo que corresponde. El gate
central no se salta jamás: **el merge de la PR es del supervisor; esta skill
no mergea**.

## INPUT CONTRACT

Consume y valida:

- Rama actual y su forma `tipo/N-slug` — de ahí se infiere el issue `#N` si
  no viene como argumento. Si no se puede inferir ni viene, escala.
- `.dev/verify-report.md` — debe existir con veredicto explícito `PASS` en
  `## Conclusion`. Con `FAIL` no se shippea: escala al supervisor.
- `.dev/learn.md` — secciones `MUST` (`## Resumen`, `## Que funciono`,
  `## Que ajustar`) con contenido real, no placeholders.
- `git status` — el working tree debe quedar limpio tras commitear los
  artefactos de la iteración; cambios ajenos al scope se escalan, no se
  arrastran al commit.
- `gh` CLI autenticado (`gh auth status`).

**Detección de estado** (Step 0): con `git branch --show-current` y
`gh pr view --json state,mergedAt 2>/dev/null` se determina en qué tramo del
ship estamos. Cada tramo tiene su verificación de entrada; ninguno se asume.

## STEPS

0. **Detecta el estado** y salta al tramo que corresponda:
   - En rama de iteración, sin PR → tramo A.
   - En rama de iteración, PR abierta sin mergear → tramo B.
   - PR de la rama mergeada (desde la rama o desde develop) → tramo C.
   - En develop sin PR pendiente de la iteración → no hay nada que shippear;
     informa y termina (si hay cambios en `develop` sin publicar en `main`,
     recuerda que la release está disponible).

1. **Tramo A — preparar y abrir la PR.**
   - Valida el INPUT CONTRACT completo (verify PASS, learn MUST, issue #N).
     Si algo falla, informa la causa concreta y para sin tocar nada.
   - Commitea los artefactos de la iteración pendientes en la rama
     (Conventional Commits, `Refs: #N`) y haz push.
   - Crea la PR contra `develop` (`gh pr create --base develop`) con `Closes #N` en el cuerpo y un resumen de los
     entregables desde `spec.md`.
   - **Para e informa**: PR creada, URL, y el siguiente paso — *el supervisor
     revisa y mergea; después se re-invoca `/dev-ship` para cerrar*.

2. **Tramo B — PR abierta.** Informa la URL y el estado. No mergees, no
   empujes commits nuevos salvo que el supervisor lo haya pedido
   explícitamente en esta sesión. Termina.

3. **Tramo C — cierre post-merge.**
   - Verifica el merge de verdad: `gh pr view --json state` = `MERGED`. Un
     estado distinto detiene el tramo.
   - `git checkout develop && git pull`.
   - Reconcilia `## Acciones siguientes` de `.dev/learn.md` antes de que el
     cierre lo archive: marca como consumida (tachado `~~...~~`) toda acción
     que este propio tramo ejecuta — el ship (push/PR/merge) y el cierre. El
     learn se escribe antes del ship, así que anotarlo ahí es legítimo; lo que
     no puede pasar es que llegue al archivo como pendiente y el briefing del
     próximo arranque lo proponga como siguiente acción (mismo patrón que la
     reconciliación de hilos de think.md).
   - Invoca el cierre de iteración (`/dev-close-iter`, que valida
     precondiciones y dispara `scripts/dev-close-iter.py`). Si el cierre
     reporta `blocked`, transmite sus causas y para: no se fuerza.
   - Push de develop con el cierre.
   - Informa: iteración cerrada, qué quedó archivado, estado activo limpio,
     y la rama de iteración lista para borrar (decisión del supervisor).

4. **Oferta de release.** Tras el tramo C, ofrece al supervisor publicar
   `develop` en producción con el runbook de `docs/deploy.md` ("Releases y
   hotfixes": `npm version minor|patch` en `develop`, PR `develop → main` que
   mergea el supervisor con merge commit, tag `vX.Y.Z` sobre el merge commit y
   comprobación del deploy de Render). Propón la versión (minor si la iteración
   trae funcionalidad, patch si solo corrige) y **para**: la release la decide
   el supervisor, que puede juntar varias iteraciones. Sin su sí en esta
   sesión no se ejecuta ningún paso del runbook.

## OUTPUT CONTRACT

Según el tramo ejecutado:

- Tramo A: rama pusheada con los artefactos de iteración commiteados, PR
  abierta contra `develop` con `Closes #N`, supervisor informado del gate.
  Nada tocado en `develop` ni en `main`.
- Tramo C: develop actualizado con el merge + el commit de cierre
  (`archive/iter-NN/` poblado, activos reseteados, header de think.md al
  día), pusheado. La salida informa de todo lo anterior y ofrece la release.
- En cualquier tramo: si una verificación falla, el estado queda como estaba
  y la causa se informa completa (P9: coherente o intacto, nunca a medias).

## ANTI-PATTERNS

- No mergear la PR ni aprobarla: ese gate es del supervisor, siempre.
- No cerrar la iteración sin verificar `MERGED` — secuenciar no es verificar.
- No escribir artefactos per-iteración en develop antes del merge (único-escritor).
- No abrir la PR de iteración contra `main` ni cerrar la iteración en `main`:
  `main` solo recibe releases y hotfixes.
- No hacer la release (versión, PR a `main`, tag) sin el sí del supervisor.
- No shippear con verify `FAIL`, learn en placeholder o working tree sucio.
- No reimplementar a mano el cierre: eso es de `/dev-close-iter` y su script.
- No borrar la rama sin decisión del supervisor.
