# Spec: hylistats — iter-11 cabecera del perfil: vitrina
**Estado**: aprobada (issue [#27](https://github.com/adrirobg/hylistats/issues/27); el supervisor eligió C2, honor turquesa, splash del último 1º con tratamiento oscuro y barra fija reducida, y dio paso a Execute con "procede con todo", 2026-10-03. Las inferencias I1–I10 son del orquestador y se revisan en Verify; rama `feat/27-cabecera-vitrina` desde `develop`)
**Consume**: think.md ORGANIZED "Cabecera del perfil: vitrina" (decisiones 1–6) como referencia y restricción; maquetas `.dev/research/cabecera/propuestas.html` (v3, propuesta C2) y `propuestas-v1.html` (diagnóstico); F4/F7 (Arena God), F21 (títulos), F24–F25 (ELO), brief `.dev/research/design-brief.md` §6 (tokens y tipografía)
**Produce**: `.dev/tasks/` inicial + criterios de aceptación verificables

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando aportan valor real. Todo contenido `{...}` es placeholder pendiente. **Ciclo de Estado**: `plantilla` (nadie abrio iteracion — dev-context/dev-start no la reportan como activa) → `draft` (iteracion abierta, spec en elaboracion) → `aprobada` (gate del supervisor superado).

## Objetivo <!-- MUST -->

Que la cabecera del perfil enseñe con su peso real lo que más se mira: el **ELO del grupo** y los **títulos** junto a **Dios de Arena**, en una "vitrina" con el splash del último campeón ganado, y que los títulos quepan aunque se acumulen (Hylimichi llevaba 8 chips + la Deidad el 2026-10-03).

## Alcance <!-- MUST -->

**Incluye** <!-- MUST -->:
- **Banner (vitrina)** en lugar del header actual y de la franja de la barra Arena God (`Cabin` slots `header` y `god`):
  - **Fondo**: splash de Data Dragon del **último campeón con 1º** de la temporada (`VerifiedChampion` con mayor `lastWinAt` → `Champion.ddId` → `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{ddId}_0.jpg`). **Tratamiento oscuro**: imagen desaturada (~0,55), desenfoque ligero (~1,5 px), velo oscuro hacia el texto (≈ 0,92 → 0,72 → 0,55 de izquierda a derecha en escritorio; de abajo arriba en estrecho) y fundido inferior al color de la cabina. Imagen decorativa (`alt=""`). Sin ningún 1º, o si la imagen falla, degradado con el color de la liga (como en la maqueta "Sin splash").
  - **Identidad**: avatar grande (icono de invocador o iniciales) y, con la Deidad conseguida, **sello** (anillo dorado + corona); nombre `font-display` grande con `#tag`; ★ favorito; chip de identidad (Mi perfil / Este soy yo / Viendo el perfil de X, como hoy); chip **Deidad de Arena** con su tooltip de condición (el `Badge` de hoy); aviso de Arena fuera de rotación (como hoy).
  - **Acciones y frescura** arriba a la derecha: "Última partida hace…", "Comprobado…", botón **Actualizar** y menú ⋯ (`LocalMenu`), con el mismo comportamiento que hoy (progreso, cola, toast, avisos de límite de peticiones y de error).
  - **Dos trofeos gemelos**, mismo tamaño de cifra:
    - **Liga del grupo** (solo miembros): escudo con el color de la liga, nombre de la liga, rating redondeado, etiqueta "provisional" si toca, posición "Nº de N", chips de **cambio de hoy** y **de la semana** (verde si sube, rojo si baja, ocultos si `null`), **distancia al de arriba** ("a 3 de Azpekaa"; el primero: "líder por N") y **a la siguiente liga** ("a 18 de Oro"; en Diamante no se muestra).
    - **Dios de Arena**: **anillo** con las tres capas de hoy (verificados en oro, manuales en azul rayado solo en «mi perfil», marca del oficial), la meta (60 «Deidad de Arena» o el catálogo «Dios de Arena», `arenaGodGoal`), "N / meta", "faltan N", hitos (Deidad · 60, Dios · catálogo) y el **aviso** con sus acciones (Sincronizar, Marcar a mano, Qué significa, Reintentar) y la explicación "?" exactamente como `ArenaGodBar` hoy.
- **Bajo el banner**, dos columnas (una en estrecho), solo en miembros:
  - **Títulos**: una **fila por título** (no por título y periodo), en el orden de `TITLE_DEFINITIONS`: icono propio, nombre sin periodo ("Equipo mental boom"), marcas **HOY** y **SEM** (encendida la del periodo que lleva) y el **«por qué» escrito** de cada periodo que lleva ("Hoy: …", "Semana: …"), más "con X y Y" en los de dúo y trío. Tono **honor en turquesa** (El D-d-d-diablo, Equipo roto, Pareja rota) y **vergüenza en rosa apagado** (El trol, El pacifista, Equipo mental boom, Pareja mental boom). Cabecera del bloque con el recuento ("2 de honor · 2 de vergüenza") y el enlace a la explicación (`?tab=grupo#titulos`). Estado vacío con los mínimos.
  - **Escalera del grupo**: la Clasificación del ELO (todos los miembros, como la pestaña Grupo): posición, escudo de liga, nombre (enlace a su perfil), rating y cambio del día; la fila propia destacada; pie con la distancia al de arriba.
- **Barra fija reducida**: al salir el banner de la vista queda pegada arriba una barra con avatar pequeño, nombre, liga · rating, Actualizar y ⋯. Un **solo** botón Actualizar en el DOM (`REFRESH_BUTTON_ID`, al que llaman las acciones del trofeo).
- **Tokens nuevos** en `globals.css`: `--honor` (= `--place-top`, turquesa) y su fondo, `--shame` (`#c77fa0`) y su fondo, y los colores de liga (`--league-hierro` … `--league-diamante`, valores de la maqueta).
- **Esqueleto de carga** (`loading.tsx`) con la forma nueva.
- **Fuera de uso**: los chips fijos "EUW" y "Arena · temporada actual"; los `Badge` de títulos en la cabecera; la franja `god` de `Cabin` (si queda vacía, se quita el slot).

**No incluye** <!-- SHOULD -->:
- Reorganizar pestañas, raíl, franja de cifras (`strip`), Marcador, Forma o Compañeros (hilo aparte).
- Cambios en las reglas o los textos de los títulos (los lleva #25 / PR #26) ni en el ELO o Arena God del dominio.
- Elegir el campeón del fondo, splash de skins o animaciones del banner.
- Página `/` (landing) y vista de perfil no registrado / no encontrado.

**Inferencias del orquestador** (revisables en Verify):
- **I1 — No miembros** (sin ELO ni títulos): el banner lleva identidad y **solo el trofeo de Dios de Arena**; no hay bloque Títulos + Escalera.
- **I2 — Raíl y franja sin cambios**: el Marcador sigue en el raíl (≥ 1100 px) y en la franja (< 1100 px).
- **I3 — Fuera "EUW" y "Arena · temporada actual"**: no cambian nunca (diagnóstico de la v1).
- **I4 — Compañeros en los títulos de equipo**: "con X y Y" por `gameName` de `GroupViewMember`; con empates (el mismo título con dos dúos) la fila es una y lista los compañeros de cada uno.
- **I5 — Estado vacío de títulos** (miembro sin títulos): "Sin títulos hoy ni esta semana" + los mínimos (`minimumText`).
- **I6 — Barra fija**: una sola cabecera pegajosa; con el banner a la vista solo enseña frescura y acciones sobre el banner, y al salir el banner gana fondo y la identidad compacta (IntersectionObserver). Así no hay dos botones Actualizar.
- **I7 — Escalera con enlaces**: cada nombre lleva al perfil de ese miembro (`GroupViewMember.slug`).
- **I8 — Orden de los títulos**: el de `TITLE_DEFINITIONS` (no se separa por tono).
- **I9 — Iconos** de `lucide-react` (ya instalado): trol `Laugh` o equivalente, pacifista `Feather`, diablo `Flame`, Equipo roto `Swords`, Equipo mental boom `Bomb`, Pareja rota `Heart`, Pareja mental boom `HeartCrack`, Deidad `Crown`. Escudo de liga: SVG propio (forma de la maqueta).
- **I10 — Sin "+N hoy" en Dios de Arena**: no hay dato de campeones nuevos del día en `ProfileView`; no se añade.

## Entregables <!-- MUST -->

| # | Entregable | Descripcion |
|---|------------|-------------|
| 1 | Vista-modelo de la vitrina | Módulo puro con tests: filas de títulos agrupadas, escalera y datos del trofeo de Liga, campeón y URL del splash |
| 2 | Trofeo Dios de Arena | Componente con anillo de tres capas, aviso, acciones y explicación; geometría del anillo pura con tests; sustituye a `ArenaGodBar` |
| 3 | Vitrina | Banner (splash, identidad, acciones, trofeos), bloque Títulos + Escalera, barra fija reducida, tokens, `Cabin`/`page.tsx`/`loading.tsx` |
| 4 | Verify | `verify-report.md` con capturas a 1280 y 375 px de los casos de AC12 |

## Criterios de aceptacion <!-- MUST -->

- [ ] **AC1 — Banner**: en el perfil de un miembro se ve el banner con identidad, acciones y los dos trofeos; a ≥ 1100 px como la C2 de la maqueta y a 375 px apilado sin scroll horizontal.
- [ ] **AC2 — Splash**: el fondo es el splash del campeón con el `lastWinAt` más reciente, con el tratamiento oscuro; sin 1º en la temporada o con la imagen rota, degradado de la liga. Nombre, cifras y botones se leen (contraste AA sobre el velo).
- [ ] **AC3 — Trofeo Liga**: liga con su color, rating, "provisional" si toca, "Nº de N", cambio de hoy y de la semana (ocultos si `null`), distancia al de arriba ("líder por N" si es el primero) y a la siguiente liga (nada en Diamante). Los valores coinciden con la Clasificación de la pestaña Grupo.
- [ ] **AC4 — Trofeo Dios de Arena**: anillo con verificados, manuales (solo en «mi perfil») y oficial; meta 60 o catálogo con su nombre; "faltan N"; el aviso y sus acciones se comportan como hoy en los estados `match`, descuadre, sin oficial y sincronizando (tests del dominio intactos).
- [ ] **AC5 — Títulos**: una fila por título con HOY/SEM; los «por qué» de cada periodo escritos; "con X y Y" en dúo y trío; turquesa para honor y rosa para vergüenza; enlace a la explicación; estado vacío. Con los datos de Hylimichi del 2026-10-03 salen 4 filas.
- [ ] **AC6 — Escalera**: todos los miembros de la Clasificación con posición (empates compartidos como en la pestaña Grupo), liga, rating, cambio del día y enlace; la fila propia destacada; pie con la distancia al de arriba.
- [ ] **AC7 — Deidad**: con la Deidad conseguida, sello en el avatar y chip con tooltip de la condición; sin ella, nada.
- [ ] **AC8 — Barra fija**: al hacer scroll queda una barra con avatar, nombre, liga · rating, Actualizar y ⋯; hay un solo `#REFRESH_BUTTON_ID`; Actualizar, Sincronizar y Reintentar del trofeo siguen funcionando; los avisos de límite y de error salen como hoy.
- [ ] **AC9 — No miembros**: banner con identidad y solo el trofeo de Dios de Arena; sin Títulos ni Escalera; sin errores.
- [ ] **AC10 — Carga**: `loading.tsx` tiene la forma nueva (banner, trofeos) sin saltos grandes al llegar la página.
- [ ] **AC11 — Calidad**: tests de las funciones puras (agrupado de títulos con día, semana y ambos; empates de dúo; escalera con empates y líder; distancias de liga incluida Diamante; campeón del splash sin 1º y con varios; geometría del anillo con manuales, oficial nulo y meta 60/173). `npm run lint && npm run typecheck && npm test && npm run build` y CI en verde.
- [ ] **AC12 — Verificación visual** en navegador a 1280 y 375 px: miembro con muchos títulos, miembro sin títulos, no miembro y perfil sin ningún 1º (o simulado). Capturas en `verify-report.md`.
- [ ] **AC13 — Aceptación** (supervisor, tras la release): el grupo abre su perfil y la cabecera le enseña de un vistazo liga, títulos y Dios de Arena. El PR se puede mergear con este gate abierto.

## Riesgos y restricciones <!-- MAY -->

- **PR #26 abierta** (títulos, `think.md`): toca `group-titles.ts` y textos de los «por qué». Esta iteración solo presenta los títulos; tras su merge se integra `develop` en la rama y se revisa que las filas usen los textos nuevos.
- **Peso del splash**: ~100–200 KB por imagen desde Data Dragon (`images: { unoptimized: true }`). Se carga sin bloquear el render (`loading="lazy"` no aplica al estar arriba; basta con `decoding="async"` y `fetchPriority="low"`).
- `data.ts` no debe crecer más que el cableado mínimo (deuda de iter-04/05): lo nuevo va en módulos propios.

## Estrategia de implementacion <!-- SHOULD -->

1. **T01 ∥ T02**: la vista-modelo de la vitrina (puro) y el trofeo de Dios de Arena (con su geometría pura) no comparten archivos.
2. **T03** monta la vitrina con ambos: banner, bloque Títulos + Escalera, barra fija, tokens y cableado en `Cabin`, `page.tsx` y `loading.tsx`. El ELO y la escalera salen de `loadProfileGroupData` (la vista del grupo ya está memoizada: no se calcula de nuevo).
3. **T04**: verificación en navegador (orquestador) y `verify-report.md`.
Workers por subagente; commits del orquestador al cerrar cada task.
