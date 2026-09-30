# Task T11 — Verificación E2E con la UI y re-backfill real de la cola 1740

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Verificar AC1–AC7 contra la app real, con evidencia en `.dev/verify-report.md`: capturas del navegador integrado, comandos, SQL y métricas de `/api/health`. AC8 queda como gate manual del supervisor. El re-backfill de la 1740 de `BEJITO MAMBO#1991` se hace **con la UI abierta**, y así una sola ejecución sirve de evidencia para AC5 y AC7.

## Contexto <!-- SHOULD -->

- spec.md: AC1–AC8, "Riesgos y restricciones" (key, presupuesto) y "Decisiones técnicas".
- Estado de la BD dev: `BEJITO MAMBO#1991` tiene 509 partidas 1750 y `602002 = 75`; con la 1740 se esperan unas 80 partidas más y 5 campeones verificados nuevos: Sona, Malphite, Aphelios, Gnar y Jayce. La key vigente está en `settings` (fuente `db`).
- Plantilla del report: la de `.dev/verify-report.md`. Ejemplo de iter-01 en `.dev/archive/iter-01/verify-report.md`.
- Trucos de entorno (handover de iter-01):
  - SQL en un fichero del scratchpad (`docker compose exec -T postgres psql -U hylistats -d hylistats < f.sql`).
  - `npm run build && npm start` con el log en el scratchpad.
  - Key y token solo en el shell, sin imprimirlos.

## Prompt / instrucciones para worker <!-- MUST -->

1. **AC1**: `npm run lint && npm run typecheck && npm test && npm run build`. `grep` de la key (`RGAPI-`) y de los `puuid` de la BD en el repo, en `.next/static` y en los logs.
2. `npm run db:migrate`, `npm run build` y `npm start` (log al scratchpad). `/api/health` con `key.status = ok`. **Con 401/403, parar y avisar al supervisor.**
3. **AC2**:
   - En el navegador integrado, `/` sin datos locales → landing.
   - Guarda "Este soy yo" en `/euw/BEJITO%20MAMBO-1991` y vuelve a `/` → redirige.
   - `/?inicio` → landing.
   - Captura cada paso.
4. **AC3**:
   - Marca 3 objetivos (uno sin jugar, uno jugado sin ganar y uno ganado) y marca a mano uno jugado.
   - Captura el álbum con los 4 estados y el objetivo.
   - Cambia filtro, búsqueda, orden y vista, y comprueba que la URL refleja cada cambio. Recarga con esa URL y comprueba que se restaura.
5. **AC5 + AC7**:
   - Anota las métricas de `/api/health`.
   - Con el perfil abierto en 1440 px, ejecuta `npm run sync:season -- "BEJITO MAMBO#1991"`.
   - Captura, sin recargar, la banda "Descargando la temporada" con f/t en al menos dos momentos, el marcador (Partidas) subiendo y los cromos de la 1740 sellándose.
   - Al terminar: verificados = `602002` y aviso "Cuadra" (captura). SQL independiente: `count(distinct champion_id) filter (placement = 1)` sobre 1750 ∪ 1740 desde `SEASON_START`.
   - Después, "Actualizar" pasado el cooldown, sin partidas nuevas: `matchIds` +2 y `match` +0 en `/api/health`.
   - Registra el coste en peticiones.
6. **AC4**: tests de `arena-god` con los 4 casos (salida de vitest). Opcionalmente, captura de un caso distinto de "Cuadra" simulado con marcas manuales.
7. **AC6**: landing y perfil a 375, 960, 1440 y 1920 px (`resize_window`). En cada uno, `document.documentElement.scrollWidth <= clientWidth` (con `javascript_tool`) y captura.
8. **Accesibilidad**:
   - Contraste AA de los pares de tokens de texto sobre `--bg` y `--surface-1`, calculado con un script en el scratchpad.
   - Teclado: `/`, `o`, flechas y `Esc`.
   - Presencia de las reglas de `prefers-reduced-motion`.
9. **AC8**: se lista como gate de merge en el report y en la PR.
10. Escribe `.dev/verify-report.md` con veredicto `PASS` si AC1–AC7 pasan, y los hallazgos.

## Criterios de aceptacion <!-- MUST -->

- [x] Evidencia de AC1–AC7 en `verify-report.md` (capturas, comandos, SQL, métricas); AC8 como gate manual.
- [x] Re-backfill de la 1740 hecho con la UI abierta, sin recargar, y con `verificados = 602002`.
- [x] 0 fugas de key ni de `puuid`.

## Notas de implementacion <!-- MAY -->

- Orden real: al abrir el perfil se encoló el incremental automático (job 5), que trajo 8 partidas 1750 nuevas jugadas el 29-sep; `602002` pasó de 75 a 77. Después, el re-backfill (job 6) con la UI abierta y "Actualizar" sin partidas nuevas (job 7).
- La verificación de contraste encontró `--text-faint` por debajo de AA (3,53:1). Se subió el token a `#858179` (4,90 / 4,53), commit aparte `fix(ui)`, con los cuatro checks repetidos.
- AC5 se registró con un observador JS en la página (1 s) en lugar de capturas sueltas: fecha cada transición y prueba que no hubo recarga.

## Evidencias <!-- MUST -->

- `.dev/verify-report.md`: veredicto **PASS**, con AC1–AC7 y accesibilidad con evidencia y AC8 como gate de merge.
- AC7: SQL 1750 ∪ 1740 = **77** = `602002`; los 5 nuevos son Sona, Malphite, Aphelios, Gnar y Jayce. "Cuadra con el contador oficial." en la página. Incremental sin partidas nuevas: `matchIds` +2 y `match` +0.
- AC5: marcador 517 → 577 → 589 → 597 y barra 72 → 75 → 76 → 77, sin recargar; sellos en vivo de Aphelios, Gnar, Jayce, Malphite y Sona.
- Fugas: 0 (key de `settings` y de `.env.local`, y `puuid`) en `.next`, en el árbol, en git, en los logs y en las respuestas HTTP.
- Coste Riot: 102 peticiones, 0 × 429.
- Checks (tras el ajuste del token): lint OK (121 ficheros) · typecheck OK · `npm test` 36 ficheros y 623 tests en verde · build OK.
