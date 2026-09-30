# Task T07 — Pestaña Grupo en los perfiles de los miembros

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Los perfiles de los miembros tienen una pestaña "Grupo" (`?tab=grupo`) con la misma vista que `/grupo` y la fila del dueño del perfil destacada; los perfiles que no son del grupo no la tienen.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Vista del grupo"; Entregable 6; **AC9**.
- Código:
  - `src/app/euw/[slug]/view-model.ts:25`: `PROFILE_TABS`, `TAB_LABEL`, `DEFAULT_TAB`.
  - `src/app/euw/[slug]/tabs.tsx`: barra de pestañas (enlaces `?tab`, teclado).
  - `src/app/euw/[slug]/page.tsx:166`: `switch` de la pestaña activa; `data.ts:545`: carga por pestaña (`loadRecords` solo si `tab === "estadisticas"`).
  - Componente de vista de T05/T06 y `loadGroupView` (T04); consulta "es miembro" de T01.

## Prompt / instrucciones para worker <!-- MUST -->

1. Pestaña "Grupo" al final de la barra, solo si el perfil es miembro. Si alguien abre `?tab=grupo` en un perfil que no lo es, se trata como una pestaña desconocida (el comportamiento actual).
2. Carga bajo demanda como el resto: `loadGroupView` solo cuando la pestaña está activa, sin hacer crecer `data.ts` más allá de la llamada.
3. Reutiliza el componente de vista de `/grupo`, con la fila del dueño del perfil destacada en el ranking y en Temporada.
4. Tests de la vista-modelo (qué pestañas ve un miembro y un no miembro). Comprueba en el navegador que la pestaña y `/grupo` muestran los mismos valores.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Pestaña Grupo en los perfiles de miembros y no en los de no miembros (AC9).
- [ ] Mismos valores que `/grupo`, con la fila del dueño destacada (AC9).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
