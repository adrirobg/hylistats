# Task T03 — Recálculo independiente y métrica de estabilidad

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Comprobar con un cálculo independiente, que no reutiliza el TypeScript de la app, que la app aplica F28 sobre datos reales, y medir la estabilidad que se consigue.

## Contexto <!-- SHOULD -->

- spec.md: AC8 y AC9.
- `.dev/research/elo-estabilidad.md`: "Reproducir" (consulta SQL) y §1 (definición de las métricas por día).
- `.dev/research/elo-estabilidad/{elo.py,sim.py,run2.py}`.
- MCP `supabase` (PRO, **solo lectura**: `execute_sql` con un `select`, nunca `apply_migration`).

## Prompt / instrucciones para worker <!-- MUST -->

1. Actualizar `elo.py` a F28: puntos, pendiente, multiplicadores, racha (cruza días, solo sobre ganancias) y liga con margen sobre el rating redondeado. Tiene que dar también la racha en curso.
2. Generar `rows.json` con la consulta del research a PRO, en el scratchpad. No se commitea.
3. Sacar los ratings, las ligas y las rachas de la app con los mismos datos (BD local con copia o script con `tsx` sobre `computeGroupElo`) y compararlos miembro a miembro (±0,01).
4. Métrica de AC9: cambios de liga en el día para los días-jugador con 10 o más partidas, con la liga con margen. Reportar también la diferencia en el día, la liga distinta de un día a otro y la inflación.
5. Registrar los resultados en `verify-report.md`.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC8: coincidencia de rating (±0,01), liga y racha en curso para todos los miembros.
- [ ] AC9: mediana de cambios de liga en el día ≤ 1,5.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
