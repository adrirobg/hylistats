# Spec: hylistats — iter-03 compañeros, partidas, panel de campeón y cierre de v1
**Estado**: aprobada (issue [#3](https://github.com/adrirobg/hylistats/issues/3), aprobada por el supervisor, 2026-09-29)
**Consume**: think.md §1 (criterio de terminado F4) y decisiones F1–F14 como referencia y restricción; `.dev/research/design-brief.md` §2 (mapa de URLs), §3.3–3.6, §4.6–4.10, §5 y D4, D5, D6, D9 y D10 (§8, recomendación adoptada, F13); `.dev/research/reference-sites.md` (plantillas de enlaces y huecos de slugs); `.dev/research/design-mock.html`; iteraciones 01 y 02 (`.dev/archive/iter-01/`, `.dev/archive/iter-02/`, deuda en `iter-02/learn.md`); runbook `.dev/research/orquestacion-v1.md`
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

## Objetivo <!-- MUST -->

Completar la v1: compañeros, historial y panel de campeón, con refresco automático, para que el grupo juegue una sesión entera sin abrir otra web.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Compañeros** (§3.4): tabla con partidas, 1º, % 1º, top 3, puesto medio y última partida. Muestra mínima ≥ 3 por defecto y aviso ⚠ por debajo de 5 (D6). Enlace al perfil del compañero en hylistats y top de compañeros en el raíl (D2).
- **Partidas** (§3.5): filas compactas y marca "nuevo 1º". Detalle 6×3 con el propio equipo siempre resaltado y enlace directo `?partida=`. Si no hay augments o items, no se pintan. Filtros por campeón, puesto y compañero, en bloques de 50.
- **Panel de campeón** (§3.6, D9) en `?campeon=`: stats personales, distribución, últimas partidas, objetivo, marcado manual y enlaces a op.gg, LoLalytics, METAsrc, u.gg y Blitz. Slugs verificados en casos límite (Wukong, Nunu, Renata, Bel'Veth, Kai'Sa…).
- **Resumen** (§3.3, D4): marcador, distribución, forma, curva de campeones ganados acumulados con el umbral y destacados.
- **Auto-refresco** (D10): al volver a la pestaña y cada 5 min si está visible. Cooldown de 60 s en el botón y dentro del presupuesto de I2.
- **Estados restantes de §5**: límite de peticiones, cola compartida, Arena fuera de rotación, contador oficial no disponible y perfil ajeno.

**No incluye** <!-- SHOULD -->:
- Stats por trío (D5), tema claro (D11), filtro por clase (D8), hosting (F12) y sync entre dispositivos.
- Puesto medio móvil como segunda serie de la curva (D4 la deja "si cabe"; el issue pide solo la curva con el umbral).
- Pulido visual más allá de la maqueta y deuda de iter-02 sin relación con estos ficheros (payload RSC, raíl de 380 px, roving tabindex): siguen en "Pulido UI" de `think.md`.
- Selector de temporada (D7: etiqueta estática) y colas 2v2: solo se sincronizan las colas de tríos 1750 y 1740 (F14), así que no hace falta etiqueta de cola.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Dominio de compañeros | `computeTeammates` con `top3` y `lastPlayedAt`, y tests de tríos (2 compañeros por partida). `TeammateSummary` sin `puuid` |
| 2 | Auto-refresco D10 | `auto-refresh.tsx` con `visibilitychange` y cadencia visible. Umbral automático de 5 min en el servidor (`ensureFreshOnView`), polling parado con la pestaña oculta |
| 3 | Pestañas y estado en URL | `?tab=campeones\|resumen\|companeros\|partidas`, carga bajo demanda por pestaña y `?campeon=` / `?partida=` abribles por URL directa |
| 4 | Compañeros y raíl | Pestaña Compañeros (§3.4, D6) y top de compañeros en el raíl (D2) |
| 5 | Partidas y detalle | Pestaña Partidas (§3.5): filas, "nuevo 1º", filtros, bloques de 50 y detalle 6×3 con `?partida=` |
| 6 | Panel de campeón | Hoja lateral o inferior en portal (§3.6, D9) con stats, distribución, últimas, objetivo, marcado manual y enlaces externos (§4.9) con slugs probados |
| 7 | Resumen | Marcador, distribución, forma enlazada a la partida, curva D4 con umbral y destacados |
| 8 | Estados de §5 | Límite de peticiones, cola compartida, Arena fuera de rotación, contador oficial no disponible y perfil ajeno, en header, banda y panel |
| 9 | Verificación E2E | `.dev/verify-report.md` con capturas, logs del worker, SQL y enlaces externos abiertos en el navegador |

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1 — `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` en verde. Tests de las agregaciones de compañeros (tríos: 2 por partida) y de los slugs de enlaces.
- [ ] AC2 — Las pestañas, el panel y la partida expandida se pueden abrir por URL directa.
- [ ] AC3 — El auto-refresco no pasa de 1 petición de ids por perfil cada 5 min con la pestaña visible, verificado por logs. **Interpretación registrada** (el issue es anterior a F14): ≤ 1 incremental automático por perfil cada 5 min, que son 2 peticiones de ids (una por cola, 1750 y 1740).
- [ ] AC4 — Los enlaces externos abren la página correcta en al menos 5 campeones, incluidos 3 casos límite.
- [ ] AC5 — **Criterio de terminado de la v1 (F4). Aceptación manual del supervisor = gate de merge**: en una sesión real de Arena el grupo elige campeón y consulta stats y compañeros sin abrir otra web. El recuento de campeones ganados cuadra con el contador oficial o la app explica la diferencia.

## Riesgos y restricciones <!-- MAY -->

- **Key**: nunca se imprime, loguea, commitea ni se pasa a subagentes. La vigente está en `settings` (fuente `db`). Es dev key y caduca hacia el 2026-09-30 a las 18:30 UTC. AC3 se verifica contra Riot: por eso el auto-refresco va pronto en el orden de tasks. Con 401/403 se para y se avisa al supervisor.
- **Presupuesto Riot (I2)**: cada incremental automático cuesta 2 peticiones de ids y 1 de `player-data`, y el umbral es de 5 min por perfil en el servidor, compartido por pestañas y visitantes. Sin `db:reset` ni un segundo backfill completo.
- **Enlaces externos**: los sitios de terceros cambian de URL sin aviso. Los slugs se derivan del `id` de Data Dragon con excepciones por sitio, verificadas en el navegador integrado y fijadas en tests. Los tests no llaman a la red.
- **Payload RSC** (~83 kB por `router.refresh()`, deuda de iter-02): no se añaden a `ProfileView` datos que no se pintan. Los de pestañas no activas, del panel y del detalle se cargan solo cuando la URL los pide.
- **Sin dependencias nuevas**: `recharts` (ya instalado, vía `src/components/ui/chart.tsx`) sirve para la curva. Sin jsdom: la lógica de UI se prueba como funciones puras y la UI se verifica en el navegador integrado del orquestador.
- **Next 16**: leer `node_modules/next/dist/docs/` antes de escribir código (`searchParams` asíncronos, Server Actions, `useSearchParams` con `Suspense`).

## Estrategia de implementacion <!-- SHOULD -->

Secuencia por dependencias:
1. Dominio de compañeros.
2. Auto-refresco D10. Se adelanta para verificar AC3 contra Riot con la key vigente.
3. Pestañas y URL.
4. Compañeros y raíl.
5. Partidas y detalle.
6. Panel de campeón con enlaces.
7. Resumen.
8. Estados de §5.
9. Verificación E2E.

Cada task la implementa un subagente con prompt autocontenido, en serie (los tests comparten la BD `hylistats_test`). El orquestador revisa el diff, ejecuta `npm run lint && npm run typecheck && npm test && npm run build`, verifica la UI en el navegador integrado y commitea (`feat(scope): …` + `Refs: #3`).

Decisiones técnicas del orquestador (dentro del alcance, sin cambiar F1–F14 ni D1–D13):
- **AC3 y umbral automático**: los disparos automáticos (montaje, `visibilitychange` a visible y el latido con la pestaña visible) llaman a `ensureFreshOnViewAction`. El servidor solo encola un incremental si `lastSyncedAt` tiene más de 5 min (`AUTO_REFRESH_STALE_MS`, antes 2 min al montar). El guardia está en el servidor y en BD, así que vale para varias pestañas y visitantes a la vez. El latido del cliente comprueba cada 60 s con la pestaña visible (solo toca la BD propia): el incremental cae entre 5 y 6 min después del anterior. Con la pestaña oculta no hay polling ni disparos. El botón Actualizar conserva su cooldown de 60 s (`REFRESH_COOLDOWN_MS`) y no depende del umbral de 5 min.
- **Carga bajo demanda**: `loadProfilePage` recibe la pestaña y los parámetros de la URL y carga solo lo que se pinta: tabla completa de compañeros en `companeros`, bloque de partidas en `partidas`, curva y destacados en `resumen`, panel con `?campeon` y detalle 6×3 (18 participantes) con `?partida`. El raíl siempre lleva el top de compañeros (unos 5).
- **URL**:
  - `?tab` admite `campeones` (por defecto), `resumen`, `companeros` y `partidas`. Al cambiar de pestaña se quitan los parámetros propios de la anterior.
  - `?campeon={slug}` abre el panel sobre cualquier pestaña. El slug es el `id` de Data Dragon en minúsculas (`ahri`, `monkeyking`, `nunu`…); si el campeón no está en el catálogo, el `championName` de la partida en minúsculas.
  - `?partida={matchId}` expande esa partida en Partidas.
  - Filtros de Partidas: `?q` (campeón, texto, como el `?q` del álbum), `?puesto=1|top3` y `?companero={Nombre-TAG}` (slug de Riot ID, nunca `puuid`). Los bloques de 50 se amplían con `?n`.
  - Compañeros: `?min` (muestra mínima; 3 por defecto) y `?orden` por columna.
- **Panel en portal**: hoja lateral en escritorio y hoja inferior por debajo de 640 px. Va en portal fuera de `.app`, porque su `container-type` contiene el `position: fixed` (mismo patrón que `toast.tsx` y `card-menu.tsx`). `Esc` y ✕ lo cierran quitando `?campeon`, y el foco vuelve al origen.
- **Colores de puesto**: `TONE_BG` pasa de `scoreboard.tsx` a junto a `placeTone` (deuda de iter-02), porque lo reutilizan chips de partidas, panel y Resumen.
- **Enlaces de compañeros**: el nombre enlaza siempre a `/euw/{Nombre-TAG}`. Si no está registrado, esa página ofrece registrarlo (estado que ya existe). ★ si está en favoritos (capa de navegador F6).
- **Enlaces externos**: `championLinks(ddId, name)` es una función pura con plantillas de §4.9 y una tabla de excepciones por sitio. La tabla se verifica en el navegador integrado antes de fijarla en tests.
- **Curva D4**: campeones verificados (dominio, sin marcas manuales) acumulados por fecha del primer 1º, en línea escalonada con la línea horizontal del umbral `ARENA_GOD_THRESHOLD` (60).
- **Arena fuera de rotación**: Riot no expone la rotación de modos, así que se infiere de la BD propia. Si la última partida de Arena de **cualquier** perfil tiene más de 7 días y la última sincronización fue bien, el header lo explica: "Sin partidas de Arena desde el X: puede que Arena esté fuera de rotación". Así no parece un fallo de sincronización y no se afirma lo que no se sabe.
- **Límite de peticiones y cola compartida**:
  - Se derivan en el servidor del job activo (`nextRunAt` futuro tras un `RiotRateLimitError`) y de los jobs activos de otros perfiles en el orden de `pickWork`. El texto de `lastError` no sale del servidor.
  - Contador oficial no disponible (§4.3, "sin dato oficial") y perfil ajeno ("Viendo el perfil de X", D12) ya existen desde iter-02. En esta iteración se extienden a las vistas nuevas: el panel no muestra objetivo ni marcado manual en perfiles ajenos.

`.dev/tasks/index.json` es tracking operativo local derivado de este spec y del issue; no sustituye el source of truth superior.
