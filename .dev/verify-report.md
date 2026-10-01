# Verify Report: hylistats — iter-07 despliegue en Render y Supabase
**Fecha**: 2026-10-02
**Consume**: commits `d32cc24` (T01), `df60262` (T04) y operaciones de T02/T03 en la rama `feat/13-despliegue`; AC1–AC9 de `spec.md` (#13)
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

- spec.md AC1: checks del repo en verde, desarrollo local sin cambios, Node acotado y respetado por Render.
- spec.md AC2: migraciones de Supabase = `drizzle/`; recuentos por tabla idénticos a local.
- spec.md AC3: servicio `hylistats` (Frankfurt, Free) desplegando con migraciones al arrancar.
- spec.md AC4: portada, 6 perfiles con sus pestañas, `/grupo` y `/admin` sobre HTTPS; valores iguales a local.
- spec.md AC5: `/api/health` OK; el worker procesa un "Actualizar".
- spec.md AC6: `noindex`, `robots.txt` y ausencia de secretos.
- spec.md AC7: sueño y reanudación.
- spec.md AC8: documentación.
- spec.md AC9: gate manual (F18), queda abierto.

## Entorno <!-- SHOULD -->

- Producción: Render Free, servicio `srv-dave04qd0e5s73fkle3g` (Frankfurt, 512 MB, 0,15 CPU), Node 24; Supabase Free `frtniilscrrbyhbzdkhl` (`eu-central-1`, PostgreSQL 17.11) por el pooler en modo session.
- Local: macOS (Darwin 25.5), Node 26.9 para los checks; Postgres 17 en Docker (`hylistats-postgres-1`), cuyo `psql`/`pg_dump` se usó también contra Supabase.
- Navegador integrado del desktop app; MCP de Render para eventos, deploys y métricas.

## Checks ejecutados <!-- MUST -->

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

```bash
# Recuentos por tabla (local y Supabase, mismo SQL) y secuencias
select 'group_members',count(*) from group_members union all ... ;
select sequencename, last_value from pg_sequences where schemaname='public';
```

```bash
curl -s https://hylistats.onrender.com/api/health
curl -sI https://hylistats.onrender.com/ | grep -i x-robots
curl -s https://hylistats.onrender.com/robots.txt
# 6 perfiles × (álbum, resumen, estadisticas, companeros, partidas, grupo) + /, /admin, /grupo
curl -s -o /dev/null -w '%{http_code} %{time_total}s' https://hylistats.onrender.com/euw/<slug>?tab=<tab>
```

```bash
# Secretos: ni la contraseña de Supabase ni el ADMIN_TOKEN local en el árbol
git grep -c -F -e "$PASSWORD" -e "$ADMIN_TOKEN"
```

Uso real (2026-10-02, el grupo con la web abierta): `/api/health` y `sync_jobs` en Supabase.

Manual en navegador: `/grupo` en producción frente a `/grupo` local (`hylistats-dev-noworker`, sin worker para no descargar), comparando el texto de Hoy/Semana, Equipos y Temporada; "Actualizar" en el perfil de BEJITO MAMBO y lectura de `sync_jobs` en Supabase. Sueño: 22 min sin peticiones y `curl` a `/api/health`.

## Resultados observados <!-- MUST -->

- **AC1**: exit 0; Biome sin fixes, 59 ficheros / 1268 tests, build OK. `npm start` intacto (`start:prod` es nuevo). `.node-version` = 24; Render construye con él (build ~55 s con plan de build `starter`) y CI pasa a `node-version-file`.
- **AC2**: `drizzle.__drizzle_migrations` con 5 filas = 5 ficheros en `drizzle/`. Recuentos local = Supabase: group_members 6, match_fetch 1222, matches 1222, participants 21996, profiles 7, settings 1, sync_jobs 634. Secuencias iguales (`profiles_id_seq` 7, `sync_jobs_id_seq` 641). Tablas con dueño `postgres`, RLS activado y no forzado.
- **AC3**: primer deploy sin secretos falla al arrancar (`nonZeroExit: 1`, falta `DATABASE_URL`), como se esperaba. Con los secretos, `dep-dave2svavr4c73bl49c0` y `dep-dave36unfi0s73fsggu0` → `succeeded`; el arranque aplica las migraciones (ya al día) y levanta Next.
- **AC4**: las 39 URLs dan 200 sobre HTTPS (perfiles 1–3 s, picos de ~7 s en frío; `/` 0,13 s; `/admin` 0,21 s). `/grupo` producción = local en todas las cifras de Hoy (ranking, títulos, dúos y tríos del día), Equipos (15 dúos y 19 tríos) y Temporada (partidas, 1º, campeones ganados, victorias a la primera, campeón con más 1º de los 6 miembros); las únicas diferencias de texto son etiquetas cortas de cabecera por el ancho de la ventana. Imágenes de Data Dragon cargan (0 rotas).
- **AC5**: `/api/health` → `ok: true`, `db: ok`, worker `idle` con el lock, key `ok` (`source: db`), cola vacía. "Actualizar" en BEJITO MAMBO → job 642 `incremental` interactivo `done` en 3 s; 1 partida nueva (1223), métricas de Riot: 2 `matchIds`, 1 `match`, 1 `summoner`, 1 `playerData`, 0 × 429. El refresco automático no salta con la pestaña oculta (política `autoRefreshOnEvent`), como está diseñado. En uso real del grupo, el refresco automático lanzó 5 incrementales (`interactive = false`), todos `done`; 1224 partidas; 0 × 429.
- **AC6**: `x-robots-tag: noindex, nofollow` en las respuestas; `robots.txt` = `Disallow: /`. `/api/health` solo da estado y origen de la key. `git grep` de la contraseña de Supabase y del `ADMIN_TOKEN` local: 0 coincidencias; los `RGAPI-` del árbol son keys falsas de tests.
- **AC7**: **no verificado**. La prueba (22 min sin peticiones y despertar) se lanzó y se detuvo porque el grupo empezó a usar la web, y con tráfico el servicio no se duerme. Diferido al uso real con aprobación del supervisor (2026-10-02). El diseño lo respalda: la cola vive en la BD y el worker toma el lock al arrancar (comprobado en cada deploy).
- **AC8**: `AGENTS.md` → "Stack e infraestructura"; `docs/deploy.md` con despliegue, variables, rotación, backup/restauración (con el `TRUNCATE settings` aprendido en T02), límites Free y herramientas, con IDs y URLs reales.
- **AC9**: abierto (gate del supervisor, sesión conjunta F18).

## Juicio de coherencia y sentido <!-- MUST -->

La publicación respeta la arquitectura de I3 (un proceso, cola en BD, advisory lock) sin tocar código de la app: solo un script de arranque y la versión de Node. Las decisiones encajan con F9 (sin publicitar, `noindex`) y F22 (coste €0, sin tarjeta). Los datos de producción son los de local en el momento del volcado y divergen desde entonces solo por sincronizaciones nuevas, que es el comportamiento buscado. Los tiempos de página de 1–3 s con 0,15 CPU son aceptables para una pantalla secundaria, pero son el primer candidato a revisar tras la sesión con el grupo (Render Starter).

## Revision de calidad del codigo <!-- SHOULD -->

Diff de código mínimo (`package.json`, `.node-version`, `ci.yml`, `.mcp.json`) y limpio. `.node-version` como fuente única evita duplicar la versión entre Render y CI.

## Replay / validacion independiente <!-- SHOULD -->

No aplica un actor independiente: no hay lógica de negocio nueva. La comparación producción↔local de `/grupo` (que agrega todas las métricas de la app) y los recuentos SQL por tabla cubren la integridad de la migración.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| La restauración choca con la fila `settings.id=1` sembrada por una migración | resuelto | N/A | `TRUNCATE settings;` antes del volcado, en la misma transacción; documentado en `docs/deploy.md` |
| El MCP de Render no permite fijar el health check ni cambiar la rama del servicio | resuelto | N/A | Health check puesto por el supervisor; la rama pasa a `main` tras el merge (cierre de la iteración) |
| AC7 (sueño y reanudación) sin verificar: el grupo empezó a usar la web durante la prueba | diferido | Supervisor | Observarlo en el uso real; si tras dormirse no reanuda, issue de corrección |
| Páginas de perfil de 1–3 s (picos de ~7 s) con 0,15 CPU | diferido | Supervisor | Decidir tras la sesión F18: Render Starter ($7) o mantener |

## Conclusion <!-- MUST -->

**PASS** (con AC7 diferido y AC9 abierto)

AC1–AC6 y AC8 cumplidos con evidencia. AC7 diferido al uso real por decisión del supervisor; AC9 es el gate manual de F18.
