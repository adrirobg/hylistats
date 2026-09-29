---
name: dev-harvest
description: 'Cosechar un proyecto dev-system: destilar learn.md, think.md y el archivo de iteraciones a un único .dev/harvest.md
  (qué se trabajó, qué se aprendió, qué se investigó, decisiones que sobreviven, estado final). Usar al cerrar o pausar un
  proyecto, o al cerrar una iteración mayor.'
disable-model-invocation: true
model: sonnet
context: fork
allowed-tools: Read Write Glob Grep Bash
---


## IDENTITY

Esta skill destila el conocimiento acumulado de un proyecto `dev-system` en un
único artefacto curado: `.dev/harvest.md`. Es el paso previo al volcado en el
PKM del supervisor (esa segunda fase NO pertenece a esta skill). No es un
resumen mecánico: selecciona lo que sobrevive al proyecto.

## INPUT CONTRACT

Fuentes, por precedencia. Si una falta, se declara como gap — no se inventa:

- `.dev/archive/iter-*/learn.md` — los learn por iteración archivados: fuente
  primaria de hallazgos (learn.md es per-iteración; el activo solo cubre la
  iteración en curso)
- `.dev/learn.md` — hallazgos de la iteración activa, si existe
- `.dev/think.md` — estado estratégico, decisiones (DISTILLED), hilos
- `.dev/archive/iter-NN/` — specs y verify-reports de iteraciones cerradas
- `.dev/research/` — investigaciones (solo títulos/estados, no releer enteras)
- git: `git log --format='%h %ad %s' --date=short` para cronología real

## STEPS

1. Lee las fuentes del INPUT CONTRACT. Anota qué fuentes faltan.
2. Reconstruye QUÉ SE TRABAJÓ: entregables y capacidades reales (no
   intenciones), con fechas del git log.
3. Destila QUÉ SE APRENDIÓ: máximo 7 puntos curados. Criterio: ¿cambiaría cómo
   se aborda el siguiente proyecto? Cita la evidencia (hallazgo, commit, doc).
3b. Preserva el buzón "Hallazgos para dev-system": recórrelo en TODOS los
   `learn.md` archivados (`.dev/archive/iter-*/learn.md`) y en el activo,
   deduplica y consérvalo como **inventario íntegro con recuento de
   recurrencia** (`N×: iter-NN, iter-MM`). Este buzón NO se cura ni se
   resume: la recurrencia es la señal (un harvest que eleva 2 de 20
   hallazgos destruye el backlog de mantenimiento).
4. Inventaría QUÉ SE INVESTIGÓ y dónde está (rutas concretas a los artefactos).
5. Extrae DECISIONES QUE SOBREVIVEN: las que aplican fuera de este proyecto.
6. Declara ESTADO FINAL honesto (qué quedó validado, qué no, qué se abandona)
   y SIGUIENTE ACCIÓN si existe — "ninguna" es una respuesta válida.
7. Lista CANDIDATOS A DESTILAR: afirmaciones o términos reutilizables fuera del
   contexto del proyecto, con destino propuesto (`nota-atomica` | `concepto` |
   descarte consciente). El volcado al PKM lo decide y ejecuta el supervisor.
8. Escribe `.dev/harvest.md` con la estructura del OUTPUT CONTRACT y muestra
   un resumen de 5 líneas al supervisor.

## OUTPUT CONTRACT

`.dev/harvest.md` con exactamente estas secciones:

```markdown
# Harvest: {proyecto}
> Generado: {fecha} | Fuentes: {las usadas} | Gaps: {las ausentes}

## Qué se trabajó
## Qué se aprendió
## Hallazgos para dev-system (inventario íntegro, con recurrencia)
## Qué se investigó y dónde está
## Decisiones que sobreviven al proyecto
## Estado final y siguiente acción
## Candidatos a destilar
```

Barra mínima: cada afirmación de "Qué se aprendió" debe ser rastreable a una
fuente (no opiniones nuevas); "Estado final" debe ser honesto aunque sea
incómodo; el archivo completo cabe en una lectura (~80 líneas máximo, sin
contar el inventario de "Hallazgos para dev-system", que mide lo que mida).

## ANTI-PATTERNS

- No escribir en el vault PKM ni en rutas fuera del proyecto: esta skill
  termina en `.dev/harvest.md` (el volcado tiene gate del supervisor).
- No inventar aprendizajes que no estén soportados por las fuentes.
- No volcar learn.md entero: harvest cura, no acumula. **Excepción única**: el
  buzón "Hallazgos para dev-system" se preserva íntegro con recurrencia —
  resumirlo es el anti-patrón que motivó esta regla (F-21).
- No usar esta skill como cierre de iteración rutinario (eso es
  `/dev-close-iter` + `/dev-learn`); harvest es cierre/pausa de proyecto.
- No declarar el proyecto "finalizado" en artefactos: el estado lo decide el
  supervisor.
