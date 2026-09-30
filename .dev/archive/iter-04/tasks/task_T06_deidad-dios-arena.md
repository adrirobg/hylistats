# Task T06 — Badge Deidad de Arena, meta Dios de Arena y renombrado

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Con ≥60 ganados la cabecera muestra el badge "Deidad de Arena" y la barra de tres capas pasa a la meta "Dios de Arena: X / N" (N = campeones de los datos estáticos). Ningún texto visible dice "Arena God" (AC6).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Badge Deidad de Arena y meta Dios de Arena"; Entregable 6; AC6.
- think.md §2 punto 3 y ORGANIZED iter-04 (P7): nombres del supervisor; la curva del Resumen conserva el umbral 60 renombrado.
- Código:
  - `src/lib/config.ts:18` `ARENA_GOD_THRESHOLD = 60`.
  - `src/domain/arena-god.ts`: `arenaGodState` (l. 51, recibe `goal`), `arenaGodLabel`, frases y `ARENA_GOD_EXPLANATION` (l. ~193).
  - `src/app/euw/[slug]/arena-god.tsx`: barra (textos visibles "Arena God · temporada actual" l. ~129 y "· Arena God" l. ~266); recibe `goal` desde `page.tsx:147`.
  - `src/app/euw/[slug]/header.tsx`: cabecera del perfil.
  - `src/lib/ddragon.ts:134` `getChampionCatalog()` → catálogo de campeones de la versión en uso (N = su tamaño).
  - `won-curve-chart.tsx` y `data.ts:574` (`threshold` de la curva).
  - Contador oficial: `profiles.challengeValue`.

## Prompt / instrucciones para worker <!-- MUST -->

1. Badge: componente reutilizable `src/components/hy/badge.tsx` (título, icono/emblema sencillo, tooltip accesible con la condición "60 campeones distintos ganados esta temporada"). Pensado como primera pieza del sistema de badges de iter-05: props genéricas, sin lógica de Arena dentro.
2. Condición: `max(verificados, oficial ?? 0) >= ARENA_GOD_THRESHOLD`. **No** cuentan las marcas manuales para el badge (viven en el navegador y solo en "mi perfil").
3. Barra: si la condición se cumple, `goal = N` (tamaño del catálogo) y la etiqueta pasa a "Dios de Arena"; si no, `goal = 60` con etiqueta "Deidad de Arena". Las tres capas (verificados, manuales, oficial) y el aviso de descuadre no cambian.
4. Renombra todo texto **visible** "Arena God" → "Deidad de Arena" (barra, curva, explicaciones, estados). Comentarios e identificadores de código pueden quedarse.
5. Tests: `arena-god.test.ts` (cambio de meta en 59/60/oficial mayor), y un test que busque "Arena God" en los textos exportados visibles.
6. Verifica en el navegador integrado un perfil con ≥60 y otro con <60; capturas. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] Badge en la cabecera con ≥60 (verificados u oficial), componente reutilizable.
- [x] Barra "Dios de Arena: X / N" con N del catálogo; <60 sigue a 60 como "Deidad de Arena".
- [x] Sin textos visibles "Arena God".
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Condición única en `arenaGodGoal({ verified, official, championTotal })` (`src/domain/arena-god.ts`), que devuelve `{ reached, goal, name }`. Las marcas manuales no cuentan.
  - N sale del catálogo que ya carga `data.ts`.
  - Fallback: si el catálogo trae menos de 60 campeones o está caído, la meta se queda en 60 con el nombre «Deidad de Arena» y el badge se muestra igualmente.
- `src/components/hy/badge.tsx` es genérico (`title`, `description`, `emblem`) y no sabe nada de Arena.
  - El tooltip es un Popover de Base UI. Se abre con hover, con clic o toque, y con Enter desde el teclado.
  - La descripción está siempre en el DOM como `sr-only` enlazada por `aria-describedby`.
- Formato de la barra: la spec escribe «Dios de Arena: X / N». Se mantiene el formato de la barra, con título «Dios de Arena · temporada actual» y contador «X de N»: la información es la misma.
- Escala, corrección del orquestador en la revisión: con meta 173 la etiqueta pisaba los ticks 160 y 180. Ahora el paso es 40 cuando `scaleMax` > 100, y se quitan los ticks regulares a menos de 20 de la meta. Queda `[0, 40, 80, 120, 173]`, con tests.
- Renombrado de textos visibles:
  - Título de la barra: «Deidad/Dios de Arena · temporada actual».
  - Tick de la meta: «· {nombre}».
  - Curva del Resumen: «Deidad de Arena · 60».

  Un test recorre los textos del dominio y el código sin comentarios de los componentes. `grep` de "Arena God" en `src/` solo encuentra comentarios y tests.
- Navegador integrado (dev noworker):
  - Azpekaa (63): badge «Deidad de Arena», barra «DIOS DE ARENA · TEMPORADA ACTUAL · 63 de 173», escala limpia y línea de la curva «Deidad de Arena · 60».
  - Tooltip abierto con Enter: «60 campeones distintos ganados esta temporada».
  - Hylimichi (107) a 375 px: badge visible, «107 de 173» y sin scroll horizontal.
  - TheCIutch (30): sin badge, «DEIDAD DE ARENA · 30 de 60 · 60 · Deidad de Arena».
  - Ningún «Arena God» en el texto de la página.
- `npm run lint && npm run typecheck && npm test && npm run build`: en verde (50 ficheros, 1089 tests).
