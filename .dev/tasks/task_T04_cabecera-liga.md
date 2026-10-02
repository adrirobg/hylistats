# Task T04 — Liga y rating en la cabecera del perfil

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La cabecera del perfil de cada miembro muestra liga y rating como texto junto al nombre ("Oro · 1526", con *provisional* si aplica); los no miembros no muestran nada.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Cabecera del perfil"; Riesgos → "Cabecera justa a 375 px"; **AC4**.
- think.md: P9 de "ELO del grupo" (texto, no badge; la cabecera ya va justa a 375 px, deuda de iter-05).
- Código:
  - `src/app/euw/[slug]/header.tsx:~150-225` (nombre, badge "Deidad de Arena" y `titleBadges`).
  - `src/app/euw/[slug]/page.tsx:~150` (props de la cabecera).
  - ELO del perfil en los datos del perfil (T02).

## Prompt / instrucciones para worker <!-- MUST -->

1. Prop nueva en la cabecera con el ELO del perfil (o `null`). Con valor, un texto corto junto al nombre: "<Liga> · <rating entero>", y "provisional" si aplica. No uses `Badge`.
2. Debe coincidir con la fila del miembro en la Clasificación (mismo redondeo y liga del dominio).
3. A 375 px, con varios badges de títulos, la cabecera no se rompe ni desborda. Si no cabe en la línea del nombre, colócalo en la línea siguiente sin quitar los badges.
4. Comprueba en el navegador a 375 px y en escritorio si tienes acceso; si no, déjalo indicado para el orquestador.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; números con `formatDecimal`/`formatCount` de `@/lib/format`; componentes `hy/*` y `ui/*`; textos de UI en español.
- No hagas crecer `src/app/euw/[slug]/data.ts` (716 líneas) ni `src/domain/group-titles.ts` (743) más allá del cableado mínimo: lo nuevo va en módulos propios.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Texto de liga y rating en la cabecera de los miembros; nada en no miembros.
- [ ] Mismo valor que la Clasificación.
- [ ] Cabecera correcta a 375 px con badges.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

