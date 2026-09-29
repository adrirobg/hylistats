---
name: dev-system
description: 'Referencia consultiva para entender como operar dentro de dev-system: algoritmo canonico v2, contratos entre
  fases, artefactos, escalada determinista y modelo de colaboracion. Leer al entrar en el sistema o antes de crear o ajustar
  workflows y skills.'
allowed-tools: Read Glob Grep
---


## IDENTITY

Esta skill explica el canon operativo de `dev-system`. Es **consultiva**: se lee para orientarse y para alinear decisiones locales con el sistema; no sustituye a las skills operativas de cada workflow.

`dev-system` es el source of truth de la metodologia, las skills, los templates, los scripts y las convenciones del entorno de desarrollo asistido por IA. Su objetivo es hacer el trabajo reproducible sin perder criterio humano: el supervisor decide, el orquestador coordina y los workers ejecutan con contratos claros.

## INPUT CONTRACT

Antes de aplicar esta skill al trabajo actual, leer o identificar como minimo:

- `AGENTS.md` del repo o proyecto activo
- `.dev/think.md` como memoria estrategica vigente
- `.dev/spec.md` y `.dev/tasks/index.json` si existe iteracion activa
- `.dev/verify-report.md` y `.dev/learn.md` si la iteracion ya paso por Verify o Learn
- `.dev/context.md` solo como snapshot derivado cuando exista

Precedencia de fuentes:

- `AGENTS.md` manda sobre wrappers o instrucciones secundarias del repo
- `.dev/think.md` manda como memoria estrategica y restriccion de proyecto
- `.dev/spec.md` manda sobre la iteracion activa
- `.dev/tasks/index.json` manda sobre el estado operativo mutable de las tasks
- `.dev/context.md` nunca sustituye a las fuentes anteriores

**Step 0 - anti-duplicacion**

Antes de crear una task, una investigacion, una seccion nueva en `think.md` o cualquier artefacto de iteracion, comprobar si ya existe un equivalente en:

- `.dev/tasks/`
- `.dev/research/`
- `.dev/think.md`
- artefactos activos de la iteracion

Si hay equivalencia clara, reutilizar, ampliar o enlazar lo existente. Si hay duda material, no crear en zonas estables hasta resolverla.

## STEPS

### 1. Canon

#### Foundational Algorithm

El algoritmo canonico v2 tiene **5 fases**:

```text
Think -> Spec -> Execute -> Verify -> Learn
```

La planificacion existe como actividad, pero **no** como fase canonica separada ni como artefacto obligatorio.

#### CODE motor

`CODE` significa `Capture -> Organize -> Distill -> Express`.

No es una fase aparte ni un gate burocratico. Opera dentro de cada fase para madurar inputs y convertirlos en artefactos o decisiones accionables.

#### Contratos entre fases

| Fase | Consume | Produce | Persistencia |
|------|---------|---------|--------------|
| Think | inputs diversos | `.dev/think.md` | Persistente |
| Spec | `.dev/think.md` como referencia y restriccion | `.dev/spec.md` + `.dev/tasks/` inicial | Per-iteracion |
| Execute | `.dev/spec.md` + `.dev/tasks/` | codigo, commits, PRs y mutaciones operativas de tasks | Per-iteracion |
| Verify | cambios, PRs y criterios de aceptacion de `spec.md` | `.dev/verify-report.md` | Per-iteracion |
| Learn | todos los artefactos de la iteracion | `.dev/learn.md` | Per-iteracion |

#### Artefactos y ciclo de vida

- Persistentes: `.dev/think.md`
- Per-iteracion: `.dev/spec.md`, `.dev/verify-report.md`, `.dev/tasks/`, `.dev/learn.md`
- Derivado y regenerable: `.dev/context.md`
- Archivado por iteracion: `.dev/archive/iter-NN/`

#### Contratos de templates

Los templates v2 y sus artefactos derivados usan markers `MUST/SHOULD/MAY`. Ver `docs/standards/skill-anatomy.md` para la regla general y `templates/project/.dev/` para el scaffold de referencia. Las skills y los agentes deben respetarlos al producir o editar:

- `.dev/spec.md`
- `.dev/tasks/task_*.md`
- `.dev/verify-report.md`
- `.dev/learn.md`

`think.md` tambien participa de esos markers segun su propio template (`templates/project/.dev/think.md`): el header (`**Estado**`/`**Ultima sesion**`) es MUST, `Hilos abiertos` es SHOULD y el glosario del proyecto es MAY. Aun asi no es un contrato de cierre operativo: `dev-close-iter` no lo valida como artefacto per-iteracion, solo exige esos headers como precondicion antes de cerrar. Sigue siendo memoria estrategica y destilacion continua, no un artefacto que se archive y resetee por iteracion.

#### Escalada determinista

Resolver siempre con el mecanismo mas simple que cierre el caso:

```text
codigo -> CLI -> prompt -> agentico
```

La IA entra donde hay ambiguedad, exploracion o necesidad de sintesis. Lo determinista debe resolverse de forma determinista.

### 2. Operacion

#### Modelo de colaboracion

- **Supervisor**: decide direccion, scope, prioridades y aprobaciones visibles
- **Orchestrator**: mantiene el contexto principal, coordina, delega e integra
- **Workers**: ejecutan trabajo aislado con ownership acotado y contrato cerrado

Regla: el orquestador no cambia direccion por su cuenta y no delega por delegar. Primero entiende el sistema, luego aplica la herramienta mas simple posible.

#### Cadena base de skills

Cadena minima de operacion hoy:

1. `dev-system` orienta el canon y las reglas transversales.
2. `dev-start` abre sesion y sintetiza el estado operativo.
3. `dev-task` gestiona el set activo de tasks.
4. `dev-learn` captura aprendizajes al cerrar la iteracion.

Las skills de coordinacion y revision amplian esta cadena cuando existan en el repo o en la instalacion activa. Deben referenciar este canon, no duplicarlo.

#### Convenciones

- Conventional Commits: `type(scope): descripcion` + `Refs: #N`
- Tipos: `feat`, `fix`, `research`, `maint`, `docs`, `test`, `ci`
- Branches: `tipo/ISSUE_NUMBER-slug-descriptivo`
- Cierre de issue en merge PR: `Closes #N`
- Alineacion esperada: issue label = branch prefix = commit type

#### Niveles de esfuerzo

El trabajo puede operar en `minimo`, `estandar` o `profundo` segun contexto. Regla practica: cubrir el contrato minimo necesario para avanzar sin expandir scope; profundizar solo cuando el riesgo, el supervisor o la invocacion lo pidan.

#### Unidad tocada, unidad coherente

Si una skill toca una unidad operativa, debe dejarla coherente con su estado real. Ejemplos:

- una task `done` necesita evidencias cerradas
- un `verify-report.md` necesita veredicto explicito
- un `learn.md` no debe quedar con placeholders del template si se considera cerrado

Si no se puede completar el cierre, se conserva el estado anterior y se escala. No se deja el artefacto a medias.

## OUTPUT CONTRACT

Tras leer esta skill, el agente debe poder responder con claridad:

- en que fase del algoritmo esta trabajando
- que artefacto manda en el contexto actual
- que artefactos son persistentes, per-iteracion o derivados
- cuando debe aplicar Step 0
- como escalar de forma determinista
- que skill operativa debe leer despues

Si esta skill se usa para guiar una accion concreta, el resultado minimo esperado es que la accion quede alineada con el contrato v2 y con `docs/standards/skill-anatomy.md`.

## ANTI-PATTERNS

- No expandir scope, direccion o arquitectura sin aprobacion del supervisor.
- No crear artefactos duplicados cuando ya existe un equivalente utilizable.
- No reintroducir `plan.md` ni la fase `Plan` como canon v2.
- No tratar `.dev/context.md` como source of truth.
- No dejar tasks, reports o learnings en estado incoherente con su contenido real.
- No duplicar en skills operativas el canon que ya vive en esta skill o en los templates.
