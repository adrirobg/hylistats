# Task T01 — Grupo en BD y apartado Grupo en /admin

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Existe una lista de miembros del grupo en la BD (tabla nueva con migración de Drizzle), con consultas para leerla, y un apartado "Grupo" en `/admin` para añadir y quitar miembros.

## Contexto <!-- SHOULD -->

- spec.md: Alcance → "Grupo"; Entregable 1; **AC1**.
- think.md: F19 (un único grupo fijo, lista explícita en el servidor, editable desde `/admin`; elruffles fuera).
- Código:
  - `src/db/schema.ts:56` (`profiles`: `id`, `riotIdNorm` único, `status`) y el resto de tablas como estilo; migraciones con `drizzle-kit` (mira `package.json` y `drizzle/`).
  - `src/app/admin/page.tsx` y `src/app/admin/actions.ts` (`loginAction`, `saveKeyAction`, `logoutAction`): patrón de login y server actions de `/admin`.
  - `src/lib/riot-id.ts` (`normalizeRiotId`), la misma normalización con la que se guarda `profiles.riotIdNorm`.

## Prompt / instrucciones para worker <!-- MUST -->

1. Tabla nueva de miembros del grupo, que referencie `profiles.id` (un perfil como mucho una vez), con migración generada por drizzle-kit.
2. Funciones de consulta: listar los miembros (con `profileId`, Riot ID, `puuid` y `lastSyncedAt`), saber si un perfil es miembro, añadir por Riot ID y quitar por perfil. Colócalas en un módulo nuevo de `src/domain/` (no en `src/app/euw/[slug]/data.ts`).
3. Añadir por Riot ID solo acepta un perfil **ya registrado** (existe en `profiles`); si no existe, error claro ("Ese Riot ID no está registrado: búscalo primero en la app"). Añadir un miembro que ya está no hace nada.
4. Apartado "Grupo" en `/admin`, visible solo tras el login actual: lista de miembros con botón de quitar y un formulario para añadir por Riot ID. Mismo estilo que el resto de `/admin`.
5. Tests de las consultas con la BD de test (patrón de `src/domain/queries.test.ts`): añadir, duplicado, no registrado y quitar.
6. **No** des de alta a nadie en la BD local: lo hace el orquestador desde `/admin`.

Reglas comunes (todas las tasks):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de rutas, server actions o componentes, lee la guía correspondiente en `node_modules/next/dist/docs/`.
- No imprimas, loguees ni commitees la Riot key. Los tests no llaman a la API real.
- Sin dependencias nuevas.
- Sigue las convenciones del repo: funciones puras en `src/domain/` con tests; fechas con `@/lib/format`; números con `formatDecimal`/`formatPercent`/`formatCount`; componentes `hy/*`.
- Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] Tabla y migración creadas; `npm run db:migrate` (o el script equivalente del repo) la aplica sobre la BD local.
- [ ] Consultas de miembros con tests: añadir, duplicado idempotente, Riot ID no registrado con error claro y quitar (AC1).
- [ ] `/admin` muestra el apartado Grupo solo con sesión; añade y quita miembros (AC1).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

Pendiente.
