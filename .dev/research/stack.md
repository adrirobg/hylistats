# I3 — Stack, scaffolding y hosting

> Investigación I3 de `think.md` (consulta: 2026-09-29). Consume `sync-strategy.md` (I2, §7 vinculante) y `riot-api.md` (I1). Alimenta Spec.
> Etiquetas: **[V]** verificado hoy en fuente primaria · **[S]** fuente secundaria (blog/agregador/snippet de búsqueda) · **[I]** inferido/estimación propia · **[NV]** no verificado.
> Precios en USD tal como los publica cada proveedor, sin IVA (el IVA aplicable en España **[NV]**). No se ha creado código, proyecto ni instalado nada: los comandos de §5 **no se han ejecutado**.

## 1. Resumen ejecutivo

- **App**: **Next.js 16 (App Router) + TypeScript + Drizzle ORM + Postgres**, un único deployable. Versiones actuales: `next` 16.3.7, `drizzle-orm` 0.45.3, `tailwindcss` 4.3.3 (npm, 2026-09-29) **[V]**.
- **Worker**: mismo proceso que la web, arrancado sin `await` desde `instrumentation.ts` (`register()` corre una vez por instancia de servidor **[V]**). Cola y estado en Postgres (tablas de I2), rate limiter en memoria, y **un `pg_try_advisory_lock`** como garantía de "una sola instancia activa" (req. 5 de I2) aunque el host solape dos procesos en un deploy. El mismo código se separa en un segundo servicio cambiando una variable (`WORKER_ENABLED`).
- **Hosting recomendado (con GitHub Student Pack)**: **Heroku, región `eu`**, 1 dyno **Basic** ($7) + **Postgres Essential-0** ($5) = $12/mes, cubierto por el crédito del Pack ($13/mes durante 24 meses) → **$0 durante 24 meses**, después $12/mes o migración a Railway (~$6–8 **[I]**). Sin caducidad de key ni de BD; la app no usa nada específico de Heroku (Node + Postgres + variables de entorno), así que la salida es un `pg_dump` + `git push` a otro host.
- **Sin el Pack**, la opción por defecto sería **Railway Hobby** ($5/mes con $5 de uso incluido; estimado $6–8 con web + Postgres **[I]**), misma app.
- **Cliente Riot propio y fino** (~200 líneas: `fetch` + limiter de dos ventanas + reintentos con `Retry-After` + esquemas Zod validados con las respuestas reales de I1). Ninguna librería está verificada con Arena tríos (queue 1750); `twisted` es la única activa pero trae su propio limiter por instancia y superficie que no usamos.
- **UI**: Tailwind 4 + **shadcn/ui** + **Recharts 3** (los charts de shadcn son Recharts v3 sin wrapper **[V]**); imágenes de campeón directas desde Data Dragon (sin optimizador de `next/image`, para no gastar RAM).
- **Tooling**: Biome (lint+format, opción nativa de `create-next-app`), Vitest 5, GitHub Actions. Sin Sentry/Datadog en v1 (gratis con el Pack, pero sobran).
- **Sin Personal key por ahora (solo development key, caduca cada 24 h)**: la key se guarda en una tabla `settings` de la BD (con fallback a la variable de entorno) y se cambia **sin redeploy ni reinicio** pegándola en una página `/admin` protegida por un `ADMIN_TOKEN`; el worker se **pausa solo ante 401/403** y **se reanuda al guardar una key válida**. La BD de desarrollo es **desechable** (los PUUID cambian al registrar el producto); ver §7.1.
- **Descartado**: DigitalOcean (el crédito del Pack **ya no existe** desde 2026-08-01), Vercel+Inngest+Neon (más piezas y peor encaje con el worker), SvelteKit+SQLite (buen encaje pero ecosistema de UI/charts más flojo), Prisma (en RC), free tiers con sleep o caducidad (Render, Supabase).

## 2. Criterios y pesos

Derivados del perfil (F1, F9: 5–10 amigos, pantalla secundaria, web sin publicitar, coste bajo) y de I2 §7.

| # | Criterio | Peso | Por qué |
|---|---|---|---|
| C1 | Encaje con worker persistente, cola en BD y **una sola instancia** (I2 §7.1, §7.5) | 25 % | Es el requisito duro: backfill de ~10–30 min, rate limiter global |
| C2 | Simplicidad operativa (pocas piezas, deploy trivial, poco mantenimiento) | 20 % | Principio del supervisor; app de amigos, no SaaS |
| C3 | Coste mensual (incluyendo beneficios del Student Pack y qué pasa al caducar) | 15 % | Requisito nuevo del supervisor |
| C4 | Ecosistema de UI (grid con imágenes, gráficas, shadcn) y DX/familiaridad | 15 % | UI moderna y visual es parte del producto |
| C5 | Portabilidad / coste de salida | 10 % | Los beneficios caducan; no atarse |
| C6 | Madurez y riesgo del stack | 10 % | Sin sorpresas en un proyecto de fin de semana |
| C7 | Secretos/HTTPS/`noindex`/BD relacional, key solo servidor (I2 §7.2–7.3) | 5 % | Todas cumplen; casi no discrimina |

## 3. Opciones evaluadas

### (a) Next.js + Postgres + worker en el mismo proceso, en un PaaS de contenedor/dyno

Web y worker en un solo servicio; worker lanzado desde `instrumentation.ts`; Postgres gestionado. Hosts posibles: **Heroku** (Pack), Railway, Render.

- **Worker**: encaja. Proceso persistente sin timeouts. `register()` "debe completar antes de que el servidor atienda peticiones" **[V]** → el worker se lanza sin `await` (`void startWorker()`), guardado por `NEXT_RUNTIME === 'nodejs'` **[V]**. Next recomienda parada ordenada con SIGTERM y un drain de 10–30 s **[V]**; el worker debe soportarlo (los jobs son idempotentes por diseño en I2).
- **Riesgos**: (1) el worker comparte RAM con Next (Basic dyno: 512 MB **[NV]**; estimación web+worker 250–350 MB **[I]**; mitigación: `images.unoptimized`, sin `sharp`); (2) `instrumentation.ts` es un hook pensado para observabilidad, no para colas — se usa como "arranque"; si molesta, se separa en un 2º servicio con el mismo repo; (3) Heroku ciclia los dynos cada ~24 h (comportamiento conocido, **[NV]** hoy) → el worker debe ser reanudable, y lo es (cola en BD).
- **Ops**: 1 servicio + 1 Postgres. Migraciones en `release` (Heroku) o pre-deploy (Railway).
- **DX/madurez**: máximo. Next 16.3.7 publicado 2026-09-29, 142 k★, push del mismo día **[V]**; shadcn/ui 124 k★, push 2026-09-29 **[V]**.

| Host | Coste mensual | Notas |
|---|---|---|
| Heroku (Basic $7 + Essential-0 $5) | $12 → **$0 con Student Pack 24 m** | Eu `--region eu` **[V]**; Basic no duerme, "Free SSL" **[V]**; Essential-0: 1 GB, 20 conexiones, backups diarios PGBackups, 99,5 % uptime, sin fork/follow **[V]** |
| Railway Hobby | $5 (incl. $5 de uso); uso estimado web+PG ~$6–8 **[I]** | $0,00000772/vCPU·s, $0,00000386/GB·s, volumen $0,15/GB, egress $0,05/GB **[V]**; región EU West (Ámsterdam) **[V]**; si el crédito llega a 0 se cancela la suscripción **[V]** |
| Render Starter web $7 + Postgres Basic-256mb $6 | ~$13 **[S]** | El free tier no sirve: web duerme a 15 min y Postgres free caduca a los 30 días **[V]**; precios de pago **[S]** (la página oficial no se dejó leer) |

### (b) Next.js en Vercel + cola gestionada (Inngest) + Postgres gestionado (Neon)

- **Worker**: encaja **a medias**. Hobby: función máx. 300 s, cron solo diario con precisión ±59 min **[V]**; el backfill de 10 min hay que trocearlo en steps. Inngest `throttle` (limit 100, period 120 s, burst 0) sirve para el límite de Riot y encola FIFO **[V]**, pero el limiter pasa a vivir en un SaaS y hay que modelar el backfill como funciones Inngest (adiós a la cola de I2 en BD, o duplicarla).
- **Coste**: $0 en free tiers: Vercel Hobby (uso no comercial **[NV]** cita literal), Inngest Free 50 k ejecuciones/mes y 5 steps concurrentes **[V]**, Neon Free 0,5 GB y 100 CU-h/mes con scale-to-zero a los 5 min no desactivable **[V]**. Riesgo: el polling de una pantalla siempre abierta mantiene Neon despierto; 0,25 CU × 730 h ≈ 182 CU-h > 100 **[I]** → podría agotar la cuota si la pantalla está abierta 24/7.
- **Ops**: 3 proveedores, 3 paneles, 3 conjuntos de secretos. La Personal key vive en Vercel.
- **Portabilidad**: baja (funciones Inngest, límites de Vercel).
- **Veredicto**: válido y gratis, pero rompe el principio "lo más simple": añade dos SaaS solo para evitar mantener un proceso.

### (c) Full-stack Node con SQLite en volumen: SvelteKit + `adapter-node` (+ worker en `hooks.server.ts`) en Fly.io

- **Worker**: encaje muy bueno: el módulo de servidor corre una vez, sin hooks especiales. SQLite en volumen evita el Postgres separado.
- **Scaffold**: `sv create` con add-ons `drizzle`, `tailwindcss`, `vitest`, `eslint`, `prettier`, `sveltekit-adapter` (SQLite: `better-sqlite3`/`libsql`/`turso`) **[V]**; `@sveltejs/kit` 2.70.3, `svelte` 5.57.1, `adapter-node` 5.5.7 **[V]**. Es el scaffold más completo "de fábrica".
- **Contras**: (1) UI: shadcn-svelte y charts (LayerChart 2.5.0) existen pero con menos masa crítica que shadcn+Recharts; (2) SQLite+volumen ata a un solo host con disco (no Heroku, que tiene FS efímero **[D conocido]**); volumen único → redeploy con un breve corte; (3) menor familiaridad general/LLM con Svelte 5 **[I]**.
- **Coste**: Fly `shared-cpu-1x` 512 MB $2,80/mes, 256 MB $1,40/mes, volumen $0,15/GB·mes, snapshots $0,08/GB con 10 GB gratis, egress $0,02/GB en EU **[V]** → ~$3/mes con SQLite. Sin free tier: trial de 7 días o 2 h de máquina, después tarjeta obligatoria **[V]**.
- **Variante VPS**: Hetzner CX23 €5,49 (+€0,50 IPv4) **[S]**; más barato por potencia, pero hay que mantener SO, TLS, backups y despliegue a mano → descartado por C2.

### Variante de framework dentro de (a): React Router 8 (ex-Remix)

`create-react-router` 8.4.0 (2026-09-15) con plantillas `node-postgres` y `node-custom-server` **[V]**. El servidor custom permitiría arrancar el worker en `server.ts` sin `instrumentation.ts`. Es una alternativa seria y más ligera que Next; se prefiere Next por ecosistema (shadcn `init -t next`, `create-next-app` con Biome/AGENTS.md, más contexto de ejemplos), y porque deja abierta la salida (b). No cambia nada de lo demás si el supervisor prefiere RR8.

### Puntuación (1–5, juicio propio, ponderada)

| Criterio (peso) | (a) Next+PG (Heroku/Railway) | (b) Vercel+Inngest+Neon | (c) SvelteKit+SQLite (Fly) |
|---|---|---|---|
| C1 worker (25) | 5 | 3 | 5 |
| C2 ops (20) | 4 | 3 | 4 |
| C3 coste (15) | 4 ($0→$12 o ~$7) | 5 ($0) | 4 (~$3) |
| C4 UI/DX (15) | 5 | 5 | 3 |
| C5 portabilidad (10) | 5 | 2 | 3 |
| C6 madurez (10) | 5 | 4 | 4 |
| C7 secretos/HTTPS (5) | 5 | 4 | 5 |
| **Total** | **4,65** | **3,65** | **4,05** |

## 4. GitHub Student Pack (consulta 2026-09-29)

Fuente principal: <https://education.github.com/pack/offers> (extracto legible) y páginas de partner. La página principal `/pack` se renderiza en cliente y la extracción es **parcial**: la lista de abajo no se garantiza exhaustiva **[NV]**. Vigencia general **[S]**: los beneficios se conceden por periodos de 2 años, GitHub re-verifica la condición de estudiante periódicamente y, sin verificación, GitHub Pro vuelve a Free y los partners dejan de renovar. La documentación oficial consultada no fija plazos ni el efecto de graduarse **[NV en fuente primaria]**.

### Relevantes para hylistats

| Partner | Beneficio concreto | Duración | Condiciones | Uso en hylistats |
|---|---|---|---|---|
| **Heroku** | Crédito $13/mes; válido para Dynos, Postgres y Key-Value (no add-ons de terceros) **[V]** | **24 meses**, una sola vez; el crédito cuenta desde el día 1 del mes de aprobación; no acumulable **[V]** | ≥ 18 años, tarjeta obligatoria para canjear y para cualquier exceso **[V]** | **Hosting principal**: Basic $7 + Essential-0 $5 = $12 ≤ $13 |
| **Microsoft Azure** | $100 de crédito, renovable anualmente mientras se sea estudiante, **sin tarjeta** **[V]**; gratis 12 meses: VM B1s 750 h, PostgreSQL Flexible B1MS 750 h/32 GB, Container Registry; App Service "1 h/día" (inútil para un worker); Container Apps 180 k vCPU·s/mes **[V]** | 12 meses (renovable) | Correo del centro + verificación; el Pack indica 18+ **[V]** | **Plan B**: VM B1s + PG B1MS gratis 12 m. Más ops (SO, TLS). Container Apps: 180 k vCPU·s ≈ 50 h de 1 vCPU, insuficiente para 24/7 **[I]** |
| **Name.com** | Dominio gratis con 25+ extensiones (.dev, .app, .live, .studio…) **[V]** | **1 año**; no aplica a renovaciones ni a premium **[S]** | Cuenta verificada; renovación a precio normal, importe **[NV]** | Dominio opcional (ver más abajo) |
| **Namecheap** | Dominio `.me` 1 año + 1 SSL 1 año **[V]** | 1 año | Verificación en nc.me; auto-renueva con aviso 30 días antes **[S]**; renovación `.me`: ~$5 vs ~$20 según fuentes **[NV, discrepan]** | Alternativa a Name.com |
| **Sentry** | 50 k errores, 100 k transacciones, 1 GB adjuntos, 500 replays, Team, sin on-demand **[V]** | 1 año, renovable **[V]** | Estudiante verificado | Opcional; no en v1 |
| **Doppler** | Team gratis **[V]** | Mientras seas estudiante | Estudiante activo | Gestor de secretos; innecesario (basta con las config vars del host) |
| **Codecov** | Gratis en repos públicos y privados **[V]** | Mientras seas estudiante | — | Opcional (cobertura en CI) |
| **GitHub Pro / Actions** | Pro gratis mientras estudiante; el Pack anuncia minutos de Actions ilimitados en privados **[NV: el resumen puede confundir con la cuota de Pro]** | Mientras estudiante | — | CI: en repo público Actions es gratis igualmente |
| Honeybadger, Datadog (2 años), New Relic, Blackfire | Monitorización/uptime/errores gratis **[V, según extracto]** | 1–2 años / mientras estudiante | — | Descartados: sobra para una app de amigos |
| MongoDB Atlas ($50), SQLGate, PopSQL, Deepnote | BD documental / clientes SQL **[V, según extracto]** | Varía | — | Atlas descartado (no relacional). PopSQL puede servir como cliente Postgres opcional |
| Appwrite Education | 2 proyectos, límites de Appwrite Pro **[V, según extracto]** | Mientras estudiante | — | Descartado: BaaS distinto de la arquitectura |

### Ya no disponible

- **DigitalOcean ($200/año)**: **el crédito del Pack terminó**. La oferta cerró el 2026-07-31 y todos los créditos (incluidos los ya canjeados) expiraron el 2026-08-01 (anuncio oficial de GitHub en Community #201240 **[V]**; la página `/pack/offers` ya no lo lista **[V]**). No contar con él. Cualquier guía que lo cite está desactualizada.

### Qué cambia en la elección

- **Hosting**: sí cambia. Sin Pack, la elección es Railway (~$6–8/mes **[I]**). Con Pack, **Heroku queda gratis 24 meses** y encaja con (a) sin tocar el diseño. La condición es mantener la app portable.
- **Dominio**: el Pack lo hace gratis el primer año; no es necesario (la URL `*.herokuapp.com` basta para una web no publicitada). Si se quiere uno, Name.com `.dev`/`.app` (HTTPS obligatorio, encaja con el despliegue). Tras 1 año, renovar o volver a la URL del host.
- **Monitorización/CI**: gratis pero no se adopta por simplicidad. CI mínimo con GitHub Actions.

### Qué pasa al caducar

1. **Heroku (mes 25)**: la factura pasa a $12/mes en la tarjeta. Opciones: quedarse, o migrar a Railway/Fly (Postgres dump/restore + variables de entorno; ≤ 1 h de trabajo **[I]**). Con Postgres estándar y sin APIs de Heroku la migración es mecánica. Acordarse de: alerta en calendario ~mes 22, y considerar que **no se sabe** si el crédito se mantiene si la verificación de estudiante caduca antes de los 24 meses **[NV]** → comprobar la fecha real de fin de estudios/reverificación del supervisor.
2. **Dominio (mes 13)**: renueva a precio normal o se abandona; cambiar de dominio solo obliga a actualizar el enlace compartido en el grupo (F9: "se comparte por enlace").
3. **Sentry/Codecov (si se usan)**: dejan de ser gratis; no hay dependencia dura, se quitan.
4. **Datos**: son re-derivables desde Riot (mientras las partidas estén dentro de los ~2 años de retención) → la pérdida de la BD no es catastrófica (ver §7).

## 5. Blueprint y scaffolding

**No hay plantilla única** que cubra Next + Drizzle + Postgres + shadcn + charts + worker. Opciones revisadas:

| Plantilla | Estado (consulta 2026-09-29) | Veredicto |
|---|---|---|
| `create-next-app` 16.3.7 | Oficial; TS, Tailwind, Biome o ESLint, App Router, `AGENTS.md`+`CLAUDE.md` **[V]** | **Base elegida** |
| `shadcn` CLI 4.21.0 (`init -t next`, `add chart`) | 124 k★, activo **[V]** | Capa de UI |
| `create-t3-app` 7.40.0 | Última publicación 2025-11-05, último push 2025-12-13 **[V]**; trae tRPC/NextAuth que no se usan | Descartado (más piezas, más antiguo) |
| `create-better-t-stack` | 5,8 k★, push 2026-09-27 **[V]**; combina tRPC/auth/etc. | Descartado (sobra) |
| `create-react-router` 8.4.0 plantillas `node-postgres`/`node-custom-server` | Oficial **[V]** | Alternativa a Next, no elegida |
| `sv create` (SvelteKit) con add-ons | Oficial, el más completo de fábrica **[V]** | Opción (c) |
| Templates de Railway / Heroku (botón deploy) | No evaluados en detalle **[NV]** | No hacen falta: Next + Postgres se despliega con Nixpacks/buildpack sin plantilla |

**Comando propuesto** (npm disponible localmente: Node v26.9.0, npm 11.19.1; `pnpm` no está instalado; **no ejecutado**):

```bash
npx create-next-app@latest hylistats --ts --tailwind --biome --app --src-dir --import-alias "@/*" --use-npm --turbopack
cd hylistats
npx shadcn@latest init -t next
npx shadcn@latest add button card badge input tabs tooltip skeleton table chart
npm i drizzle-orm pg zod @tanstack/react-query
npm i -D drizzle-kit @types/pg vitest tsx
```

(Si el CLI de create-next-app pregunta por opciones no cubiertas por flags, `--yes` acepta los valores por defecto/anteriores. Revisar que la salida cumpla: TS, Tailwind 4, Biome, `src/`.) Versiones actuales de referencia: `react` 19.3.0, `typescript` 7.0.2, `vitest` 5.0.2, `@biomejs/biome` 2.5.14, `recharts` 3.10.1, `@tanstack/react-query` 5.104.0, `zod` 4.6.5, `pg` 8.23.0 (todas npm 2026-09-29 **[V]**).

**Qué hay que añadir encima** (estructura, no código):

- Fase development key (§7.1): tabla `settings` (`riot_api_key`, `key_status`, `key_kind`, `updated_at`), página `src/app/admin/` con formulario y validación previa de la key, `api/health`, y `scripts/db-reset.ts`.
- `src/db/schema.ts` + `drizzle.config.ts` (dialecto `postgresql`, driver `pg`, SSL activo para Heroku) + migraciones versionadas; script `migrate` que se ejecuta en la fase `release` (Heroku) o pre-deploy.
- `src/worker/`: `main.ts` (bucle, advisory lock, prioridades y round-robin de I2), `limiter.ts` (dos ventanas: 20/1 s y ~90/120 s con margen 10 %), `riot-client.ts`, `jobs.ts`. `instrumentation.ts` en la raíz de `src/` que llama a `startWorker()` sin `await`. Entrada alternativa `tsx src/worker/main.ts` para correr el worker en solitario (pruebas o 2º servicio).
- `src/lib/ddragon.ts` (versión de parches, mapa `championId`↔`key`), `next.config.ts` con `images.unoptimized`, cabeceras `X-Robots-Tag`, `output: 'standalone'` solo si se usa Docker.
- Tests: Vitest para el limiter, el mapeo de Match-V5 a filas y las agregaciones (winrate, campeones ganados, compañeros), con **fixtures reales** de I1.
- CI: workflow con `biome ci`, `tsc --noEmit`, `vitest run`.
- Descargo de Riot en el footer (política, I1 §11).

**Prisma**: descartado. `prisma` 8.0.0-rc.19 (RC, publicado hoy) **[V]**; Drizzle 0.45.3 (35,9 k★, push 2026-09-29) es SQL-first y sin motor binario, y permite cambiar de dialecto si algún día se quisiera SQLite.
**Gráficas**: Recharts 3.10.1 (27,6 k★, activo) **[V]** vía shadcn `chart`. `visx` (`@visx/xychart` 4.0.0, push 2026-06-22) es más bajo nivel; Chart.js 4.5.1 (última publicación 2025-10-13) y Nivo (0.99.0, 2025-05) están más parados; Tremor (3.18.7, 2025-01) parado. Ninguno mejora a shadcn+Recharts para gráficas de evolución sencillas.

## 6. Cliente Riot

**Recomendación: cliente propio y fino, sin librería.**

- Superficie necesaria mínima (I1): Account-V1 por Riot ID, Match-V5 ids + detalle (host `europe`), Challenges-V1 `player-data` y Summoner-V4 (host `euw1`). 4–5 endpoints GET.
- Ninguna librería está verificada con queue 1750 ni con `playerSubteamId`/`placement` de Arena tríos (I1 §12). `twisted` 1.83.0 (2026-08-18, 150★, MIT, push 2026-09-11) es la única TypeScript activa **[V]**; `@fightmegg/riot-api` 0.0.21 lleva más de un año sin publicar **[V]**; `galeforce` con estado incierto **[NV]**.
- Lo importante no lo resuelve una librería: el limiter **global por host con prioridades y round-robin entre perfiles** (I2 §2). Un limiter por instancia de librería no lo cubre. `bottleneck` 2.19.5 sin publicar desde 2023 **[V]**; `p-queue` 9.3.3 solo maneja una ventana; `limiter` 4.1.0 (2026-09-11) es un token bucket simple **[V]**. Un log deslizante de timestamps de ~40 líneas con dos ventanas es más simple y testeable.
- Diseño: `riotFetch(host, path, priority)` → limiter → `fetch` con la key (leída de `settings`/entorno en cada llamada, para que un cambio desde `/admin` surta efecto sin reinicio; §7.1) en cabecera `X-Riot-Token` → política de errores de I2 §2 (429 con `Retry-After`; 5xx backoff con jitter máx. 5; 404 `missing`; 401/403 pausa el worker y avisa en UI). Esquemas Zod solo de los campos usados; los fixtures de I1 son los tests de contrato. La key nunca sale del servidor (módulo con `import 'server-only'`).
- Tipos: la spec OpenAPI comunitaria (I1 §12) puede servir de referencia, sin dependencia.
- **Cola**: tablas propias (`sync_jobs`, `match_fetch`) con `SELECT … FOR UPDATE SKIP LOCKED`, tal como I2. `pg-boss` 12.35.0 (activo) **[V]** no aporta el limiter ni el round-robin ni el dedupe por `matchId`, y añade su propio esquema → descartado.

## 7. Hosting y despliegue

| Tema | Decisión |
|---|---|
| **Secretos** | `DATABASE_URL` y `ADMIN_TOKEN` como *config vars* del host (Heroku: `heroku config:set`; Railway: variables). La **development key** (24 h) vive en la BD y se cambia desde `/admin` (§7.1); la futura **Personal key** iría en `RIOT_API_KEY` (entorno) como fallback. Nunca en el repo ni con prefijo `NEXT_PUBLIC_`. `.env.local` en `.gitignore`. Doppler (gratis con el Pack) no hace falta. Las keys son de una cuenta individual y se regeneran desde el portal. |
| **HTTPS** | Heroku Basic incluye SSL gratis **[V]**; Railway y Fly gestionan certificados. Riot exige HTTPS (I1 §11). Dominio propio opcional. |
| **`noindex`** | Tres capas, todas en código: `robots.txt` con `Disallow: /`, `<meta name="robots" content="noindex,nofollow">` y cabecera `X-Robots-Tag: noindex, nofollow` en `next.config.ts` (la cabecera cubre también respuestas sin HTML). `robots.txt` por sí solo no impide indexar una URL enlazada. Si el enlace se filtra (F9), añadir un código de acceso común con una cookie comprobada en `proxy.ts` de Next; no en v1. |
| **Persistencia** | Postgres gestionado (Heroku Essential-0: 1 GB, muy por encima de las decenas de MB previstas; 20 conexiones: usar un pool pequeño de `pg`, máx. ~5, para web+worker). Sin disco local: el FS de Heroku es efímero **[D conocido]**. |
| **Backups** | Heroku Postgres: backups físicos continuos y lógicos diarios con PGBackups incluidos en los planes **[V]**; retención concreta **[NV]**. Criticidad baja: todo lo del servidor se **re-deriva** con un backfill (10–30 min) mientras las partidas estén en la retención de Match-V5 de ~2 años (I2 §0); los datos personales (objetivos, marcas) viven en `localStorage` (F6). Hacer un `pg_dump` manual antes de migrar de host. Sin infraestructura de backup propia en v1. |
| **Una sola instancia del worker** | `heroku ps:scale web=1` (nunca escalar) + `pg_try_advisory_lock(<id fijo>)` al arrancar el bucle: si otro proceso tiene el lock (solape de deploy), el nuevo espera y reintenta cada N s. El lock se libera solo si cae la conexión. Recomendado además `WORKER_ENABLED=true` solo en el servicio que corresponda. |
| **Deploy** | Heroku: conexión GitHub → deploy automático desde `main`, `Procfile`: `release: node scripts/migrate.js` y `web: npm start` (`next start` respeta `$PORT`). Fijar `engines.node` a una LTS soportada por el buildpack (**[NV]** cuál, hoy Node local es 26.9.0 y podría no ser LTS). |
| **Salud** | Endpoint `/api/health` (BD + estado del worker: última actividad, jobs pendientes, key OK) para diagnosticar sin logs. Es lo que la UI usa para avisar de key caducada (I2 §2). |
| **Riot policy** | Personal key + web accesible por URL: confirmar con Riot qué es "consumo público" (abierto en I1). El stack no cambia si hay que pedir Production key. Con la **development key** (situación actual) el margen es aún menor: ver §7.1. |

### 7.1 Fase con development key (sin Personal key; caduca cada 24 h)

Contexto: registrar el producto (necesario para la Personal key, igual que para la Production key) no es posible ahora, así que el desarrollo y las primeras pruebas del grupo irán con la development key: mismos límites (20 req/s, 100 req/2 min por host, I1 §10), pero **caduca a las 24 h** y se regenera a mano en el portal de Riot (login; no es automatizable ni se debe intentar). Es una tarea diaria de ~1 minuto que el diseño debe abaratar al máximo.

**Cómo rotar la key sin redeploy** (opciones evaluadas):

| Opción | Reinicio | Código | Veredicto |
|---|---|---|---|
| Variable de entorno del host (`heroku config:set` / panel de Railway) | Sí: el host reinicia el proceso al cambiar una variable (Heroku lo hace **[D conocido, NV hoy]**) | 0 líneas | Válida y la más simple; el reinicio es inocuo (cola en BD) pero exige CLI/panel del host cada día |
| **Fila en BD (`settings`) + página `/admin` para pegarla** | **No** | ~60 líneas | **Recomendada**: se pega desde el móvil o el navegador en 10 s; el worker la relee al vuelo |
| Fichero montado / secret recargable | Depende | Más | Descartada: no encaja con Heroku (FS efímero) y añade piezas |
| Gestor de secretos (Doppler, gratis con el Pack) | Sí, hay que recargar | SDK + cuenta | Descartada: resuelve otro problema |

**Diseño recomendado** (estructura, no código):

1. **Fuente de la key**: el worker y el cliente Riot leen `settings.riot_api_key` (BD); si no existe, usan `RIOT_API_KEY` del entorno. Así el día que llegue la Personal key basta con ponerla en el entorno y borrar la fila. La clave **nunca** se devuelve por ninguna API ni se loguea (redactar en logs); vive solo en servidor. El dev key vale 24 h y la BD está cifrada en reposo por el proveedor (Heroku Postgres lo declara **[V]**), riesgo aceptable; la Personal key, cuando exista, va solo en el entorno.
2. **`/admin`**: un formulario con un campo para la key, protegido por `ADMIN_TOKEN` (variable de entorno, comparación en tiempo constante, cookie de sesión de admin `httpOnly`+`Secure`; solo por HTTPS). Al enviar, el servidor **valida la key con una llamada barata** (Account-V1 por un Riot ID conocido, endpoint ya verificado en I1) **antes de guardarla**; si falla, no se guarda y se muestra el error. Sin librería de auth: no es login de usuarios (F5), es un secreto de operador.
3. **Máquina de estados del worker** (`settings.key_status`): `ok` → (401/403) → `invalid` (pausado) → (key nueva validada) → `ok`.
   - Ante 401/403 el worker **para de sacar jobs**, devuelve el job en curso a `pending` sin consumir reintento, y guarda `key_status='invalid'`, `key_status_since` y el motivo. No martillea: no hay más llamadas a Riot mientras esté `invalid`.
   - La **UI pública** muestra un aviso ("Actualización pausada: key caducada. Los datos son los de la última sincronización") a partir de `/api/health`, sin exponer nada más. Los perfiles siguen mostrando lo ya guardado (lectura solo de BD).
   - **Reanudación**: al guardar una key válida desde `/admin`, se marca `ok` y se **despierta** al worker (señal en proceso; si algún día el worker fuese otro servicio, el bucle consulta `settings.updated_at` cada 10–15 s mientras está pausado). Los jobs `pending` continúan donde estaban (cursor en BD, I2 §2).
   - Caducidad esperada: como caduca cada 24 h, el 401/403 de todas las mañanas es **el flujo normal**, no un error; conviene un aviso más amable en `/admin` ("caduca ~<hora de la última key + 24 h> [I]") para renovarla antes de que el grupo juegue.
4. **BD desechable mientras se use la development key.** Los PUUID están cifrados por proyecto (I1 §11; I2 §5): al registrar el producto y obtener la Personal key **cambiarán** todos los `puuid` guardados (perfiles y los 18 participantes de cada partida). Consecuencias de diseño:
   - `settings.key_kind` (`dev` | `personal`) registra con qué tipo de key se pobló la BD. Si el tipo cambia, el worker **no arranca** hasta ejecutar el reset explícito (evita mezclar PUUID de dos proyectos).
   - `npm run db:reset` (script de desarrollo): trunca `profiles`, `matches`, `participants`, `sync_jobs`, `match_fetch` y conserva `settings` y las migraciones. Tras el cambio de key se re-registran los perfiles (Riot ID → PUUID nuevo) y se repite el backfill (~10–30 min, I2 §1). Es la opción más simple frente al re-mapeo por `riotIdGameName#riotIdTagline` de I2 §5, que queda como plan B si algún día hubiera datos que no se quieran perder **[I]**.
   - **El puuid no sale nunca de la BD**: URLs públicas (F5) y `localStorage` (F6) usan **región + Riot ID** y `championId`, que no cambian con el reset. Así "mi perfil", favoritos, objetivos y marcas manuales de cada amigo **sobreviven al reset**. Regla de diseño para Spec: prohibido usar `puuid` en URLs, `localStorage` o exports/imports.
   - No merece la pena invertir en backups de la BD de desarrollo.
5. **Cuándo desplegar.** Con la development key no hay urgencia por un host público: el desarrollo corre en local (`next dev` + Postgres local o Docker) con la key pegada en `/admin` local. El crédito de Heroku del Pack (24 meses, contado desde el mes de aprobación **[V]**) se consume igual aunque la app esté casi parada: **canjearlo justo cuando el grupo empiece a probar**, no antes **[I]**. Mientras tanto no hay coste.
6. **Exposición durante la fase dev-key.** La development key es aún más restrictiva que la Personal (pensada para desarrollo; qué tolera Riot con unos amigos probando **[NV]**, no confirmado). Recomendación: mientras se use, activar desde el principio el **código de acceso común** (cookie comprobada en `proxy.ts`) que F9 dejaba como plan de contingencia, y no compartir la URL fuera del grupo. `noindex` sigue igual.
7. **Impacto en el stack.** Ninguno en la elección (Next + Drizzle + Postgres + worker en proceso + Heroku/Railway): el mecanismo son una tabla, una página y una máquina de estados. Lo que sí hace es hacer imprescindible el worker **reanudable** y la **cola en BD** (ya previstos), y descarta soluciones donde el limiter/cola vivan en un SaaS externo con la key dentro (opción (b)) por la rotación diaria.

## 8. Recomendación final

**(a) Next.js 16 + Drizzle + Postgres, worker en el mismo proceso, en Heroku (`eu`) aprovechando el Student Pack; diseñada portable a Railway.**

Con la restricción actual (**solo development key, 24 h, sin Personal key**): key en BD editable desde `/admin` sin redeploy, worker que se pausa con 401/403 y se reanuda al cambiar la key, BD desechable con `db:reset`, `puuid` prohibido fuera de la BD y código de acceso común activado desde el principio (§7.1). Esto refuerza la elección (a) (limiter y cola dentro de tu proceso y tu BD) frente a (b).

Por qué gana: cumple I2 §7 sin piezas extra (proceso persistente, BD relacional, key en servidor, una instancia con advisory lock), tiene el mejor ecosistema de UI (shadcn + Recharts) y sale $0 durante 24 meses. Si el Pack no se puede usar (edad, tarjeta, verificación), la misma app va a Railway por ~$6–8/mes.

**Descartado y por qué**

- **DigitalOcean**: el crédito del Pack terminó (2026-08-01).
- **(b) Vercel + Inngest + Neon**: $0 pero tres proveedores, worker troceado en steps, Neon posiblemente sin cuota con la pantalla abierta 24/7, salida cara.
- **(c) SvelteKit + SQLite + Fly**: casi igual de bueno (~$3/mes, scaffold más completo) pero UI/charts menos maduros y SQLite+volumen ata a un host con disco. Es el plan B si se prefiere SQLite/pagar poco desde el día 1.
- **Prisma** (RC), **create-t3-app / better-t-stack** (piezas que sobran), **pg-boss** (no cubre el limiter), **`twisted`** (no verificada con tríos, limiter por instancia), **Render/Supabase/Neon free** (sleep/caducidad/pausa: Supabase pausa a 1 semana de inactividad **[V]**, 2 proyectos máx.), **VPS Hetzner** (ops manual).
- **Sentry/Datadog/Doppler/Codecov**: gratis con el Pack pero innecesarios en v1.
- **Azure** (VM B1s + PG B1MS gratis 12 m): plan B con más ops.

### Decisiones abiertas para el supervisor

| # | Decisión | Recomendación |
|---|---|---|
| D1 | ¿Heroku con el Pack ($0, 24 m) o Railway desde el día 1 (~$6–8/mes)? | Heroku + app portable. Comprobar antes: ≥ 18 años, tarjeta, Pack verificado y fecha real de reverificación/fin de estudios (¿mantiene Heroku el crédito si el Pack caduca antes de los 24 meses? **[NV]**) |
| D2 | Postgres (recomendado) vs SQLite | Postgres: FS efímero en Heroku, web+worker concurrentes, portabilidad. SQLite solo si se elige (c)/Fly |
| D3 | Next.js vs React Router 8 vs SvelteKit | Next.js (ecosistema shadcn/Recharts, familiaridad). RR8 es aceptable; SvelteKit solo con (c) |
| D4 | Worker en el mismo proceso vs segundo servicio | Mismo proceso ahora (un dyno, $0 con el Pack); separar si la RAM del dyno (512 MB **[NV]**) o el hook de `instrumentation.ts` dan problemas. Un 2º dyno Basic ($7) supera el crédito de $13 por $1 |
| D5 | Dominio propio | Opcional; si se quiere, Name.com `.dev`/`.app` gratis 1 año. Sin dominio no se pierde nada |
| D6 | Cliente Riot propio vs `twisted` | Propio (ver §6) |
| D7 | Sentry (gratis 1 año) | No en v1; añadir solo si aparecen errores difíciles de diagnosticar con `/api/health` + logs |
| D8 | Personal key: **no disponible ahora** (registrar el producto no es posible). Se desarrolla y prueba con la development key (24 h); I2 §5 recomendaba pedirla al empezar Execute, ya no aplica | Desarrollar con la dev key, tratar la BD como **desechable** y hacer `db:reset` + re-backfill al llegar la Personal key. Registrar el producto en cuanto sea posible: es lo que quita la rotación diaria y el reset |
| D9 | Candado de acceso (F9 lo dejaba solo si el enlace se filtra) | **Cambia mientras se use la dev key**: activar ya un código común (cookie en `proxy.ts`), porque la dev key es aún más restrictiva que la Personal y qué se tolera **[NV]**. Volver al criterio de F9 con la Personal key |
| D10 | Cómo rotar la key diaria | Fila en BD + `/admin` con `ADMIN_TOKEN`, validación previa y reanudación automática del worker (§7.1). Alternativa mínima sin código: `heroku config:set RIOT_API_KEY=…` (reinicia el dyno, inocuo pero incómodo cada día) |
| D11 | Cuándo canjear el crédito de Heroku y desplegar | Cuando el grupo empiece a probar; hasta entonces desarrollo en local con la key pegada en `/admin` local. El crédito de 24 meses corre desde el mes de aprobación **[V]** |
| D12 | Reset de BD al cambiar de key: `db:reset` + re-backfill (recomendado) vs re-mapeo por Riot ID (I2 §5) | Reset: más simple, coste ~10–30 min por grupo. Re-mapeo solo si hubiera datos irrecuperables (no los hay en v1). Prohibir `puuid` en URLs/`localStorage` para que el reset sea invisible al usuario |

## 9. Fuentes (consultadas 2026-09-29)

**Precios y límites**
- Railway pricing: <https://railway.com/pricing>; planes: <https://docs.railway.com/reference/pricing/plans>; volúmenes: <https://docs.railway.com/reference/volumes>; regiones: <https://docs.railway.com/reference/deployment-regions>
- Fly.io pricing: <https://docs.fly.io/about/pricing/>; free trial: <https://docs.fly.io/about/free-trial/>
- Render free: <https://render.com/docs/free>; precios de pago (secundaria): <https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses>
- Heroku pricing: <https://www.heroku.com/pricing>; Eco dyno hours: <https://devcenter.heroku.com/articles/eco-dyno-hours>; Postgres Essential: <https://devcenter.heroku.com/articles/heroku-postgres-plans>; regiones: <https://devcenter.heroku.com/articles/regions>
- Vercel límites de funciones: <https://vercel.com/docs/functions/limitations>; cron: <https://vercel.com/docs/cron-jobs/usage-and-pricing>
- Neon: <https://neon.com/pricing>; Turso: <https://turso.tech/pricing>; Supabase: <https://supabase.com/pricing>; Inngest: <https://www.inngest.com/pricing>, throttling: <https://www.inngest.com/docs/guides/throttling>; Trigger.dev: <https://trigger.dev/pricing>
- Hetzner (secundaria): <https://comparedge.com/tools/hetzner/pricing>, <https://costgoat.com/pricing/hetzner>

**GitHub Student Pack**
- Pack y ofertas: <https://education.github.com/pack>, <https://education.github.com/pack/offers>
- Heroku para estudiantes: <https://www.heroku.com/github-students>
- Azure for Students: <https://azure.microsoft.com/en-us/free/students>
- DigitalOcean deja el Pack: <https://github.com/orgs/community/discussions/201240>
- Name.com / Namecheap: <https://github.com/namedotcom/student-pack>, <https://nc.me/landing/github> (detalles de renovación: fuentes secundarias, no verificados)
- Vigencia y reverificación (secundarias): <https://github.com/orgs/community/discussions/144470>, <https://perkstack.co/blog/github-student-pack-guide>

**Scaffolding y librerías**
- `create-next-app`: <https://nextjs.org/docs/app/api-reference/cli/create-next-app>; self-hosting: <https://nextjs.org/docs/app/guides/self-hosting>; instrumentation: <https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation>
- shadcn CLI: <https://ui.shadcn.com/docs/cli>; charts: <https://ui.shadcn.com/docs/components/chart>
- `sv create`: <https://svelte.dev/docs/cli/sv-create>; add-on drizzle: <https://svelte.dev/docs/cli/drizzle>
- React Router: <https://reactrouter.com/start/framework/installation>, <https://github.com/remix-run/react-router-templates>
- Versiones: `npm view <pkg> version` (2026-09-29). Repos (GitHub API): `vercel/next.js`, `shadcn-ui/ui`, `drizzle-team/drizzle-orm`, `recharts/recharts`, `airbnb/visx`, `t3-oss/create-t3-app`, `AmanVarshney01/create-better-t-stack`, `sveltejs/kit`, `remix-run/react-router`, `justadev-afk/twisted`.
- Riot (contexto): I1 `.dev/research/riot-api.md` §11–12; portal <https://developer.riotgames.com/docs/portal>.
