# Verify Report: hylistats — iter-08 migración a la Personal key
**Fecha**: 2026-10-02
**Consume**: PR #17 (`e39bda7`: T01 `50a8254`, T02 `cc48436`) y la migración de T03 en producción; AC1–AC7 de `spec.md` (#16)
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

- spec.md AC1: el reset con `--keep-profiles` vacía partidas y cola y conserva perfiles, grupo y `settings`.
- spec.md AC2: corrección del Riot ID antes de vaciar.
- spec.md AC3: escenario de punta a punta con el `RiotApi` falso.
- spec.md AC4: CLI seguro (sin `--yes` no toca nada, `--url`, sin secretos ni PUUID en la salida).
- spec.md AC5: lint, typecheck, tests, build y CI.
- spec.md AC6: runbook y docs.
- spec.md AC7: migración en producción (gate del supervisor), ejecutada en esta sesión.

## Entorno <!-- SHOULD -->

- Producción: Render Free `srv-dave04qd0e5s73fkle3g` (Frankfurt); Supabase Free `frtniilscrrbyhbzdkhl` por el pooler en modo session.
- Mac del supervisor: macOS (Darwin 25.5), `main` en `e39bda7`, Postgres 17 en Docker (`hylistats-postgres-1`) para `pg_dump` y `psql` contra Supabase.
- MCP de Render (deploys) y navegador integrado (`/grupo`).

## Checks ejecutados <!-- MUST -->

```bash
# AC1–AC5 en main tras el merge
npm run lint && npm run typecheck && npm test && npm run build
npx vitest run tests/db/reset.test.ts src/worker/worker.test.ts
gh pr view 17 --json statusCheckRollup; gh run list --branch main
```

```bash
# AC7, siguiendo docs/deploy.md → "Migrar a una key de otro proyecto de Riot"
set -a; . ./.env.local; set +a
# 1. backup + foto previa
docker exec -e U="$SUPABASE_DATABASE_URL" hylistats-postgres-1 sh -c 'pg_dump "$U" --schema=public --data-only --no-owner --no-privileges' > ~/Backups/hylistats/backup-2026-10-02.sql
npm run db:reset -- --keep-profiles --url "$SUPABASE_DATABASE_URL"            # foto previa
# 2. Personal key en /admin (supervisor, 11:48:09Z); comprobado en /api/health (key.since)
# 3. reset
npm run db:reset -- --keep-profiles --url "$SUPABASE_DATABASE_URL" --yes
# 4. seguimiento: /api/health cada minuto hasta cola vacía
# 5. verificación: mismo comando sin --yes + SQL de jobs/match_fetch + texto de /grupo
# 6. RIOT_API_KEY en Render (supervisor) → redeploy → `update settings set riot_api_key = null where id = 1;` (supervisor) → /api/health
```

Evidencias guardadas fuera del repo en `~/Backups/hylistats/` (`foto-previa`, `grupo-previa`, `reset`, `backfill-health.log`, `foto-final`; el backup lleva la dev key y no va al repo).

## Resultados observados <!-- MUST -->

- **AC1–AC4**: `tests/db/reset.test.ts` y `src/worker/worker.test.ts` → 36/36 en verde en `main`. En producción, AC4 se observa además en la salida real: sin `--yes` imprime el resumen y no toca nada (foto previa y final); la salida muestra `host/BD` sin contraseña ni PUUID. AC1 se confirma en producción: tras el reset los 9 perfiles conservan id, Riot ID, 602002 y grupo (6 miembros); jobs nuevos 714–722 > 705 anteriores. AC2 no se ejercitó en producción: el resumen previo no listó ningún Riot ID cambiado ("0 Riot ID corregidos").
- **AC5**: lint (207 ficheros, sin fixes), typecheck, 60 ficheros / 1276 tests y build en verde en `main`; CI de la PR #17 (`check` ×2) y del push de `e39bda7` a main en verde.
- **AC6**: el runbook se siguió de principio a fin en esta sesión sin el transcript de la iteración; el orden key → reset está marcado como obligatorio y se respetó (key 11:48:09Z, reset 11:48Z+, primer job 717 en curso a las 11:49Z con 9 `account` resueltos). `AGENTS.md` describe la Personal key.
- **AC7** (producción):
  - Foto previa: 9 perfiles (6 en el grupo), 1230 partidas, 705 jobs, todos `active`.
  - Backfill: 9 backfills `done` en 28 min (11:49–12:17Z), 1300 peticiones (9 `account`, 40 `matchIds`, 1232 `match`, 9 `summoner`, 9 `playerData`, 1 `validate`), **0 × 429, 0 reintentos**, sin `lastError`.
  - Foto final: 9/9 perfiles `active`, ninguno sin PUUID; partidas por perfil = foto previa salvo Hylimichi 940 → 942 (2 partidas de hoy) — todas ≥. `match_fetch` 1232 `done`, 0 fallidos; 22176 participantes = 1232 × 18.
  - "Campeones ganados" = 602002 en los 6 miembros (78, 110, 63, 31, 29, 28).
  - `/grupo` frente a la captura previa: 15 dúos y 19 tríos idénticos; Temporada idéntica salvo las partidas de Hylimichi (942; 1º, % y puesto medio sin cambio); Hoy pasa de 1 a 3 partidas de Hylimichi.
  - Paso 6: deploy `dep-davq72p42hec73dp0jv0` (`e39bda7`) `live` tras crear `RIOT_API_KEY`; `settings.riot_api_key` = `null`; `/api/health` → key `ok`, `source: env`. Con la key del entorno, el worker hizo un incremental tras el deploy (10 jobs `done`, 1233 partidas, 0 × 429). `/admin` sin "Caduca aprox.": `expiresHint` solo existe con `source = db` (`src/lib/admin/key-service.ts`), y el supervisor lo confirma en una captura de `/admin` (key `ok`, desde 11:48 UTC, fuente `env`, sin fila "Caduca aprox.").

## Juicio de coherencia y sentido <!-- MUST -->

La migración hizo lo que prometía la spec: los PUUID se volvieron a cifrar con el proyecto de la Personal key (9 llamadas a Account-V1) y los datos derivados reaparecen idénticos, que es la prueba de que reset + backfill reconstruyen el mismo estado y no otro parecido. Las únicas diferencias son partidas jugadas hoy, el comportamiento esperado. El coste real (1300 peticiones, 28 min, 0 × 429) cuadra con la estimación del runbook (~1300, 25–30 min), y el limitador respetó la ventana de 100/2 min sin un solo reintento. La dev key desaparece de la BD y deja de existir el ciclo de rotación diaria.

## Revision de calidad del codigo <!-- SHOULD -->

N/A en esta fase: el código de T01/T02 se revisó en la PR #17 antes del merge; T03 no toca código.

## Replay / validacion independiente <!-- SHOULD -->

La comparación foto previa ↔ foto final y `/grupo` previo ↔ final (que agrega todas las métricas de la app) actúa como validación independiente de la integridad: dos lecturas del mismo comando y de la misma página, separadas por un vaciado completo. No aplica un actor adicional.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| El auto-deploy de Render no se disparó con los merges de #15 y #17 a `main` (rama y `autoDeploy: yes` correctos); producción siguió en `541b78d` hasta el redeploy del paso 6 | diferido | Supervisor | Learn de iter-08: comprobar el webhook/GitHub App de Render en el próximo push a main |
| El runbook escribe `backup-*.sql` y `foto-previa-*.txt` en la raíz del repo y no están en `.gitignore`; el backup lleva la key de la BD | diferido | Supervisor | Learn de iter-08: runbook a `~/Backups/hylistats/` y patrones en `.gitignore` |
| AC2 sin ejercitar en producción (nadie había cambiado su Riot ID) | resuelto | N/A | Cubierto por los tests de AC2 y el escenario del worker |

## Conclusion <!-- MUST -->

**PASS**

AC1–AC7 cumplidos con evidencia. Producción corre con la Personal key en `RIOT_API_KEY`, perfiles, grupo y estadísticas intactos.
