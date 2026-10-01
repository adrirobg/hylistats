# Task T04 — Documentación

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Que una sesión limpia sepa qué stack e infraestructura tiene el proyecto y pueda operar el despliegue sin este transcript.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Documentación"; **AC8**.
- `AGENTS.md` es source of truth; `CLAUDE.md` remite a él y no se toca.

## Prompt / instrucciones para worker <!-- MUST -->

1. `AGENTS.md`: sección "Stack e infraestructura" breve (stack y versiones, worker en proceso con advisory lock, Render + Supabase en Frankfurt, MCPs, reglas de secretos, pooler session, una instancia), enlazando a `docs/deploy.md`.
2. `docs/deploy.md`: despliegue, variables, rotación de la dev key, backup/restauración con `pg_dump`, pausa de Supabase, sueño de Render, límites Free, salto a Starter.
3. Solo hechos comprobados en T01–T03.

## Criterios de aceptacion <!-- MUST -->

- [ ] Sección de `AGENTS.md` fiel a lo desplegado (AC8).
- [ ] `docs/deploy.md` cubre los puntos del paso 2 (AC8).

## Evidencias <!-- MUST -->

- {pendiente}
