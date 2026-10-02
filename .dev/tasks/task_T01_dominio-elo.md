# Task T01 — Dominio del ELO

**Owner**: worker:opus
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un módulo puro `src/domain/elo.ts` (con `elo.test.ts`) que, a partir de las partidas de los miembros, calcula el rating de cada miembro, el desglose de cada partida, la liga, el *provisional*, el cambio del día y de la semana y el orden de la Clasificación. Constantes en `src/lib/config.ts`.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Cálculo del rating", "Ligas", "Cambio del periodo" y orden de "Bloque Clasificación"; Riesgos → "El cambio base no es la tabla de puntos", "Redondeo", "El cambio del periodo sigue al bloque Hoy / Semana"; **AC1** y **AC2**.
- think.md: F24 (modelo), F25 (ligas, provisional), F17 (día de juego), F20 (semana).
- Código:
  - `src/domain/group-titles.ts:28`: `GroupMatchRow` (`puuid` = clave de miembro, `matchId`, `gameStartTimestamp`, `playerSubteamId`, `placement`, …). Es la entrada.
  - `src/domain/group-titles.ts:66` `gameWeek`, `:74` `periodKey`, `:139` `displayedPeriod` (periodo que muestra el bloque Hoy / Semana; reutilízalo tal cual para el cambio del periodo).
  - `src/domain/records.ts:185` `gameDay`: la única definición del día de juego.
  - `src/domain/stats.ts` (`PLACEMENTS`) e `isPlacement` en `group-titles.ts:47`: solo cuentan los puestos 1..6.
  - `src/lib/config.ts`: estilo de constantes documentadas (ver `HEAT_*`, `GROUP_*`).

## Prompt / instrucciones para worker <!-- MUST -->

1. Constantes en `src/lib/config.ts`, documentadas con F24/F25: `ELO_START_RATING = 1500`, `ELO_PLACEMENT_POINTS = [25, 12, 2, -5, -15, -19]` (índice = puesto − 1), `ELO_SLOPE = 44`, `ELO_SCALE = 400`, multiplicadores por desconocidos `{0: ×1/×1, 1: ×1,15 si gana / ×0,75 si pierde, 2: ×1,30 / ×0,50}`, ligas `Hierro < 1450 · Bronce 1450–1479 · Plata 1480–1509 · Oro 1510–1539 · Platino 1540–1569 · Diamante ≥ 1570` y `ELO_PROVISIONAL_GAMES = 10`.
2. Entrada: `rows: readonly GroupMatchRow[]` (solo miembros, ya filtradas a temporada y colas por la consulta), `memberKeys: readonly string[]` (todos los miembros, también los que no tienen partidas) y `now`. Ignora filas con puesto fuera de 1..6.
3. Orden cronológico por `gameStartTimestamp`, desempate por `matchId`. Todos empiezan en 1500.
4. Por partida y miembro, con R = rating del miembro **antes** de la partida (todos los miembros de una misma partida usan su rating previo; ninguno ve el cambio de otro):
   - `E = 1 / (1 + 10^((1500 − R) / 400))`; `base = puntos[puesto] − 44·(E − 0,5)`.
   - Desconocidos = `3 − (miembros con el mismo matchId y playerSubteamId)`, acotado a 0..2. Un no miembro (aunque sea perfil registrado) es desconocido: por eso solo cuentan las filas de miembros.
   - `multiplicador` = el de ganancia si `base > 0`, el de pérdida si `base < 0`, 1 si `base = 0`. `delta = base × multiplicador`.
   - Partidas con miembros en equipos rivales: cada uno con el puesto de su equipo, sin trato especial.
5. Salida por miembro: rating con decimales, rating redondeado (`Math.round`), partidas, `provisional` (< 10 partidas), liga (por el **redondeado**), historial `[{matchId, gameStartTimestamp, placement, strangers, base, multiplier, delta, ratingBefore, ratingAfter}]` y cambio del día y de la semana: suma de `delta` de sus partidas en el periodo de `displayedPeriod(rows, now, "day" | "week")` (el mismo que el bloque Hoy / Semana), `null` si no jugó en él. Incluye el periodo mostrado (con su `label` e `isCurrent`) para que la UI lo etiquete.
6. Clasificación: miembros ordenados por rating de mayor a menor; posición compartida en empate de rating redondeado (1, 1, 3). Los miembros con 0 partidas entran con 1500, provisionales.
7. Formateadores puros para la UI: cambio con signo redondeado a entero ("+29", "−14", "0") y cambio con signo y un decimal solo si no es entero ("−2,5", "+26,9"). Usa el signo menos tipográfico si el repo ya lo usa en otros formateadores; si no, `-`. Comprueba `@/lib/format`.
8. Tests con partidas sintéticas: todos los casos de AC1 (los 6 puestos a 1500 exactos; pendiente por encima y por debajo de 1500; multiplicadores con 0, 1 y 2 desconocidos y base positiva y negativa; un no miembro cuenta como desconocido; miembros rivales; orden cronológico y rating previo; provisional con 9 y 10) y de AC2 (cortes de liga 1449/1450, 1479/1480, 1509/1510, 1539/1540, 1569/1570 sobre el redondeado, p. ej. 1449,4 → Hierro y 1449,5 → Bronce; cambio del día con partidas a las 05:59 y 06:00 Madrid; semana con lunes 05:59 y 06:00; periodo actual vacío → el del último día jugado). Más un caso de una temporada sintética de varias partidas con el valor final calculado a mano en el test.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; números con `formatDecimal`/`formatCount` de `@/lib/format`; componentes `hy/*` y `ui/*`; textos de UI en español.
- No hagas crecer `src/app/euw/[slug]/data.ts` (716 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Constantes de F24/F25 en `config.ts`.
- [ ] Cálculo por partida con rating previo, pendiente, multiplicador por desconocidos y orden cronológico (AC1).
- [ ] Liga por rating redondeado, provisional < 10, cambio del día y de la semana sobre `displayedPeriod` (AC2).
- [ ] Clasificación ordenada con empates compartidos.
- [ ] Tests de todos los casos de AC1 y AC2.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

