# Task T09 — Logo: 3 propuestas SVG, elección y aplicación

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] 3 propuestas SVG + capturas en `.dev/research/logo/`.
- [ ] Elección registrada del supervisor.
- [ ] Logo en la cabecera y favicon; checks en verde.

## Evidencias <!-- MUST -->

Pendiente.
