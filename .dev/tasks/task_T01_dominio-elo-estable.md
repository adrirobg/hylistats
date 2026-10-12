# Task T01 — Dominio y reglas del ELO estable (F28)

**Owner**: worker:opus
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`src/domain/elo.ts` calcula el ELO con las reglas de F28 (K×0,5, multiplicador por desconocidos nuevo, racha de 1º seguidos y liga con margen de ±10), la nota de la regla las explica y todos los tests pasan con las cifras nuevas.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Constantes", "Dominio" y "Nota de la regla"; inferencias I1, I2 e I8; AC1, AC2, AC3, AC7 y AC10.
- think.md: F28 y §6 (puntos 1–4).
- `src/lib/config.ts:100-148`: constantes del ELO de hoy (`ELO_PLACEMENT_POINTS`, `ELO_SLOPE`, `ELO_STRANGER_MULTIPLIERS`, `ELO_LEAGUES`).
- `src/domain/elo.ts`: `eloMatchChange`, `eloLeague`, `EloMatch`, `EloMember` y `computeGroupElo`. El bucle recorre las filas en orden cronológico y cada fila solo toca a su miembro.
- `src/app/grupo/clasificacion-model.ts:104-157`: nota de la regla (`placementPointsText`, `strangerMultipliersText`, `leaguesText`, `clasificacionNote`), que saca las cifras de `config.ts`.
- `src/app/euw/[slug]/rating-view.ts:90-108`: `visibleLeagues` usa `ELO_LEAGUES` sin margen y así se queda (I2).
- Tests con cifras del ELO: `src/domain/elo.test.ts`, `src/domain/group-view.test.ts`, `src/app/euw/[slug]/{vitrina-view,matches-view,matches-elo,rating-view}.test.ts` y `src/app/grupo/clasificacion-model.test.ts`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Constantes** en `config.ts`, con doc-comments al estilo de los de hoy y referencias a F28:
   - `ELO_PLACEMENT_POINTS = [12.5, 6, 1, -2.5, -7.5, -9.5]`.
   - `ELO_SLOPE = 22`.
   - `ELO_STRANGER_MULTIPLIERS`: 1 desconocido → `{ gain: 1.1, loss: 0.85 }`; 2 → `{ gain: 1.2, loss: 0.8 }`.
   - Nueva: `ELO_LEAGUE_MARGIN = 10`.
   - Nueva: `ELO_STREAK_MULTIPLIERS`, el multiplicador por número de 1º seguidos con la partida actual incluida (1 → 1, 2 → 1,5, 3 o más → 2). Representarlo de forma que "3 o más" sea el último valor, por ejemplo `[1, 1, 1.5, 2]` indexado por la racha y con tope en el último índice.
2. **Racha** en `elo.ts`:
   - Función pura `eloStreakMultiplier(streak)`.
   - `EloMatch` gana `streak` (1º seguidos con esta partida; 0 si no es 1º) y `streakMultiplier`.
   - `multiplier` sigue siendo el de desconocidos.
   - `delta = base × multiplier × streakMultiplier`. El de racha solo se aplica si `base × multiplier > 0`; si no, vale 1.
   - La racha es por miembro, sobre sus partidas contadas en orden cronológico, y no se corta por día.
   - `EloMember` gana `streak`: la racha en curso, es decir, los 1º seguidos al final de su historial.
3. **Liga con margen**:
   - Función pura `eloLeagueStep(current, rating)`: sobre el rating redondeado, sube mientras haya liga superior y `rounded ≥ superior.min + ELO_LEAGUE_MARGIN`, y baja mientras `rounded ≤ current.min − ELO_LEAGUE_MARGIN`. Hierro no tiene suelo y Diamante no tiene techo.
   - `computeGroupElo` la aplica tras cada partida de cada miembro, empezando en `eloLeague(ELO_START_RATING)` (Plata).
   - `EloMember.league` pasa a ser esa liga.
   - `eloLeague(rating)` se queda como está (lo usan la gráfica y fixtures).
   - Actualizar el comentario de cabecera del módulo y los doc-comments afectados (F28).
4. **Nota de la regla** (`clasificacionNote` y funciones auxiliares):
   - Un párrafo o frase sobre la racha ("dos 1º seguidos: ×1,5; tres o más: ×2, solo al ganar; la racha sigue aunque cambie el día").
   - Otro sobre el margen ("se sube al pasar el corte en 10 y se baja al quedarse 10 por debajo").
   - Todas las cifras salen de `config.ts`.
   - Los puntos ahora tienen decimales: `signed()` tiene que formatear `12,5` y `−2,5` en vez de redondear.
5. **Tests**:
   - Nuevos en `elo.test.ts` para AC1–AC3: tabla con R = 1500, multiplicadores, racha (1, 2, 3, 4, corte, cruce de día, combinación con desconocidos, sin bonificación en no positivos) y margen (+10 sube, +9 no, −10 baja, −9 no, salto de varias ligas, extremos y Plata sin partidas).
   - Ajustar los tests existentes cuyas cifras dependan de las constantes. Recalcular los valores esperados; no debilitar las aserciones ni cambiar lo que comprueba cada test.
6. Comprobar con `npm run lint && npm run typecheck && npm test`.

**Restricciones**:
- No tocar la UI (`.tsx`); eso es T02.
- No tocar `data.ts` salvo el cableado mínimo, si hiciera falta.
- Sin dependencias nuevas.
- No hacer commit: lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1, AC2 y AC3 de la spec cubiertos por tests en `elo.test.ts`.
- [ ] AC7: la nota explica la racha y el margen, sin cifras escritas a mano. Test en `clasificacion-model.test.ts`.
- [ ] `EloMatch.streak`, `EloMatch.streakMultiplier` y `EloMember.streak` disponibles para T02.
- [ ] `npm run lint && npm run typecheck && npm test` en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
