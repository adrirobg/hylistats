# Task T03 — Recálculo independiente y métrica de estabilidad

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [x] AC8: coincidencia de rating (±0,01), liga y racha en curso para todos los miembros.
- [x] AC9: mediana de cambios de liga en el día ≤ 1,5.

## Notas de implementacion <!-- MAY -->

- `elo.py` mantiene `run()` (reproduce el análisis del 2026-10-06) y añade `run_f28()` + `league_step()`; `ROWS` elige el `rows.json`.
- `check_f28.py`: ratings finales y métricas de estabilidad. `compare_app.ts` (`npx tsx`): `computeGroupElo` de la app sobre el mismo `rows.json`, con el historial partida a partida.
- `rows.json` (3203 filas, PRO hasta el 2026-10-12, consulta del research con `execute_sql` en solo lectura) en el scratchpad de la sesión: no se commitea.

## Evidencias <!-- MUST -->

- **AC8**: 6 miembros con rating (±0,01), liga y racha en curso iguales; **3203 partidas comparadas una a una (cambio ±1e-4 y racha): 0 diferencias**. Racha máxima 4; 68 partidas con bonificación.
- **AC9**: 94 días-jugador con ≥ 10 partidas desde el 2026-09-01 → cambios de liga en el día: **mediana 1,0, media 1,11** (hoy 5,5 de media). Diferencia en el día (mediana): 34 (hoy 65). Inflación: +30,9 (el research preveía +24 con datos hasta el 2026-10-06).
- Ratings finales F28: Krill1nt 1561,8 Platino · BEJITO MAMBO 1561,0 Platino · Hylimichi 1537,5 Platino (dentro del margen; `eloLeague` diría Oro) · Azpekaa 1531,1 Oro · TheCIutch 1509,0 Plata · zapas14 1484,9 Plata.
- Commits: `4c941f6` (`elo.py`, `check_f28.py`), `069efbb` (`compare_app.ts`).
