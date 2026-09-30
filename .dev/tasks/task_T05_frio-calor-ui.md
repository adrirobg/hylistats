# Task T05 — Frío/calor en el álbum y en el panel de campeón

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Los cromos muestran ❄️ / 🔥 según `computeHeat`, el álbum tiene el orden "Frío/calor" y el panel de campeón explica el estado con sus números.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Frío/calor en el álbum"; Entregable 5.
- think.md F16 (nombres visibles: 🔥 "Modo diablo", ❄️ "Nevera").
- Código:
  - `src/app/euw/[slug]/album-view.ts:24`: `ORDENES` y `ORDEN_LABEL` (l. ~235); lógica de orden del álbum en el mismo fichero. `FILTROS` no se toca.
  - `src/app/euw/[slug]/album-card.tsx`: el cromo (partes con `data-card-part`, estado `CardState` en `album-view.ts:130`).
  - `src/app/euw/[slug]/data.ts`: carga de la pestaña Campeones (álbum) con `getPlayerRows`; calcula `computeHeat` ahí sobre las mismas filas.
  - `src/app/euw/[slug]/champion-panel.tsx` y `champion-panel-view.ts`: stats personales del panel.

## Prompt / instrucciones para worker <!-- MUST -->

1. `data.ts`: calcula `computeHeat(rows)` donde ya se construye el álbum y pasa a cada entrada del álbum `heat: "hot" | "cold" | "neutral"` (y al panel el `ChampionHeat` completo + `globalAvg`).
2. Cromo: marca pequeña (🔥 / ❄️) en una esquina que no choque con ◎ objetivo ni con el ⋯, con `aria-label`/`title` "Modo diablo" / "Nevera". Neutral: nada.
3. Orden nuevo `calor` con etiqueta "Frío/calor": 🔥 primero (mejor ajustada primero), luego neutrales (orden por estado actual), luego ❄️ (peor ajustada al final). Válido en `?orden=calor` por URL.
4. Panel de campeón: bloque "Frío/calor" con estado, media del campeón, media ajustada, tu media global y nº de partidas; si es neutral, la razón (`won`: "ya ganado"; `few-games`: "menos de 5 partidas"; `within`: "dentro de tu media").
5. Tests: orden `calor` en `album-view.test.ts`; textos del panel en `champion-panel-view.test.ts`.
6. Verifica en el navegador integrado con un perfil real que hay marcas y que el orden funciona; capturas en Evidencias. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] Marca ❄️/🔥 en cromos con texto accesible; nada en neutrales.
- [x] Orden `?orden=calor` funciona y tiene test.
- [x] Panel de campeón muestra estado, medias y nº de partidas, o la razón de neutral.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `data.ts` calcula `computeHeat(stats.playerRows)` una sola vez. Esas filas ya se cargan en todas las pestañas, así que no hay consultas nuevas. El resultado va a `buildAlbum`, que da a `AlbumEntry` los campos `heat` y `heatAdjustedAvg`, y a `championPanelData`, que da `heat` con el `ChampionHeat` y `globalAvg`.
- Cromo: `HeatMark` en la esquina inferior izquierda del retrato. Las otras tres esquinas ya están ocupadas por ◎, el sello o el lápiz, y ⋯. Lleva `role="img"` con `aria-label` y `title` «Modo diablo» o «Nevera», y `cardLabel` lo añade al `aria-label` del `<li>`.
- Orden `calor` («Frío/calor», `?orden=calor`): primero 🔥, de mejor a peor ajustada. Después los neutrales, con las bandas y el nombre de `estado`. Al final ❄️, con la peor ajustada la última. Los empates se resuelven por nombre y luego por `championId`.
- Corrección del orquestador en la revisión: un cromo con marca manual de «ganado» se trata como neutral, porque F16 solo marca campeones sin 1º. `effectiveHeat(entry, state)` lo aplica a la marca, al `aria-label` y al orden. Tiene 2 tests.
- Panel: bloque «Frío/calor» con la línea de estado («🔥 Modo diablo · 0,48 puestos mejor que tu media»), o la razón del neutral (ya ganado, menos de `HEAT_MIN_GAMES` partidas o dentro de tu media), más partidas, media del campeón, media ajustada y tu media.
- Navegador integrado (dev noworker):
  - Marcas en perfiles reales:
    - Hylimichi: ❄️ Nocturne, la última en `?orden=calor`.
    - BEJITO MAMBO: 🔥 Blitzcrank, primero; ❄️ Ekko y Kog'Maw, últimos.
    - Azpekaa: ❄️ ×3.
    - TheCIutch: ❄️ ×4.
    - zapas14: ❄️ ×3.
    - Krill1nt: ❄️ ×2.
    - elruffles: ninguna.
  - Panel de Blitzcrank: 5 partidas, media del campeón 2,40, ajustada 2,88 y tu media 3,36. La cuenta cuadra: (5·2,40 + 5·3,36)/10 = 2,88.
- `npm run lint && npm run typecheck && npm test && npm run build`: en verde (50 ficheros, 1071 tests).
