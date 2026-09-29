---
name: dev-task
description: Gestión de tasks dev-system. Ver estado, activar siguiente task, marcar completada, o mostrar detalle de una
  task específica.
disable-model-invocation: true
argument-hint: '[status|next|done T01|show T01]'
allowed-tools: Read Edit Bash Glob
---


## IDENTITY

Esta skill gestiona el estado operativo de `.dev/tasks/` durante la iteracion activa. Puede leer tasks, activar la siguiente o cerrar una task, pero no redefine el contrato de `spec.md`.

## INPUT CONTRACT

- `.dev/tasks/index.json` es el source of truth operativo mutable.
- Cada task debe tener `artifact_path` hacia su `task_*.md`.
- Para cualquier mutacion, actualiza `updated_at` en formato ISO 8601 UTC.
- Antes de marcar una task como `done`, verifica que `## Evidencias` este realmente cerrada en el `task_*.md`.

### tasks/index.json

Lee `.dev/tasks/index.json`. Si no existe, informa `WARN: no existe .dev/tasks/index.json`.

```bash
cat .dev/tasks/index.json 2>/dev/null || echo "WARN: no existe .dev/tasks/index.json"
```

## STEPS

El usuario ha ejecutado `/dev-task` con los argumentos proporcionados.

### `/dev-task` o `/dev-task status`

- Muestra tabla de TODAS las tasks: `| ID | Título | Estado | Owner |`
- Resumen: X done, Y pending, Z in_progress

### `/dev-task next`

1. Busca la primera task con `status: pending` cuyas dependencias (`depends_on`) estén todas en `done`
2. Cambia su `status` a `in_progress` en `.dev/tasks/index.json` (actualiza `updated_at` a NOW en ISO 8601 UTC)
3. Lee su `artifact_path` (el task_*.md correspondiente) y muestra: Objetivo, Contexto, Prompt/instrucciones, Criterios de aceptación
4. Informa: "Task T0X activada. Lee el task file para contexto completo."

### `/dev-task done T01`

1. Lee el `task_*.md` correspondiente.
2. Verifica que la seccion `## Evidencias` no este vacia ni en placeholder.
3. Si faltan evidencias, deten la operacion y pide completarlas antes de cambiar el estado.
4. Solo si las evidencias estan cerradas, cambia `status` a `done` en `.dev/tasks/index.json` y actualiza `updated_at`.
5. Muestra la siguiente task `pending` disponible, si existe.

### `/dev-task show T01`

1. Lee el task_*.md correspondiente al ID dado
2. Muestra contenido completo

### Reglas generales

- Siempre actualizar `updated_at` cuando cambies un campo en index.json
- Formato timestamp: ISO 8601 UTC (ej: `2026-04-04T20:00:00Z`)
- Si el subcomando no se reconoce, mostrar ayuda con los subcomandos disponibles
- Si no hay .dev/tasks/index.json, informar que no hay sistema de tasks configurado

## OUTPUT CONTRACT

La skill debe producir uno de estos resultados:

- tabla de estado de tasks
- activacion de una task con contexto suficiente para ejecutar
- cierre valido de una task con evidencias ya presentes
- detalle completo de una task concreta
- mensaje de bloqueo si faltan evidencias o no existe el sistema de tasks

## ANTI-PATTERNS

- No marcar una task como `done` sin evidencias cerradas.
- No ignorar dependencias al activar la siguiente task.
- No mutar campos fuera de `index.json` sin necesidad explicita.
- No reescribir `spec.md` ni reinterpretar el scope de la iteracion desde esta skill.
