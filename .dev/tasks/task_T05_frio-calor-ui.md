# Task T05 — Frío/calor en el álbum y en el panel de campeón

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] Marca ❄️/🔥 en cromos con texto accesible; nada en neutrales.
- [ ] Orden `?orden=calor` funciona y tiene test.
- [ ] Panel de campeón muestra estado, medias y nº de partidas, o la razón de neutral.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
