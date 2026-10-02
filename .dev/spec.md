# Spec: hylistats — iter-08 migración a la Personal key
**Estado**: aprobada (issue [#16](https://github.com/adrirobg/hylistats/issues/16); el supervisor aprobó la opción (b) y las decisiones 1–4 en la conversación, 2026-10-02)
**Consume**: think.md → ORGANIZED "iter-08: migración a la Personal key" (plan 2a, decisiones a–c), F9; `.dev/research/stack.md` §7.1 y D12; I1 §11 (PUUID cifrados por proyecto)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

## Objetivo <!-- MUST -->

Pasar producción de la dev key a la **Personal key** de Riot, que no caduca y se acaba la rotación diaria, sin perder perfiles ni grupo. Los PUUID cambian con la key, así que se vuelve a descargar todo con un comando reutilizable y probado: `npm run db:reset -- --keep-profiles`.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **`db:reset --keep-profiles`** (opción (b) de la decisión (a)). En una sola transacción:
  - vacía `participants`, `matches`, `match_fetch` y `sync_jobs`, sin `CASCADE` y sin reiniciar la secuencia de `sync_jobs`, porque el worker de producción sigue vivo;
  - en `profiles`: `puuid = null`, `status = 'resolving'` y `last_synced_at = null`;
  - encola un `backfill` no interactivo por perfil;
  - conserva `group_members`, `settings`, los ids de los perfiles (las URL), `riot_id_norm`, el icono y el 602002 (decisión 3).
- **Corrección automática del Riot ID** (decisión 1): si la partida más reciente de un perfil lleva otro Riot ID, se actualizan `game_name` y `tag_line` antes de vaciar. Sin esto, el worker buscaría el nombre antiguo, Riot respondería 404 y el perfil quedaría `not_found`.
- **Resumen previo** sin `--yes`: BD destino (sin credenciales), perfiles, miembros, partidas por perfil, 602002, estado y Riot ID que se corregirán. Sirve de foto previa y de verificación.
- **`--url <postgres-url>`**, como `scripts/migrate.ts`.
- **Lógica en `src/db/reset.ts`** y script fino; tests contra la BD de tests y un escenario del worker de punta a punta.
- **Runbook** en `docs/deploy.md`: aviso al grupo, backup, foto previa, Personal key en `/admin`, reset, seguimiento, verificación y paso de la key a `RIOT_API_KEY`. La key de la BD se vacía con una línea de SQL que ejecuta el supervisor (decisión 2).
- **`AGENTS.md`** y **`docs/cloud.md`** dejan de describir la rotación diaria.

**No incluye** <!-- SHOULD -->:
- Página o modo de mantenimiento: hilo nuevo en `think.md` para una iteración propia. Para esta, se avisa al grupo (decisión 4).
- Botón en `/admin` para borrar la key de la BD o usar la del entorno.
- Que el worker actualice el Riot ID de los perfiles en cada sincronización.
- Ejecutar la migración en producción: la hace el supervisor desde su Mac siguiendo el runbook.
- Protección de las server actions públicas: sigue abierto como hilo.

## Entregables <!-- MUST -->

| # | Entregable | Descripción |
|---|------------|-------------|
| 1 | `db:reset --keep-profiles` | `src/db/reset.ts` (resumen y reseteo) + `scripts/db-reset.ts` (CLI con `--keep-profiles`, `--url` y `--yes`) |
| 2 | Tests | `tests/db/reset.test.ts` (resumen, reseteo con y sin perfiles, CLI) y escenario de migración en `src/worker/worker.test.ts` |
| 3 | Runbook y docs | `docs/deploy.md` ("Key de Riot" y "Migrar a una key de otro proyecto de Riot"), `AGENTS.md` y `docs/cloud.md` |
| 4 | Migración en producción | Ejecutada por el supervisor tras el merge; evidencia en `verify-report.md` |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Conserva lo que debe.** Tras `--keep-profiles --yes`:
  - quedan vacías `participants`, `matches`, `match_fetch` y los jobs anteriores;
  - los perfiles conservan id, `riot_id_norm`, icono y 602002, con `puuid = null`, `resolving` y `last_synced_at = null`;
  - `group_members` y `settings` no cambian;
  - hay un `backfill` `pending` no interactivo por perfil, con ids mayores que los anteriores.

  Lo cubre un test contra la BD de tests.
- [ ] **AC2 — Riot ID.** Un perfil cuya última partida lleva otro Riot ID queda con ese `game_name`/`tag_line` y el mismo `riot_id_norm`. En el escenario del worker, ese perfil se resuelve y queda `active`, no `not_found`.
- [ ] **AC3 — De punta a punta.** Con el `RiotApi` falso: backfill → reset → el worker vuelve a resolver (2.ª llamada a Account-V1) y deja los mismos recuentos de `matches`, `participants` y `match_fetch`, con el job `done`.
- [ ] **AC4 — CLI seguro.**
  - Sin `--yes`, imprime el resumen, sale con código 1 y no toca nada.
  - `--url` manda sobre `DATABASE_URL`.
  - La salida no contiene la contraseña ni PUUID.
  - Sin `--keep-profiles`, el reseteo completo sigue como antes.
- [ ] **AC5 — Repo.** `npm run lint && npm run typecheck && npm test && npm run build` en verde, y CI en verde.
- [ ] **AC6 — Docs.** Con `docs/deploy.md`, una sesión limpia puede ejecutar la migración sin este transcript, en el orden obligatorio: key nueva antes que reset. `AGENTS.md` describe la key real.
- [ ] **AC7 — Producción (gate del supervisor, tras el merge).** Siguiendo el runbook:
  - todos los perfiles quedan `active`;
  - las partidas por perfil son ≥ que en la foto previa;
  - "campeones ganados" coincide con el 602002;
  - `/grupo` es igual a la captura salvo partidas nuevas;
  - `/api/health` no registra ningún 429;
  - `/admin` muestra la key del entorno sin aviso de caducidad.

  La PR se puede mergear con este gate abierto: el código no cambia nada en producción hasta que se ejecute.

## Riesgos y restricciones <!-- MAY -->

- **Orden key → reset**: si el reset va antes de pegar la Personal key, el worker resuelve con la dev key y hay que repetirlo. El runbook lo marca como obligatorio.
- **Worker vivo durante el reset**: un paso a medias puede escribir justo después del commit. Analizado:
  - con la Personal key, lo que use un PUUID viejo falla con 400 sin escribir;
  - una partida descargada trae PUUID nuevos, que son coherentes;
  - una escritura sobre un job viejo no puede caer en uno nuevo porque la secuencia no se reinicia.
- **Nombres cambiados sin partidas**: si un perfil se renombró y su última partida guardada es anterior al cambio, queda `not_found`. El runbook explica cómo arreglarlo: SQL + "Actualizar".
- **Coste**: unas 1300 peticiones, 25–30 min, con el grupo sin usar la web.

## Estrategia de implementacion <!-- SHOULD -->

1. Issue #16 y rama `cloud/fix/16-personal-key`.
2. T01: `src/db/reset.ts` + script + tests (AC1–AC5).
3. T02: runbook y docs (AC6).
4. PR → CI → merge del supervisor.
5. T03: el supervisor ejecuta la migración (AC7) → Verify → Learn → cierre.
