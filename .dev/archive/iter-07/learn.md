# Learn: hylistats — iter-07 despliegue en Render y Supabase
**Fecha**: 2026-10-02
**Consume**: `spec.md` (AC1–AC9, issue #13), `tasks/` (T01–T05), `verify-report.md` (PASS con AC7 diferido y AC9 abierto), commits `85c4638`…`df60262`
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

iter-07 publica hylistats en <https://hylistats.onrender.com> con coste €0 (Render Free + Supabase Free, ambos en Frankfurt; F22), con los datos del grupo llevados desde local y sin tocar la arquitectura. El grupo empezó a usarla el mismo día. Verify da PASS en AC1–AC6 y AC8; AC7 (sueño y reanudación) queda diferido al uso real por decisión del supervisor y AC9 es el gate de F18.

## Que funciono <!-- MUST -->

- **Elegir el hosting desde la arquitectura, no desde la popularidad.** Leer `instrumentation.ts` y el worker antes de comparar mostró que el requisito duro era un proceso vivo mientras hay trabajo (no 24/7). Eso descartó con razón Vercel/Netlify (lo que usan los amigos del supervisor) y validó Render Free aunque se duerma.
- **Ninguna credencial pasó por el chat.** La contraseña de Supabase vivió en `.env.local` (leída sin imprimirla, comprobando solo forma y longitud) y los secretos de Render los pegó el supervisor en el panel. El MCP de Supabase quedó limitado al proyecto y a 4 grupos de herramientas.
- **El cliente de Postgres del contenedor Docker** sirvió para migrar, volcar y restaurar contra Supabase sin instalar nada en el Mac ni depender del MCP (que no carga hasta reiniciar la sesión).
- **Restaurar en una sola transacción (`psql -1`, `ON_ERROR_STOP`).** El primer intento falló por la fila sembrada de `settings` y no dejó nada a medias; el segundo, con `TRUNCATE settings`, entró limpio.
- **Comparar `/grupo` producción frente a local** (servidor local sin worker para no descargar) validó de una vez todas las métricas agregadas, además de los recuentos SQL.
- **Desplegar desde la rama de la iteración** permitió verificar en producción antes del merge.

## Que ajustar <!-- MUST -->

- **Las pruebas que necesitan ausencia de tráfico van antes de compartir el enlace.** La prueba de sueño (AC7) se lanzó con el grupo a punto de entrar y quedó invalidada. Orden mejor: probar el sueño justo tras el primer deploy correcto y avisar después.
- **El MCP de Render no cubre toda la configuración del servicio** (health check, rama). Conviene listar en la spec qué pasos de panel quedan para el supervisor, para no descubrirlo durante la ejecución.
- **Cambiar la rama del servicio a `main` antes del merge rompería el deploy** (en `main` aún no existe `start:prod`). El orden correcto es merge → cambiar la rama; queda en el runbook y en el cierre.
- **El refresco automático no salta con la pestaña oculta**, también en el navegador integrado: para verificarlo hay que usar una acción interactiva o tráfico real.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F22: Render Free + Supabase Free en Frankfurt | Ratificada | €0, sin tarjeta, sin cambios de código; 170 MB de 512 y páginas de 1–3 s con 0,15 CPU, aceptable para pantalla secundaria |
| Migraciones al arrancar (`start:prod`) | Ratificada | El *pre-deploy* no existe en Free; las migraciones de Drizzle son idempotentes y el arranque las aplicó sin incidencias |
| Pooler Supavisor en modo session | Ratificada | El advisory lock del worker funciona; la conexión directa es solo IPv6 |
| `.node-version` en lugar de `engines` | Corregida (respecto a la spec) | Render y CI lo leen; evita avisos `EBADENGINE` con Node 26 en local |
| Servicio creado con el MCP (sin `render.yaml`) | Ratificada | Un solo servicio; la configuración queda en `docs/deploy.md` |
| Stack e infraestructura en `AGENTS.md`, runbook en `docs/deploy.md`, `CLAUDE.md` sin tocar | Ratificada | Petición del supervisor; una sola fuente (AGENTS.md manda) |

## Deuda y gaps <!-- MAY -->

- AC7 sin verificar: observar en el uso real que, tras dormirse, el servicio despierta y el worker retoma la cola. Diferido; dueño: supervisor.
- Rendimiento con 0,15 CPU (perfiles de 1–3 s, picos de ~7 s en frío). Decidir tras F18 entre mantener o Render Starter ($7).
- Supabase Free sin backups automáticos: solo `pg_dump` manual (documentado).
- El hilo de abuso de las server actions públicas sigue abierto: con la URL pública cualquiera podría registrar perfiles o refrescar en bucle. Mitigación actual: F9.
- Dev key de 24 h: ahora la rotación es en producción (`/admin`); la de local ya no se usa para el grupo.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Tras el merge, cambiar la rama del servicio de Render a `main` (Settings → Build & Deploy → Branch) | Cierre de iter-07 (supervisor) | alta |
| Renovar la dev key en `https://hylistats.onrender.com/admin` (la actual caduca el 2026-10-02 ~15:18 UTC) | `docs/deploy.md` → Rotar la dev key | alta |
| Sesión conjunta de Arena (F18) sobre la URL pública: AC9 de #13 + AC12 de #9 + AC11 de #7 + AC5 de #3 + AC8 de #2 | think.md (hilos AC pendientes) | alta |
| Registrar el producto en Riot ahora que hay URL (Personal key) | think.md → hilo "Registro del producto" | media |
| Decidir protección de las server actions públicas si el enlace se comparte fuera del grupo | think.md → hilo "Abuso de las server actions públicas" | media |
| Revisar rendimiento y sueño tras F18 (Starter o pinger) | think.md → F22 (salidas) | baja |

## Hallazgos para dev-system <!-- MAY -->

- Se repite #24 (iteración sin grill: el alcance sale de la conversación de hosting) y #14 (abrir la iteración a mano).
- Nuevo #25 en `research/dogfood-log.md`: el template de task no tiene sitio para pasos que solo puede hacer el supervisor en iteraciones de operaciones.

## Candidatos a vault <!-- MAY -->

- Patrón «secreto en `.env.local`, leído sin imprimir» para que el agente opere con credenciales sin que pasen por el chat.
