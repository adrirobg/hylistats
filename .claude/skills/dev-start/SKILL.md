---
name: dev-start
description: Inicio de sesión dev-system. Consume el briefing compacto compilado por dev-context.py, juzga coherencia y señala
  la siguiente acción. Usar al iniciar cualquier sesión en un proyecto dev-system.
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash
---


## IDENTITY

Esta skill abre una sesion de trabajo en un proyecto `dev-system` y entrega un briefing operativo compacto. No crea ni muta artefactos de fase (solo regenera `context.md`, que es derivado).

## FRONTERA MOTOR / LLM

El reparto es contrato, no costumbre (F-08/F-09, G2 resuelta 2026-07-03):

- **El motor compila** — `scripts/dev-context.py` produce el "que esta pasando": Fase inferida, Ultima accion, Iteracion activa, Siguiente accion, Hilos abiertos y Avisos, desde las fuentes por ciclo de vida (think/spec/tasks/verify/learn/archive/git). En sesiones Claude, el hook SessionStart ya lo ejecuto y sirvio el compacto al abrir la sesion.
- **El LLM consume y juzga** — esta skill NO recompila ese estado ni relee las fuentes para reconstruirlo. Aporta exactamente tres cosas: (1) juicio de coherencia sobre el compacto, (2) gaps metodologicos si los hay, (3) contexto breve solo si aporta.

El briefing general del proyecto (fuentes enteras, `--full`) es bajo demanda del supervisor, no parte del arranque.

## INPUT CONTRACT

Input primario: `.dev/context.md` compacto. Si el hook de sesion ya lo imprimio en el contexto de la conversacion, **no lo releas** — usalo. Si no esta, regeneralo y leelo:

```bash
DCS="scripts/dev-context.py"; [ -f "$DCS" ] || DCS="<directorio base de esta skill>/scripts/dev-context.py"
python3 "$DCS" . >/dev/null 2>&1 || true
cat .dev/context.md 2>/dev/null || echo "WARN: no existe .dev/context.md ni se pudo generar"
```

(Resolución del script: el `scripts/dev-context.py` del propio proyecto primero —
distribución autocontenida de project-init—, y el script embebido en esta skill
como fallback. El directorio base lo anuncia el runtime al invocar la skill; el
agente sustituye `<directorio base de esta skill>` por esa ruta.)

Escalada a fuentes (excepcion, no regla): abre `think.md`, `spec.md` o `tasks/` SOLO si (a) el compacto es incoherente o contradice algo visible (git, conversacion), o (b) el supervisor pide el detalle. Indica siempre por que escalaste.

Estados de `spec.md` que el compacto reporta: `plantilla` (no hay iteracion activa — no es un draft), `draft`, `aprobada`, o inexistente. Tras un cierre, el estado real vive en `archive/iter-NN/` y en los hilos de `think.md`; el compacto ya lo refleja.

## STEPS

1. Obten el compacto (hook o comando de arriba).
2. Contrasta su coherencia minima: ¿la fase inferida cuadra con git y con lo que la conversacion ya sabe? Si no, escala a la fuente concreta y señala la discrepancia.
3. Releva los Avisos: son deuda visible (placeholders MUST, shape de tasks, entorno) — no los omitas ni los repares en silencio.
4. Entrega el briefing en el formato del OUTPUT CONTRACT, añadiendo contexto breve solo si cambia lo que el supervisor haria a continuacion.

## OUTPUT CONTRACT

Briefing compacto, formato fijo:

1. **Ultima accion** — una linea
2. **Siguiente accion** — una linea, concreta y ejecutable
3. **Hilos abiertos** — solo los relevantes, una linea cada uno
4. **Avisos** — si el compacto los trae
5. **Contexto breve** — opcional, solo si aporta

Sin tablas de tasks por defecto, sin resumen del proyecto, sin repetir el compacto literal: sintetiza sobre el.

## ANTI-PATTERNS

- No releer `think.md` entero por defecto: eso es recompilar lo que el motor ya compilo (F-08).
- No tratar `.dev/context.md` como source of truth: es derivado; ante contradiccion mandan las fuentes.
- No reportar una spec `plantilla` (o en placeholders `{...}`) como iteracion activa, ni placeholders como hilos reales.
- No inventar estado cuando falte un artefacto; los Avisos existen para eso.
- No mutar artefactos de fase; esta skill solo consume y juzga.
