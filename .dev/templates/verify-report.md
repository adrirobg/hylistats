# Verify Report: {nombre o identificador}
**Fecha**: {fecha}
**Consume**: commits, PRs, AC del spec
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

{Que se verifico. Referencia explicita a los criterios de aceptacion del spec.}

- spec.md AC1: {descripcion}
- spec.md AC2: {descripcion}

## Entorno <!-- SHOULD -->

{Lo minimo para reproducir. OS, versiones, configuracion relevante.}

- OS: {ej. macOS 15.x}
- {herramienta}: {version}

## Checks ejecutados <!-- MUST -->

{Comandos, scripts, pasos manuales — formato copy-pasteable.}

```bash
# {descripcion del check}
{comando}
```

## Resultados observados <!-- MUST -->

{Output relevante, logs, capturas. Solo lo que aporta evidencia.}

## Juicio de coherencia y sentido <!-- MUST -->

{Separar el juicio de los checks mecanicos: coherencia canon↔instancias o artefactos relacionados; y si la salida tiene sentido en su dominio. `N/A` solo con razon concreta.}

## Revision de calidad del codigo <!-- SHOULD -->

{Pasada sobre el diff de la iteracion con el vocabulario de smells de *Refactoring* (Fowler): mysterious name, duplicated code, feature envy, data clumps, primitive obsession, repeated switches, divergent change, speculative generality, message chains, middle man. Los smells detectados van a la tabla de Hallazgos; si el diff esta limpio, decirlo. `N/A` solo si la iteracion no toco codigo.}

## Replay / validacion independiente <!-- SHOULD -->

{Indicar por que aplica o no segun el riesgo. Si aplica: actor, fuentes canonicas, repo auditado read-only, fixture aislado mutable, fallback previsto y cobertura efectiva/comandos/resultados.}

## Hallazgos <!-- MAY -->

{Todo hallazgo detectado debe quedar resuelto con evidencia o diferido con dueno y destino antes de PASS. Vacio si todo limpio.}

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| {hallazgo real} | {disposicion} | {dueno o N/A si resuelto} | {accion, issue o evidencia} |

## Conclusion <!-- MUST -->

**{PASS | FAIL}**

{Si FAIL: hallazgos que informan la siguiente iteracion. Si PASS: confirmacion escueta.}
