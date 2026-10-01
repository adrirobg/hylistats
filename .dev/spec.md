# Spec: hylistats — iter-07 despliegue en Render y Supabase
**Estado**: aprobada (issue [#13](https://github.com/adrirobg/hylistats/issues/13), aprobada por el supervisor, 2026-10-02)
**Consume**: think.md → hilo "Hosting/publicación y código de acceso", F9, F12, F18, F22; `.dev/research/stack.md` §3(a) y §7; comparativa de hosting con el supervisor (2026-10-01/02)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

## Objetivo <!-- MUST -->

Publicar hylistats en **Render Free** (web + worker, Frankfurt) con **Supabase Free** (Postgres, Frankfurt), con los datos actuales del grupo, a coste €0 y sin cambiar la arquitectura (Next.js + worker en el mismo proceso + Postgres).

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Repo listo para Render**:
  - Node fijado a la 24 LTS con límite superior (Render resuelve `engines` sin techo a la última versión).
  - Migraciones **al arrancar**: el *pre-deploy command* de Render no existe en instancias gratuitas, así que el arranque aplica `db:migrate` y después `next start`. Las migraciones de Drizzle son idempotentes.
  - Build con `npm ci && npm run build`; `next start` escucha en `$PORT`.
- **Supabase** (proyecto ya creado por el supervisor en `eu-central-1`, Data API desactivada, RLS automático activado):
  - Conexión por el **pooler Supavisor en modo session** (puerto 5432, IPv4). El modo transaction (6543) no sirve: rompe el `pg_try_advisory_lock` del worker y las sentencias preparadas. La conexión directa es solo IPv6.
  - Esquema aplicado con las migraciones de Drizzle.
- **Datos**: `pg_dump` de solo datos del Postgres local (contenedor Docker, Postgres 17) y restauración en Supabase, sin volver a descargar partidas de Riot. Comprobación de recuentos por tabla.
- **Servicio en Render** creado con el MCP de Render: nombre `hylistats` (`hylistats.onrender.com`), región Frankfurt, plan Free, deploy automático desde `main`, health check en `/api/health`. Los secretos (`DATABASE_URL`, `ADMIN_TOKEN`) los introduce el supervisor en el panel; no pasan por el chat ni por el repo.
- **Documentación**:
  - `AGENTS.md`: sección "Stack e infraestructura" (stack y versiones, worker en proceso, hosting, MCPs del proyecto, reglas: secretos fuera del repo, pooler en modo session, una sola instancia). `CLAUDE.md` no se toca: ya remite a `AGENTS.md`.
  - `docs/deploy.md`: runbook (cómo se despliega, variables de entorno, rotación de la dev key, backup y restauración con `pg_dump`, pausa de Supabase, sueño de Render, límites del plan gratis, cómo subir a Render Starter).
  - `.mcp.json` del proyecto (MCP de Supabase limitado al proyecto y a `docs,database,debugging,development`).
- **think.md**: decisión F22 (hosting) y actualización del hilo de hosting.

**No incluye** <!-- SHOULD -->:
- Código de acceso común (F9: solo si el enlace se filtra).
- Protección frente al abuso de las server actions públicas (registro y refrescos): sigue como hilo abierto; la mitigación de hoy es F9 (`noindex`, enlace compartido solo en el grupo).
- Dominio propio (basta `*.onrender.com`).
- Pinger para evitar que Render se duerma; se decide tras la sesión con el grupo.
- Rediseño serverless (Vercel), Render Starter u otro hosting de pago.
- Personal key de Riot (el producto se podrá registrar ahora que hay URL; es un hilo aparte).
- Backups automáticos.

## Entregables <!-- MUST -->

| # | Entregable | Descripción |
|---|------------|-------------|
| 1 | Repo desplegable | Versión de Node fijada, arranque con migraciones, `.mcp.json` |
| 2 | BD en Supabase | Esquema migrado y datos locales restaurados, con recuentos comprobados |
| 3 | Servicio en Render | `hylistats` en Frankfurt, Free, autodeploy desde `main`, health check |
| 4 | Documentación | Sección en `AGENTS.md` y `docs/deploy.md` |
| 5 | Verificación | `.dev/verify-report.md` contra la URL pública |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Repo.** `npm run lint && npm run typecheck && npm test && npm run build` en verde. El desarrollo local (`npm run dev` contra Docker) no cambia. La versión de Node tiene límite superior y Render la respeta (log de build).
- [ ] **AC2 — Esquema y datos.** Las migraciones aplicadas en Supabase coinciden con `drizzle/`. Los recuentos de cada tabla en Supabase coinciden con los del Postgres local en el momento del volcado.
- [ ] **AC3 — Despliegue.** El servicio `hylistats` en Render (Frankfurt, Free) despliega desde `main` (o desde la rama durante la verificación) y el arranque aplica las migraciones sin error.
- [ ] **AC4 — Web pública.** Sobre HTTPS en `hylistats.onrender.com` cargan la portada, el perfil de los 6 miembros (con álbum, Estadísticas, Compañeros y Partidas), `/grupo` y `/admin` (login). Los valores de cabecera de perfil (partidas, 1º, campeones ganados) coinciden con los de local para los 6 miembros.
- [ ] **AC5 — Salud y worker.** `/api/health` responde OK con BD conectada y worker activo (con el lock). Con una dev key válida pegada en `/admin`, el worker se reanuda y un "Actualizar" en un perfil encola un incremental que termina sin error.
- [ ] **AC6 — Exposición.** En producción, todas las respuestas llevan `X-Robots-Tag: noindex, nofollow`, `robots.txt` deniega todo y no hay secretos en el repo ni en las respuestas (`/api/health` no expone key ni token).
- [ ] **AC7 — Sueño y reanudación.** Tras dormirse el servicio (15 min sin tráfico), la primera visita lo despierta, la web responde y el worker vuelve a tomar el lock y la cola.
- [ ] **AC8 — Documentación.** `AGENTS.md` describe stack e infraestructura reales y `docs/deploy.md` permite a una sesión limpia redeplegar, rotar la key y restaurar un backup sin este transcript.
- [ ] **AC9 — Aceptación manual (gate del supervisor, F18).** La sesión conjunta de Arena se hace sobre la URL pública. Se valida junto con AC12 de #9, AC11 de #7, AC5 de #3 y AC8 de #2. La PR se mergea con este gate abierto.

## Riesgos y restricciones <!-- MAY -->

- **Recursos del plan gratis**: 512 MB de RAM y CPU muy limitada (0,1 según fuentes no oficiales). El build de Next o el worker podrían ir justos; si el build falla por memoria se escala al supervisor (opciones: Render Starter a $7 o ajustar el build).
- **Solape en deploys**: Render mantiene la instancia vieja 60 s tras arrancar la nueva; el advisory lock garantiza un solo worker activo y las migraciones son idempotentes.
- **Pausa de Supabase**: tras 7 días sin consultas; con uso semanal no debería ocurrir. Se documenta cómo reanudar.
- **Server actions públicas**: con la URL pública cualquiera podría registrar perfiles o refrescar en bucle y gastar el rate limit; aceptado mientras el enlace no se filtre (F9).
- **Política de Riot**: la dev key no está pensada para consumo público; la web no se publicita (F9) y el registro del producto queda como hilo.
- **Secretos**: la contraseña de Supabase y `ADMIN_TOKEN` solo los maneja el supervisor; el volcado local no incluye credenciales de Supabase, y la key guardada en `settings` caduca en 24 h.

## Estrategia de implementacion <!-- SHOULD -->

1. Rama `feat/13-despliegue`, spec y tasks; F22 en `think.md`.
2. Repo desplegable (Node, arranque con migraciones, `.mcp.json`).
3. Supabase: migraciones y restauración de datos (el supervisor proporciona la cadena de conexión en una variable local o ejecuta el comando).
4. Render: crear el servicio con el MCP; el supervisor añade los secretos; primer deploy desde la rama.
5. Documentación (`AGENTS.md`, `docs/deploy.md`).
6. Verify contra la URL pública → Learn → PR → merge → close.
