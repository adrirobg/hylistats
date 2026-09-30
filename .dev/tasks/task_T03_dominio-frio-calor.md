# Task T03 — Dominio de frío/calor (F16)

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un módulo puro `src/domain/heat.ts` que clasifica cada campeón del jugador como `hot`, `cold` o `neutral` según F16, con las constantes en `config.ts` y tests de umbral (AC3).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Frío/calor en el álbum"; Entregable 3; AC3.
- think.md F16: solo campeones **sin 1º** en la temporada; media global del jugador con **todas** sus partidas; media ajustada `(n·media_campeón + K·media_global) / (n + K)` con K = 5; mínimo 5 partidas; 🔥 si `media_global − ajustada ≥ 0,4`, ❄️ si `ajustada − media_global ≥ 0,4` (puesto menor = mejor).
- Código: `src/domain/stats.ts:10` `PlayerMatchRow` y `PLACEMENTS` (solo cuentan puestos 1..6, igual que `computeSummary`); `src/lib/config.ts` (constantes como `ARENA_GOD_THRESHOLD`).

## Prompt / instrucciones para worker <!-- MUST -->

1. En `src/lib/config.ts`: `HEAT_MIN_GAMES = 5`, `HEAT_PRIOR_GAMES = 5`, `HEAT_THRESHOLD = 0.4`, documentadas con referencia a F16 ("revisables tras el uso").
2. `src/domain/heat.ts`: `computeHeat(rows: readonly PlayerMatchRow[])` → `{ globalAvg: number | null, byChampion: Map<number, ChampionHeat> }` con `ChampionHeat = { state: "hot" | "cold" | "neutral", games, avg, adjustedAvg }` para **todos** los campeones jugados (los que tienen algún 1º o < mínimo salen `neutral`; incluye un campo `reason: "won" | "few-games" | "within" | null` para que la UI pueda explicarlo).
3. Compara con tolerancia de coma flotante (p. ej. `>= HEAT_THRESHOLD - 1e-9`) para que "justo en 0,4" marque.
4. Tests `src/domain/heat.test.ts`, como mínimo los de AC3: campeón con 4 partidas → neutral (`few-games`); campeón justo en ±0,4 de ajustada → hot / cold; campeón con algún 1º que cumpliría el umbral → neutral (`won`); la media global incluye las partidas de campeones ganados (construye un caso donde excluirlas cambiaría el resultado). Añade: sin partidas → `globalAvg` null.
5. No toques UI (eso es T05). `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] Constantes en `config.ts` y `computeHeat` con la forma descrita.
- [ ] Tests de AC3 en verde.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
