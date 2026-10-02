# Task T05 — Cambio de rating en el historial de partidas

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

En la pestaña Partidas de un miembro, cada partida que cuenta para el rating muestra su cambio en la fila y el desglose en el detalle.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Historial de partidas"; Riesgos → "El cambio base no es la tabla de puntos"; **AC5**.
- Código:
  - `src/app/euw/[slug]/matches-panel.tsx`, `matches-view.ts` (`MatchRowData` en `:272`, etiquetas de fila en `:~414`), `match-detail.tsx`, `match-parts.tsx` y sus tests (`matches-view.test.ts`).
  - `src/domain/matches.ts:31` `MatchListRow`.
  - `src/app/euw/[slug]/page.tsx:~360` (props de `MatchesPanel`).
  - Historial por `matchId` del ELO del perfil (T02) y formateadores de `src/domain/elo.ts` (T01).

## Prompt / instrucciones para worker <!-- MUST -->

1. Pasa a `MatchesPanel` el historial del ELO por `matchId` (o `null` si el perfil no es miembro). Si el panel es cliente, pasa solo lo que necesita (datos serializables).
2. **Fila**: el cambio redondeado con signo ("+29", "−14") junto al puesto, con color de subida o bajada coherente con el resto de la app. Solo en las partidas que están en el historial del ELO.
3. **Detalle**: el desglose: puesto, cambio base (un decimal si no es entero), multiplicador con el número de desconocidos si los hay ("×1,15 · 1 desconocido"), cambio final y rating tras la partida (entero). Usa los valores del dominio, no los recalcules.
4. Perfiles de no miembros y partidas fuera del historial: sin nada de ELO.
5. Tests del view-model (fila y desglose) con un historial sintético.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; números con `formatDecimal`/`formatCount` de `@/lib/format`; componentes `hy/*` y `ui/*`; textos de UI en español.
- No hagas crecer `src/app/euw/[slug]/data.ts` (716 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Cambio con signo en la fila de las partidas que cuentan.
- [x] Desglose en el detalle con base, multiplicador y desconocidos, cambio final y rating tras la partida.
- [x] Nada en no miembros ni en partidas que no cuentan.
- [x] Tests del view-model.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `matches-view.ts` (`eloRowChange`, `eloBreakdown`) + tests; `matches-panel.tsx` (chip con el cambio en la fila), `match-detail.tsx` (bloque "Cambio de rating": puesto, cambio base, multiplicador y desconocidos, cambio final, rating tras la partida), `match-parts.tsx` (`ELO_TONE_CLASS`), `page.tsx` (una línea).
- Ejemplo: "Puesto 2º · Cambio base +23,4 · Multiplicador ×1,15 · 1 desconocido · Cambio final +26,9 · Rating tras la partida 1552".
- Orquestador: rating sin separador de miles, igual que la Clasificación ("1552", no "1.552").
- `npm run lint && npm run typecheck && npm test && npm run build` en verde (1337 tests).

