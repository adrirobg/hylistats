# Task T05 — Landing: buscador, recientes/favoritos y redirección a "mi perfil"

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`/` es la landing del brief §3.1 con el sistema visual de T02:

- "¿Quién eres?" con un campo único que acepta `Nombre#TAG`, `Nombre-TAG` o una URL de op.gg.
- La línea de definición.
- Recientes y Favoritos, con ★ y ✕.

Con "mi perfil" guardado en el navegador, `/` redirige a su perfil. `?inicio` fuerza la landing.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (Landing), Entregable 5 y AC2.
- Brief §3.1: wireframe y prioridad. Región EUW como etiqueta estática, sin selector (F10). Línea "Victoria = 1º puesto · temporada actual de Arena". Recientes/Favoritos con estrella y ✕. El autocompletado está **fuera**, según la spec.
- Brief §5: "Riot ID no encontrado" es un error inline bajo el campo que mantiene lo escrito. Aquí solo aplica al formato; el "no existe en Riot" se resuelve en la página de perfil (T06).
- Maqueta `.dev/research/design-mock.html`:
  - CSS: `.landing`, `.lsearch` y `.recent` (l. 255–262).
  - HTML: tablero "Landing · sin «mi perfil» guardado" (l. 403–414).
- APIs de T04:
  - `src/lib/riot-id.ts`: `parseRiotIdInput(input)`, `riotIdInputError(reason)`, `profileSlug(gameName, tagLine)` y `normalizeRiotId`.
  - `src/lib/use-local-store.ts`: `useLocalStore(selector)` y sus acciones `toggleFavorite`, `removeRecent`…
  - `src/lib/local-store.ts`: tipos del estado (`myProfile`, `favorites`, `recents`).
- Componentes de T02 en `src/components/hy/` (`Btn`, `Chip`, `Box`…) y tokens Tailwind (`bg-surface-1`, `text-muted-foreground`, `text-faint`, `font-display`…). Ojo: `text-muted` **no** es texto atenuado (en shadcn `muted` es una superficie).
- Estado actual: `src/app/page.tsx` y `src/app/riot-id-form.tsx`, un formulario mínimo de iter-01 que se sustituye.
- Next 16: lee `node_modules/next/dist/docs/` sobre `searchParams` (asíncronos en páginas), `useRouter`/`router.replace` y `useSearchParams`, que exige `Suspense`, antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Formato de fechas** (`src/lib/format.ts`, puro):
   - `formatRelative(ms, now)` en español: "ahora", "hace 5 min", "hace 2 h", "ayer", "hace 3 d", y la fecha corta a partir de 30 días.
   - `formatDateTime`, que sustituye al `formatDate` duplicado de `/admin` y del perfil. Actualiza esos dos usos (learn de iter-01).
   - Formateadores `es-ES` de porcentaje y decimal reutilizables.
   - Tests.
2. **Redirección**:
   - `landingTarget(myProfile, hasInicio)`: función pura que devuelve el slug o `null`. Tests.
   - Componente cliente `RedirectToMyProfile`: sin `?inicio` y con `myProfile`, hace `router.replace('/euw/' + profileSlug(...))`.
   - Mientras decide, la landing no parpadea: muéstrala con el contenido del buscador visible y deja la redirección en efecto. No hace falta ocultarla.
3. **Landing** (`src/app/page.tsx` + componentes cliente en `src/app/(landing)/` o `src/components/landing/`):
   - Título display "¿Quién eres?" con el `h1` de la app: rótulo "hylistats" y chip "EUW".
   - **Campo**:
     - `input` grande con `aria-label="Riot ID"`, placeholder `Nombre#TAG`, `autoComplete="off"` y botón "Ir".
     - Al enviar: `parseRiotIdInput`. Si es ok, navega a `/euw/{slug}`. Si no, muestra el error inline bajo el campo (`role="alert"`) y mantiene lo escrito.
     - Pegar una URL de op.gg funciona.
   - **Línea de definición** bajo el campo.
   - **Recientes | Favoritos**:
     - Conmutador segmentado accesible (`aria-pressed` o tabs ARIA).
     - Filas con ★ (conmuta favorito, con `aria-label`), el Riot ID (`Nombre` + `#TAG` atenuado) enlazado a su perfil, "hace X" con `formatRelative` y ✕ para quitar el reciente.
     - Vacíos con texto útil: "Aún no has visitado ningún perfil", "Marca perfiles con ★".
   - Si hay "mi perfil" y se entra con `?inicio`: enlace "Ir a mi perfil (Nombre#TAG)".
   - Responsive: sin scroll horizontal a 375 px; el campo ocupa todo el ancho en móvil.
   - Retira `src/app/riot-id-form.tsx` si queda sin uso.
4. Los datos locales solo existen en cliente: la página de servidor pinta el esqueleto y el buscador, y los recientes/favoritos se hidratan con `useLocalStore`; el snapshot de servidor está vacío, así que no hay errores de hidratación.
5. `npm run lint && npm run typecheck && npm test && npm run build` en verde.
6. Verificación en navegador: no tienes el navegador integrado; la hace el orquestador. Deja en el informe los pasos exactos para probar la redirección (qué clave de `localStorage` y qué valor).

## Criterios de aceptacion <!-- MUST -->

- [ ] El campo acepta las tres formas y muestra el error inline sin perder lo escrito.
- [ ] Recientes/Favoritos con ★ y ✕ desde la capa de navegador; vacíos útiles.
- [ ] `/` redirige a "mi perfil" si existe; `?inicio` fuerza la landing (función pura probada; comprobación en navegador del orquestador).
- [ ] `format.ts` probado y `formatDate` duplicado eliminado.
- [ ] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
