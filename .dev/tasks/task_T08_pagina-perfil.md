# Task T08 — Página mínima de perfil /euw/{nombre}-{tag}

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Página sin diseño en `/euw/{nombre}-{tag}` que permite registrar un perfil, muestra el progreso del backfill (`fetched/total`) con auto-refresco, el aviso de pausa por key caducada, el botón "Actualizar", las cifras de la temporada y la lista verificada de campeones ganados frente al contador oficial `602002`. Home con buscador de Riot ID.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (página mínima), Entregable 8, AC2 (progreso visible), AC4 (lista vs contador), AC6 (la página indica la pausa); "Decisiones técnicas" (URL separando por el último `-`; el `puuid` nunca sale de la BD).
- `.dev/research/sync-strategy.md` §3 (al abrir: refresco si `lastSyncedAt` > 2 min; polling ligero a la BD propia; botón con cooldown 60 s; primer registro dispara el backfill con progreso).
- `.dev/research/stack.md` §7.1 punto 3 (texto del aviso: "Actualización pausada: key caducada. Los datos son los de la última sincronización").
- Código previo: `src/worker/queue.ts` (`registerProfile`, `requestRefresh`, `ensureFreshOnView`, `wakeWorker`), `src/domain/queries.ts` (`getProfileStats`), `src/lib/admin/key-service.ts` (`getKeyStatus`), `src/lib/config.ts`, `src/db/schema.ts`.
- Next.js 16: leer `node_modules/next/dist/docs/` (params asíncronos, Server Actions, `router.refresh`) antes de escribir.

## Prompt / instrucciones para worker <!-- MUST -->

Sin llamadas a la Riot API real ni lectura de `.env.local`. Sin diseño: HTML semántico y utilidades Tailwind mínimas (la UI final es #2).

1. `src/lib/riot-id.ts`: `parseProfileSlug(slug)` → `{ gameName, tagLine } | null` (decodifica, separa por el **último** `-`, recorta; `tagLine` 2–5 alfanuméricos; `gameName` 3–16 caracteres), `profileSlug(gameName, tagLine)` y `normalizeRiotId(gameName, tagLine)` (mismo criterio que `riotIdNorm` de T02; reutiliza si ya existe). Tests unitarios (espacios, acentos, `-` en el nombre, entradas inválidas).
2. Home `src/app/page.tsx`: formulario "Riot ID (Nombre#TAG)" que navega a `/euw/{profileSlug}`; error si no tiene `#`.
3. `src/app/euw/[slug]/page.tsx` (`dynamic = 'force-dynamic'`):
   - Slug inválido → `notFound()`.
   - Perfil no registrado → Riot ID y botón "Registrar y sincronizar" (Server Action → `registerProfile` + `wakeWorker` + `revalidatePath`).
   - Perfil `not_found` → "Ese Riot ID no existe en EUW".
   - Perfil registrado → cabecera con Riot ID canónico, temporada (`SEASON_START`), `lastSyncedAt`; bloque de sync: fase del job activo (resolviendo / listando / descargando) y **`fetched/total`**; aviso de pausa si `keyStatus = 'invalid'` (texto de stack §7.1); botón "Actualizar" (Server Action → `requestRefresh({ interactive: true })` + `wakeWorker`; muestra `cooldown`/`active`).
   - Cifras (`getProfileStats`): partidas, 1º, % 1º, top 3 (n y %), puesto medio, distribución 1º–6º (tabla).
   - Campeones ganados verificados: **N verificados vs `602002` = V (nivel)** con el estado de `compareWithChallenge` ("cuadra" / "diferencia de D: la lista verificada solo ve el historial Match-V5 de esta temporada" / "contador no disponible"); lista `championName`, nº de 1º, fecha del último 1º y `matchId`.
   - Sin compañeros en la UI (van en #3). Nunca se renderiza ningún `puuid`.
4. Auto-refresco: componente cliente `AutoRefresh` que llama a `router.refresh()` cada 3 s si hay job activo y cada 30 s si no; y un efecto de montaje que invoca una Server Action `ensureFreshOnView` una vez por visita.
5. Tests: `riot-id.test.ts`; test de la función de carga de datos de la página (sepárala en `src/app/euw/[slug]/data.ts`) contra la BD de test: perfil inexistente, perfil con job `fetching` (devuelve `fetched/total`), perfil con stats y `challengeValue`, `keyStatus = 'invalid'` → `paused: true`; y que el objeto devuelto no contiene la clave `puuid` en ningún nivel.
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] Registro desde la página y progreso `fetched/total` con auto-refresco.
- [ ] Aviso de pausa con key caducada y botón "Actualizar" con cooldown.
- [ ] Cifras de temporada y lista verificada frente a `602002` con explicación de la diferencia.
- [ ] Ningún `puuid` en la página ni en sus datos; `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
