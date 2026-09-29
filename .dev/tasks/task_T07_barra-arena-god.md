# Task T07 — Barra Arena God de tres capas y aviso de descuadre

**Owner**: worker:sonnet
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

Bajo el header del perfil va la barra Arena God del brief §4.2, con tres capas:

- verificados: oro sólido;
- manuales: azul acero rayado y discontinuo;
- contador oficial `602002`: marca vertical.

Lleva además la meta de 60 y el texto "N verificados + M manuales · oficial O · objetivo 60". Debajo, el aviso de descuadre del §4.3 con sus 4 casos y sus acciones. La lógica es pura y probada con datos simulados.

## Contexto <!-- SHOULD -->

- spec.md: Alcance (barra y aviso), Entregable 7, AC4 ("reproducen los 4 casos de §4.3, tests con datos simulados") y AC7 (con la 1740 debe salir "Cuadra"). En "Decisiones técnicas", umbral 60 como constante.
- Brief:
  - §4.2 y §4.3: tabla de los 4 casos con su mensaje y sus acciones. Siempre en azul acero, nunca en rojo; el caso que cuadra es discreto, con check y sin banner.
  - §6.1: reglas de color.
  - F4/F7 en think.md: el contador es un control y la app explica la diferencia.
- Maqueta `.dev/research/design-mock.html`:
  - CSS: `.god`, `.bar`, `.seg`, `.ver`, `.man`, `.off`, `.bar-scale` y `.notice` (l. 86–103).
  - HTML: l. 309–319.
  - JS: `renderGod` (l. 501–521), con los textos de los casos.
  - Acciones del caso "faltan" (l. 704–709): Sincronizar → Actualizar; "Marcar a mano" → filtro sin ganar + toast de guía; "Qué significa" → explicación.
- Datos disponibles en `ProfileView` (`src/app/euw/[slug]/data.ts`):
  - `verifiedChampions: VerifiedChampion[]` (`championId`…).
  - `challenge: { value: number | null; level; checkedAt: Date | null; comparison }`.
- `compareWithChallenge` de `src/domain/stats.ts` solo distingue `match | diff | unknown` y no sabe de manuales: el nuevo dominio lo sustituye en la UI (no borres la función si la usan tests o `/api/health`).
- Manuales: `useLocalStore` (T04) → `profiles[norm].manual` (ids de campeón). **Solo en "mi perfil"** (D12); en perfiles ajenos, manuales = 0 y no se muestran.
- Hueco reservado por T06 en `page.tsx`, marcado `{/* T07 */}`, y acciones de T06: `refreshProfileAction` y el toast. Si el toast no es reutilizable, extráelo a un componente compartido.
- `src/lib/config.ts`: añade aquí el umbral.

## Prompt / instrucciones para worker <!-- MUST -->

1. **Config**: `ARENA_GOD_THRESHOLD = 60` en `src/lib/config.ts`, con el comentario "nivel MASTER de 602002, thresholds del `config` verificados en I1 §7.2 (IRON 3 … MASTER 60)".
2. **Dominio puro** (`src/domain/arena-god.ts`):
   - `arenaGodState({ verifiedIds: number[]; manualIds: number[]; official: number | null; goal: number })`.
   - Los manuales que ya estén verificados **no** cuentan (dejan de ser huecos).
   - Devuelve `{ verified, manual, total, official, goal, status, diff, scaleMax, ticks }`.
   - `status` es uno de:
     - `unknown`: `official === null`;
     - `match`: `official === total`;
     - `missing`: `official > total`, con `diff = official − total`;
     - `ahead`: `official < total`. Distingue dos variantes de mensaje: `official < verified` (más victorias verificadas que el oficial; puede que Riot aún no lo haya actualizado) y `verified ≤ official < total` (las marcas manuales superan al contador; revísalas).
   - `scaleMax = max(goal, official ?? 0, total)` redondeado al múltiplo de 10 superior; `ticks` cada 20 hasta `scaleMax`, e incluye `goal`, etiquetado "60 · Arena God".
   - Textos en `src/domain/arena-god.ts` o en el componente, siguiendo los del §4.3 con singular y plural correctos: "Falta 1 campeón" / "Faltan 2 campeones".
   - El caso `missing` explica el porqué: "Faltan N campeones que el historial no muestra (partidas no devueltas por la API o no sincronizadas)".
   - El caso `unknown` dice "No se pudo leer el contador oficial" y, si hay `checkedAt`, "(hace X)".
3. **Tests** (`src/domain/arena-god.test.ts`): los 4 casos de §4.3 (`match`, `missing`, `ahead` en sus dos variantes y `unknown`); manuales ya verificados que no cuentan; singular y plural; `scaleMax` y `ticks` con `official` > `goal` (por ejemplo 75 frente a 60) y con todo por debajo de la meta; caso real de AC7 (75 verificados, 0 manuales, oficial 75 → `match`).
4. **Componente** `ArenaGodBar`, cliente porque lee los manuales de la capa de navegador:
   - **Barra**: segmentos con `left` y `width` en % de `scaleMax`, marca vertical del oficial con etiqueta "oficial N", marca de la meta y escala con los ticks.
   - `role="img"` con un `aria-label` completo ("75 verificados, 0 manuales, contador oficial 75, objetivo 60").
   - Transiciones de anchura que respetan `prefers-reduced-motion`.
   - Contador grande en display: `total` de `goal`.
   - **Aviso**: `Notice` de T02 en azul acero; el caso `match`, discreto con ✓.
   - **Acciones de `missing`**:
     - [Sincronizar] llama a la action de refresco de T06.
     - [Marcar a mano], solo en "mi perfil", pone `?filtro=sin-ganar` en la URL y muestra el toast "Abre el menú ⋯ de un campeón y usa «Marcar como ganado a mano»".
     - [Qué significa] muestra la explicación de las tres capas en dos frases ("Riot da el número oficial pero no la lista; la lista sale de tu historial…").
   - **Acción de `unknown`**: [Reintentar], que refresca.
   - Tooltip o `?` con la explicación de las tres capas (§4.2).
5. Monta el componente en el hueco `{/* T07 */}` de `page.tsx` con los datos del servidor. Retira de la página el bloque provisional "verificados vs 602002" si T06 lo dejó.
6. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `arenaGodState` cubre los 4 casos de §4.3 (con las dos variantes de `ahead`), manuales redundantes y escala (tests).
- [ ] La barra pinta tres capas + meta + escala con `aria-label` completo; el aviso usa azul acero, nunca rojo.
- [ ] Las acciones de cada caso funcionan (Sincronizar/Reintentar → refresco; Marcar a mano → filtro en la URL + guía; Qué significa).
- [ ] Manuales solo en "mi perfil".
- [ ] Los cuatro checks en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
