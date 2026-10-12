# Task T02 — Racha en la UI: historial, aviso y 🔥

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La racha de 1º seguidos se ve en tres sitios:
- En el historial: la fila y el desglose de cada partida.
- En un aviso de la pila flotante del perfil de un miembro.
- Con un 🔥 en la Clasificación de la pestaña Grupo y en El grupo hoy de la vitrina.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Historial", "Aviso de racha" y "🔥 en la Clasificación"; inferencias I3–I7; AC4, AC5 y AC6.
- T01: `EloMatch.streak`, `EloMatch.streakMultiplier` y `EloMember.streak` en `src/domain/elo.ts`, y `ELO_STREAK_MULTIPLIERS` en `config.ts`.
- Historial: `src/app/euw/[slug]/matches-view.ts:460-520`:
  - La celda del cambio (`formatEloChange` + `eloTone`).
  - El desglose `eloBreakdown`, con `formatMultiplier` y `strangersText`.
  - Se pintan en `matches-panel.tsx` y `match-parts.tsx`.
- Pila: `src/app/euw/[slug]/floating-notices.ts` (prioridades, firmas y `closedNoticeKey` en `localStorage`) y su test. Se pinta en `vitrina.tsx` junto a `god-trophy.tsx`. La pila global está en `@/components/hy/floating`. Reglas D8–D12 de iter-11 (`.dev/archive/iter-11/spec.md`, "Revisión v5b").
- Clasificación: `src/app/grupo/clasificacion-model.ts` (`ClasificacionRow`) y `clasificacion-block.tsx`.
- El grupo hoy: `src/app/euw/[slug]/vitrina-view.ts` (filas de El grupo hoy) y `group-today.tsx`.
- Datos del perfil: `ProfileElo` en `page.tsx` y `data.ts`, y `GroupView.elo.standings` en `src/domain/group-view.ts`. Comprobar si la racha en curso del dueño llega ya por `standings` antes de añadir cableado.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Lógica de presentación en funciones puras con tests**, junto a las de hoy:
   - `matches-view.ts`:
     - Texto de la racha de una partida: `🔥×1,5` o `🔥×2`, o `null` si el multiplicador es 1.
     - Línea "Racha" del desglose: "3 primeros seguidos · ×2"; solo si aplicó.
   - `floating-notices.ts`, aviso de racha:
     - Activo si el perfil es de un miembro con `streak ≥ 1`.
     - Prioridad entre Dios de Arena y Arena fuera de rotación (I4).
     - Firma con la longitud de la racha, para que el cierre persistente valga solo para esa racha (I5).
     - Texto (I3): en «mi perfil», "Llevas N primeros seguidos: tu próximo 1º vale ×M"; en otro, "{gameName} lleva N primeros seguidos: su próximo 1º vale ×M". M sale de `ELO_STREAK_MULTIPLIERS` para N + 1. Con N = 1, "1 primero".
   - `clasificacion-model.ts` y `vitrina-view.ts`: campo de racha en cada fila (`streak ≥ 2` → mostrar `🔥N` con `title` "N primeros seguidos"; si no, nada).
2. **UI**:
   - En la fila del historial, el indicador va junto al cambio sin romper el ancho a 375 px.
   - El desglose tiene la línea nueva.
   - El aviso usa el componente de aviso de la pila, igual que el de Dios de Arena, con título de contexto "Racha".
   - El 🔥 va junto al nombre en las dos tablas.
3. Comprobar con `npm run lint && npm run typecheck && npm test && npm run build`.

**Restricciones**:
- Ningún aviso desplaza el contenido (AC22 de iter-11).
- Sin dependencias nuevas.
- No tocar el dominio salvo un fallo de T01, que se avisa.
- No hacer commit.

## Criterios de aceptacion <!-- MUST -->

- [x] AC4, AC5 y AC6 de la spec, con tests de lo puro: texto de racha (1,5, 2 y nada), línea del desglose, aviso (activo con 0, 1 y 3 seguidos; segunda y tercera persona; firma distinta con otra longitud; orden de prioridad) y 🔥 en las filas (0, 1, 2 y 4).
- [x] Los perfiles de no miembros no cambian.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Notas de implementacion <!-- MAY -->

- **Datos**: `ProfileElo.streak` (nuevo, `src/domain/group-view.ts`, solo cableado: `profileEloOf` copia `standing.streak`) lleva la racha del dueño a la página; `standings` ya traía `streak` para las tablas. `elo.ts` y `config.ts` sin tocar; T01 sin fallos detectados.
- **Funciones puras (con tests)**:
  - `matches-view.ts`: `eloRowStreak` (`🔥×1,5` / `🔥×2`, `null` con ×1) y línea "Racha" en `eloBreakdown` ("3 primeros seguidos · ×2", tras "Multiplicador", solo si `streakMultiplier > 1`). `formatMultiplier` pasa a exportarse.
  - `floating-notices.ts`: `STREAK_PRIORITY = 15` (entre Dios de Arena y Arena fuera de rotación), `streakNoticeSignature` (`racha:N`), `streakNoticeText` (I3; M = `eloStreakMultiplier(N + 1)`) y `"racha"` en `closedNoticeKey`.
  - `clasificacion-model.ts`: `streakBadge` (`🔥N` + title "N primeros seguidos" si N ≥ 2); `ClasificacionRow.streak` y `GroupTodayRow.streak` (`vitrina-view.ts`) lo reutilizan.
- **UI**: `matches-panel.tsx` (`StreakChange`, `flex-none` junto al cambio), `vitrina.tsx` (`FloatingItem` título "Racha", icono 🔥, `remember` por perfil; solo tras `useLocalReady` para no pintarlo en 3ª persona y cambiar a 2ª), `clasificacion-block.tsx`, `group-today.tsx` (🔥 tras el nombre, `title` + texto `sr-only`), `page.tsx` (prop `streak`).
- **Desviación menor**: con N = 1 el texto es "1 primero seguido" (el contrato decía "1 primero"; concordancia).

## Evidencias <!-- MUST -->

- `npm run lint && npm run typecheck && npm test && npm run build`: verde (76 ficheros, 1591 tests).
- Tests nuevos: `eloRowStreak` (1,5 / 2 / nada), línea "Racha" del desglose (sola y con desconocidos), aviso (texto 2ª/3ª persona con 1, 2 y 3+; firma distinta por longitud; prioridad; cierre por longitud), `streakBadge` (0, 1, 2, 4) y su paso a `clasificacionRows` y `groupTodayRows`.
- Comprobación manual contra la BD local (build de producción, `WORKER_ENABLED=false`): `/euw/Krill1nt-EUW` (racha en curso de 3): 🔥3 en El grupo hoy y en la Clasificación (`?tab=grupo`), aviso "Krill1nt lleva 3 primeros seguidos: su próximo 1º vale ×2" en la pila (plegado en "+N avisos" a 375 px porque hay otro de sincronización), 🔥×2 / 🔥×1,5 en `?tab=partidas`. Sin captura formal (T04).
