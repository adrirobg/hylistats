# Task T02 — Maquetación de /admin

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`/admin` maquetada con el sistema de diseño existente: cabecera, fila Key/Worker, Box Grupo con tabla, login y estado deshabilitado, sin cambiar comportamiento ni datos.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Maquetación de `/admin`"; **AC3**, **AC4**, **AC5**, **AC6**.
- Código:
  - `src/app/admin/page.tsx`: página actual (HTML sin estilos); `RESULT_MESSAGES` y `GROUP_MESSAGES` con los códigos `ok`/`added`/`already`/`removed` (éxito o neutro) y el resto (error).
  - `src/app/grupo/page.tsx`: patrón de página (`TopBar` de `src/app/euw/[slug]/top-bar.tsx`, `main` + contenedor `mx-auto w-full max-w-[960px]`, `h1` en `font-display text-[40px] … uppercase`).
  - `src/components/hy/box.tsx` (`title`, `hint`, `titleAs`), `btn.tsx` (`size="small"`; `type="submit"` explícito en formularios: por defecto es `button`), `chip.tsx`, `notice.tsx` (variantes `trust`/`okay`), `src/components/ui/input.tsx`, `src/components/ui/table.tsx`.
  - Tokens de color en `src/app/globals.css`: `text-ok`, `text-danger`, `border-line`, `text-faint`, `text-muted-foreground` (NO `text-muted`).
  - Estados: key `unknown | ok | invalid` (`src/db/schema.ts:34`); worker `starting | waiting_lock | running | idle | paused | stopped` (`src/worker/main.ts:33`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **`Notice` variante `danger`**: borde y fondo con `--danger` (p. ej. `border-danger/35` y un fondo `color-mix` tenue) e icono `!` en `text-danger`. No toques las variantes existentes.
2. **Sesión iniciada**:
   - `main` con `TopBar` y el contenedor de `/grupo` (con `px-4` o similar en móvil si `/grupo` lo necesita; comprueba cómo lo resuelve). Fila de título: `h1` "Admin" y a la derecha el formulario de `logoutAction` con `Btn size="small" type="submit"` "Cerrar sesión".
   - Grid `md:grid-cols-2 gap-4`: `Box` "Key de Riot" y `Box` "Worker" (`titleAs="h2"`).
     - Key: `Chip` con el estado (`ok` → texto/borde `ok`, `invalid` → `danger`, `unknown` → neutro); `dl` en grid de dos columnas (etiqueta tenue / valor) con Desde, Motivo (si hay), Fuente, Guardada, Caduca aprox. (si hay, con "(última key + 24 h)"). Debajo, separado, el formulario "Nueva key": `label` visible, `Input type="password"` y `Btn type="submit"` "Validar y guardar" en fila (en columna si no cabe), y el resultado como `Notice` (`okay` si `result === "ok"`, `danger` en el resto). Mantén `role`/semántica de resultado accesible (el `output` actual: usa `role="status"` en el `Notice`).
     - Worker: `Chip` con el estado (`running`/`idle` → `ok`, `paused`/`stopped` → `danger`, resto neutro) y `dl` con Última actividad, Job actual, Último error (si hay; que pueda partir líneas largas).
   - `Box` "Grupo" a todo el ancho (`titleAs="h2"`, `hint` "N miembros"): resultado como `Notice` (`okay` para `added`/`removed`, `trust` para `already`/`not_member`, `danger` para el resto); tabla con columnas Riot ID (`gameName#tagLine`), Última sync y una columna de acción alineada a la derecha con el formulario de `removeGroupMemberAction` (`Btn size="small" type="submit"` "Quitar", con `aria-label` que incluya el Riot ID); "Sin miembros." si está vacío; al pie, formulario de añadir con `label`, `Input` (placeholder "Nombre#TAG") y `Btn type="submit"` "Añadir al grupo".
   - Los `name` de los inputs, `autoComplete="off"`, `required` y los campos ocultos no cambian.
3. **Login**: `TopBar` + `Box` estrecho centrado (`max-w-sm`) con título "Admin", `Notice` `danger` "Token incorrecto." si `error === "token"` (con `role="alert"`), `label` + `Input type="password" name="token"` + `Btn type="submit"` "Entrar" a todo el ancho.
4. **Deshabilitado**: mismo `Box` estrecho con el mensaje de T01 (no cambies el texto).
5. A 375 px no puede haber scroll horizontal de página: la tabla puede hacer scroll dentro de su contenedor si hiciera falta (`ui/table` ya lo envuelve; compruébalo).
6. Si `page.tsx` pasa de ~200 líneas, extrae secciones a componentes locales en `src/app/admin/` (server components, sin `"use client"`).

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees `ADMIN_TOKEN` ni la Riot key (ni los de `.env.local`).
- Sin dependencias nuevas.
- No cambies server actions (`src/app/admin/actions.ts`), rutas, códigos de resultado ni textos de los mensajes (salvo el de "deshabilitado").
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Variante `danger` en `Notice`.
- [ ] `/admin` con sesión, login y deshabilitado maquetados según el prompt (AC3).
- [ ] Mismos formularios, `name`s y acciones; flujos intactos (AC4).
- [ ] 2 columnas en `md+`, 1 columna sin scroll horizontal a 375 px (AC5).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

