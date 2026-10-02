---
name: dev-close-iter
description: 'Cerrar una iteracion dev-system: validar precondiciones semanticas, disparar `scripts/dev-close-iter.py` (que
  archiva `spec.md`, `verify-report.md`, `tasks/` y `learn.md`, resetea los activos y actualiza el header de `think.md`) y
  reconciliar los hilos abiertos de `think.md`. Usar al final de Verify/Learn, normalmente invocada por `/dev-ship` en develop
  tras el merge (en hylistats la iteración se cierra en `develop`, no en `main`; ver `AGENTS.md`).'
disable-model-invocation: true
argument-hint: '[iter-NN]'
allowed-tools: Read Edit Bash Glob Grep
---


## IDENTITY

Esta skill es **invocable**: `/dev-close-iter [iter-NN]`.

Cierra una iteracion ya decidida como cerrable. No decide si esta lista: ese
juicio ocurrio en `Verify` y `Learn`.

**Frontera skill↔script (contrato duro)**: el LLM **no archiva, no resetea y
no mueve ficheros** — todo el movimiento de archivos, la validacion mecanica
de precondiciones y la actualizacion del header de `think.md` salen de
`python3 scripts/dev-close-iter.py`. La skill aporta exactamente tres cosas:
el juicio semantico previo, la interpretacion de la salida del script y la
reconciliacion de los hilos de `think.md` posterior. Si en algun momento
parece necesario que el LLM haga a mano parte del cierre, eso es un bug de
contrato: se escala, no se improvisa.

## INPUT CONTRACT

El usuario (o `/dev-ship`) ha ejecutado `/dev-close-iter` con los argumentos
proporcionados.

La validacion mecanica (existencia de artefactos, tasks en `done/cancelled`,
fecha, secciones MUST basicas y veredicto explicito en `verify-report.md`,
secciones MUST de `learn.md`, target `iter-NN` inedito) **es del script**. La
skill valida lo que requiere juicio, leyendo antes de disparar:

- `.dev/spec.md` — el `## Objetivo` describe la iteracion real, no un texto
  de relleno que pasa el filtro de placeholders.
- `task_*.md` de las tasks `done` — las `## Evidencias` son evidencia real
  (commits, tests, salidas), no frases genericas.
- `.dev/verify-report.md` completo:
  - `## Juicio de coherencia y sentido` responde de forma sustantiva a ambas
    preguntas; `N/A` solo vale con una razon concreta
  - la respuesta no contradice checks, resultados ni conclusion
  - cada hallazgo detectado esta resuelto con evidencia o diferido con dueno y
    destino; una nota sin disposicion bloquea PASS
  - si el riesgo exigia replay/validacion independiente, el reporte registra
    actor, fallback y cobertura efectiva. El repo auditado permanece read-only;
    un fixture aislado puede ser mutable
- `.dev/learn.md` — el contenido es veraz respecto a la iteracion; si esta
  flojo o generico, sugerir `/dev-learn` antes de cerrar. La skill llamadora
  conserva el ownership del caso.
- `.dev/think.md` §Hilos abiertos — anotar cuales consume esta iteracion
  (se reconciliaran tras el cierre).

Si falta un input critico o hay ambiguedad material, no inventes contenido.
Escala con causa concreta.

## STEPS

1. **Juicio semantico previo** (INPUT CONTRACT). Si algo es relleno, falso,
   generico, contradictorio o deja un hallazgo sin disposicion, para aqui e
   informa; no dispares el script.

2. **Dispara el script**:

   ```bash
   python3 scripts/dev-close-iter.py [--iter iter-NN]
   ```

   Parsea el JSON de stdout: `{"status", "iter", "archived", "reset",
   "think_header_updated", "errors"}`.

3. **Si `status = "blocked"`** (exit ≠ 0): transmite `errors` literal al
   supervisor y para. No reintentes, no corrijas artefactos para que pasen
   la validacion, no reimplementes el cierre a mano. Si el bloqueo es
   `learn.md` incompleto, sugiere `/dev-learn` y retoma despues.

4. **Si `status = "closed"`: reconcilia los hilos de `think.md`** (el header
   ya lo actualizo el script — no lo toques). Lee la spec archivada
   (`.dev/archive/iter-NN/spec.md`) y el `learn.md` archivado, y en
   `.dev/think.md` §Hilos abiertos marca como resueltos o retira los hilos
   que la iteracion consumio. Solo los consumidos: los demas quedan
   intactos. Muestra el diff del cambio al supervisor en el informe.

5. **Informe final**: `iter-NN` cerrada; que archivo el script y donde;
   activos reseteados; hilos de think.md reconciliados (diff); siguiente
   paso — el proyecto queda listo para una nueva fase Think o Spec.

## OUTPUT CONTRACT

Al terminar con exito, debe cumplirse todo esto:

- El script reporto `status = "closed"`: `.dev/archive/iter-NN/` con
  `spec.md`, `verify-report.md`, `learn.md` y `tasks/`; activos reseteados
  a template; header de `think.md` actualizado.
- `.dev/think.md` §Hilos abiertos reconciliado por la skill: hilos
  consumidos marcados/retirados, el resto intacto, diff mostrado.
- Informe con: que se archivo, donde, estado activo limpio, hilos
  reconciliados y siguiente paso.

Contrato close-iter→dev-start: el estado que deja el cierre no produce
afirmaciones falsas en un arranque en frio (sin iteracion activa fantasma,
hilos consumidos cerrados).

La barra minima es binaria: o el script cerro y think.md quedo reconciliado,
o no se toco nada y se informa el bloqueo concreto (P9: coherente o intacto,
nunca a medias).

## ANTI-PATTERNS

- No reimplementar a mano nada de lo que hace el script (archivar, resetear,
  borrar tasks, editar el header de think.md) — ni siquiera "solo esta vez"
  porque el script fallo: se escala.
- No editar artefactos para que pasen la validacion del script.
- No tocar hilos de think.md que la iteracion no consumio, ni reescribir
  otras secciones.
- No tocar el contenido de `.dev/learn.md`: rellenarlo es de `/dev-learn`;
  archivarlo y resetearlo es del script.
- No sobreescribir `.dev/archive/iter-NN/` existente (el script ya lo
  impide; no lo puentees).
- No inventar veredictos, evidencias ni aprendizajes.
- No aceptar `N/A` sin razon en el juicio de coherencia/sentido.
- No convertir el precheck semantico en parser de palabras clave: la
  identificacion y disposicion honesta de hallazgos requiere juicio.
- No expandir scope hacia analisis nuevo, generacion de `context.md` o
  replanificacion de la iteracion.
