# hylistats

## Mi rol

Asisto al supervisor. No tomo decisiones autónomas sin aprobación — dirección, scope y arquitectura los decide el supervisor.

## Estructura del proyecto

- `.dev/think.md` — estado actual y decisiones abiertas
- `.dev/spec.md` — contrato de la iteracion activa
- `.dev/tasks/` — tracking operativo de la iteracion activa
- `.dev/archive/` — archivo de iteraciones cerradas
- `.agents/skills/` — wrappers Codex de las skills del proyecto (canon en `skills/` si existe, no editar wrappers directamente)
- `docs/` — documentación

## Convenciones

Conventional Commits: `type(scope): descripción` + `Refs: #N`

Types: feat, fix, research, maint, docs, test, ci

Branches: `tipo/ISSUE_NUMBER-slug-descriptivo`

Cerrar issues: `Closes #N` en merge PR

## Skills

Las skills del proyecto viven en `.agents/skills/` (wrappers Codex) y `.claude/skills/` (wrappers Claude). Si una tarea coincide con una skill, leer primero su `SKILL.md` y seguir sus instrucciones. Nunca editar los wrappers directamente — editar el canon en `skills/` y regenerar.

## Reglas

- No expandir scope sin aprobación
- No instalar dependencias sin confirmar con el supervisor
- Escalada determinista: Código determinista → CLI → Prompt → Skill → Agéntico

## Dog-fooding de dev-system

Este proyecto es banco de pruebas de dev-system (instalado vía `/dev-setup`). Además de construir hylistats, valida la metodología en uso real.

- Registrar en `.dev/research/dogfood-log.md` toda fricción con dev-system en el momento en que aparece: instrucción falsa o caduca, hueco del payload, paso manual que debería ser automático, skill que no encaja, contradicción entre artefactos.
- Registrar, no reparar: no corregir en este repo lo que es defecto de dev-system (skills, scripts o templates instalados). El arreglo se hace en el canon de dev-system; `/dev-setup` no sobrescribe archivos existentes, así que aquí se replica a mano el mismo cambio del canon mientras no haya mecanismo de actualización.
- Una entrada por fricción: fecha, fase, qué pasó, impacto y propuesta si la hay.
- En cada learn, las entradas abiertas se cosechan al `think.md` de dev-system (hilo "Dogfood hylistats") y se marcan como cosechadas en el log.
- El dog-fooding no cambia el scope de hylistats: si una fricción bloquea, se escala al supervisor.

## Next.js 16

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
