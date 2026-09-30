# Learn: hylistats — iter-02 perfil y álbum de campeones
**Fecha**: 2026-09-30
**Consume**: todos los artefactos de la iteracion
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

El motor de iter-01 pasa a ser la herramienta de pantalla secundaria:
- landing con "mi perfil";
- cabina con la barra Arena God de tres capas;
- álbum de campeones con objetivos y marcas manuales;
- raíl con marcador y forma.

Al incluir la cola 1740 (F14, cambio de alcance), la lista verificada cuadra con el contador oficial: 77 = `602002`. Verify **PASS** con AC1–AC7, y AC8 (partida real) queda como gate manual del supervisor.

## Que funciono <!-- MUST -->

- **Predicción antes de ejecutar**:
  - El sondeo de iter-01 nombró las 80 partidas 1740 y los 5 campeones (Sona, Malphite, Aphelios, Gnar y Jayce) antes del re-backfill, y el re-backfill los reprodujo exactos.
  - Un contador opaco (`602002`) se validó con dos fuentes independientes, sin ajustes a posteriori.
- **Re-backfill incremental por diseño** (T01, `sync:season`): descargó solo las 80 que faltaban, con 102 peticiones en total y 0 × 429. No hizo falta un segundo backfill completo ni `db:reset`.
- **Un observador JS en la página para AC5**, en lugar de capturas sueltas: fecha cada transición (marcador 517 → 597, barra 72 → 77 y cromos sellados) y prueba con una marca en `window` que no hubo recarga. Es más barato y más convincente que perseguir el momento con capturas.
- **BD de tests + semillas del scratchpad** (`seed-perfil`, `finish-perfil`) para verificar la UI de T05–T10 sin tocar Riot ni la BD dev. El estado en vivo (backfill → partida nueva) se simuló sin gastar cuota.
- **Orquestador + subagentes Sonnet en serie**, con una sección "Estado previo" (firmas, rutas y avisos aprendidos) en cada prompt. Los avisos (`text-muted`, `tabular-nums` en display, `fixed` dentro de `@container`, `!important` con `biome-ignore`) no se repitieron como errores en las tasks siguientes.
- **Separar lógica pura y componentes**: `album-view.ts`, `album-interaction.ts`, `arena-god.ts` y `scoreboard.ts` con tests (de 299 a 623 tests). Así los cambios de UI se revisaban sobre funciones puras.
- **HANDOVER sin trackear en la raíz**: sobrevivió al clear y a un corte por límite de uso a mitad de T11, y la sesión siguió sin pérdida.

## Que ajustar <!-- MUST -->

- **Los tokens de la maqueta no se midieron.**
  - `--text-faint` se dio por "revisado por contraste", pero daba 3,53:1; se detectó en T11, al final.
  - El cálculo de contraste (un script de 20 líneas) debería correr en T02, cuando se fijan los tokens, no en la verificación final.
- **El raíl de 380 px (≥ 1500 px de contenedor) era inalcanzable desde T06**, porque el layout raíz mide 1480 px. La spec heredó del brief rangos que el layout real no permite. Hay que contrastar los rangos del brief con el contenedor real al escribir la task de layout.
- **El polling repite el payload RSC completo del perfil**: 83 kB sin comprimir, 14,6 kB con gzip, cada 30 s (cada 3 s con job). Además, cada refresco repite el prefetch de `/?inicio`. Funciona, pero crece con el álbum; en T08 era de unos 76 kB.
- **Los rangos del marcador se decidieron sin cifras reales**: la maqueta pedía 5 columnas iguales, que en 340 px no caben con "16,5%" en display de 30 px. El subagente tuvo que medir con la fuente real. Las maquetas deberían probarse con los datos del perfil real (597 partidas, 3 cifras de %).
- **Un job lanzado desde la CLI se ve en la página con hasta 30 s de retraso** (sin job activo, el polling es lento). Es aceptable, pero sorprende en la verificación.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F14: la cola 1740 entra en backfill, incremental y stats (supervisor, 2026-09-29) | Ratificada | 1750 ∪ 1740 = 77 = `602002`, con "Cuadra" en la página; los 5 campeones previstos, exactos |
| D1: vista por defecto "Objetivos sin ganar" si hay objetivos, si no "Todos" por bandas | Ratificada | Al marcar el primer objetivo, el álbum responde a "¿a quién saco?" sin más clics |
| D2: raíl a partir de 1100 px, con franja compacta por debajo | Ratificada | Marcador y forma visibles sin cambiar de pestaña; sin scroll horizontal en los 4 anchos |
| D3: Top-N fijo en 3 | Ratificada | No hizo falta más UI |
| Paleta de la maqueta (`--text-faint: #6e6a62`) | Corregida | Por debajo de AA; se sube a `#858179` (4,90:1 / 4,53:1) con el mismo tono |
| Estado local en el navegador (F6: objetivos y marcas manuales en `localStorage`) | Ratificada | Suficiente para el prototipo; el sync entre dispositivos sigue como hilo post-v1 |
| Polling de la BD propia (3 s con job y 30 s sin él) en lugar de push | Ratificada para v1 | Simple y sin coste de Riot; el payload queda como deuda |

## Deuda y gaps <!-- MAY -->

- **Payload RSC del perfil** (dueño: orquestador; destino: hilo "Pulido UI" de `think.md`, post-v1): 83 kB por refresco. Hay que reconstruir `portraitUrl` en el cliente, no hacer prefetch del logo (`/?inicio`) en cada `router.refresh()` y valorar un endpoint de progreso ligero durante el backfill.
- **Retraso de hasta 30 s para jobs lanzados fuera de la página** (dueño: supervisor; destino: "Pulido UI"): aceptable. Solo importa si hay más fuentes de jobs que la propia página.
- **Raíl de 380 px inalcanzable** (dueño: supervisor; destino: "Pulido UI"): o se ensancha el layout raíz o se quita el rango.
- **Desviaciones menores de la maqueta** (dueño: supervisor; destino: "Pulido UI"):
  - "Qué significa" en línea;
  - rejilla móvil de 64 px y lista compacta por debajo de 640 px;
  - "1º" y "% 1º" en oro;
  - cifras del raíl en `flex`;
  - franja sin la barra 1º–6º.
- **Foco y tabulación del álbum** (dueño: orquestador; destino: backlog de accesibilidad, post-v1): si un cromo sale de la vista, el foco cae en `body`, y hay unas 3 paradas de Tab por cromo. Roving tabindex.
- **Calidad** (dueño: orquestador; destino: #3 si toca esos ficheros):
  - `TONE_BG` vive en el componente `scoreboard.tsx` y lo importa `form-strip.tsx`: iría junto a `placeTone`;
  - `album.tsx` (513 líneas) merece partirse si #3 añade interacción.
- **De iter-01, siguen abiertas**:
  - sembrar el limitador tras un reinicio (backlog técnico, baja);
  - `602001` (jugados) sin cuadrar, que solo importa si #3 muestra "jugados".
- **De iter-01, cerradas en iter-02**: `formatDate` y `normalizeRiotId`, el texto de la diferencia con `602002` (aviso de tres casos) y el aviso del último job en `error`.
- **Key**: la dev key de `settings` caduca hacia el 2026-09-30 a las 18:30 UTC. #3 necesita una vigente para su E2E.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| AC8: aceptación manual en una partida real (elegir campeón desde "Objetivos sin ganar") | Supervisor / PR de #2 (gate de merge) | alta |
| Renovar la dev key antes del E2E de #3 (por `/admin` o `POST /api/admin/key`: la de BD manda) | Supervisor | alta |
| Medir el contraste de los tokens al fijarlos (script en la task de sistema visual), no solo en Verify | Plantilla de tasks de UI / runbook `research/orquestacion-v1.md` | media |
| Aligerar el payload RSC del polling (retratos en cliente, sin prefetch del logo) | think.md → hilo "Pulido y mejora de la UI base" | media |
| Contrastar los rangos del brief con el contenedor real al escribir la task de layout (raíl de 380 px) | think.md → "Pulido UI" | baja |
| Roving tabindex y foco estable en el álbum | backlog de accesibilidad (post-v1) | baja |
| Mover `TONE_BG` junto a `placeTone` si #3 reutiliza los colores de puesto | issue #3 | baja |

## Hallazgos para dev-system <!-- MAY -->

- **Bucle reproducido en una segunda iteración**: orquestador + subagentes + task files autocontenidos + verify con E2E real. Once tasks sin escalar al supervisor, con avisos aprendidos que se propagan a los prompts ("Estado previo"). Se refuerza la propuesta de iter-01 de documentar el "modo orquestador".
- **Handover**: un `HANDOVER.md` sin trackear en la raíz, borrado antes del Ship, sobrevive al clear y a los cortes por límite de uso. Es candidato a patrón documentado de la skill `handover`: dónde vive el fichero y cuándo se borra.
- **Merge delegado con un gate manual pendiente** (#11 + #13): el supervisor autorizó el merge para seguir con la siguiente iteración, pero AC8 (una partida real) es gate de merge. Registrado como fricción #15 en `dogfood-log.md`.
- Siguen confirmadas en uso real #10 y #12 (`dev-ship` y `dev-task` sin invocación por modelo; el helper `task_status.py` se recreó de la sesión anterior) y #14 (abrir iteración sin paso determinista).

## Candidatos a vault <!-- MAY -->

- 2026-09-30 — Validar un contador opaco prediciendo antes de ejecutar (qué partidas y qué campeones), y no explicando la diferencia después — destino: nota-atomica
- 2026-09-30 — Un observador en la propia página (muestreo del DOM cada segundo más una marca en `window`) es mejor evidencia de "se actualiza sin recargar" que una serie de capturas — destino: nota-atomica
