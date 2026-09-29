# hylistats

## Qué es este proyecto

Webapp de estadísticas de perfil de jugador para trackear progreso en el modo Arena de LoL usando la Riot API (inspiración: lolalytics.com/arena, op.gg/lol/modes/arena, metasrc.com/lol/arena, arenasweats.lol, arena.trott.dev)

## Inicio de sesión

1. Leer `AGENTS.md` — instrucciones canónicas y convenciones
2. Consumir el briefing compilado (`.dev/context.md`, lo sirve el hook SessionStart o `/dev-start`); escalar a `.dev/think.md` solo con justificación
3. Si hay work-in-progress, revisar `.dev/tasks/index.json`

## Estructura clave

- `.dev/` — artefactos de fase (`think.md`, `spec.md`, `verify-report.md`, `learn.md`) y `context.md` derivado cuando exista
- `.dev/tasks/` — tracking operativo de la iteracion activa
- `.dev/archive/` — archivo de iteraciones cerradas
- `.agents/skills/` — skills del proyecto
- `docs/` — documentación

## Skills

Las skills locales del proyecto viven en `.agents/skills/` (wrappers Codex) y `.claude/skills/` (wrappers Claude). El canon de cada skill vive en `skills/` si el proyecto está bajo dev-system, o directamente en `.agents/skills/` si es standalone. Si una tarea coincide con una skill, leer primero su `SKILL.md` y seguir sus instrucciones.

## Reglas

- `AGENTS.md` es source of truth si hay conflicto con cualquier otra instrucción
- No expandir scope sin aprobación del supervisor
- Escalada determinista: Código determinista → CLI → Prompt → Skill → Agéntico
