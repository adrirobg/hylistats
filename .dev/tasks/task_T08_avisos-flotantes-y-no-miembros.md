# Task T08 — Todos los avisos de sincronización flotantes y Dios de Arena en no miembros

**Owner**: worker:opus
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: derivada de `spec.md` → "Revisión v4" (D6 ampliada) tras la revisión del supervisor del 2026-10-12: "no deberíamos mover banners; ¿por qué no ponemos todo flotante?" y "toma tú la decisión más elegante" para el perfil de fuera del grupo.

## Objetivo <!-- MUST -->

1. Ningún aviso de **sistema** (estado de la sincronización) empuja el contenido: todos salen en **una sola pila flotante**.
2. En perfiles de **fuera del grupo**, Dios de Arena deja de ser una columna estrecha con el aviso apretado.

## Decisiones de diseño (orquestador) <!-- MUST -->

**Criterio**: lo que habla del *sistema* (si los datos se están actualizando, si se pueden actualizar) flota; lo que habla del *contenido* del perfil se queda en su sitio. Se quedan en el flujo: el aviso de Arena fuera de rotación bajo la identidad, el aviso de descuadre del trofeo Dios de Arena (es del trofeo y sus acciones también), y los estados vacíos (`sync-empty.tsx`).

- **A1 — Una pila flotante** abajo a la derecha (340 px; por debajo de 640 px de viewport, de lado a lado con 12 px), en portal sobre `<body>` (`useBody` de `src/components/hy/toast.tsx`). Enseña **un aviso persistente** (el de mayor prioridad) y, encima, el **toast efímero** de Actualizar si lo hay (el toast deja de ir abajo al centro: así no se pisan en móvil). Prioridad: (1) **error de actualización** "No se pudo actualizar (Riot no responde)" con su botón **Reintentar** (hoy `Notice` en `vitrina.tsx`); (2) **pausa** por key caducada; (3) **límite de peticiones**, tanto el del incremental (hoy `Notice` en `vitrina.tsx`) como el del backfill (hoy en `SyncBand`); (4) **progreso** del backfill y la cola (`resolving`, `listing`, `fetching`, `queued` de `SyncBand`), como tarjeta con su barra y textos de hoy, en el tono neutro.
- **A2 — Cerrar**: todos los avisos persistentes se cierran con su ✕ (`aria-label="Cerrar aviso"`). Cerrado, no vuelve hasta que cambie su `kind` (como ya hace `SyncBand`). El progreso cerrado tampoco vuelve hasta que cambie de fase.
- **A3 — Rastro tras cerrar**: si hay un aviso persistente activo pero cerrado, la frescura de la barra ("Comprobado hace…") lleva al lado un indicador pequeño (icono `!` en `text-trust`, botón con `aria-label="Ver aviso"`) que lo vuelve a abrir. En la barra compacta y en móvil también (la frescura se oculta en compacta/móvil: pon el indicador junto al botón Actualizar en esos casos).
- **A4 — Accesibilidad**: la pila es una región viva (`output`/`role="status"`) siempre presente; el error usa el mismo rol que hoy. El foco no salta al aviso.
- **A5 — Sin banda**: el slot `band` de `Cabin` queda sin uso: quítalo (y su hueco) si nadie más lo usa; `SyncBand` deja de pintar en el flujo (puede convertirse en el proveedor del contenido de la pila o desaparecer: elige lo más simple y documéntalo).
- **N1 — No miembros**: la fila de trofeos lleva solo Dios de Arena **a todo el ancho** con disposición horizontal: a la izquierda anillo + cifra + hitos; a la derecha, separado por un borde vertical sutil, el aviso de descuadre con sus acciones (máx. ~460 px). Sin aviso (estado `match`), la tarjeta se ajusta a su contenido (`w-fit`) y queda a la izquierda, dejando ver el splash. Por debajo de ~700 px de contenedor, apilado (aviso debajo). En miembros no cambia nada (la tarjeta estrecha junto a El grupo hoy, con su aviso debajo como ahora).

## Contexto <!-- SHOULD -->

- `src/app/euw/[slug]/vitrina.tsx`: `status?.kind === "rate_limit"` (~436) y `showError` (~444) con `Notice`; `ToastRegion` con `refresh.toast`; la frescura en la barra.
- `src/app/euw/[slug]/sync-band.tsx` (modelos `syncBandModel` en `view-model.ts`), `cabin.tsx` (slot `band`), `page.tsx` (`band={<SyncBand />}`, `TrophyGrid single`), `vitrina-ui.tsx` (`TrophyGrid`, `TrophyCard`), `god-trophy.tsx` + `arena-god-notice.tsx`.
- `src/components/hy/toast.tsx`: `useBody`, `ToastRegion`, `FloatingNotice` (T06). `use-refresh.tsx` (toast).
- Estado común: `usePageStatus()` (`status-provider.tsx`) da `status.profile.sync`, `paused`, `lastJobErrorAt`, `lastSyncedAt`: la pila puede leerlo ella misma; lo que solo tiene la vitrina (Reintentar, `refresh.toast`) pásalo por contexto o props, sin duplicar la lógica de `useRefresh` (un solo `REFRESH_BUTTON_ID`).
- Servidor de la rama en http://localhost:3005 (BD local, sin worker; proceso del orquestador: **no lo pares ni arranques otro**). Hylimichi tiene la key caducada (pausa) → el aviso de pausa se ve; elruffles (`/euw/elruffles-6485`) es no miembro con descuadre. Para ver error, límite y progreso, usa tests de componente/funciones puras o fuerza estados en local de forma temporal y **revierte** antes de terminar.

## Prompt / instrucciones para worker <!-- MUST -->

Implementa A1–A5 y N1. La elección de qué aviso persistente toca (prioridad + cerrados) va en una función pura con test (p. ej. en `view-model.ts` o un módulo nuevo `floating-notices.ts`): entradas = estado de sync/pausa/error/límite + `kind`s cerrados; salida = aviso visible y si hay alguno cerrado activo (para A3). Tests: prioridad con varios activos, cerrado que no vuelve con el mismo `kind` y vuelve al cambiar, progreso → pausa, sin nada.

Reglas comunes:
- Next.js 16: antes de escribir código de Next lee la guía en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas. Textos en español; comentarios con la densidad y el tono del código vecino (actualiza los comentarios de cabecera de los archivos que cambien de papel).
- No hagas crecer `data.ts`.
- Si algo no encaja con el código, **para y descríbelo** en el informe.
- Comprueba en el navegador (Claude_Browser si lo tienes): Hylimichi a 1440 y 375 px (aviso de pausa, cerrar, indicador A3, reabrir; nada se mueve al cerrar), elruffles a 1440, ~700 y 375 px. Restaura el tamaño de la ventana al terminar.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. Sin commit.

## Criterios de aceptacion <!-- MUST -->

- [x] Ningún aviso de sincronización en el flujo: error, pausa, límite (ambos) y progreso en la pila flotante, uno persistente a la vez por prioridad, más el toast encima.
- [x] Cerrar funciona y no vuelve hasta cambiar de `kind`; indicador para reabrir (A3).
- [x] Slot `band` retirado o justificado.
- [x] No miembros: Dios de Arena a todo el ancho con el aviso a la derecha; sin aviso, ajustado a su contenido.
- [x] Función pura de prioridad con tests; `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- Commit `734b48d`. `npm run lint && npm run typecheck && npm test && npm run build`: EXIT 0 (75 archivos, 1519 tests; `floating-notices.test.ts` 11 tests).
- Navegador (worker): Hylimichi a 1440 y 375 — aviso de pausa, cerrar, indicador y reabrir sin mover frescura, botón ni pestañas; elruffles a 1440/768/700/375 con Dios de Arena a lo ancho y el aviso a la derecha; error, toast y progreso forzados y revertidos. Slot `band` y `sync-band.tsx` retirados.
