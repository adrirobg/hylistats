# Task T04 — Pestaña Estadísticas (UI)

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La pestaña `?tab=estadisticas` existe entre Resumen y Compañeros, carga bajo demanda y pinta `computeRecords` con enlaces a partida y panel de campeón, estados vacíos, bien a 375 px y usable con teclado (AC5).

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Pestaña Estadísticas"; Entregable 4; AC5.
- Código:
  - `src/app/euw/[slug]/view-model.ts:25`: `PROFILE_TABS`, `TAB_LABEL`, `tabHref`, `panelId`; `tabs.tsx` (patrón WAI-ARIA con roving tabindex, ya gestiona desplazamiento en estrecho).
  - `src/app/euw/[slug]/data.ts`: carga por pestaña (`view.tab === "resumen"` l. ~565, `companeros` l. ~559): añade `estadisticas` igual.
  - `src/app/euw/[slug]/page.tsx` y `tab-panel.tsx`: montaje de paneles; `summary-panel.tsx` y `highlight-groups.tsx` como referencia de estilo (Box, chips, textos vacíos que dicen por qué).
  - Enlace a partida: `?tab=partidas&partida={matchId}` (ver `matches-view.ts` / `view-model.ts` para el helper existente). Enlace a campeón: `championHref` en `champion-panel-view.ts`.
  - Componentes base en `src/components/hy/` (`box`, `chip`, `notice`). Formato de números/fechas en `src/lib/format.ts`.
  - Diseño: lenguaje visual de `.dev/research/design-brief.md` y `design-mock.html` (no hay maqueta de esta pestaña: reutiliza cajas y tipografía del Resumen).

## Prompt / instrucciones para worker <!-- MUST -->

1. Añade `estadisticas` a `PROFILE_TABS` en tercera posición, etiqueta "Estadísticas". Actualiza los tests de `view-model.test.ts` / `data.test.ts` que enumeren pestañas.
2. `data.ts`: con `view.tab === "estadisticas"` carga `getRecordRows` y `computeRecords` (T02); el resto de pestañas no lo cargan.
3. `stats-panel.tsx` (servidor si puede; cliente solo si necesita la URL como `highlight-groups.tsx`) con bloques:
   - **Récords de una partida**: daño, daño recibido, kills, racha de kills y muertes; cada uno valor grande + retrato/nombre del campeón + fecha, todo el bloque es enlace a la partida.
   - **Victorias especiales**: victorias sin morir (número + lista compacta enlazada, colapsable si >5) y victoria con más muertes.
   - **Rachas**: más 1º seguidos y más partidas sin 1º, con rango de fechas y "en curso" cuando aplique.
   - **Días**: mejor y peor día (fecha legible, puesto medio con 2 decimales, nº partidas) y nota "días de 06:00 a 06:00, mínimo 3 partidas".
   - **Campeones**: victorias a la primera (número y %) y campeón con más 1º (enlace a su panel).
   - Estados vacíos con texto que explique por qué (sin partidas, sin 1º, ningún día con 3 partidas).
4. Responsive: cuadrícula que pasa a una columna a 375 px sin scroll horizontal. Enlaces con foco visible; orden de tabulación lógico.
5. Tests de vista (funciones puras de view-model para textos/fechas si las creas) y de `data.ts` para la carga bajo demanda.
6. Verifica en el navegador integrado con la app en local (`npm run dev` vía la configuración de preview del proyecto) un perfil real (p. ej. `/euw/hylimichi-...`) en escritorio y a 375 px; adjunta capturas en Evidencias. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `?tab=estadisticas` abre por URL directa y aparece entre Resumen y Compañeros.
- [ ] Todos los bloques pintados; cada récord enlaza a su partida y el campeón con más 1º a su panel.
- [ ] Estados vacíos con explicación.
- [ ] Capturas a 375 px y escritorio sin scroll horizontal; navegación por teclado OK.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
