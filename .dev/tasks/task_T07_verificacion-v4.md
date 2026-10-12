# Task T07 — Verificación visual de la revisión v4/v5

**Owner**: orchestrator
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Sección "Revisión v4/v5" del `verify-report.md` con veredicto por AC (AC14–AC22) y capturas a 1440, 700 y 375 px de miembro, otro miembro y no miembro.

## Contexto <!-- SHOULD -->

- spec.md: revisiones v4, v5 y v5b (D1–D12, AC14–AC22).
- Tasks T05, T06, T08, T09 y T10 (commits `2cdcd4f`, `bd71f96`, `734b48d`, `3948eaf`, `dd0750a`).
- App local: config `feat27-noworker` de `.claude/launch.json` (puerto 3005, BD local).

## Prompt / instrucciones para worker <!-- MUST -->

1. Integrar `develop` (PR #26) y repasar que los títulos siguen bien con sus reglas nuevas.
2. `npm run lint && npm run typecheck && npm test && npm run build`.
3. Reiniciar el servidor (memo de la `GroupView`) y, en el navegador, medir las pestañas, el scroll horizontal, los `#refresh-profile` y la pila flotante en Hylimichi (1440, 700 y 375), Krill1nt (1440) y elruffles (1440). Capturas.
4. Escribir la sección de la revisión en `verify-report.md` con veredicto por AC y hallazgos.

## Criterios de aceptacion <!-- MUST -->

- [x] `verify-report.md` con veredicto explícito por AC14–AC22 y evidencias.

## Notas de implementacion <!-- MAY -->

- AC14 en móvil (1214 px > 1000) queda aceptado por el supervisor (2026-10-06).

## Evidencias <!-- MUST -->

- Merge de `develop` en `49559b6` (conflicto solo en la cabecera de `think.md`). Tras el merge, `npm run lint && npm run typecheck && npm test && npm run build`: EXIT 0 (Biome 252 archivos, 76 archivos y 1550 tests, build OK).
- Navegador: pestañas en 662 px (Hylimichi, 1440×860), 1181 px (700) y 1214 px (375); elruffles 413 px; scroll horizontal 0 y un solo `#refresh-profile` en todos; pila con pausa + Arena (Hylimichi) y pausa + Dios de Arena + «+1 aviso» (elruffles). Capturas en `.dev/research/cabecera/verify-v4/` (`hylimichi-1440.jpg`, `hylimichi-700.jpg`, `hylimichi-375.jpg`, `krill1nt-1440.jpg`, `elruffles-1440.jpg`).
- `.dev/verify-report.md`, sección "Revisión v4/v5 (2026-10-12)": PASS (AC14 en móvil aceptado); commit `e0edeb1`. PR #28 mergeada por el supervisor (`9731003`).
