# Task T05 — Verificación contra la URL pública

**Owner**: orchestrator
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`.dev/verify-report.md` con evidencias de AC1–AC8 contra `hylistats.onrender.com`; AC9 queda como gate manual (F18).

## Contexto <!-- SHOULD -->

- spec.md: **AC1–AC9**.

## Prompt / instrucciones para worker <!-- MUST -->

1. Navegador: portada, 6 perfiles (pestañas), `/grupo`, `/admin`; comparar cabeceras con local.
2. `curl`: `X-Robots-Tag`, `robots.txt`, `/api/health` sin secretos.
3. Worker: key en `/admin` (supervisor), "Actualizar" → job terminado en `sync_jobs`.
4. Sueño: esperar >15 min sin tráfico, despertar y comprobar health y cola.

## Criterios de aceptacion <!-- MUST -->

- [ ] Evidencias de AC1–AC8 en `verify-report.md`, veredicto explícito.

## Evidencias <!-- MUST -->

- {pendiente}
