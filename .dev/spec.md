# Spec: hylistats — iter-06 maquetación de /admin
**Estado**: aprobada (issue [#11](https://github.com/adrirobg/hylistats/issues/11), aprobada por el supervisor, 2026-10-01)
**Consume**: hilo abierto "Pulido y mejora de la UI base" de think.md; revisión de seguridad de `/admin` antes de publicar (conversación con el supervisor, 2026-10-01); componentes `src/components/hy/` y `src/components/ui/`; patrón de `/grupo` (`src/app/grupo/page.tsx`)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

## Objetivo <!-- MUST -->

Que `/admin` sea gestionable: hoy es HTML sin maquetar (títulos que no se distinguen, inputs sin borde, botones de texto plano, lista de miembros con "Quitar" pegado). Se maqueta con el sistema de diseño existente y, de paso, se cierra el único requisito de seguridad que falta antes de publicar: exigir un `ADMIN_TOKEN` largo.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Token mínimo** (endurecimiento previo a publicar). `ADMIN_TOKEN` con menos de 32 caracteres (tras `trim`) cuenta como no configurado: `/admin` y `/api/admin/*` quedan deshabilitados, igual que sin token. El mensaje de `/admin` deshabilitado lo explica (definir `ADMIN_TOKEN` de al menos 32 caracteres y cómo generarlo). `.env.example` documenta el mínimo y `openssl rand -base64 32`.
- **Maquetación de `/admin`**, solo presentación:
  - Cabecera: `TopBar` y contenedor como en `/grupo` (`max-w-[960px]`), `h1` "Admin" en display; "Cerrar sesión" como `Btn` pequeño a la derecha del título.
  - Fila de estado, 2 columnas en escritorio y 1 en móvil: `Box` "Key de Riot" (estado en `Chip` de color: `ok` verde, `invalid` rojo, `unknown` neutro; datos en `dl` etiqueta/valor; formulario "Nueva key" dentro del mismo `Box` con `Input` + `Btn` y su resultado como `Notice`) y `Box` "Worker" (estado en `Chip`; última actividad, job actual y último error en `dl`).
  - `Box` "Grupo" a todo el ancho: nº de miembros en el `hint`, tabla (`ui/table`) Riot ID · Última sync · "Quitar" (`Btn` pequeño, alineado a la derecha), formulario de añadir en línea al pie con su `Notice`.
  - Login y "admin deshabilitado": `Box` estrecho centrado; login con `Input` + `Btn`; "Token incorrecto" como `Notice`.
  - Variante `danger` en `Notice` (token `--danger`) para los resultados de error; los de éxito usan `okay`.

**No incluye** <!-- SHOULD -->:
- Cambios en server actions, rutas, códigos de resultado, textos de los mensajes o datos mostrados (salvo el mensaje de "deshabilitado").
- Rate limiting del login, sesión más corta o revocable, cabeceras anti-iframe (descartados: con token ≥32 aleatorio y cookie `sameSite: strict` no aportan protección hoy).
- Confirmación al quitar, refresco automático del estado del worker, pestañas o secciones plegables.
- Abuso de las server actions públicas (registro, refrescos) al publicar: se apunta como hilo en `think.md`.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Token mínimo de admin | `src/lib/admin/auth.ts` + tests + `.env.example` |
| 2 | `/admin` maquetada | `src/app/admin/page.tsx` (+ subcomponentes locales) y variante `danger` de `Notice` |

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1: con `ADMIN_TOKEN` de menos de 32 caracteres (tras `trim`), `isAdminConfigured()` es `false`, el login, la cookie y el `Bearer` se rechazan, y `/admin` muestra el mensaje de deshabilitado con el mínimo y cómo generarlo. Cubierto por tests de `auth.test.ts`.
- [ ] AC2: `.env.example` documenta el mínimo de 32 caracteres y `openssl rand -base64 32`.
- [ ] AC3: `/admin` (sesión iniciada) muestra cabecera, fila Key/Worker, `Box` Grupo con tabla y formularios maquetados con los componentes del sistema de diseño; estados de key y worker en `Chip`, resultados en `Notice` (`okay` / `danger`).
- [ ] AC4: los flujos siguen funcionando igual: login, token incorrecto, guardar key (resultado visible), añadir y quitar miembro (resultado visible), cerrar sesión.
- [ ] AC5: a 1280 px la fila Key/Worker va en 2 columnas; a 375 px todo va en 1 columna sin scroll horizontal de página.
- [ ] AC6: `npm run lint`, `npm run typecheck` y `npm test` en verde.

## Estrategia de implementacion <!-- SHOULD -->

1. **T01** token mínimo (`src/lib/admin/auth.ts`, tests de auth/actions/route que usen tokens cortos, `.env.example`, mensaje de deshabilitado en `page.tsx`).
2. **T02** maquetación (`src/app/admin/page.tsx`, subcomponentes locales en `src/app/admin/` si hace falta, variante `danger` en `src/components/hy/notice.tsx`).
3. **T03** verificación en navegador (1280 y 375 px) y checks.

T01 y T02 los implementa un worker Sonnet; T03 el orquestador.
