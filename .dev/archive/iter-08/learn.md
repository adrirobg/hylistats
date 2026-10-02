# Learn: hylistats — iter-08 migración a la Personal key
**Fecha**: 2026-10-02
**Consume**: `spec.md` (AC1–AC7, issue #16), `tasks/` (T01–T03), `verify-report.md` (PASS), PR #17 (`e39bda7`) y la migración en producción del 2026-10-02 (11:48–12:31Z)
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

Producción pasa de la dev key de 24 h a la Personal key en `RIOT_API_KEY`, con `db:reset --keep-profiles` volviendo a descargar todo con los PUUID del nuevo proyecto: 1300 peticiones en 28 min, 0 × 429, y perfiles, grupo y estadísticas idénticos salvo las partidas de hoy. Se acaba la rotación diaria. Verify da PASS en AC1–AC7.

## Que funciono <!-- MUST -->

- **La foto previa es el mismo comando sin `--yes`.** Antes y después se leen con la misma herramienta y el mismo formato, así que la comparación es línea a línea. Lo mismo con el texto de `/grupo` sacado con el navegador integrado, que agrega todas las métricas de la app: 34 equipos y 6 filas de temporada idénticos.
- **Comprobar el orden key → reset con un dato, no con la palabra.** Antes del reset se miró `key.since` en `/api/health` (11:48:09Z, la key recién pegada). El orden obligatorio del runbook quedó verificado objetivamente.
- **Seguimiento de `/api/health` en segundo plano, una línea por minuto.** No hizo falta mirar a mano y dejó la evidencia del ritmo (~100 peticiones cada 2 min), de los 0 × 429 y de cuándo terminó.
- **El reparto supervisor/agente.** Las keys solo las tocó el supervisor (`/admin`, Render, SQL de `settings`). El agente lanzó backup, fotos y reset, este último tras un «adelante» explícito, y siguió el resto. Ninguna key pasó por el chat.
- **La estimación del runbook acertó** (~1300 peticiones, 25–30 min, frente a 1300 y 28 min reales). El grupo, avisado, no interfirió.
- **`key.source` en `/api/health`** permitió confirmar el paso 6 sin entrar en `/admin`; la captura del supervisor lo corroboró.

## Que ajustar <!-- MUST -->

- **Los backups tienen que tener un sitio fijo y fuera del repo.** El agente dejó el `pg_dump` en el scratchpad (`/tmp`) y el supervisor lo cuestionó con razón. El runbook escribe `backup-*.sql` y `foto-previa-*.txt` en la raíz del repo, sin `.gitignore`, y el backup lleva la key de `settings`. Quedó en `~/Backups/hylistats/` (`700`/`600`); el runbook debe decirlo.
- **El auto-deploy de Render no se disparó** con los merges de #15 y #17, aunque la rama era `main` y `autoDeploy: yes`. Producción siguió en `541b78d` hasta el redeploy del paso 6, y solo se vio al listar los deploys. Hay que comprobarlo en cada push a main hasta saber la causa.
- **El briefing de arranque iba por detrás de `origin`.** Antes del `git pull` decía «sin iteración activa». Con trabajo hecho en sesiones cloud, el primer paso es hacer pull y regenerar el briefing (dogfood #27).

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| (a) opción (b): `db:reset --keep-profiles` reutilizable y probado frente a SQL ad hoc | Ratificada | Se ejecutó tal cual desde el runbook; la salida sin `--yes` sirvió de foto previa y de verificación |
| 1. Corregir el Riot ID desde la última partida antes de vaciar | Ratificada (no ejercitada) | Nadie se lo había cambiado ("0 Riot ID corregidos"); queda cubierta por los tests de AC2 |
| 2. La key de la BD la vacía el supervisor con una línea de SQL, sin botón en `/admin` | Ratificada | Una operación puntual; `source: env` confirmado justo después |
| 3. Conservar icono y 602002 | Ratificada | "Campeones ganados" = 602002 desde el primer momento, sin esperar al backfill |
| 4. Avisar al grupo en lugar de modo mantenimiento | Ratificada | 28 min sin incidencias; el modo mantenimiento sigue como hilo para operaciones más largas |

## Deuda y gaps <!-- MAY -->

- Causa del auto-deploy que no salta (webhook o GitHub App de Render). Diferido; dueño: supervisor.
- Runbook de backup apuntando a la raíz del repo, sin patrones en `.gitignore`. Diferido; dueño: supervisor.
- Siguen abiertos de antes: AC7 de #13 (sueño y reanudación), la sesión F18 (AC9 de #13, AC12 de #9, AC5 de #3) y la protección de las server actions públicas.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Comprobar si el push del cierre de iter-08 a main genera deploy en Render; si no, revisar la integración con GitHub en el panel (Settings → Build & Deploy) | `docs/deploy.md` → "Cómo se despliega" | alta |
| Runbook: backups y fotos en `~/Backups/hylistats/` y `backup-*.sql` / `foto-*.txt` en `.gitignore` | `docs/deploy.md` → "Backup y restauración" + `.gitignore` | media |
| Sesión conjunta de Arena (F18) sobre la URL pública | think.md (hilos AC pendientes) | alta |
| Modo mantenimiento para la próxima operación larga | think.md → hilo "Página o modo de mantenimiento" | baja |

## Hallazgos para dev-system <!-- MAY -->

- Nuevo #27 en `research/dogfood-log.md`: el briefing del SessionStart se compila sin `git fetch` y va por detrás cuando la iteración avanzó en sesiones cloud.
- Se repite #25: T03 es una task de operación con owner supervisor, pero la ejecutaron el agente y el supervisor a medias. El template no tiene sitio para ese reparto.

## Candidatos a vault <!-- MAY -->

- 2026-10-02 — «La foto previa es el mismo comando sin `--yes`»: un comando destructivo cuyo modo seco imprime el estado sirve de dry-run, foto previa y verificación a la vez — destino: nota-atomica
