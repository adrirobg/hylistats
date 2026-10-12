# Spec: hylistats — iter-12 estabilizar el ELO del grupo
**Estado**: aprobada (issue [#29](https://github.com/adrirobg/hylistats/issues/29); gate del grill confirmado por el supervisor el 2026-10-12; el supervisor aprueba la spec con las inferencias I1–I8 y da paso a Execute, 2026-10-12; rama `feat/29-elo-estabilidad` desde `develop`)
**Consume**: think.md §6 y F28 (revisan §4, F24 y F25) como referencia y restricción; análisis `.dev/research/elo-estabilidad.md` y scripts `.dev/research/elo-estabilidad/`; pila flotante de avisos de iter-11 (D8–D12)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

Que la liga y el rating del ELO del grupo dejen de ir y venir dentro de un día. Hoy hay 5,5 cambios de liga al día; el objetivo, según la simulación, es ~1. Además, ganar seguido (1º tras 1º) se premia y se ve.

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Constantes** (`src/lib/config.ts`). Cambia el valor de algunas y se añaden otras; el resto de la configuración no cambia.
  - `ELO_PLACEMENT_POINTS`: `[12.5, 6, 1, -2.5, -7.5, -9.5]`.
  - `ELO_SLOPE`: `22`.
  - `ELO_STRANGER_MULTIPLIERS`: `[{1,1}, {gain 1.1, loss 0.85}, {gain 1.2, loss 0.8}]`.
  - Constantes nuevas:
    - `ELO_LEAGUE_MARGIN = 10`.
    - Multiplicadores de racha por número de 1º seguidos, con la partida actual incluida: 1 → ×1, 2 → ×1,5, 3 o más → ×2.
- **Dominio** (`src/domain/elo.ts`):
  - **Racha**: cada `EloMatch` lleva cuántos 1º seguidos lleva el miembro con esa partida (`streak`, 0 si no es 1º) y su multiplicador de racha.
    - Fórmula: `delta = base × multiplicador de desconocidos × multiplicador de racha`. El multiplicador de racha solo se aplica si el cambio tras los desconocidos es positivo.
    - La racha cruza días. Cualquier otro puesto la corta.
    - `EloMember` lleva la racha en curso: los 1º seguidos al final de su historial.
  - **Liga con margen**: la liga de cada miembro se decide recorriendo su historial desde Plata (la de 1500).
    - Tras cada partida, con el rating redondeado: si llega al `min` de la liga superior `+ 10`, sube; si llega al `min` de su liga `− 10` o menos, baja.
    - Puede saltar más de una liga si el cambio es grande.
    - `EloMember.league` pasa a ser esta liga. `eloLeague(rating)` (sin margen) se queda para las bandas de la gráfica.
  - Se recalcula toda la temporada al leer, como hoy: sin migración ni reglas por fecha.
- **Historial** (`matches-view.ts` y su panel):
  - En la fila, junto al cambio, `🔥×1,5` o `🔥×2` si aplicó la racha.
  - En el desglose del detalle, una línea "Racha" ("3 primeros seguidos · ×2"). Si hay desconocidos y racha, se ven los dos multiplicadores.
- **Aviso de racha** en la pila flotante (`floating-notices.ts`, `vitrina.tsx`): sale en el perfil de un miembro con una racha en curso de 1 o más. Dice cuántos 1º seguidos lleva y cuánto vale su próximo 1º.
- **🔥 en la Clasificación** de la pestaña Grupo (`clasificacion-model.ts` / `clasificacion-block.tsx`) junto a quien lleve una racha en curso de 2 o más.
- **Nota de la regla** (`clasificacionNote`): explica el margen de las ligas y la racha con cifras sacadas de `config.ts`, como hoy.
- **Recálculo independiente**: `.dev/research/elo-estabilidad/elo.py` se actualiza a F28 (racha y margen) para la comprobación de Verify.

**No incluye** <!-- SHOULD -->:
- Contrapartida para las rachas de 6º (descartada en F28).
- Récord o título de racha (post-v1).
- Cambios en los cortes, nombres o colores de las ligas.
- Aviso en la UI del recálculo: se cuenta en el grupo.
- El resto de "Mejoras del ELO tras usarlo": títulos semanales de ELO, "Clásico", ajuste por compañeros.
- Cambios en la escala `E` (400) y en el *provisional* (10 partidas).

**Inferencias del orquestador** (aprobadas por el supervisor el 2026-10-12):
- **I1 — Margen sobre el rating redondeado**, como la liga de hoy. Ejemplos: Plata → Oro al llegar a 1520; Oro → Plata al llegar a 1500 o menos. Un miembro sin partidas está en Plata.
- **I2 — Bandas de la gráfica de evolución sin margen**: siguen en los cortes de F25, porque el rating que se dibuja es el real. La liga actual de la cabecera puede no coincidir con la banda en la que está el punto mientras el rating esté dentro del margen.
- **I3 — Aviso de racha en el perfil de cada miembro**. En «mi perfil» va en segunda persona ("Llevas 2 primeros seguidos: tu próximo 1º vale ×2"); en el de otro miembro, con su nombre. En los perfiles de no miembros no sale.
- **I4 — Prioridad del aviso de racha en la pila**: sincronización > Dios de Arena > **racha** > Arena fuera de rotación.
- **I5 — Cierre del aviso de racha**: se recuerda en `localStorage` por perfil y por longitud de la racha (como D12). Vuelve a salir cuando la racha crece o cuando empieza una nueva.
- **I6 — 🔥 también en El grupo hoy** de la vitrina, junto al nombre y con el mismo criterio (racha de 2 o más). Es la Clasificación de la cabecera.
- **I7 — El 🔥 de la Clasificación lleva el número** (`🔥3`) y un `title` con el texto ("3 primeros seguidos").
- **I8 — `nextLeagueText`**, sin uso en la UI desde la revisión v4 de iter-11: no se toca.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Dominio y reglas | Constantes de F28, racha y liga con margen en `elo.ts`, nota de la regla y tests (dominio y vistas-modelo con cifras que cambian) |
| 2 | Racha en la UI | Indicador en el historial y el desglose, aviso de racha en la pila y 🔥 en la Clasificación y en El grupo hoy |
| 3 | Recálculo independiente | `elo.py` a F28; comparación con la app sobre datos reales de PRO y métrica de cambios de liga |
| 4 | Verify | `verify-report.md` con la comparación, la métrica y capturas a 1280 y 375 px |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Cálculo**: con R = 1500 y sin desconocidos ni racha, el cambio es exactamente +12,5 / +6 / +1 / −2,5 / −7,5 / −9,5. La pendiente es `22·(E−0,5)`. Los multiplicadores por desconocidos son ×1,10/×0,85 y ×1,20/×0,80.
- [ ] **AC2 — Racha**:
  - Un 1º tras otro lleva ×1,5, y el tercero y los siguientes, ×2.
  - Cualquier otro puesto la corta.
  - Cruza días: el último 1º de un día y el primero del siguiente cuentan como seguidos.
  - Se combina con los desconocidos: `base × 1,10 × 2`.
  - No se aplica a cambios no positivos.
  - Tests de 1, 2, 3 y 4 seguidos, del corte, del cruce de día y de la combinación.
- [ ] **AC3 — Liga con margen**:
  - Sube al llegar a `min + 10` de la superior y no sube en `+ 9`.
  - Baja al llegar a `min − 10` de la propia y no baja en `− 9`.
  - Salta varias ligas con un cambio grande.
  - Hierro y Diamante funcionan en los extremos.
  - Un miembro sin partidas está en Plata.
  - Tests de todos estos casos.
- [ ] **AC4 — Historial**: una partida con racha enseña `🔥×1,5` o `🔥×2` junto al cambio. El desglose tiene la línea "Racha". Con desconocidos y racha, se ven los dos multiplicadores. Las partidas sin racha se ven como hoy.
- [ ] **AC5 — Aviso de racha**:
  - Con una racha en curso de 1 o más, la pila del perfil del miembro enseña el aviso con la longitud de la racha y el multiplicador del próximo 1º (×1,5 con 1 seguido, ×2 con 2 o más).
  - Se cierra con ✕, no vuelve mientras la racha no cambie, sigue la prioridad de I4 y no desplaza el contenido (AC22 de iter-11).
  - En no miembros no aparece.
- [ ] **AC6 — 🔥 en la Clasificación**: en la pestaña Grupo y en El grupo hoy, 🔥 con el número junto a quien lleve 2 o más 1º seguidos; nada con 0 o 1.
- [ ] **AC7 — Nota de la regla**: explica la tabla nueva, los multiplicadores, la racha y el margen de las ligas, y ninguna cifra está escrita a mano (todas salen de `config.ts`).
- [ ] **AC8 — Recálculo independiente**: con datos reales de PRO, los ratings, las ligas y las rachas en curso de la app coinciden con `elo.py` actualizado para todos los miembros, con un margen de ±0,01 en el rating.
- [ ] **AC9 — Estabilidad**: con los datos de PRO hasta la fecha de Verify, la mediana de cambios de liga dentro del día en los días-jugador con 10 o más partidas es **≤ 1,5** (hoy, 5,5).
- [ ] **AC10 — Calidad**: `npm run lint && npm run typecheck && npm test && npm run build` y CI en verde.
- [ ] **AC11 — Verificación visual** en navegador a 1280 y 375 px:
  - Historial con racha y desconocidos.
  - Aviso de racha en «mi perfil» y en el perfil de otro miembro.
  - Clasificación y El grupo hoy con 🔥.
  - Perfil de un no miembro sin cambios.
  - Capturas en `verify-report.md`.
- [ ] **AC12 — Aceptación** (supervisor y grupo, tras la release): en las sesiones de juego dejan de verse idas y venidas de liga dentro del día y el grupo entiende de dónde salen los puntos de una racha. La PR se puede mergear con este gate abierto (F18).

## Riesgos y restricciones <!-- MAY -->

- **Cifras en los tests**: hay tests de las vistas-modelo (`vitrina-view`, `group-view`, `matches-view`, `clasificacion-model`, `rating-view`) que dependen de los puntos de hoy. Hay que actualizarlos con valores calculados, sin reescribir la intención de cada test.
- **PRO solo en lectura**: `rows.json` se genera con la consulta del research mediante el MCP de Supabase y no se commitea.
- `data.ts` no crece más que el cableado mínimo, por la deuda de iter-04/05.

## Estrategia de implementacion <!-- SHOULD -->

1. **T01** (worker): dominio y reglas. Constantes, racha y liga con margen en `elo.ts`, nota de la regla, tests nuevos y tests existentes ajustados a las cifras nuevas.
2. **T02** (worker, depende de T01): la racha en la UI (historial, aviso y 🔥), con la lógica de presentación en funciones puras con tests.
3. **T03** (orquestador, puede ir en paralelo a T02 una vez cerrada T01): `elo.py` a F28, `rows.json` desde PRO y comparación con la app, más la métrica de AC9.
4. **T04** (orquestador): verificación visual y `verify-report.md`.

Commits del orquestador al cerrar cada task.
