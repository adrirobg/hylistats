# Task T08 — Menú ⋯ en todos los cromos con enlaces de builds

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

El menú ⋯ aparece en todos los cromos (ganados, sin ganar y sin jugar) con los enlaces de builds del panel de campeón; "Marcar / quitar ganado a mano" sigue apareciendo solo donde aplicaba (AC8).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Builds en el menú ⋯"; Entregable 8; AC8.
- Código:
  - `src/app/euw/[slug]/card-menu.tsx`: popover de Base UI con paso de confirmación; hoy recibe `action: Exclude<ManualAction, "none">` y solo se pinta si hay acción manual.
  - `src/app/euw/[slug]/album-card.tsx:195` y `:275`: `manualActionFor(state)` y montaje condicional de `CardMenu`.
  - `src/app/euw/[slug]/album-interaction.ts`: `ManualAction`, `manualCopy`.
  - `src/lib/champion-links.ts` (+ test): enlaces externos por campeón (op.gg, LoLalytics, METAsrc, u.gg, Blitz) con slugs probados; `champion-panel.tsx` los usa.

## Prompt / instrucciones para worker <!-- MUST -->

1. `CardMenu` acepta `action: ManualAction` (incluido `"none"`) y la lista de enlaces del campeón. El menú se pinta siempre.
2. Contenido: sección "Builds" con los enlaces (`target="_blank" rel="noopener noreferrer"`, mismo orden y etiquetas que el panel); si `action !== "none"`, separador y la opción de marcado manual con su confirmación actual intacta.
3. Mantén el comportamiento del popover: portal, Esc/clic fuera, foco devuelto al ⋯, `stopPropagation` para no abrir el panel.
4. Tests: `album-interaction.test.ts` / test de componente si existe patrón; y que los enlaces del menú son exactamente los del panel para los slugs límite (Wukong, Nunu, Renata, Bel'Veth, Kai'Sa) reutilizando `champion-links`.
5. Verifica en el navegador integrado en un cromo ganado, uno sin ganar y uno sin jugar; captura del menú abierto. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] ⋯ visible en todos los estados de cromo.
- [x] Enlaces de builds idénticos a los del panel, en pestaña nueva.
- [x] "Marcar a mano" solo donde aplicaba antes; teclado y foco como antes.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `cardMenuContent(ddId, name, manual)` (`album-interaction.ts`) devuelve `{ links, manual }`. Los enlaces salen de `championLinks`, la misma función que usa el panel. `CardMenu` recibe ese contenido y se pinta en todos los cromos.
  - La opción manual solo aparece con `actions` (mi perfil) y `manualActionFor(state) !== "none"`, como antes.
  - `aria-label` del ⋯: «Más acciones: X» si hay marca manual y «Más opciones de X» si no.
- Tests: menú = panel para Wukong, Nunu, Renata, Bel'Veth y Kai'Sa; matriz de estados (mi perfil y perfil ajeno); sin `ddId`.
- Navegador integrado (dev noworker):
  - BEJITO MAMBO (mi perfil): ⋯ en cromo ganado (Ahri, «Más opciones»), jugado (Aatrox) y sin jugar (Darius).
  - Menú de Aatrox abierto con Enter: «BUILDS» con op.gg, LoLalytics, METAsrc, u.gg y Blitz, todos `_blank noopener noreferrer`, y debajo «Marcar como ganado a mano…». Captura con el menú abierto.
  - Foco inicial en op.gg. Esc cierra y devuelve el foco al ⋯. La URL no cambia (no se abre el panel).
  - Hylimichi (perfil ajeno): 173/173 cromos con ⋯. El de Kai'Sa lleva solo Builds, con los slugs `kaisa` y `Kaisa` correctos.
- `npm run lint && npm run typecheck && npm test && npm run build`: en verde (50 ficheros, 1108 tests).
