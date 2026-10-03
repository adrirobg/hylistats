# Task T02 — Trofeo Dios de Arena con anillo

**Owner**: worker:opus
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un componente `GodTrophy` (`src/app/euw/[slug]/god-trophy.tsx`) que sustituye a `ArenaGodBar` como trofeo de la vitrina: **anillo** con las tres capas de hoy, cifra grande, "faltan N", hitos y el **mismo aviso, acciones y explicación** que la barra actual. La geometría del anillo va en un módulo puro con tests (`god-ring.ts` + `god-ring.test.ts`).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Dios de Arena" (segundo trofeo); AC4, AC11; inferencia I10.
- Maqueta: `.dev/research/cabecera/propuestas.html`, propuesta C2, tarjeta `.tw.g` (función `ringSvg` y `renderC2` en el `<script>`): anillo de 118 px (88 px en estrecho), trazo 12, pista `rgba(255,255,255,.08)`, arco oro desde las 12 en sentido horario con extremos redondeados, porcentaje en el centro, marca del hito de 60 cuando la meta es el catálogo; a la derecha "N / meta" en `font-display` ~66 px (48 px en estrecho) y debajo "faltan N" + "✓ oficial N"; fila de hitos "👑 Deidad · 60" (oro si conseguida) y "Dios · 173" (el catálogo). Cabecera de la tarjeta: etiqueta con el nombre de la meta ("Dios de Arena" o "Deidad de Arena") + "temporada".
- Código actual a conservar en comportamiento: `src/app/euw/[slug]/arena-god.tsx` (277 líneas, léelo entero): props `ArenaGodBarProps`, «mi perfil» y marcas manuales desde `localStorage`, `arenaGodState`, acciones `sync | manual | why | retry` (`REFRESH_BUTTON_ID`, `markByHandHref`, toast), `Notice` con `arenaGodMessage`, explicación `ARENA_GOD_EXPLANATION` tras el botón "?", `aria-label` con `arenaGodLabel(state)`. Dominio: `src/domain/arena-god.ts` (`ArenaGodState`: `verified`, `manual`, `total`, `official`, `goal`, `status`, `scaleMax`, `ticks`…) — **no se cambia**.
- Hoy la barra la monta `page.tsx:195-205` en el slot `god` de `Cabin`. Ese cableado lo cambia T03; tú solo exportas el componente.
- Tokens: `--place-1` (oro), `--trust` (azul de las marcas manuales), `--text`, `--ok`, `--line` en `src/app/globals.css`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **`god-ring.ts`** (puro): dada `ArenaGodState` (y el radio/trazo si hace falta) devuelve la geometría del anillo: longitud de arco de verificados y de manuales (manuales a continuación de verificados, sin pasar de la vuelta completa), ángulo de la marca del oficial (o `null`), ángulo del hito de 60 cuando `goal` ≠ 60, y el porcentaje mostrado (`total / goal`, tope 100). Si `total` o el oficial superan la meta, la vuelta se completa sin desbordar. Tests: sin manuales, con manuales, oficial `null`, oficial > meta, meta 60 y meta catálogo, cero verificados.
2. **`god-trophy.tsx`** (cliente): mismas props que `ArenaGodBarProps` (puedes reexportar el tipo como `GodTrophyProps`). Reutiliza la lógica de `arena-god.tsx` (extrae lo común si así queda más limpio; no la dupliques). Pinta:
   - Cabecera: nombre de la meta + botón "?" (explicación como hoy) + "temporada".
   - Anillo SVG (pista, arco oro de verificados, arco azul rayado/discontinuo de manuales, marca blanca del oficial con `title`/etiqueta accesible, marca del hito 60), con `role="img"` y `aria-label={arenaGodLabel(state)}`.
   - Cifras: `total` / `goal`, "faltan N" (`goal - total`, mínimo 0), y "✓ oficial N" cuando cuadra.
   - Hitos: Deidad · 60 (conseguida en oro con corona) y el nombre de la meta final con el catálogo.
   - El `Notice` con sus acciones y la explicación, **igual que hoy** (mismos textos y estados). Compacto: que quepa en la tarjeta a 375 px.
   - Contenedor transparente: el fondo, borde y radio de la tarjeta los pone T03 (la vitrina). Exporta el componente sin envoltorio de tarjeta o con una prop `className`.
3. Deja `arena-god.tsx` en uso hasta que T03 cambie el cableado: si extraes lógica compartida, `ArenaGodBar` tiene que seguir compilando y funcionando. T03 decidirá si se borra.
4. Respeta `prefers-reduced-motion` (las transiciones del arco se apagan como hoy con la regla global).

Reglas comunes (todas las tasks de código):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de Next lee la guía correspondiente en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas (iconos de `lucide-react`, ya instalado). Textos de UI en español; comentarios con la densidad y el tono del código que tocas.
- La UI no tiene jsdom: la lógica va en módulos puros con tests.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Otra task (T01) trabaja en paralelo en el mismo árbol sobre `vitrina-view*`, `title-badges*` y `ddragon.ts`: no toques esos archivos; si un fallo de lint/tests viene de ellos, dilo en el informe.
- Al terminar: `npm run lint && npm run typecheck && npm test` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] `god-ring.ts` + tests de los casos listados.
- [x] `GodTrophy` con anillo de tres capas, cifras, hitos, aviso, acciones y explicación con el comportamiento de `ArenaGodBar`.
- [x] `ArenaGodBar` sigue compilando; dominio `arena-god.ts` sin cambios.
- [x] `npm run lint && npm run typecheck && npm test` en verde.

## Notas de implementacion <!-- MAY -->

- Lógica común sacada a `arena-god-notice.tsx` (`ArenaGodProps`, `useArenaGod`, `ArenaGodNotice`, `ArenaGodExplainButton`, `ArenaGodExplanation`); `ArenaGodBar` la usa y se pinta igual.
- `GodTrophy` (`GodTrophyProps = ArenaGodProps & { className? }`): sin envoltorio de tarjeta; raíz `@container/god` (necesita ancho de su contenedor). Bajo 420 px propios: anillo 88 px y cifra 48 px.
- Porcentaje del centro: 100 solo con la meta cumplida (59/60 → 99 %). Hito de 60 en oro hasta que el arco lo cubre; después, muesca del color del fondo.
- Con meta 60 el componente no conoce el catálogo: los hitos dicen "Deidad · 60" y "después, Dios" (sin 173). "faltan 0" con la meta cumplida.

## Evidencias <!-- MUST -->

- `god-ring.test.ts`: 17 tests (manuales, desborde, oficial nulo y por encima, meta 60 y catálogo, cero verificados, porcentaje, hitos).
- `npm run lint && npm run typecheck && npm test` en verde (73 archivos, 1485 tests).

