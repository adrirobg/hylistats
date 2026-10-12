# Task T10 — Pila flotante global: todos los avisos y toasts

**Owner**: worker:opus
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: derivada de `spec.md` → "Revisión v5b" (D8–D12, AC22). Parte de lo hecho en T08 (pila de sincronización en `Vitrina`) y T09 (tarjeta Dios de Arena con barra).

## Objetivo <!-- MUST -->

Una sola pila flotante para toda la app en la que entran todos los avisos que aparecen solos y todos los toasts, de modo que ninguno empuje el contenido.

## Contexto <!-- SHOULD -->

- `src/components/hy/toast.tsx`: `useToast`, `ToastRegion` (abajo al centro), `FloatingStack` y `FloatingNotice` (T08), `useBody`.
- Usos de toasts: `src/app/euw/[slug]/use-refresh.tsx`, `arena-god-notice.tsx` (Marcar a mano / Sincronizar), `matches-panel.tsx`, `src/app/grupo/group-freshness.tsx`.
- Pila de sincronización de T08: `floating-notices.ts` (+ test, `pickNotice`), `sync-notice.tsx`, estado de cerrados e indicador A3 en `vitrina.tsx`.
- Aviso de Dios de Arena: `arena-god-notice.tsx` (estados y acciones; su lógica y textos no cambian) y `god-trophy.tsx` (T09: línea de datos con "✓ oficial N"; en no miembros, `wide` con el aviso a la derecha — al salir el aviso de la tarjeta, la tarjeta de no miembros vuelve a ser a su medida, `min-w` de T09, sin columna de aviso).
- Aviso de Arena fuera de rotación: el `<output>` bajo la identidad en `vitrina.tsx` (`arenaQuietPhrase`).
- Layout raíz: `src/app/layout.tsx`.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Pila global**: un proveedor cliente en el layout raíz (p. ej. `FloatingProvider` en `src/components/hy/`) con una API para (a) **toasts** efímeros (`useFloatingToast()` → `show(contenido)`, misma duración que hoy) y (b) **avisos** que se registran desde cualquier componente (p. ej. `<FloatingItem id priority group onClose>contenido</FloatingItem>` que no pinta nada en su sitio y se registra en el proveedor mientras está montado). El proveedor pinta la pila en un portal sobre `<body>` (una región viva `output`), toasts encima. Sustituye `ToastRegion`/`useToast` y el `FloatingStack` de `Vitrina` por esta API y borra lo que quede sin uso.
2. **Prioridad y plegado (D10)** en una función pura con tests: entradas = avisos registrados (id, prioridad, grupo) + cerrados + ancho (móvil o no); salida = visibles (2 en escritorio, 1 en móvil — `matchMedia("(max-width: 640px)")`), plegados ("+N avisos", botón que despliega/pliega) y número de cerrados activos. Prioridades: sincronización (con su orden interno de T08) > Dios de Arena > Arena fuera de rotación.
3. **Avisos que entran**: los de sincronización de T08 (misma lógica, ahora registrados en la pila global); el de **Dios de Arena** (sale de la tarjeta; mismo contenido y acciones dentro del aviso flotante, con el título "Dios de Arena"; "Qué significa" abre la explicación «?» de la tarjeta, que sí se despliega en su sitio porque la abre el usuario); el de **Arena fuera de rotación** (sale de bajo la identidad; título "Arena", icono informativo).
4. **Rastro (D11)**: en la línea de datos de `GodTrophy`, con aviso activo, en lugar de "✓ oficial N" un botón de texto corto en `text-trust` que lo enfoca/reabre (texto según el estado, p. ej. "! no cuadra con el oficial (79)", "! sin contador oficial", "sincronizando…"). Sin alto extra.
5. **Indicador A3**: cuenta los cerrados activos de todos los grupos ("!" con número si > 1) y los reabre todos.
6. **Cierres que duran (D12)**: Dios de Arena y Arena fuera de rotación guardan el cierre en `localStorage` con clave por perfil y firma del estado (función pura de firma con test); sincronización, en memoria. `try/catch` en lecturas y escrituras; sin `localStorage` funciona igual (solo no recuerda).
7. Comprueba en el navegador (http://localhost:3005, servidor del orquestador: no lo pares ni arranques otro; pon tu pestaña al frente con `tabs_select` antes de medir): Hylimichi (pausa + Arena fuera de rotación → 2 visibles), un perfil con aviso de Dios de Arena (elruffles `/euw/elruffles-6485`; o BEJITO MAMBO si tiene marcas manuales — si no, fuérzalo y revierte), /grupo (toast de su frescura si lo puedes provocar), a 1440 y 375 px. Mide que el `top` de `[role=tablist]` no cambia al aparecer/cerrar avisos y que ya no hay hueco bajo la identidad. Restaura el tamaño de ventana al terminar.

Reglas comunes:
- Next.js 16: antes de escribir código de Next (layout, providers) lee la guía en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas. Textos en español; comentarios con la densidad y el tono del código vecino (actualiza las cabeceras de los archivos que cambian de papel).
- No hagas crecer `data.ts`. Un solo `REFRESH_BUTTON_ID`. Si algo no encaja, **para y descríbelo**.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. Sin commit.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC22 de la spec.
- [ ] `ToastRegion` y la pila local de `Vitrina` sustituidas por la global; nada sin uso.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.
