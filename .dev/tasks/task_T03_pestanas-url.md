# Task T03 — Pestañas del perfil, estado en la URL y carga bajo demanda

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

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

- [ ] Cuatro pestañas accesibles (`tablist`/`tab`/`tabpanel`, flechas) y enlazadas por `?tab`; `campeones` sin `?tab`.
- [ ] `tabHref` probado: limpia los parámetros propios de otras pestañas y conserva `campeon`.
- [ ] `loadProfilePage` recibe la vista; no carga datos de pestañas no activas (test).
- [ ] (Orquestador) Abrir `/euw/…?tab=partidas` por URL directa selecciona la pestaña; cambiar de pestaña no recarga la página ni hace scroll horizontal a 375 px.
- [ ] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
