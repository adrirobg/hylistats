# Spec: hylistats
**Estado**: plantilla
**Consume**: think.md {§N referenciadas} como referencia y restriccion; brief de entrada en .dev/research/ si existe
**Produce**: `.dev/tasks/` inicial + criterios de aceptacion verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

{Que se va a construir/cambiar y por que. Una o dos oraciones.}

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- {entregable o cambio concreto}

**No incluye** <!-- SHOULD -->:
- {exclusion explicita relevante}

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | {nombre} | {que es y donde queda} |

## Criterios de aceptacion <!-- MUST -->

- [ ] {criterio verificable, no ambiguo}

## Riesgos y restricciones <!-- MAY -->

{Opcional — solo cuando aporte valor. Eliminar seccion si no aplica.}

## Estrategia de implementacion <!-- SHOULD -->

{Como se aborda el trabajo: secuencia, dependencias, decisiones tecnicas clave. `.dev/tasks/index.json` es tracking operativo local derivado de este spec y del issue; no sustituye el source of truth superior. Las tasks individuales no se duplican aqui.}
