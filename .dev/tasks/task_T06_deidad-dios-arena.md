# Task T06 — Badge Deidad de Arena, meta Dios de Arena y renombrado

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] Badge en la cabecera con ≥60 (verificados u oficial), componente reutilizable.
- [ ] Barra "Dios de Arena: X / N" con N del catálogo; <60 sigue a 60 como "Deidad de Arena".
- [ ] Sin textos visibles "Arena God".
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
