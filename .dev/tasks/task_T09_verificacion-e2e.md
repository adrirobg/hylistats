# Task T09 — Verificación E2E de iter-03 y verify-report

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Verificar AC1–AC4 contra la app real y dejar la evidencia en `.dev/verify-report.md`: capturas del navegador integrado, comandos, logs del worker, SQL de `sync_jobs` y enlaces externos abiertos. AC5 (F4) queda como **gate manual del supervisor** en el report y en la PR.

## Contexto <!-- SHOULD -->

- spec.md: AC1–AC5, "Riesgos y restricciones" (la key caduca hacia el 2026-09-30 a las 18:30 UTC) y "Decisiones técnicas".
- La evidencia de AC3 contra Riot se toma **justo después de T02** (con la key vigente) y se copia aquí. No hace falta repetirla al final si el código de T02 no cambia.
- Ejemplo del report: `.dev/archive/iter-02/verify-report.md`. Plantilla: `.dev/verify-report.md`.
- BD dev: `BEJITO MAMBO#1991`, 597 partidas, `602002 = 77`. Perfiles de prueba en `hylistats_test`: `Jugador Uno#EUW`, `Vacio Demo#EUW` y `Ausente Demo#EUW`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **AC1**:
   - `npm run lint && npm run typecheck && npm test && npm run build` (número de tests).
   - `grep` de `RGAPI-` y de los `puuid` de la BD en el repo, `.next/static` y los logs.
2. **AC2**, en el navegador integrado contra la BD dev (`BEJITO MAMBO`) o de tests:
   - abre por URL directa `?tab=resumen`, `?tab=companeros&min=5`, `?tab=partidas&partida={matchId}` y `?campeon=monkeyking` (o un campeón jugado) sobre dos pestañas distintas;
   - captura cada una y recarga para comprobar que se restaura.
3. **AC3** (tras T02, con la key vigente; **con 401/403, parar y avisar al supervisor**):
   - Arranca el servidor con el worker activo contra la BD dev, con el log en el scratchpad.
   - Anota `requests.matchIds` de `/api/health`.
   - Deja el perfil abierto y visible 11 min o más, con un observador JS de la visibilidad.
   - SQL: `select id, kind, interactive, created_at, finished_at from sync_jobs where profile_id = 1 order by id desc limit 5`. Comprueba ≤ 1 incremental automático cada 5 min y `matchIds` +2 por incremental.
   - Oculta la pestaña (otra pestaña al frente) durante más de 5 min y comprueba que no se encola nada. Al volver: una comprobación y, si toca, un incremental.
4. **AC4**: con los enlaces del panel, abre en el navegador integrado las 5 webs para al menos 5 campeones, 3 de ellos casos límite (Wukong, Nunu & Willump, Renata Glasc, Bel'Veth, Kai'Sa). Anota por cada una la URL final y el título o encabezado que prueba que es el campeón correcto. Rechaza los banners de cookies no esenciales.
5. **Responsive y estados**:
   - Sin scroll horizontal a 375, 960 y 1440 px en las cuatro pestañas y con el panel abierto.
   - Estados de §5 (T08) con las semillas.
6. **AC5**: gate manual del supervisor (F4). Se deja como checklist en el report y en la PR.
7. Escribe `.dev/verify-report.md` con la conclusión `PASS` si pasan AC1–AC4, y AC5 como gate explícito.

## Criterios de aceptacion <!-- MUST -->

- [ ] `verify-report.md` con evidencia de AC1–AC4 y AC5 como gate manual.
- [ ] AC3 verificado por logs y `sync_jobs` contra Riot con la key vigente.
- [ ] AC4: 5 campeones (3 casos límite) × 5 webs abiertos y correctos.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
