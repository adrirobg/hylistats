# Task T01 — Token mínimo de admin

**Owner**: worker:sonnet
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Un `ADMIN_TOKEN` de menos de 32 caracteres (tras `trim`) cuenta como no configurado: `/admin` y `/api/admin/*` quedan deshabilitados igual que sin token, y el mensaje de `/admin` lo explica.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Token mínimo"; **AC1**, **AC2**, **AC6**.
- Código:
  - `src/lib/admin/auth.ts:17` (`getAdminToken`): punto único del que dependen `isAdminConfigured`, `checkAdminToken`, `adminSessionValue`, `isAdminSession` e `isAdminBearer`.
  - `src/lib/admin/auth.test.ts` (token de test de 20 caracteres), `src/app/admin/actions.test.ts` y `src/app/api/admin/key/route.test.ts`: los tokens de test cortos dejarán de valer.
  - `src/app/admin/page.tsx:46`: rama "Admin deshabilitado: define ADMIN_TOKEN".
  - `.env.example:7`: comentario de `ADMIN_TOKEN`.

## Prompt / instrucciones para worker <!-- MUST -->

1. En `auth.ts`, exporta `ADMIN_TOKEN_MIN_LENGTH = 32` y haz que `getAdminToken` devuelva `null` si el token (tras `trim`) es más corto. Actualiza el comentario de cabecera del módulo y el de `isAdminConfigured`.
2. Tests en `auth.test.ts`: token de 31 caracteres → `isAdminConfigured` `false` y `checkAdminToken`/`isAdminSession`/`isAdminBearer` rechazan aunque coincidan; 32 → funciona; espacios en los extremos no cuentan para la longitud. Sube los tokens de test existentes (en los tres ficheros de test) a ≥32 caracteres.
3. En `page.tsx`, cambia solo el texto del caso deshabilitado: "Admin deshabilitado: define ADMIN_TOKEN con al menos 32 caracteres (por ejemplo, `openssl rand -base64 32`)." usando la constante para el número. No maquetes nada más (es T02).
4. `.env.example`: el comentario de `ADMIN_TOKEN` indica el mínimo de 32 caracteres y cómo generarlo con `openssl rand -base64 32`.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees `ADMIN_TOKEN` ni la Riot key (ni los de `.env.local`).
- Sin dependencias nuevas.
- No cambies server actions (`src/app/admin/actions.ts`), rutas, códigos de resultado ni textos de los mensajes (salvo el de "deshabilitado").
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [x] Token <32 (tras `trim`) deshabilita login, cookie y `Bearer`; con tests (AC1).
- [x] Mensaje de deshabilitado con el mínimo y cómo generarlo (AC1).
- [x] `.env.example` documentado (AC2).
- [x] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

- `getAdminToken` devuelve `null` con token <32 tras `trim`; `ADMIN_TOKEN_MIN_LENGTH` exportada. Tests nuevos en `auth.test.ts` (31 → deshabilitado y rechazos; 32 → funciona; espacios en extremos no cuentan); tokens de test subidos a ≥32 en los tres ficheros.
- `npm run lint && npm run typecheck && npm test && npm run build`: exit 0, 1268/1268 tests.
