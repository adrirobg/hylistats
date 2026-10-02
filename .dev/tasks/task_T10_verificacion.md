# Task T10 — Verificación: mediciones, verify-report y prueba en producción

**Owner**: orchestrator
**Estado**: in_progress *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

`.dev/verify-report.md` con la evidencia de AC1–AC9 y AC12, AC11 como gate manual abierto (F18) y, tras la release `v1.1.0`, AC10 (prueba de carga en producción) añadido.

## Contexto <!-- SHOULD -->

- spec.md: **AC1–AC12**; Estrategia → Entrega.
- think.md: F18; F26; F27.
- research: `carga-y-refrescos.md` §1–§2 (el "antes" de producción: 502 del 2026-10-02 y reproducción de las 21:41).
- Script de T08; mediciones de T06 y T08; MCP de Render (CPU, eventos `server_failed`).

## Prompt / instrucciones para worker <!-- MUST -->

1. Tests y calidad: `npm run lint && npm run typecheck && npm test && npm run build` en verde (AC12).
2. **AC8** (local, build de producción de la rama): script de T08 en modo `despues`, 5 clientes en la pestaña Grupo, 5 min en reposo → 0 renders de página; un "Actualizar grupo" a mitad → cálculos de `GroupView` (contador de T03) = cambios de versión del grupo; propagación ≤ 10 s entre dos pestañas reales. Comparar con el "antes" de T08.
3. **AC1–AC7** y **AC9**: evidencia de las tasks (tests, grep sin pollers sueltos, navegador para AC2 y AC5, tamaños de AC6).
4. Escribir `.dev/verify-report.md` con AC10 y AC11 abiertos, antes de la PR.
5. **Tras la release `v1.1.0`** (runbook de T01; la PR `develop → main` la mergea el supervisor): con el sí del supervisor en el momento y en un rato sin partidas, script de T08 contra `https://hylistats.onrender.com` (5 clientes, 15 min, "Actualizar grupo" a mitad desde una pestaña real); gates 0 respuestas 502, 0 `server_failed` (MCP de Render) y estado < 1 s; registrar p50/p95 y CPU. Añadir el resultado de AC10 al verify-report (en `develop`). Si falla, hotfix (P6).

## Criterios de aceptacion <!-- MUST -->

- [x] AC1–AC9 y AC12 con evidencia en el verify-report.
- [x] AC8 medido antes y después en local.
- [x] AC11 registrado como gate manual abierto (F18).
- [ ] AC10 ejecutado tras la release y añadido al verify-report.

## Evidencias <!-- MUST -->

- `.dev/verify-report.md` escrito con PASS: AC1–AC9 (salvo entrega) y AC12 con evidencia; AC8 antes 21 renders/min → después 0 tras las cargas, 1 cálculo de `GroupView` para 5 visores, 95 cálculos = 95 versiones durante el backfill, 0 tras "Actualizar grupo" sin partidas; navegador con el worker real (BD local migrada a la Personal key por decisión del supervisor). AC10 y AC11 abiertos.
- Pendiente: AC10 tras la release `v1.1.0`.
