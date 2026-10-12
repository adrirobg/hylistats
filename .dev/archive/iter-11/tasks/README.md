# .dev/tasks/ — contrato operativo

`.dev/tasks/index.json` es el **source of truth operativo local** de la ejecucion derivada de un `spec.md` y, cuando aplique, de un issue. No sustituye el source of truth superior del proyecto. Concentra estado mutable, ownership y punteros operativos de las tasks de la iteracion activa.

Este directorio representa la iteracion activa. Al cerrarla, se archiva bajo `.dev/archive/iter-NN/tasks/`.

## Archivo provisionado

```json
{
  "tasks": []
}
```

## Shape de una task

```json
{
  "id": "T01",
  "title": "string",
  "status": "pending | in_progress | blocked | done | cancelled",
  "owner": "supervisor | orchestrator | worker:<id> | null",
  "branch": "string | null",
  "worktree": "string | null",
  "depends_on": ["T02"],
  "artifact_path": ".dev/tasks/task_T01_descripcion-kebab.md",
  "created_at": "ISO 8601 UTC",
  "updated_at": "ISO 8601 UTC"
}
```

## Campos

| Campo | Obligatorio | Descripcion |
|-------|:-----------:|-------------|
| `id` | si | Identificador estable. Formato: `T` + numero correlativo con zero-padding (`T01`, `T02`, `T10`) |
| `title` | si | Nombre corto y legible |
| `status` | si | Estado operativo actual |
| `owner` | si | Responsable operativo o `null` si no asignado |
| `depends_on` | si | Lista de `id` de tasks de las que depende. Vacia si no hay dependencias |
| `artifact_path` | si | Ruta relativa al `task_*.md` correspondiente dentro de `.dev/tasks/` |
| `created_at` | si | Timestamp ISO 8601 UTC de creacion |
| `updated_at` | si | Timestamp ISO 8601 UTC de ultima actualizacion |
| `branch` | no | Rama de trabajo asociada, o `null` |
| `worktree` | no | Ruta absoluta del worktree operativo, o `null` |

## Enums

- **status**: `pending` | `in_progress` | `blocked` | `done` | `cancelled`
- **owner**: `supervisor` | `orchestrator` | `worker:<id>` | `null`

## Convencion de naming

`artifact_path` sigue el patron: `.dev/tasks/task_<TASK_ID>_<descripcion-kebab>.md`

- El `id` dentro del nombre del archivo debe coincidir con el `id` del JSON.
- `<descripcion-kebab>`: descriptor legible, ASCII, kebab-case, corto y estable.
- Una vez creado, el path no se renombra salvo motivo fuerte.

## Precedencia index.json > task_*.md

- `.dev/tasks/index.json` manda sobre metadatos operativos mutables: `status`, `owner`, `branch`, `worktree`, `depends_on`, `artifact_path`, `created_at`, `updated_at`.
- `task_*.md` es el artefacto humano-IA complementario: contexto, instrucciones, AC, narrativa, notas y evidencias.
- `Owner` y `Estado` en `task_*.md` son mirror legible, no fuente alternativa de verdad.
- Si hay divergencia, manda `.dev/tasks/index.json`.

## Validacion determinista del shape

`scripts/dev-context.py` valida en cada arranque que las tasks del JSON tengan los campos obligatorios de la tabla anterior y que `artifact_path` exista en disco; los incumplimientos aparecen como avisos en el briefing compacto (deuda visible, no fallo silencioso).

## Reglas de consistencia

- Cada task del JSON debe tener un `artifact_path` que apunte a un `task_*.md` existente.
- El `id` en el nombre del archivo debe coincidir con el `id` del JSON.
- `updated_at` debe cambiar cada vez que cambie cualquier campo operativo.
- Una task con `status = blocked` debe tener al menos una dependencia en `depends_on` o una justificacion explicita en su `task_*.md`.
- Una task con `status = done` debe tener evidencias cerradas en su `task_*.md`.
- Una task con `status = cancelled` debe tener motivo de descarte en su `task_*.md`. No requiere evidencias de cierre.
- `depends_on` referencia siempre por `id`, nunca por titulo ni por path.
