# Task T02 — Sistema visual base: tokens, fuentes, tema oscuro y layout raíz

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La app usa el sistema visual del brief §6: tokens de color, Big Shoulders Display (cifras y rótulos), Atkinson Hyperlegible Next (texto) y Atkinson Hyperlegible Mono (datos pequeños), tema oscuro único, grano de fondo e iconos de línea (`lucide-react`). Las tasks de UI siguientes solo consumen tokens y utilidades.

## Contexto <!-- SHOULD -->

- spec.md: Alcance ("Sistema visual del brief §6"), Entregable 2.
- `.dev/research/design-brief.md`:
  - §6.1: paleta y **reglas de uso** (oro = solo 1º, naranja = solo objetivo, azul acero = fiabilidad, rojo = solo errores).
  - §6.2: tipografía y escala 13/16/20/28/44/64; `tabular-nums` en cifras.
  - §6.3: iconos de línea de 20 px, trazo 1,75, y grano SVG al 3–4 %.
  - §1 P1 (cuerpo ≥ 16 px) y P9 (tema oscuro único, tokens preparados para uno claro).
- `.dev/research/design-mock.html`, líneas 9–47: `:root` con los tokens definitivos. Ojo: `--text-faint: #6E6A62` en la maqueta frente a `#625E57` en el brief; **usa el de la maqueta**, que es el que se ha revisado por contraste. Contiene además `--r: 6px`, el grano en `body` y `:focus-visible`.
- Estado actual:
  - `src/app/globals.css`: tema shadcn claro/oscuro con `@theme inline`; `@custom-variant dark`.
  - `src/app/layout.tsx`: Geist por `next/font/google`; footer con el descargo de Riot, que es obligatorio y debe mantenerse.
  - Componentes shadcn en `src/components/ui/` (base-ui). Biome los ignora; no hace falta tocarlos.
- `next/font/google` (Next 16.3.7) incluye `Atkinson Hyperlegible Next`, `Atkinson Hyperlegible Mono` y `Big Shoulders`. "Big Shoulders Display" es ahora la familia `Big Shoulders` con eje óptico: comprueba en `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` los ejes y pesos de cada familia y elige la configuración equivalente a Display 600–800.
- Next 16: lee `node_modules/next/dist/docs/` (fuentes y CSS) antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Fuentes** en `src/app/layout.tsx` con `next/font/google` y variables CSS:
   - `--font-display`: Big Shoulders con el eje o variante de Display, pesos 600/700/800.
   - `--font-body`: Atkinson Hyperlegible Next, 400/500/700.
   - `--font-mono`: Atkinson Hyperlegible Mono, 400/500.
   - Subconjunto `latin` (con `latin-ext` si existe, por las tildes). Retira Geist.
2. **Tokens** en `globals.css`:
   - Todos los de la maqueta (`--bg`, `--surface-1`, `--surface-2`, `--line`, `--text`, `--text-muted`, `--text-faint`, `--place-1`, `--won-deep`, `--place-top`, `--place-low`, `--played`, `--trust`, `--trust-bg`, `--target`, `--danger`, `--ok`, `--r`), en `:root` con `color-scheme: dark`.
   - Expónlos a Tailwind 4 en `@theme inline` como colores (`bg-surface-1`, `text-muted`, `border-line`, `text-place-1`, `text-target`…) y fuentes (`font-display`, `font-body`, `font-mono`).
   - Mapea los tokens de shadcn (`--background`, `--foreground`, `--card`, `--border`, `--primary`, `--ring`…) a la paleta nueva para que los componentes de `src/components/ui` se vean coherentes. Elimina el tema claro y el `.dark` duplicado: un único tema oscuro. Sin variables huérfanas.
   - Deja un comentario de que un tema claro solo tendría que redefinir `:root` (P9, D11).
3. **Base**:
   - `body` con fondo `--bg`, texto `--text`, `font-body`, 16 px, `line-height` 1,45 y el grano SVG de la maqueta (l. 43).
   - `:focus-visible` con contorno `--trust`.
   - Utilidad `.num` / `tabular-nums`.
   - `[hidden]{display:none!important}`.
   - `@media (prefers-reduced-motion: reduce)` global que anula transiciones y animaciones.
4. **Layout raíz**:
   - `<html lang="es">` con las variables de fuente.
   - Contenedor de página `max-width: 1480px` centrado con gutter de 16 px.
   - Footer con el descargo de Riot con los tokens nuevos (`text-faint`, `border-line`), sin cambiar el texto.
   - Metadata: mantén `robots` noindex; título "hylistats".
5. **Utilidades de componentes reutilizables**, como componentes React en `src/components/hy/` (no en `ui/`):
   - `Box`: tarjeta `surface-1` con borde `line`, radio 8 px, padding 14 px y título opcional en display uppercase con tracking (`.box h4` de la maqueta).
   - `Btn`: `.btn` de la maqueta con variantes `default | trust | small`.
   - `Chip`: `.chip`, con variante `me`.
   - `Notice`: `.notice`, con variantes `trust | okay`.
   - Copia el estilo de la maqueta con clases Tailwind o CSS de módulo. Sin lógica de negocio.
6. Comprueba que las páginas existentes (`/`, `/euw/[slug]`, `/admin`) siguen renderizando: `npm run build` y, si puedes, `npm run dev` con una petición `curl` a `/` que devuelva 200. **No hace falta** rediseñarlas: lo hacen T05 y T06.
7. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [x] Tokens del brief §6.1 (valores de la maqueta) disponibles como CSS vars y como utilidades Tailwind; un único tema oscuro.
- [x] Tres familias cargadas con `next/font` y expuestas como `font-display`, `font-body` y `font-mono`; Geist retirado.
- [x] Grano de fondo, `:focus-visible`, `tabular-nums` y `prefers-reduced-motion` globales.
- [x] Footer con el descargo intacto; noindex intacto.
- [x] `Box`, `Btn`, `Chip` y `Notice` en `src/components/hy/`.
- [x] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

- Big Shoulders variable con `axes: ["opsz"]`; `opsz 72` (Display) fijado en `@theme` (`--font-display--font-variation-settings`). Solo lo recibe la utilidad `font-display`.
- **`text-muted` no es texto atenuado** (en shadcn `muted` es superficie): usar `text-muted-foreground`. `text-faint` = `--text-faint`.
- `tabular-nums` no funciona en Big Shoulders (sin `tnum`): cifras en columnas en body o mono.
- `<html class="dark">` mantiene las variantes `dark:` de `src/components/ui/`.
- Orquestador: `@source not "../../.dev"` para que la maqueta y las specs no generen utilidades.

## Evidencias <!-- MUST -->

- Subagente: `curl /` 200 con `npm run dev`; computed styles (fondo `#0f1013`, texto `#ece6d9`, body 16/1,45, grano, contenedor 1480 px) y captura de `Box`/`Btn`/`Chip`/`Notice` en una página temporal ya borrada.
- Checks (orquestador, 2026-09-29): `npm run lint` OK (79 ficheros) · `npm run typecheck` OK · `npm test` 24 ficheros, 313 tests en verde · `npm run build` OK.
- Commit: ver `git log` (`feat(ui): sistema visual base …`).
