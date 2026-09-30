# Spec: hylistats — iter-02 perfil y álbum de campeones
**Estado**: aprobada (issue [#2](https://github.com/adrirobg/hylistats/issues/2), aprobada por el supervisor el 2026-09-29; cambio de alcance de la cola 1740 aprobado por el supervisor el 2026-09-29)
**Consume**: think.md §1 y decisiones F1–F14 como referencia y restricción; `.dev/research/design-brief.md` (I4; D1–D13 con la recomendación adoptada, F13); `.dev/research/design-mock.html` (maqueta de referencia); `.dev/research/riot-api.md` (I1) + skill `riot-api`; el motor de iter-01 (`.dev/archive/iter-01/`); runbook `.dev/research/orquestacion-v1.md`
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

## Objetivo <!-- MUST -->

Convertir el motor de datos en la herramienta de pantalla secundaria: entrar, verte y decidir a quién sacar desde el álbum. El álbum cuadra con el contador oficial porque la sincronización cubre las dos colas de Arena tríos (1750 y 1740).

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Cola 1740 (cambio de alcance, F14)**: backfill, incremental y stats cubren `queueId` 1750 y 1740. Los perfiles sincronizados antes del cambio se completan con un re-backfill que no vuelve a pedir las partidas ya guardadas.
- Sistema visual del brief §6: tokens, Big Shoulders Display + Atkinson Hyperlegible Next, tema oscuro único e iconos de línea.
- Landing (§3.1): campo `Nombre#TAG` que acepta `Nombre-TAG` y URLs de op.gg, recientes y favoritos, redirección a "mi perfil" (`?inicio` la fuerza) y aviso "Este soy yo".
- Header de perfil (§4.1): identidad, frescura en dos líneas, botón Actualizar con progreso y toast de resultado, y banda de progreso del backfill en vivo (polling a la BD propia).
- Barra Arena God de tres capas y aviso de descuadre con sus 4 casos (§4.2–4.3).
- Álbum (§4.4–4.5): cromos con 4 estados, objetivo y origen distinguidos por forma, retratos de Data Dragon por `championId`↔`key`, bandas, filtros, búsqueda (`/`), orden, vista álbum/lista, objetivos (`o`) y marcado manual con confirmación. Estado de la UI en la URL (`?tab`, `?vista`, `?filtro`, `?q`, `?orden`).
- Raíl (D2) con marcador, distribución 1º–6º y forma de las últimas 20. Los compañeros del raíl quedan para #3.
- Capa de navegador (F6): mi perfil, favoritos, recientes, objetivos y marcas manuales, con exportar/importar JSON. Todo en `try/catch` y funcional sin `localStorage`. Los perfiles ajenos no muestran datos locales (D12).
- Responsive en los 4 rangos del brief §7 y accesibilidad: contraste AA, teclado y `prefers-reduced-motion`.
- Estados de §5 que afectan a estas vistas: vacíos, esqueletos, Riot ID no encontrado y error de la API con datos visibles.

**No incluye** <!-- SHOULD -->:
- Pestañas Compañeros, Partidas y Resumen completo, panel de campeón y auto-refresco al enfocar o cada 5 min (D10) → #3.
- Tema claro (D11), filtro por clase (D8) y selector de temporada (etiqueta estática, D7).
- Autocompletado de la landing entre perfiles conocidos (§3.1, no está en el issue) y el icono de invocador real (necesita Summoner-V4 en el worker): el avatar usa iniciales, como la maqueta.
- Pulido visual más allá de la maqueta: el supervisor pide prototipar con lo que hay; el pulido de la UI base es trabajo futuro (2026-09-29).
- Separar stats por cola: `queueId` se guarda por partida, así que es posible más adelante sin re-sincronizar.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Colas 1750 + 1740 | `ARENA_QUEUE_IDS` en `src/lib/config.ts`, listado por cola en el worker (`sync_jobs.list_queue_index`, migración), consultas de dominio por las dos colas y `npm run sync:season` para re-backfill |
| 2 | Sistema visual | Tokens del brief §6.1 en `src/app/globals.css` (tema Tailwind 4), fuentes con `next/font`, grano de fondo y layout raíz con el descargo |
| 3 | Catálogo y dominio del álbum | `src/lib/ddragon.ts` (Data Dragon con caché) y `src/domain/album.ts` (estado por campeón, forma de las últimas 20) |
| 4 | Capa de navegador y parser | `src/lib/local-store.ts` (F6, export/import) y parser de entrada de Riot ID en `src/lib/riot-id.ts` |
| 5 | Landing | `src/app/page.tsx` y componentes: buscador, recientes/favoritos, redirección a "mi perfil" |
| 6 | Perfil: header y sincronización | Layout cabina, header §4.1, banda de backfill, toast, estados §5 y esqueletos en `src/app/euw/[slug]/` |
| 7 | Barra Arena God | Barra de 3 capas y aviso §4.3 con lógica pura probada |
| 8 | Álbum | Cromos, bandas, filtros, búsqueda, orden, vista álbum/lista y estado en la URL |
| 9 | Interacción local del álbum | Objetivos (`o`), marcado manual con confirmación, atajos y animación de sellado |
| 10 | Raíl | Marcador, distribución 1º–6º y forma (20); franja compacta en 640–1099 px |
| 11 | Verificación E2E | Re-backfill real de la 1740 con la UI abierta, capturas y comprobaciones responsive en `.dev/verify-report.md` |

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1 — `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` en verde. Tests de la capa de navegador (sin storage, JSON corrupto, import/export) y del parser de Riot ID.
- [ ] AC2 — Con "mi perfil" guardado, `/` redirige a su perfil; sin él, muestra la landing (`?inicio` la fuerza siempre).
- [ ] AC3 — El álbum muestra los 4 estados y el objetivo según la maqueta; los filtros, la búsqueda y la vista se reflejan en la URL.
- [ ] AC4 — La barra Arena God y el aviso reproducen los 4 casos de §4.3 (tests con datos simulados).
- [ ] AC5 — Durante un backfill, el álbum y el marcador se rellenan sin recargar.
- [ ] AC6 — Sin scroll horizontal a 375, 960, 1440 y 1920 px (comprobado en navegador).
- [ ] AC7 — (cambio de alcance) Backfill, incremental y stats cubren las colas 1750 y 1740: tras el re-backfill de `BEJITO MAMBO#1991`, los campeones verificados igualan a `602002` (75 o el valor vigente) y el aviso muestra "Cuadra"; un incremental sin partidas nuevas hace 1 petición de ids por cola (2) y ninguna de detalle.
- [ ] AC8 — **Aceptación manual del supervisor** (gate de merge): en una partida real de Arena elige campeón desde el álbum (filtro "Objetivos sin ganar").

## Riesgos y restricciones <!-- MAY -->

- **Key**: nunca se imprime, loguea, commitea ni se pasa a subagentes. La vigente está en `settings` (fuente `db`, manda sobre `.env.local`). AC5 y AC7 necesitan la key vigente; con 401/403 se para y se avisa al supervisor.
- **Presupuesto Riot**: el re-backfill de la 1740 relista la temporada de las dos colas (~8 peticiones de ids) y solo descarga las partidas que faltan (~80); no es un segundo backfill completo. Sin `db:reset`.
- **Data Dragon** es un CDN externo sin key (fuera del presupuesto Riot). Si no responde, el álbum sigue funcionando sin retratos. Los tests no llaman a la red.
- **Sin dependencias nuevas**: no hay jsdom ni Testing Library, así que la lógica de UI se prueba como funciones puras y la UI se verifica en el navegador integrado del orquestador (a los subagentes se les deniega).
- **Next 16**: leer `node_modules/next/dist/docs/` antes de escribir código (`searchParams` asíncronos, `next/font`, `next/image`).

## Estrategia de implementacion <!-- SHOULD -->

Secuencia por dependencias: colas 1750+1740 → sistema visual → catálogo y dominio del álbum → capa de navegador y parser → landing → perfil (header y sync) → barra Arena God → álbum → interacción local → raíl → verificación E2E. Cada task la implementa un subagente con prompt autocontenido, en serie (los tests comparten la BD `hylistats_test`); el orquestador revisa el diff, ejecuta `npm run lint && npm run typecheck && npm test && npm run build`, verifica la UI en el navegador integrado y commitea (`feat(scope): …` + `Refs: #2`).

Decisiones técnicas del orquestador (dentro del alcance, sin cambiar F1–F14 ni D1–D13):
- **Colas**: `ARENA_QUEUE_IDS = [1750, 1740]`. El listado recorre las colas en orden con `list_queue_index` + `listCursor` en `sync_jobs`; al terminar, los ids se fusionan sin duplicados y se ordenan de más reciente a más antigua. Un incremental sin partidas nuevas hace 1 petición de ids por cola. `npm run sync:season -- "Nombre#TAG"` encola un backfill para un perfil ya registrado: las partidas guardadas se resuelven sin petición.
- **Umbral Arena God** = 60 (nivel MASTER de `602002`, `config` verificado en I1 §7.2) como constante en `src/lib/config.ts`, con la fuente citada.
- **Data Dragon**: `versions.json` + `champion.json` (`es_ES`) en el servidor, con caché de Next (24 h). Mapeo por `Number(key)` = `championId`, retratos del CDN con la última versión. Un campeón jugado que falte en Data Dragon sale con su `championName` y sin retrato. Nombres de visualización en `es_ES`; la búsqueda también casa con el `id` de Data Dragon.
- **Datos en vivo**: se mantiene el polling de iter-01 (`router.refresh()` cada 3 s con job activo y cada 30 s sin él). El estado de UI vive en la URL y en componentes cliente, así que sobrevive a cada refresco.
- **Datos locales (F6/D12)**: objetivos y marcas manuales, por Riot ID normalizado, solo en "mi perfil". En perfiles ajenos se ocultan y se muestra "Viendo el perfil de X". Sin "mi perfil", el header ofrece "Este soy yo". Los recientes se guardan al visitar un perfil registrado.
- **Sin panel de campeón (#3)**: el marcado manual se hace desde un menú del cromo, con confirmación. Solo existe la pestaña Campeones; `?tab` se interpreta y por defecto vale `campeones`.
- **Riot ID no encontrado**: se resuelve en el worker, así que el estado aparece en la página de perfil (mensaje, campo con lo escrito y reintento), no en la landing.

`.dev/tasks/index.json` es tracking operativo local derivado de este spec y del issue; no sustituye el source of truth superior.
