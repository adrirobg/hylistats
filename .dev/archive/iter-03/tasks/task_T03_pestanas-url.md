# Task T03 — Pestañas del perfil, estado en la URL y carga bajo demanda

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

El perfil tiene cuatro pestañas navegables por URL: Campeones, Resumen, Compañeros y Partidas (`?tab`). La carga de datos es por pestaña: `loadProfilePage` recibe la pestaña y solo trae lo que esa pestaña pinta.

Esta task deja el andamiaje: barra de pestañas accesible, parser, carga condicional y paneles con esqueleto o vacío. El contenido lo ponen T04 (Compañeros), T05 (Partidas), T06 (panel) y T07 (Resumen).

## Contexto <!-- SHOULD -->

- spec.md:
  - Entregable 3 y AC2 ("Las pestañas, el panel y la partida expandida se pueden abrir por URL directa");
  - "Decisiones técnicas" → "Carga bajo demanda" y "URL": al cambiar de pestaña se quitan los parámetros propios de la anterior; `?campeon` abre el panel sobre cualquier pestaña.
- Brief:
  - §2 (mapa de URLs; nombres "Campeones · Resumen · Compañeros · Partidas");
  - §3.2 (pestañas bajo la barra, raíl a la derecha);
  - §7 (< 640 px: "pestañas como barra inferior"; en esta iteración basta con una barra superior desplazable sin scroll horizontal de página, igual que ahora).
- Código:
  - `src/app/euw/[slug]/page.tsx`: `Tabs` (l. 147, solo "Campeones", `role="tablist"`), `ProfileCabin` y `ChampionsPanel` (`role="tabpanel"`, `id="panel-campeones"`, `aria-labelledby="tab-campeones"`). `searchParams` ya se `await`-ea.
  - `src/app/euw/[slug]/view-model.ts`: `PROFILE_TABS = ["campeones"]` y `parseProfileTab`, con tests en `view-model.test.ts`.
  - `src/app/euw/[slug]/data.ts`: `loadProfilePage(db, gameName, tagLine, seasonStart, catalog)` → `ProfileView`, con tests en `data.test.ts`.
  - `src/app/euw/[slug]/album-view.ts`: el álbum lee `?vista`, `?filtro`, `?q` y `?orden` con `useSearchParams` (`withQuery`, `albumSearch`).
  - `src/app/euw/[slug]/loading.tsx`: esqueleto de la cabina.
- Aviso de payload: el RSC del perfil ya pesa unos 83 kB por `router.refresh()`. No añadas a `ProfileView` datos de pestañas no activas.

## Prompt / instrucciones para worker <!-- MUST -->

1. **`view-model.ts`**:
   - `PROFILE_TABS = ["campeones", "resumen", "companeros", "partidas"]` con etiquetas visibles "Campeones", "Resumen", "Compañeros" y "Partidas" (`TAB_LABEL`).
   - `parseProfileTab` sigue cayendo en `campeones` con lo desconocido.
   - `tabHref(pathname, search, tab)`: función pura que pone `?tab` (o lo quita para `campeones`), borra los parámetros propios de las otras pestañas y conserva el resto. Parámetros propios:
     - álbum: `vista`, `filtro`, `q`, `orden`;
     - compañeros: `min`, `orden`;
     - partidas: `q`, `puesto`, `companero`, `n`, `partida`.
     - `campeon` (panel) se conserva.
   - Tests.
2. **`Tabs`**:
   - Cuatro enlaces (`next/link`, sin recarga completa) con `role="tab"`, `aria-selected` y `aria-controls="panel-{tab}"`, y `href` de `tabHref`.
   - Mismo estilo que la pestaña actual (subrayado inset `--place-1` en la activa). Navegación con flechas izquierda y derecha entre pestañas (patrón WAI-ARIA tabs con activación manual).
   - `scroll={false}`: al cambiar de pestaña no se salta arriba.
3. **Carga por pestaña**:
   - `loadProfilePage` gana un parámetro `view: { tab: ProfileTab }` (objeto, para que T04–T07 añadan filtros sin cambiar la firma).
   - `ProfileView` gana `tab` y un campo opcional por pestaña (`teammates?`, `matches?`, `summaryTab?`…), que en esta task quedan `undefined`. Documenta en el tipo que solo se rellenan para la pestaña activa.
   - El álbum y la forma se siguen cargando siempre: el header, el raíl y la barra dependen de ellos.
   - Tests en `data.test.ts`: la pestaña se refleja y no se cargan datos de otras pestañas.
4. **Paneles**:
   - `page.tsx` pinta el panel de la pestaña activa con `role="tabpanel"`, `id="panel-{tab}"` y `aria-labelledby="tab-{tab}"`.
   - Para Resumen, Compañeros y Partidas, de momento, un esqueleto `aria-busy` con la forma aproximada. Nada de un texto "Próximamente": T04–T07 lo sustituyen.
   - Campeones queda igual.
   - `loading.tsx` sigue sirviendo.
5. Comprueba con `npm run build` que `?tab=resumen` renderiza (sin datos reales no hace falta navegador: el orquestador lo verifica).
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] Cuatro pestañas accesibles (`tablist`/`tab`/`tabpanel`, flechas) y enlazadas por `?tab`; `campeones` sin `?tab`.
- [x] `tabHref` probado: limpia los parámetros propios de otras pestañas y conserva `campeon`.
- [x] `loadProfilePage` recibe la vista; no carga datos de pestañas no activas (test).
- [x] (Orquestador) Abrir `/euw/…?tab=partidas` por URL directa selecciona la pestaña; cambiar de pestaña no recarga la página ni hace scroll horizontal a 375 px.
- [x] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- `view-model.ts`:
  - `PROFILE_TABS` tiene las 4 pestañas; nuevos `TAB_LABEL`, `DEFAULT_TAB`, `tabId`/`panelId`, `tabForKey` (flechas, Home y End) y `tabHref`.
  - `tabHref` borra los parámetros propios de todas las pestañas salvo los de la de destino si ya se estaba en ella, así que pulsar la activa no toca sus filtros. `campeon` se conserva. No añade parámetros: quien enlaza a `?partida` los añade después.
- `tabs.tsx` (cliente):
  - `next/link` con `scroll={false}` y roving tabindex; Espacio activa.
  - Centra la pestaña activa dentro de la barra, porque a 375 px las cuatro no caben.
- `tab-panel.tsx`: `TabPanel` (ids cruzados en un solo sitio) y `PendingPanel` (esqueletos de Resumen, Compañeros y Partidas hasta T04–T07).
- `loadProfilePage(db, gameName, tagLine, view: ProfileViewParams, seasonStart?, catalog?)`. `ProfileView` lleva siempre `tab`; `teammates?`, `matches?` y `summaryTab?` solo existen con su pestaña activa (`never` hasta que T05 y T07 los tipen).
- **Hallazgo fuera de alcance** (pasado a T08): "Marcar a mano" de la barra Arena God (`markByHand` en `arena-god.tsx`) pone `?filtro=sin-ganar` en cualquier pestaña. Debería volver antes a Campeones.
- Revisión del orquestador: `import { cn } from "cn"` → `@/lib/utils`, como el resto de `src/app`.

## Evidencias <!-- MUST -->

- Checks (orquestador):
  - `npm run lint`: OK, 125 ficheros;
  - `npm run typecheck`: OK;
  - `npm test`: 37 ficheros y 655 tests en verde (+18);
  - `npm run build`: OK.
- Navegador integrado (orquestador, `hylistats-testdb`, semilla `synced 30000`, 375 px):
  - `/euw/Jugador%20Uno-EUW?tab=partidas&campeon=ahri` por URL directa:
    - `tab-partidas` con `aria-selected=true` y `tabIndex` 0, las demás con -1;
    - `panel-partidas` con `aria-labelledby=tab-partidas` y esqueleto `aria-busy`;
    - `href` de Campeones = `?campeon=ahri` (sin `tab`, conserva `campeon`);
    - `scrollWidth` 375.
  - Clic en "Campeones": la URL pasa a `?campeon=ahri`, panel `panel-campeones` con 173 cromos, sin recargar (la marca en `window` sobrevive) y `scrollWidth` 375.
- Commit: ver `git log` (`feat(ui): pestañas del perfil con estado en la URL y carga por pestaña`).
