# Task T03 — Vitrina: banner, títulos, escalera y barra fija

**Owner**: worker:opus
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La cabecera del perfil pasa a ser la **vitrina C2**: banner con splash del último 1º, identidad, acciones y dos trofeos (Liga del grupo y Dios de Arena); debajo, Títulos + Escalera del grupo; y una barra fija reducida al hacer scroll. Sustituye al `ProfileHeader` actual y a la franja de la barra Arena God.

## Contexto <!-- SHOULD -->

- spec.md: **Alcance completo** e inferencias I1–I10; AC1–AC10.
- think.md: ORGANIZED "Cabecera del perfil: vitrina" (decisiones 1–6).
- **Maqueta de referencia**: `.dev/research/cabecera/propuestas.html` (v3; pesa ~850 KB por los splash en base64: no la leas entera; lee el `<style>` y el `<script>` final con `grep -n`/`sed -n`). Interesa la propuesta **C2**: CSS de `.hero`, `.hero .bgimg`, `[data-fx="oscuro"]` (tratamiento elegido), `.actions`, `.idblk`, `.av`/`.seal`, `.c2-top`, `.twins`/`.tw`/`.tw.e`, `.c2-body`, `.tlist`/`.trw`/`.pips`, `.ladder`/`.lad`, y las container queries de 980/700/640 px; JS de `renderC2`, `heroOpen`, `ladder`, `eloSub`, `eloFacts`. Tono de honor **turquesa** (`honor-teal`).
- Piezas de T01 (`src/app/euw/[slug]/vitrina-view.ts`): `titleRows`, `titleCounts`, `ladderRows`, `eloFacts`, `splashChampion`, `TITLES_LINK`.
- Pieza de T02 (`src/app/euw/[slug]/god-trophy.tsx`): `GodTrophy` (mismas props que `ArenaGodBarProps`).
- Código a sustituir o tocar:
  - `src/app/euw/[slug]/header.tsx` (391 líneas, léelo entero): identidad, ★, chip de identidad (`IdentityChip`), badges, ELO en texto, frescura, Actualizar (`useRefresh`, `REFRESH_BUTTON_ID`, progreso y cola), `LocalMenu`, avisos de límite de peticiones y de error, `ToastRegion`, aviso de Arena fuera de rotación. **Todo ese comportamiento se conserva**; cambia la presentación.
  - `src/app/euw/[slug]/cabin.tsx` (slots `header`, `band`, `god`, `strip`, `tabs`, `main`, `rail`; container queries sobre `.app`). El slot `god` desaparece o pasa a ser la vitrina; `band` (sync-band) sigue bajo la cabecera.
  - `src/app/euw/[slug]/page.tsx:160-215` (`ProfileCabin`: arma `ProfileHeader` y `ArenaGodBar`).
  - `src/app/euw/[slug]/data.ts`: `ProfileView` ya trae `titles`, `elo`, `verifiedChampions`, `arenaGod`, `challenge`, `profileIconUrl`; `loadProfileGroupData` (`src/domain/group-view-memo.ts:140`) ya devuelve `view` (con `members` y `elo.standings`) para miembros y está memoizado. Para la escalera y los nombres de compañeros hace falta pasar de `view` solo lo que se pinta (filas de `ladderRows` y nombres), **no** la `GroupView` entera (cada `router.refresh()` serializa el payload; ver comentario de `ProfileView`). Cableado mínimo en `data.ts`: lo derivado se calcula con las funciones de T01.
  - `src/app/euw/[slug]/loading.tsx` (esqueleto con `Cabin`).
  - `src/app/globals.css`: tokens (`:root` ~114, `@theme inline` ~18).
  - `src/components/hy/badge.tsx` (se sigue usando para el chip «Deidad de Arena»).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Tokens** en `globals.css` y en `@theme inline`: `--honor` (= `--place-top`), `--honor-bg` (`#142624`), `--shame` (`#c77fa0`), `--shame-bg` (`#2a1a22`), `--league-hierro` `#8a8d93`, `--league-bronce` `#c08552`, `--league-plata` `#b9c3cd`, `--league-oro` `#e8b64c`, `--league-platino` `#4fb3a3`, `--league-diamante` `#8fb2e0`.
2. **Datos** (servidor, cableado mínimo): `splashChampion(verifiedChampions, catalog)`; filas de títulos (`titleRows`) y escalera (`ladderRows`) + `eloFacts`, solo para miembros. Añade a `ProfileView` lo justo (p. ej. `vitrina: { splash, titleRows, ladder, eloFacts } | null`) y quita lo que ya no se pinte (`titleBadges`).
3. **Componentes** (cliente donde haga falta, servidor donde no), en archivos propios (`vitrina.tsx`, `elo-trophy.tsx`, `title-list.tsx`, `group-ladder.tsx`, `league-shield.tsx`…; nombres libres):
   - Banner con splash (`<img>` absoluta, `alt=""`, `decoding="async"`, `fetchPriority="low"`, `onError` → oculta y queda el degradado de liga), tratamiento oscuro de la maqueta (`filter: saturate(.55) blur(1.5px)`, `scale(1.02)`, velo `rgba(12,13,16,.92 → .72 → .55)` izquierda→derecha; en < 640 px de arriba abajo; fundido inferior a la cabina).
   - Identidad: avatar 72 px (60 en estrecho) con sello de Deidad, nombre `font-display` 48 px (30 en estrecho) + `#tag`, ★, chip de identidad, chip Deidad (`Badge` con `DEITY_NAME`/`DEITY_CONDITION`), aviso de Arena fuera de rotación.
   - Trofeo Liga: `LeagueShield` (SVG de la maqueta, `symbol#i-shield`, color `--league-*`), liga, rating, "provisional", "Nº de N", chips de hoy/semana (`deltaText`; ocultos si `null`), "a N de X" / "líder por N" y "a N de <liga>".
   - Trofeo Dios de Arena: `GodTrophy` de T02 dentro de la tarjeta `.tw` (fondo `rgba(15,16,19,.55)` + `backdrop-blur`, borde `rgba(255,255,255,.09)`, radio 12).
   - No miembros (I1): solo el trofeo Dios de Arena (que no quede estirado: ancho de una columna o centrado, a tu criterio, consistente a 1280 y 375).
   - Títulos (`title-list`): filas `.trw` (icono `lucide-react` según I9 en círculo del tono, nombre `font-display` 17 px, pips HOY/SEM, «por qué» de cada periodo en líneas "Hoy: …" / "Semana: …", "con X y Y"); cabecera con recuento y enlace `TITLES_LINK`; estado vacío (I5).
   - Escalera (`group-ladder`): filas con posición, escudo pequeño, nombre como `Link` al perfil, rating, cambio del día; fila propia destacada; pie con la distancia al de arriba.
4. **Barra fija** (I6): una sola cabecera `sticky` (`top-[env(safe-area-inset-top,0px)]`) con frescura, Actualizar (el único `#REFRESH_BUTTON_ID`) y ⋯. Con el banner visible va transparente sobre el banner (arriba a la derecha); cuando el banner sale de la vista (IntersectionObserver sobre el banner), gana fondo, borde inferior y la identidad compacta (avatar 32 px, nombre, liga · rating). Avisos de límite y de error y el toast, como hoy.
5. **Cableado**: `page.tsx` monta la vitrina; `Cabin` sin la franja `god` (o con la vitrina en su lugar); `sync-band` sigue debajo; tabs, raíl y franja sin cambios (I2). Quita "EUW" y "Arena · temporada actual" (I3). Borra `header.tsx`/`arena-god.tsx` (y `title-badges*` si T01 no lo hizo) cuando nada los use; si algo los necesita, explícalo.
6. **`loading.tsx`**: esqueleto con banner (alto similar), identidad y dos tarjetas.
7. **Comprobación en navegador** (tú mismo, antes de cerrar): arranca la app con la config `hylistats-dev-noworker` de `.claude/launch.json` (BD local en Docker, puerto 5433, ya levantada) y mira a 1280 y 375 px un miembro con títulos, un miembro sin títulos y un no miembro (busca perfiles en la BD local: `src/db/`, tabla de perfiles y lista del grupo). Sin scroll horizontal a 375 px. Comprueba la barra fija haciendo scroll y que Actualizar responde. Pon en el informe qué perfiles miraste y qué viste; no hace falta adjuntar capturas (las hace T04).

Reglas comunes (todas las tasks de código):
- Next.js 16 tiene cambios incompatibles: antes de escribir código de Next (componentes de servidor/cliente, `Image`/`img`, `Link`) lee la guía correspondiente en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas. Textos de UI en español; comentarios con la densidad y el tono del código que tocas (los archivos de `src/app/euw/[slug]/` explican rangos responsive y decisiones en un comentario de cabecera: sigue ese estilo).
- La UI no tiene jsdom: si añades lógica (p. ej. decidir cuándo compactar la barra), va en módulos puros con tests.
- No hagas crecer `data.ts` más allá del cableado mínimo; nada de la `GroupView` entera al cliente.
- No imprimas ni commitees secretos. Si una regla de la spec no se puede cumplir o contradice el código, **para y descríbelo** en tu informe en vez de inventar una alternativa.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. Para el servidor de la comprobación al terminar. No hagas commit; lo hace el orquestador.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC1–AC10 de la spec cumplidos en código.
- [ ] Un solo `#REFRESH_BUTTON_ID`; Actualizar, Sincronizar y Reintentar funcionan.
- [ ] Sin `GroupView` entera en el payload del cliente.
- [ ] Comprobación en navegador a 1280 y 375 px descrita en el informe.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Evidencias <!-- MUST -->

