# Task T03 — Dominio de equipos de temporada y tabla de temporada

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Funciones puras para las tablas de Dúos y Tríos de toda la temporada y para la tabla de Temporada por miembro (Resumen y Récords) con los líderes de cada columna, reutilizando las definiciones existentes.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Bloque Equipos" y "Bloque Temporada"; Entregable 3; **AC7** y **AC8** (parte de datos).
- think.md: ORGANIZED "iter-05: capa de grupo", P6–P8.
- Código:
  - Función de equipos de T02 (dúos y tríos sobre un conjunto de filas): reutilízala, no la dupliques.
  - `src/domain/records.ts:248`: `computeRecords(rows)` → `records.damage|damageTaken|kills|killingSpree|deaths`, `longestWinStreak`, `longestDrought`, `firstTry` (`count`, `rate`), `topChampion`.
  - `src/domain/stats.ts` y `src/domain/summary.ts`: cómo calcula hoy el perfil partidas, 1º, % de 1º y puesto medio (`computeSummary`); reutiliza esa función, no recalcules.
  - `src/domain/arena-god.ts:45`: `arenaGodGoal({ verified, official, championTotal })`; el valor de "campeones ganados" es `max(verified, official ?? 0)`, como el badge; nunca las marcas manuales.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Equipos de temporada**: tablas de Dúos y Tríos con partidas, 1º, % de 1º y puesto medio, solo equipos con 3 o más partidas juntos (la misma constante de T02), ordenados por partidas descendente (desempate estable y documentado). En Tríos solo tríos formados enteramente por miembros.
2. **Tabla de Temporada**: una fila por miembro con dos grupos de columnas:
   - Resumen: partidas, 1º, % de 1º, puesto medio, campeones ganados (`max(verified, official ?? 0)`), victorias a la primera (número y %) y campeón con más 1º.
   - Récords: máximo de daño, daño recibido, kills, racha de kills y muertes, racha más larga de 1º y de partidas sin 1º. Cada récord conserva su `matchId` para enlazar a la partida.
   Todo sale de `computeSummary`, `computeRecords` y la regla de `arenaGodGoal`, sin redefinir nada: el valor debe ser idéntico al del perfil del miembro.
3. **Líderes por columna**: el valor más bajo en puesto medio y el más alto en el resto; en empate, todos los empatados son líderes. Una columna sin datos no tiene líder.
4. Tests con filas sintéticas: umbral de 3 partidas en dúos y tríos, trío con un externo fuera de Tríos, orden, líderes con empate y columna vacía, y un test de equivalencia que compruebe que una fila de Temporada coincide con `computeSummary`/`computeRecords` del mismo jugador.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Tablas de Dúos y Tríos de temporada con umbral, orden y solo miembros en Tríos, con tests (AC7).
- [ ] Tabla de Temporada con las columnas de Resumen y Récords; valores idénticos a los del perfil (test de equivalencia) (AC8).
- [ ] Líderes por columna con empates, con tests (AC8).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
