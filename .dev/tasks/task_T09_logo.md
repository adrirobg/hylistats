# Task T09 — Logo: 3 propuestas SVG, elección y aplicación

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Tres propuestas de logo en SVG con capturas sobre la cabecera en `.dev/research/logo/`; el supervisor elige; la elegida queda como logo de la cabecera y favicon (`src/app/icon.svg`) (AC9).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Logo"; Entregable 9; AC9 (recortable, primero en el orden de recorte de §2).
- Diseño: `.dev/research/design-brief.md` (paleta, tipografía) y `design-mock.html`; cabecera actual en `src/app/euw/[slug]/header.tsx` y layout raíz en `src/app/layout.tsx`.
- Next.js 16: convención de iconos de app (`src/app/icon.svg`); consultar `node_modules/next/dist/docs/` antes de tocarla (AGENTS.md).

## Prompt / instrucciones para worker <!-- MUST -->

1. Preparar 3 propuestas SVG (monocromas/escalables, legibles a 16 px como favicon) en `.dev/research/logo/propuesta-{a,b,c}.svg`, con una nota breve de la idea de cada una.
2. Capturas de cada propuesta montada en la cabecera (navegador integrado) en la misma carpeta.
3. Presentarlas al supervisor y esperar elección o ajustes. **Gate del supervisor.**
4. Aplicar la elegida: componente de logo en la cabecera/landing y `src/app/icon.svg`. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] 3 propuestas SVG + capturas en `.dev/research/logo/`.
- [x] Elección registrada del supervisor.
- [x] Logo en la cabecera y favicon; checks en verde.

## Evidencias <!-- MUST -->

- Propuestas en `.dev/research/logo/`: `propuesta-{a,b,c}.svg`, una nota por propuesta en `README.md`, `preview.html` con los SVG embebidos y la captura `propuestas-cabecera.jpg`. La captura muestra el rótulo de la cabecera a 64, 32 y 16 px, en pestaña clara y en oscura.
- El supervisor eligió en esta sesión (2026-09-30) la **A · Sello 1º**.
- Aplicación:
  - `src/components/hy/logo.tsx`: SVG decorativo con los colores `--place-1` y `--background`, montado junto al rótulo en `top-bar.tsx` y en la landing (`src/app/page.tsx`).
  - Favicon en `src/app/icon.svg`, según la convención de `app-icons.md` de Next 16. Se retira `src/app/favicon.ico`, que era el de serie de create-next-app.
- Navegador integrado:
  - La landing y `/euw/Hylimichi-EUW` muestran el sello junto a «HYLISTATS» (`aplicado-perfil.jpg`).
  - `<link rel="icon" href="/icon.svg?…" type="image/svg+xml">` se sirve como `image/svg+xml`.
- `npm run lint && npm run typecheck && npm test && npm run build` en verde: 50 ficheros y 1108 tests, con la ruta `/icon.svg` estática en el build.
