# Task {ID} — {titulo}

**Owner**: {supervisor | orchestrator | worker:<id> | (vacio si no asignado)}
**Estado**: {pending | in_progress | blocked | done | cancelled} *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. `## Evidencias` debe estar completa antes de cerrar la task.

## Objetivo <!-- MUST -->

{Resultado concreto esperado. Que existe al terminar que no existia antes.}

## Contexto <!-- SHOULD -->

{Referencias a spec, think, codigo u otros artefactos que el worker necesita leer para ejecutar. **Contrato de precompilado**: estas referencias se resuelven al GENERAR la task — secciones concretas (§N), AC numerados, paths con linea si aplica; nunca "leer think.md" o "ver la spec". Se precompila el material, no el juicio: el worker no debe re-preguntar ni re-buscar lo que la generacion ya sabia.}

- spec.md: {seccion o AC relevante}
- think.md: {decision o seccion relevante}
- {otros archivos o links}

## Prompt / instrucciones para worker <!-- MUST -->

{Framing operativo y directivas de ejecucion. Parte central del contrato de delegacion — lo que el worker debe hacer, en que orden, con que restricciones. Cuanto mas determinista, menos espacio para improvisacion fuera de lo planificado.}

## Criterios de aceptacion <!-- MUST -->

- [ ] {criterio verificable, no ambiguo}

## Notas de implementacion <!-- MAY -->

{Se completa durante Execute. Decisiones tomadas, alternativas descartadas, detalles relevantes.}

## Evidencias <!-- MUST -->

{Se completa al cerrar. Durante la ejecucion puede quedar vacia, pero no al marcar la task como done. Links a commits, PRs, outputs de tests, capturas — lo que demuestre que los AC se cumplieron.}
