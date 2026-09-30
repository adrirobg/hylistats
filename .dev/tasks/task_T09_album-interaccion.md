# Task T09 — Álbum: objetivos, marcado manual, atajos de teclado y sellado

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

En "mi perfil", el usuario puede:

- marcar y desmarcar **objetivos** desde el cromo, con el botón diana o la tecla `o`;
- marcar y desmarcar un campeón como **ganado a mano**, con confirmación, desde el menú ⋯ del cromo;
- recorrer el álbum con las flechas.

Cuando llega un 1º nuevo durante la sincronización, el cromo se "sella" con una animación breve que respeta `prefers-reduced-motion`. En perfiles ajenos no hay ninguna de estas interacciones (D12).

## Contexto <!-- SHOULD -->

- spec.md: Alcance (objetivos `o` y marcado manual con confirmación; teclado y `prefers-reduced-motion`), Entregable 9 y AC8 (el supervisor elegirá campeón con "Objetivos sin ganar"). En "Decisiones técnicas": sin panel de campeón, así que el marcado manual va en un menú del cromo, y datos locales solo en "mi perfil".
- Brief:
  - §4.4, interacción: la diana aparece en hover y foco, y conmuta el objetivo sin abrir nada (atajo `o`). Animación única: al llegar un 1º nuevo, el cromo pasa de gris a color con un sellado de 300 ms y se mueve a su banda.
  - §3.6: marcado manual con confirmación ligera y texto explicativo; desmarcar también se confirma.
  - §7: teclado (`/` busca, `o` marca objetivo, flechas recorren el álbum; `Esc` cierra menús).
- Maqueta `.dev/research/design-mock.html`:
  - CSS: `.tgt`, `.card:hover .tgt`, `.is-target`, `.card.stamp`, `@keyframes stamp` y `sealIn`, y reglas de `prefers-reduced-motion` (l. 153–161).
  - JS: `toggleTarget`, el atajo `o` (l. 719), el sellado tras refrescar (l. 743) y los textos del panel para el marcado manual (l. 670, 677): "Objetivos y marcas manuales se guardan solo en este navegador".
- Código previo:
  - T08: componente `Album`, cromo y `album-view.ts` (`effectiveState`, `albumSections`), con el hueco para la diana y el menú.
  - T04: `useLocalStore` con `toggleTarget(norm, championId)`, `setManual(norm, championId, on)` e `isMyProfile`.
  - `normalizeRiotId` en `src/lib/riot-id.ts`.
  - T06: toast reutilizable, si se extrajo.
- Sin dependencias nuevas: un menú accesible sencillo con un botón y un `div` `role="menu"`, o los componentes de `@base-ui/react` que ya están instalados, si encajan sin fricción.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Diana**:
   - Botón en la esquina superior izquierda del cromo con `aria-pressed` y `aria-label` "Marcar como objetivo: X" o "Quitar objetivo: X".
   - Visible en hover, foco o si el cromo ya es objetivo.
   - Conmuta con `toggleTarget` sin propagar el clic.
   - Con el foco en un cromo (y fuera de inputs), `o`/`O` conmuta su objetivo y conserva el foco en el cromo aunque cambie de banda (búscalo por `championId` tras el render).
2. **Menú ⋯** (esquina inferior derecha o junto al nombre; visible en hover y foco):
   - En un campeón no verificado: "Marcar como ganado a mano…", que abre una confirmación ligera inline o en un popover con el texto "Úsalo si ganaste con X y el historial no lo muestra. Se guarda solo en este navegador." y los botones [Marcar] y [Cancelar].
   - En uno marcado a mano: "Quitar marca manual…", también confirmado.
   - En uno verificado: el menú no ofrece el marcado.
   - `Esc` cierra y devuelve el foco al disparador.
   - Los enlaces externos (↗) son del panel de #3: **no** los añadas.
3. **Flechas**: con el foco en un cromo, ← y → pasan al anterior o siguiente en el orden del DOM; ↑ y ↓, a la fila anterior o siguiente, calculando las columnas por `offsetTop` o por el ancho de la rejilla (lo que resulte robusto). `Home` y `End` van al principio y al final de la sección. Sin trampas de foco.
4. **Sellado**:
   - Guarda en un `ref` los `championId` verificados del render anterior.
   - Cuando uno nuevo pasa a `won` en un render posterior (por el polling durante un backfill o un refresco), añade durante 700 ms la clase `stamp`: `stamp` sobre el retrato y `sealIn` sobre el sello, como la maqueta.
   - En el primer render no se anima nada.
   - Con `prefers-reduced-motion: reduce`, sin animación.
   - Extrae a una función pura `newlyWon(prevIds, nextEntries)` y pruébala.
5. **Perfiles ajenos o sin "mi perfil"**: ni diana, ni menú, ni `o`. Solo se ve la capa verificada.
6. **Tests**: `newlyWon`, y la lógica pura del menú, si la separas (`manualActionFor(entryState)` → `mark` | `unmark` | `none`).
7. `npm run lint && npm run typecheck && npm test && npm run build` en verde. El orquestador verifica la interacción en el navegador: deja en el informe los pasos (clics y teclas) para comprobarla.

## Criterios de aceptacion <!-- MUST -->

- [x] Diana en hover y foco, y `o` para conmutar objetivos, persistidos en la capa de navegador; el foco se conserva.
- [x] Marcar y desmarcar a mano con confirmación, solo en campeones no verificados.
- [x] Flechas, `Home` y `End` recorren el álbum; `Esc` cierra el menú.
- [x] Sellado de 1º nuevos sin animar el primer render y respetando `prefers-reduced-motion` (`newlyWon` probado).
- [x] Nada de esto en perfiles ajenos. Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- Lógica pura en `album-interaction.ts` (`manualActionFor`, `manualCopy`, `newlyWon`/`wonIds`, `navigateTo` por `getBoundingClientRect().top`). Menú ⋯ con `Popover` de `@base-ui/react` en portal (la cabina tiene `overflow-clip`).
- Foco: las acciones anotan `{championId, part}` y `useLayoutEffect` enfoca `[data-champion-id]` tras el render (el cromo puede cambiar de banda).
- Sellado: `useStamped` decide en el render (no en un efecto), sin animar el primer render ni con `prefers-reduced-motion`; `stamp` 700 ms. Keyframes en `globals.css` (`@theme`), con `scale`/`rotate` en vez de `transform`.
- Pendiente menor (no se sobrediseña): si un cromo sale de la vista al conmutar, el foco cae en `body`; ~3 paradas de Tab por cromo (roving tabindex, mejora futura). El ⋯ solo aparece si hay acción (los ↗ de #3 lo cambiarán).

## Evidencias <!-- MUST -->

- Navegador integrado (orquestador, 2026-09-30) contra `hylistats_test`, "mi perfil" con `targets [103,17]`, `manual [350]`:
  - `o` sobre Ashe (22): pasa a "Objetivos sin ganar", `targets [103,17,22]` y el foco se queda en Ashe.
  - ⋯ de Annie → "Marcar como ganado a mano…" → "Úsalo si ganaste con Annie y el historial no lo muestra. Se guarda solo en este navegador." con el foco en [Marcar]; Enter → "Annie, ganado a mano" en Ganados, `manual [350,1]`, foco en "Más acciones: Annie". `Esc` cierra el menú y devuelve el foco al ⋯. Blitzcrank (verificado) tiene diana y no ⋯.
  - Sellado: con la página en polling, `finish-perfil newgame` → Rakan (497) recibe `li.stamp` y corren las animaciones `stamp` y `sealIn`; la clase se retira; la carga inicial no sella nada.
  - Perfil ajeno: 0 `[data-card-part]`, `o` no cambia `localStorage`, sin filtro "Objetivos sin ganar".
- Checks (orquestador): `npm run lint` OK (117 ficheros) · `npm run typecheck` OK · `npm test` 35 ficheros, 608 tests en verde · `npm run build` OK.
- Commit: ver `git log` (`feat(ui): objetivos, marcado manual, teclado y sellado en el álbum`).
