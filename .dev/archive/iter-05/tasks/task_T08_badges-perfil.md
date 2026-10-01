# Task T08 — Badges de títulos en la cabecera del perfil

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La cabecera del perfil de cada miembro muestra como badge sus títulos vigentes (del periodo que muestra el bloque Hoy / Semana), con la misma explicación que en la vista del grupo.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Badges en el perfil"; Riesgos ("Badges vigentes con el periodo vacío", ratificado por el supervisor); Entregable 7; **AC5** (en el badge) y **AC6**.
- Código:
  - `src/app/euw/[slug]/header.tsx:206`: `Badge` de "Deidad de Arena" junto al nombre.
  - `loadProfileTitles` (T04).
  - `Badge` ya abierto por foco (T05) y texto "por qué" (T02).

## Prompt / instrucciones para worker <!-- MUST -->

1. Carga `loadProfileTitles` para el perfil (en todas las pestañas, porque la cabecera es común), con la mínima línea en `data.ts`.
2. Un `Badge` por título vigente junto a "Deidad de Arena", con el nombre visible del título con su periodo, el texto "por qué" y el enlace al apartado Títulos de `/grupo`. Varios badges tienen que caber en la cabecera a 375 px (salto de línea, sin desbordar).
3. Los títulos de dúo y de trío salen en el perfil de cada uno de sus miembros. Un no miembro no muestra ningún badge de título.
4. Tests de la vista-modelo. Comprueba en el navegador con datos reales: badges presentes, apertura por foco y aspecto a 375 px.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Cada miembro muestra exactamente los títulos que la vista del grupo le asigna, incluidos los de dúo y trío (AC6).
- [x] Un no miembro no muestra badges de título (AC6).
- [x] El badge se abre con ratón, clic y foco, y muestra métrica, valor, partidas y enlace al apartado (AC5).
- [x] La cabecera no desborda a 375 px.
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `data.ts`: solo la llamada `loadProfileTitles(db, profile.id, now.getTime(), seasonStart)` en el `Promise.all` existente y el campo `titles` (+7 líneas netas).
- Vista-modelo pura `src/app/euw/[slug]/title-badges.ts` (+5 tests): nombre con periodo, "por qué", enlace `/grupo#titulos`, clave única por periodo/título/equipo; no miembro → []. `header.tsx`: un `Badge` por título junto a "Deidad de Arena" en el `flex-wrap` existente.
- Navegador (worker, datos reales): badges de los 7 perfiles cotejados con `/grupo` día y semana, título a título y con el mismo "por qué" (TheCIutch 6, Hylimichi 7, Krill1nt solo semana por no llegar al mínimo del día, elruffles 0). Apertura por foco con `:focus-visible` y popup con enlace. 375 px: `scrollWidth` = 375.
- Observación para el supervisor (no se cambia): la cabecera es sticky; con 7 badges a 375 px mide ~345 px y queda pegada al hacer scroll.
- Orquestador: `npm run lint && npm run typecheck && npm test && npm run build` en verde (57 ficheros, 1240 tests).
