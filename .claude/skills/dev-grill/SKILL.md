---
name: dev-grill
description: Madurar una semilla de proyecto o iteracion en fase Think hasta dejar entendimiento compartido y un think.md
  accionable. Usar cuando una idea, handoff, brief o hilo necesita ser interrogado antes de pasar a Spec. No ejecuta el plan,
  no abre Spec y no crea almacenes de ideas.
disable-model-invocation: false
argument-hint: '[semilla|hilo]'
allowed-tools: Read Edit Bash Glob Grep
---


## IDENTITY

Esta skill es **invocable**. Opera dentro de Think para madurar una semilla de
proyecto o iteracion hasta que exista entendimiento compartido, decisiones
explicitas y un `think.md` accionable.

Adapta el patron de `mattpocock/skills` (`grilling`, `grill-me`,
`grill-with-docs` y `domain-modeling`) al canon de `dev-system`: una pregunta
por turno, hechos investigados en fuentes disponibles, decisiones reservadas al
supervisor y cristalizacion inmediata de lo resuelto.

No decide por el supervisor, no abre Spec, no ejecuta implementacion, no crea
un parking `ideas/` y no sustituye el algoritmo `Think -> Spec -> Execute ->
Verify -> Learn`. La salida `no-init` es legitima: si la semilla no alcanza una
forma terminable, aparcarla o reconducirla a conocimiento es un resultado
correcto del grill.

## INPUT CONTRACT

Source of truth principal: `.dev/think.md`. Si hay conflicto entre una semilla
externa y `think.md`, el grill registra la discrepancia y pregunta antes de
cristalizar.

Leer antes de preguntar, en este orden:

1. `.dev/think.md`: estado, inputs procesados, decisiones, secciones `EXPRESSED`
   e hilos abiertos.
2. Inputs opcionales referenciados por el usuario o por `think.md`, normalmente
   `.dev/research/`, handoffs, briefs de entrada o notas semilla. Si
   `.dev/research/` contiene un brief de entrada (contrato en README, ciclo de
   fabrica; template canonico `templates/brief/brief-entrada.md`), consumirlo
   antes de preguntar: sus hechos verificables no se re-preguntan, sus
   restricciones se respetan como limites duraderos y sus preguntas abiertas
   alimentan el arbol del grill. Si el brief trae instrucciones de sesion, son
   revocables: una directiva posterior del supervisor las precede. Ante
   contradiccion con `think.md` u otra fuente, aplica la regla de conflicto de
   arriba (discrepancia registrada y pregunta antes de cristalizar).
3. Evidencia determinista del repo si existe: archivos, tests, docs o scripts
   que puedan responder hechos sin preguntar.
4. Contexto conversacional del supervisor.

Step 0 anti-duplicacion: antes de crear secciones, hilos o decisiones, comprobar
si ya existe un equivalente en `think.md` o `.dev/research/`. Ampliar o enlazar
lo existente si cubre el mismo concepto.

Si falta un input critico, no inventar. Separar:

- **Hechos**: se investigan en fuentes disponibles antes de preguntar.
- **Decisiones**: se formulan con recomendacion y razon breve, y se preguntan al
  supervisor.

## STEPS

1. **Preparacion**
   - Leer las fuentes del INPUT CONTRACT.
   - Devolver una lista corta de fuentes consumidas y huecos reales.
   - No preguntar por hechos disponibles en el repo o en los briefs leidos.

2. **Funcion**
   - Preguntar que trabajo debe hacer la idea y que problema evita.
   - Exigir siempre dos salidas: **v1 minima habitable** y **criterio de
     terminado**.
   - Si la idea no alcanza forma terminable, proponer `no-init`: aparcar,
     descartar o reconducir a conocimiento.

3. **Ciclo de vida**
   - Ubicar donde entra la idea en `Think -> Spec -> Execute -> Verify -> Learn`.
   - Fijar cuando termina la intervencion del grill y que handoff deja.

4. **Artefacto**
   - Decidir que se escribe y donde, sin crear contenedores vacios.
   - Por defecto, escribir solo en `.dev/think.md`.

5. **Frontera**
   - Separar que decide el supervisor, que puede compilar el agente, que puede
     resolver tooling determinista y que pertenece a conocimiento externo.
   - Mantener el almacen de conocimiento opcional y enchufable; dev-system no
     lo posee.

6. **Forma**
   - Elegir la forma operativa minima: skill, template, aviso, README, script,
     investigacion o cierre `no-init`.
   - Preferir cambio determinista minimo cuando haya mas de una forma valida.

7. **Alcance**
   - Registrar que entra en v1, que queda fuera y que queda post-v1.
   - Repetir el **criterio de terminado** como gate operativo.

8. **Gate**
   - Resumir decisiones, preguntas abiertas y salida recomendada.
   - Esperar confirmacion explicita del supervisor antes de pasar a Spec,
     ejecutar o materializar implementacion.

Durante el interrogatorio, hacer una sola pregunta por turno: varias preguntas
a la vez aturden al que responde y producen respuestas parciales que dejan
ramas sin cerrar. Cada pregunta debe llevar una respuesta recomendada y una
razon breve, salvo que el supervisor pida un modo distinto.

### Cristalizacion CODE en `think.md`

Cristalizar solo contenido resuelto:

- Decisiones que cumplen las tres condiciones de `domain-modeling` se escriben
  en `## DISTILLED — Decisiones tomadas`: son dificiles de revertir, serian
  sorprendentes sin contexto y resultan de un trade-off real.
- Hilos no cerrados se escriben o actualizan en `## Hilos abiertos`.
- El glosario es lazy: crear `## Glosario del proyecto <!-- MAY -->` solo si
  hay terminos reales que reduzcan ambiguedad, y ubicarlo inmediatamente despues
  de `## ORGANIZED — Ideas organizadas`.
- Las salidas cerradas que pasan a Spec se expresan en `## EXPRESSED —
  Especificaciones cerradas` con destino inmediato explicito.

## OUTPUT CONTRACT

La skill termina con una de estas salidas:

- `ready-for-spec`: entendimiento compartido confirmado, decisiones relevantes
  cristalizadas y una seccion `EXPRESSED` lista para que Spec la consuma.
- `needs-more-think`: hilos abiertos actualizados y siguiente pregunta o fuente
  concreta identificada.
- `no-init`: semilla aparcada, descartada o reconducida a conocimiento con
  motivo breve y sin abrir Spec.

Barra minima de cierre:

- Fuentes consumidas y huecos reales nombrados.
- v1 minima habitable y criterio de terminado respondidos o marcados como
  bloqueo.
- Decisiones del supervisor separadas de inferencias del agente.
- `think.md` coherente con lo resuelto si se edito.
- Si el grill consumio un brief de entrada, el cierre incluye su canal de
  vuelta: que aporto el brief, que le falto y que sobro, registrado donde el
  brief lo indique (`learn.md` o la seccion grillada de `think.md`).

## ANTI-PATTERNS

- No pasar a Spec sin confirmacion explicita de entendimiento compartido.
- No ejecutar implementacion ni crear ramas/issues como parte del grill.
- No preguntar decisiones disfrazadas de hechos ni inferir decisiones por el
  supervisor.
- No crear `ideas/`, archivos de glosario o investigaciones vacias.
- No canonizar una decision que no cumpla las tres condiciones de persistencia.
- No convertir `no-init` en fracaso: es una salida valida cuando evita fabricar
  un proyecto mal tipado.
- No duplicar hilos, decisiones o secciones existentes en `think.md`.
- No introducir sintaxis o dependencias especificas de un runtime en el canon de
  la skill.
