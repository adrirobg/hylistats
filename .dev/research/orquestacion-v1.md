# Orquestación de hylistats v1 (#1 → #2 → #3)

> Handoff para la sesión orquestadora (2026-09-29). Lo consume la sesión que implementa la v1 de forma autónoma. **No es un artefacto de iteración**: cada iteración sigue teniendo su `spec.md`, `tasks/`, `verify-report.md` y `learn.md`, escritos en su rama.

## Fuentes de verdad

| Qué | Dónde |
|---|---|
| Spec aprobada de cada iteración | Issue [#1](https://github.com/adrirobg/hylistats/issues/1), [#2](https://github.com/adrirobg/hylistats/issues/2) y [#3](https://github.com/adrirobg/hylistats/issues/3). Aprobadas por el supervisor el 2026-09-29 |
| Producto y decisiones | `.dev/think.md` §1, F1–F13 (cerrado) |
| Riot API | `.dev/research/riot-api.md` + skill `riot-api` |
| Sync y worker | `.dev/research/sync-strategy.md` |
| Stack | `.dev/research/stack.md` (salvo hosting: F12, desarrollo solo local) |
| Diseño | `.dev/research/design-brief.md` + `.dev/research/design-mock.html` (D1–D13 adoptadas por defecto, F13) |
| Método | skill `dev-system` y skills `dev-*` del proyecto |

## Rol

- El orquestador (Opus) **planifica, coordina, revisa y verifica**. Delega la implementación de cada task a **subagentes Sonnet** con prompts autocontenidos: rutas de archivo, criterios, restricciones y la referencia a la research relevante (regla global de delegación).
- Una iteración cada vez, en orden **#1 → #2 → #3**. La siguiente no empieza hasta que la anterior está mergeada **y** cerrada en main.

## Bucle por iteración

1. **Arranque**: `/dev-start`. Comprobar que main está limpio y al día (`git pull`), que `.dev/spec.md` está en `plantilla` (sin iteración activa) y que la iteración anterior está archivada en `.dev/archive/`.
2. **Rama**: `feat/N-slug`, con el nombre exacto que indica el issue, creada desde main.
3. **Spec**: materializar el issue en `.dev/spec.md` siguiendo la plantilla. `Estado: aprobada` (aprobada en el issue #N por el supervisor, 2026-09-29). `Consume:` think §1 + research. No cambiar el alcance del issue.
4. **Tasks**: descomponer la spec en `.dev/tasks/task_*.md` + `index.json` con el formato de la skill `dev-task`. Tasks pequeñas y verificables, en orden de dependencias; cada criterio de aceptación queda cubierto por al menos una task. Commit: `docs(spec): spec y tasks de iter-0N` + `Refs: #N`.
5. **Execute**, por cada task:
   - Activarla con `dev-task`.
   - Delegar a un subagente Sonnet.
   - Revisar el diff y ejecutar `npm run lint && npm test && npm run build`.
   - Commit Conventional (`feat(scope): …` + `Refs: #N`).
   - Marcarla como completada.
   
   Si una task falla dos veces con enfoques razonables, **escalar** en lugar de insistir.
6. **Verify**: comprobar cada criterio de aceptación del issue y escribir `.dev/verify-report.md` con la evidencia (comandos, salidas, capturas del navegador integrado para la UI).
   - Los criterios que necesitan la API real exigen una key vigente. Si da 401/403, parar y avisar al supervisor.
   - Los criterios marcados como **aceptación manual del supervisor** no los puede cumplir el orquestador. Se listan en el verify-report como *gate de merge* y se copian a la PR.
   - La conclusión es `PASS` si todos los criterios automatizables pasan; los manuales quedan como gate explícito.
7. **Learn**: `/dev-learn` → `.dev/learn.md`. Las fricciones del propio dev-system se anotan también en `.dev/research/dogfood-log.md`.
8. **Ship, tramo A**: seguir `.claude/skills/dev-ship/SKILL.md`. Push de la rama y PR contra main con `Closes #N`, resumen de entregables y la checklist de aceptación manual. **PARAR** y avisar al supervisor con la URL de la PR.
9. **Ship, tramo C** (solo cuando el supervisor diga que ha mergeado): verificar `MERGED`, `git checkout main && git pull`, `/dev-close-iter` y push del cierre. Después, siguiente issue.

## Límites (parar y escalar al supervisor)

- **Nunca** mergear ni aprobar PRs. Nunca hacer push a main, salvo el cierre del tramo C tras verificar `MERGED`.
- **Nunca** imprimir, loguear, commitear ni enviar a un subagente el valor de la Riot key. Leerla solo desde `.env.local` o `settings` dentro del código o del shell. Los subagentes reciben la instrucción de leerla así, nunca el valor.
- No conseguir keys nuevas ni tocar el portal de Riot. Con la key caducada, seguir con lo que no la necesita y avisar.
- No cambiar alcance, arquitectura ni decisiones F1–F13 o D1–D13. Si algo del issue es inviable o contradictorio, escalar con opciones y una recomendación.
- Sin hosting, despliegues, registro de producto ni cuentas externas (F12).
- Los tests **no** llaman a la API real: usan fixtures grabadas con `puuid` anonimizados y sin la key.
- Presupuesto Riot: todo pasa por el limitador. Como mucho un backfill completo por perfil, salvo un `db:reset` justificado.
- Si Docker no está en marcha, avisar. No instalar Postgres en el sistema.
- Dependencias nuevas fuera de las de `stack.md` §5: solo si son claramente necesarias, y justificadas en el commit.

## Puntos de control del supervisor

| Momento | Qué hace el supervisor |
|---|---|
| Antes de #1 | Arranca Docker Desktop y comprueba que la dev key de `.env.local` está vigente |
| Cada ~24 h | Renueva la dev key (en `.env.local` o, cuando exista, en `/admin`) |
| PR de #1 | Revisa y mergea. Avisa al orquestador |
| Antes de #2 (opcional) | Revisa D1–D13 sobre la maqueta. Si no dice nada, se aplican las recomendaciones |
| PR de #2 | Aceptación manual (elegir campeón en una partida real), merge y aviso |
| PR de #3 | Sesión real con el grupo (criterio de terminado F4), merge y aviso |

## Prompt de arranque sugerido

```
Eres el orquestador de hylistats v1. Lee `.dev/research/orquestacion-v1.md` y síguelo:
empieza por /dev-start y ejecuta el bucle para el issue #1. Delega la implementación en
subagentes Sonnet y respeta los límites del runbook. Para en cada PR y avísame.
```
