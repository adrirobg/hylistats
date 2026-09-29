---
name: dev-learn
description: Capturar hallazgos al final de una iteración. Guía el proceso de rellenar learn.md con qué funcionó, qué ajustar,
  decisiones y deuda.
disable-model-invocation: true
allowed-tools: Read Edit Bash Glob Grep
---


## IDENTITY

Esta skill captura los aprendizajes de una iteracion cerrando `learn.md` con contenido real. No inventa hallazgos ni da por validada una iteracion sin evidencia suficiente.

## INPUT CONTRACT

- `spec.md` aporta criterios de aceptacion y foco de iteracion.
- `.dev/tasks/index.json` muestra que tasks quedaron realmente en `done`.
- `.dev/verify-report.md` aporta la evidencia obligatoria del resultado.
- `.dev/learn.md` es el artefacto que debe salir coherente al terminar.
- `CLAUDE.md` solo añade contexto si el proyecto funciona como lab del sistema.

Si falta un input clave, senalalo como gap. No conviertas ausencia de evidencia en conclusion positiva. En particular, Learn no empieza hasta que el gate Verify→Learn descrito abajo pase.

### spec.md (criterios de aceptacion)

Lee los criterios de aceptación de `.dev/spec.md` (líneas con checkboxes `- [`). Si no hay ACs, informa `WARN: no hay ACs en spec.md`.

```bash
grep -A 1 "^\- \[" .dev/spec.md 2>/dev/null || echo "WARN: no hay ACs en spec.md"
```

### tasks completadas

Lee `.dev/tasks/index.json` y lista las tasks con `status == "done"`. Si no hay ninguna, informa `WARN: no hay tasks done`.

```bash
jq -r '.tasks[] | select(.status == "done") | "\(.id): \(.title)"' .dev/tasks/index.json 2>/dev/null || echo "WARN: no hay tasks done"
```

### verify-report (gate bloqueante)

Lee `.dev/verify-report.md` completo. Antes de continuar, comprueba:

- existe y tiene una `Fecha` real, no placeholder
- `Alcance validado`, `Checks ejecutados`, `Resultados observados` y
  `Conclusion` contienen material real, no placeholders
- `Conclusion` declara `PASS` o `FAIL` explicitamente
- `Juicio de coherencia y sentido` contiene juicio sustantivo; `N/A` lleva
  una razon concreta

```bash
cat .dev/verify-report.md
```

Si cualquiera falla, informa `BLOCKED: verify-report.md no esta materializado`
con la causa concreta y para. No edites `learn.md` ni rebajes el bloqueo a
`WARN`.

### learn.md actual

Lee `.dev/learn.md`. Si no existe, informa `WARN: no existe .dev/learn.md`.

```bash
cat .dev/learn.md 2>/dev/null || echo "WARN: no existe .dev/learn.md"
```

### CLAUDE.md (si menciona dev-system lab)

Busca en `CLAUDE.md` menciones a `lab`, `validar` o `dev-system`. Si no hay coincidencias o no existe, informa `(no es lab de dev-system)`.

```bash
grep -i "lab\|validar\|dev-system" CLAUDE.md 2>/dev/null || echo "(no es lab de dev-system)"
```

## STEPS

1. **Valida** el gate Verify→Learn del INPUT CONTRACT; si falla, para
2. **Analiza** qué se hizo (tasks done) vs qué se planificó (spec ACs)
3. **Identifica** qué funcionó bien (prácticas, decisiones, herramientas)
4. **Identifica** qué hay que ajustar (fricción, ineficiencias, errores)
5. **Evalúa** decisiones: ¿se ratifican o se corrigen?
6. **Detecta** deuda técnica, metodológica o de documentación
7. **Propone** acciones siguientes con destino canónico

Si el proyecto es lab de dev-system, anade una seccion extra: **Hallazgos para dev-system** con lo que deberia promoverse al sistema (templates, skills, scripts, convenciones).

## OUTPUT CONTRACT

Edita `.dev/learn.md` directamente con contenido real. Fecha: hoy.

- Cubre siempre las secciones `MUST` del template.
- Completa las `SHOULD` cuando aporten valor real.
- Usa las `MAY` solo si existe senal suficiente para justificar la seccion.
- No dejes placeholders; si algo no aplica, elimina la seccion o usa `N/A`.
- Todo hallazgo diferido en Verify aparece en `Deuda y gaps` o `Acciones
  siguientes`, conservando dueno y destino.
- `Candidatos a vault` es el buzon de salida hacia el vault PKM: anotar, no actuar — nunca escribas ni elabores directamente en el vault, solo registra el candidato para que la sesion de vault PKM lo procese con sus propios gates.

## ANTI-PATTERNS

- No inventar aprendizajes que no se sostengan en tasks, verify o evidencia observable.
- No omitir `Que ajustar`; el learning no es solo celebracion.
- No dejar `learn.md` con placeholders del template una vez tocado.
- No tratar la ausencia de `verify-report.md` como PASS implicito.
- No continuar Learn con un verify-report en plantilla, incompleto o sin
  juicio sustantivo.
- No perder al pasar a Learn los hallazgos diferidos, su dueno o su destino.
