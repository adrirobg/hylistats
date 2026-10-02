# Despliegue y operación

Runbook de producción de hylistats. Decisión de hosting: F22 en `.dev/think.md`; arquitectura: `.dev/research/stack.md` §3(a) y §7.

## Piezas

| Pieza | Dónde | Plan | Notas |
|---|---|---|---|
| Web + worker | Render, servicio `hylistats` (`srv-dave04qd0e5s73fkle3g`), Frankfurt | Free | <https://hylistats.onrender.com>. Un solo proceso: Next.js y el worker de sincronización (arrancado en `src/instrumentation.ts`) |
| Postgres | Supabase, proyecto `frtniilscrrbyhbzdkhl`, `eu-central-1` | Free | Postgres 17. Data API desactivada; RLS automático activado (no afecta: la app conecta como `postgres`, dueño de las tablas, sin `FORCE`) |

Coste: €0. Ninguno de los dos tiene tarjeta asociada.

## Cómo se despliega

- **Automático**: cada push a la rama configurada en Render (`main`) construye y despliega. Requiere la GitHub App de Render instalada con acceso a `adrirobg/hylistats` (GitHub → Settings → Applications → Installed GitHub Apps). Sin ella, Render clona el repo (es público) pero no se entera de los push: solo despliega a mano o al cambiar la configuración. Así estuvo hasta el 2026-10-02.
- **Build**: `npm ci && npm run build`. Node sale de `.node-version` (24); CI usa el mismo fichero.
- **Arranque**: `npm run start:prod` = `npm run db:migrate && next start`. Las migraciones se aplican en cada arranque (idempotentes) porque el *pre-deploy command* de Render no existe en el plan Free. `next start` escucha en `$PORT`.
- **Health check**: `/api/health` (BD, estado del worker, key, cola, métricas de Riot; sin secretos). Configurado en el panel de Render (Settings → Health Check Path).
- **Solape**: al desplegar, la instancia vieja sigue 60 s tras arrancar la nueva. El `pg_try_advisory_lock` del worker garantiza que solo uno trabaja; el otro espera el lock.
- **Manual**: panel de Render → *Manual Deploy*, o el MCP de Render (`trigger_deploy`).

## Releases y hotfixes

Flujo de ramas (F27, resumen en `AGENTS.md`): se trabaja en `develop`; `main` es producción y solo recibe releases y hotfixes. Versiones SemVer desde `v1.0.0`: minor por release con funcionalidad, patch por hotfix.

### Release

La decide el supervisor, normalmente tras cerrar una iteración en `develop` (puede juntar varias). `/dev-ship` la ofrece al terminar el cierre, pero no la hace sin su sí.

1. **Versión en `develop`**: con `develop` al día y limpio,
   ```bash
   npm version minor --no-git-tag-version
   ```
   (`patch` si la release solo corrige) y commit `maint(release): vX.Y.Z` con `package.json` y `package-lock.json`. Antes, comprobar que la versión de `package.json` es la del último tag (`git describe --tags --abbrev=0`): `npm version minor` sube desde lo que haya en `package.json`. Si no coinciden, fijar la versión explícita (`npm version X.Y.Z --no-git-tag-version`); pasó en `v1.1.0`, porque `package.json` seguía en `0.1.0`. Push de `develop`. El tag no se crea aquí: va sobre el merge commit de `main`.
2. **PR `develop → main`** con título `release: vX.Y.Z` y, en el cuerpo, las issues y PR incluidas desde la release anterior (`git log --merges --oneline vANTERIOR..develop`). La mergea el supervisor con **merge commit** (sin squash ni rebase, para que `main` y `develop` compartan la historia).
3. **Tag** sobre el merge commit de `main`:
   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   ```
   La release de GitHub (`gh release create vX.Y.Z --generate-notes`) es opcional.
4. **Comprobar el deploy**: el push a `main` lanza el deploy de Render. Comprobar que el evento termina en `deploy_ended` sin `server_failed` (MCP de Render: `list_deploys` / `list_events`) y que `/api/health` responde con la BD y el worker bien.

### Hotfix

Solo si producción está rota o molesta en uso real; si no, el arreglo va por `develop` y sale en la próxima release.

1. Rama `fix/N-slug` desde `main` (issue `N` con label `fix`).
2. Arreglo, tests y `npm version patch --no-git-tag-version` (commit `maint(release): vX.Y.Z`) en la misma rama.
3. PR a `main`; la mergea el supervisor con merge commit.
4. Tag `vX.Y.Z` sobre el merge commit de `main` y push del tag; comprobar el deploy como en el paso 4 de la release.
5. Merge de `main` en `develop` (PR `main → develop` o merge local y push) para que el arreglo no se pierda en la próxima release.

### Probar `develop` antes de una release

No hay staging. `develop` se prueba en local con build de producción:

```bash
npm run build && npm run start
```

con la BD local. Si hace falta reproducir algo con los datos reales, se vuelca producción y se restaura en una BD local migrada y vacía con el procedimiento de "Backup y restauración" (sustituye los datos de esa BD: mejor una base aparte que `hylistats`). Nunca se apunta un `develop` local a la BD de producción: habría dos workers sobre la misma cola.

## Variables de entorno (Render → Environment)

| Variable | Secreta | Valor |
|---|---|---|
| `DATABASE_URL` | Sí | URI del **pooler Supavisor en modo session** (Supabase → Connect → Session pooler, puerto 5432). No usar el modo transaction (6543): rompe el advisory lock del worker y las sentencias preparadas. La conexión directa es solo IPv6 |
| `ADMIN_TOKEN` | Sí | ≥ 32 caracteres (`openssl rand -base64 32`). Contraseña de `/admin` y del Bearer de `/api/admin/key` |
| `SEASON_START` | No | `2026-05-12T00:00:00Z` (si falta, se usa `DEFAULT_SEASON_START` de `src/lib/config.ts`) |
| `WORKER_ENABLED` | No | `true` |
| `RIOT_API_KEY` | Sí | Personal key de Riot (no caduca). Se usa cuando no hay key guardada desde `/admin`, que manda sobre esta |

Los secretos los introduce el supervisor en el panel: nunca en el repo, en el chat ni con prefijo `NEXT_PUBLIC_`. Cambiar una variable en Render redepliega el servicio.

## Key de Riot

La key vigente es la **Personal key** (concedida el 2026-10-02; producción migró a ella el mismo día con el procedimiento de abajo): no caduca y tiene los mismos límites que la de desarrollo (100 peticiones cada 2 min, 20 por segundo). Vive en `RIOT_API_KEY` (Render → Environment).

Una key guardada desde `/admin` **manda sobre** `RIOT_API_KEY`. Es la vía rápida si Riot invalida la key, porque no necesita redeploy:

- **Navegador**: <https://hylistats.onrender.com/admin> → login con `ADMIN_TOKEN` → "Nueva key".
- **Shell**:
  ```bash
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"key":"RGAPI-..."}' https://hylistats.onrender.com/api/admin/key
  ```

La key se valida contra Riot antes de guardarse. Con una key rechazada el worker se pausa y se reanuda solo al guardar una válida. `/admin` muestra "Caduca aprox." para cualquier key guardada en la BD, porque supone que es de desarrollo. Con la key en el entorno, ese aviso no aparece.

**Cambiar de key de proyecto de Riot** (de la dev key a la Personal, o a otra app) **no es pegar la key nueva y ya**: los PUUID van cifrados por proyecto, y los guardados dejan de servir con la key nueva (Riot responde 400 "Exception decrypting"). Hay que seguir la migración de abajo. Regenerar la key del mismo proyecto no cambia los PUUID.

## Migrar a una key de otro proyecto de Riot

Vuelve a descargarlo todo con la key nueva y conserva los perfiles (ids, URL, icono y 602002), el grupo y `settings`. Son unas 1300 peticiones: 25–30 min con el grupo actual. Todo se lanza desde el Mac, con `SUPABASE_DATABASE_URL` en `.env.local` (ver Backup).

**Antes**: avisar al grupo de que no use la web mientras dura, y que nadie registre perfiles nuevos.

1. **Backup y foto previa.** Hacer el `pg_dump` de "Backup y restauración". Después, la foto previa: el mismo comando del reset sin `--yes` solo imprime el resumen (perfiles, grupo, partidas por perfil, 602002 y Riot ID que se van a corregir) y no toca nada.
   ```bash
   set -a; . ./.env.local; set +a
   npm run db:reset -- --keep-profiles --url "$SUPABASE_DATABASE_URL" | tee ~/Backups/hylistats/foto-previa-$(date +%F).txt
   ```
   Hacer también una captura de `/grupo` (Temporada y Equipos).
2. **Pegar la key nueva en `/admin`** ("Nueva key"). Desde aquí, los refrescos que se lancen fallan con 400 sin guardar nada; el paso 3 los descarta.
3. **Reset, justo después del paso 2.** Este orden es obligatorio: si el reset va antes, el worker resolvería los PUUID con la key vieja.
   ```bash
   npm run db:reset -- --keep-profiles --url "$SUPABASE_DATABASE_URL" --yes
   ```
   En una transacción hace lo siguiente:
   - vacía `participants`, `matches`, `match_fetch` y `sync_jobs`;
   - corrige el Riot ID de quien se lo haya cambiado (según su última partida guardada; la URL no cambia);
   - deja los perfiles sin PUUID y en `resolving`;
   - encola un backfill por perfil.

   El worker de Render los recoge en segundos, no hay que reiniciar nada.
4. **Seguir el backfill** en `/admin` (Worker) o en `/api/health` (cola y métricas de Riot). La web se va rellenando perfil a perfil.
5. **Verificar** con el mismo comando del paso 1 (sin `--yes`), comparando con la foto previa:
   - todos los perfiles están `active`;
   - las partidas por perfil son ≥ que en la foto;
   - "campeones ganados" coincide con el 602002 en la cabecera de cada perfil;
   - `/grupo` es igual a la captura salvo partidas nuevas;
   - `/api/health` no registra ningún 429.

   Si un perfil queda `not_found`, su Riot ID ya no existe y su última partida guardada no traía el nombre nuevo. Hay que corregir el Riot ID con SQL (`update profiles set game_name = '…', tag_line = '…' where id = N`) y pulsar "Actualizar" en su perfil, que reintenta los `not_found`.
6. **Pasar la key al entorno.**
   1. En Render → Environment, poner la key nueva en `RIOT_API_KEY` y esperar al redeploy. Mientras tanto sigue mandando la de la BD, así que no hay corte.
   2. Vaciar la key de la BD en Supabase → SQL Editor:
      ```sql
      update settings set riot_api_key = null where id = 1;
      ```
   3. Comprobar en `/admin` que la key sale del entorno, sin aviso de caducidad, y que el estado es correcto.

**En local**: mismo procedimiento contra la BD de Docker. Poner la key en `RIOT_API_KEY` de `.env.local`, dejar la de la BD a `null` y ejecutar `npm run db:reset -- --keep-profiles --yes`. Sin `--url` usa `DATABASE_URL`. Si los datos locales no importan, basta con `npm run db:reset -- --yes`, que también borra perfiles y grupo.

## Backup y restauración

Supabase Free no hace backups. Casi todo se puede volver a descargar de Riot (Match-V5 guarda ~2 años), pero conviene un volcado antes de cambios de esquema o de mover de host. En el Mac no hay cliente de Postgres; se usa el del contenedor de desarrollo (`docker compose up -d`, Postgres 17). Con la URI del pooler en `SUPABASE_DATABASE_URL` dentro de `.env.local`:

Los volcados y las fotos van a `~/Backups/hylistats/`, fuera del repo: el volcado incluye `settings`, con la key de Riot si hay una guardada desde `/admin`. Crear la carpeta una vez con `mkdir -p ~/Backups/hylistats && chmod 700 ~/Backups/hylistats`. El `.gitignore` excluye además `backup-*.sql` y `foto-*.txt` por si se guardan en la raíz.

```bash
set -a; . ./.env.local; set +a
docker exec -e U="$SUPABASE_DATABASE_URL" hylistats-postgres-1 sh -c 'pg_dump "$U" --schema=public --data-only --no-owner --no-privileges' > ~/Backups/hylistats/backup-$(date +%F).sql
```

Restaurar en una BD con el esquema ya migrado (`npx tsx scripts/migrate.ts --url "$SUPABASE_DATABASE_URL"`) y vacía. Una migración siembra la fila `settings.id=1`, de ahí el `TRUNCATE`:

```bash
{ echo 'TRUNCATE settings;'; cat ~/Backups/hylistats/backup-AAAA-MM-DD.sql; } | docker exec -i -e U="$SUPABASE_DATABASE_URL" hylistats-postgres-1 sh -c 'psql "$U" -v ON_ERROR_STOP=1 -1 -q'
```

El mismo procedimiento sirve para llevar datos de local a producción (volcado de `hylistats` local con `-U hylistats -d hylistats`), que es como se cargó la BD el 2026-10-02. Después, comparar recuentos por tabla en ambos lados.

## Límites del plan gratis y qué hacer

| Situación | Qué pasa | Qué hacer |
|---|---|---|
| Render sin tráfico 15 min | El servicio se duerme; la primera visita tarda ~1 min en despertarlo. El worker se para y, al despertar, retoma la cola desde la BD | Nada. Mientras alguien tenga una pestaña abierta (el polling de la página) no se duerme |
| Render: recursos | 512 MB de RAM (la app usa ~170 MB en reposo) y 0,15 CPU: las páginas de perfil tardan 1–3 s en generarse (hasta ~7 s en frío); 750 h de instancia/mes (cubre un servicio 24/7), 100 GB de tráfico y 500 min de build al mes | Si la lentitud o el sueño molestan: Render Starter ($7/mes, 0,5 CPU, sin sueño), cambiando solo el plan |
| Supabase sin consultas 7 días | Pausa el proyecto (avisa por correo antes). Los datos se conservan hasta 1 año | Supabase → proyecto → *Resume project*. Mientras tanto `/api/health` da 503 (`db: error`) |
| Supabase: tamaño | 500 MB de BD (≈ 45 MB en 2026-10) | Vigilar en el panel de Supabase |

## Herramientas

- **MCP de Render** (conector de la cuenta de Claude): crear servicios, variables de entorno, deploys, logs, eventos y métricas. No puede borrar recursos (eso se hace en el panel).
- **MCP de Supabase** (`.mcp.json` del proyecto): limitado al proyecto `frtniilscrrbyhbzdkhl` y a `docs,database,debugging,development`. Se autentica una vez con `claude` → `/mcp` → `supabase` → Authenticate.
- **Paneles**: <https://dashboard.render.com/web/srv-dave04qd0e5s73fkle3g> y <https://supabase.com/dashboard/project/frtniilscrrbyhbzdkhl>.
