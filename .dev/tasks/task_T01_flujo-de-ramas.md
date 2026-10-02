# Task T01 — Flujo de ramas: tag v1.0.0, documentación y skills contra develop

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`develop` queda documentada como rama de trabajo, `main` como producción que solo recibe releases y hotfixes, existe el tag `v1.0.0` y las skills `dev-ship` y `dev-close-iter` de hylistats trabajan contra `develop` y ofrecen la release. Va primero: esta misma iteración se entrega con ellas.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Flujo de ramas"; **AC9** (todas las cláusulas salvo la última, que se cumple al entregar la iteración); Riesgos → "Skills locales adaptadas".
- think.md: **F27**; ORGANIZED "iter-10" → P4 (versiones), P5 (release, 4 pasos), P6 (hotfix y staging).
- Memoria del proyecto: `rama-develop-por-defecto` (hasta esta task, "main" en las skills se lee como `develop`).
- Archivos: `AGENTS.md` (secciones Convenciones y Stack e infraestructura → Producción); `docs/deploy.md` (§ "Cómo se despliega", línea ~16: Render despliega `main`); `.claude/skills/dev-ship/SKILL.md` (tramos A–C, PR contra `main` en ~l.64, `git checkout main && git pull` en ~l.76, cierre en main en ~l.87–97); `.claude/skills/dev-close-iter/SKILL.md` (descripción ~l.5: "invocada por `/dev-ship` en main"); `scripts/dev-close-iter.py` (comprobar si asume la rama `main`; `main()` en l.444 es la función, no la rama); `.dev/research/dogfood-log.md` (tabla numerada, última entrada #31).
- No existe `skills/` ni `.agents/skills/` en este repo: el canon local son los `SKILL.md` de `.claude/skills/`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Tag `v1.0.0`**: crear el tag anotado sobre `b955a82` (`maint(close): cerrar iter-09`), que es el `main` actual. **Pedir confirmación explícita al supervisor antes de `git push origin v1.0.0`** (es visible en GitHub).
2. **`AGENTS.md`**: en Convenciones, el flujo: ramas de iteración desde `develop` y PR contra `develop` (`Closes #N` cierra porque `develop` es la rama por defecto); `main` = producción (Render la despliega) y solo recibe releases (PR `develop → main` con merge commit, que mergea el supervisor) y hotfixes (`fix/N-slug` desde `main`, PR a `main`, tag patch y después merge de `main` en `develop`); SemVer (minor por release con funcionalidad, patch por hotfix, `npm version`); sin staging (`develop` se prueba en local con build de producción). Enlazar el runbook.
3. **`docs/deploy.md`**: sección nueva "Releases y hotfixes" con el runbook de P5 (1. `npm version minor|patch` en `develop` y commit `maint(release): vX.Y.Z`; 2. PR `develop → main` con las issues y PR incluidas, merge commit, lo mergea el supervisor; 3. tag `vX.Y.Z` sobre el merge commit de `main` y push del tag, release de GitHub opcional; 4. comprobar el deploy de Render: evento y `/api/health`) y el de hotfix de P6. Cómo probar `develop` en local (build de producción y, si hace falta, copia de datos con el procedimiento de "Backup y restauración").
4. **`dev-ship`** (solo en hylistats): la PR va contra `develop`; el tramo C hace checkout/pull de `develop` y el cierre (`/dev-close-iter`) en `develop`; al terminar, **ofrece** la release (enlazando el runbook) y no la hace sin el sí del supervisor. Mantener la regla de autorización de merge explícita.
5. **`dev-close-iter`**: descripción y cualquier referencia a `main` → `develop`. Si `scripts/dev-close-iter.py` comprueba la rama, ajustarlo y su test si lo hay.
6. **Dogfood**: entrada #32 en `dogfood-log.md` (fecha 2026-10-02, fase Ship): dev-system asume que la iteración se mergea y cierra en `main`; en hylistats `main` despliega solo y se adaptan `dev-ship`/`dev-close-iter` a un flujo con `develop` y releases, **como cambio local deliberado pedido por el supervisor** (excepción a "registrar, no reparar"); propuesta: rama de integración configurable en el canon y paso de release opcional.
7. Actualizar la memoria `rama-develop-por-defecto` del proyecto: quitar la nota "hasta que la iter-10 actualice…".

## Criterios de aceptacion <!-- MUST -->

- [ ] Tag `v1.0.0` en `b955a82`, empujado tras la confirmación del supervisor.
- [ ] `AGENTS.md` describe `develop`, releases, SemVer, hotfix y la ausencia de staging.
- [ ] `docs/deploy.md` tiene el runbook de release y el de hotfix.
- [ ] `dev-ship` y `dev-close-iter` trabajan contra `develop` y `dev-ship` ofrece la release al final.
- [ ] Entrada #32 en `dogfood-log.md`.

## Evidencias <!-- MUST -->

{Se completa al cerrar.}
