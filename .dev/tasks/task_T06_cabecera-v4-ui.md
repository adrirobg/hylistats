# Task T06 — Cabecera v4: identidad con liga, El grupo hoy, títulos por compañero y aviso flotante

**Owner**: worker:opus
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: instancia derivada de `spec.md` (sección "Revisión v4"). Depende de T05 (tipos `GroupTodayRow`, `TitleRow` por compañero, `VitrinaGroup.today`).

## Objetivo <!-- MUST -->

Llevar la vitrina a la **propuesta B** de `.dev/research/cabecera/propuestas-v4.html` (la referencia visual: ábrela y lee su CSS; mismos tamaños, gaps y rangos): cabecera mucho más baja, con El grupo hoy en lugar del trofeo Liga y la Escalera.

## Contexto <!-- SHOULD -->

- spec.md → "Revisión v4": D1–D6, AC14–AC18. Lo demás del Alcance original sigue (barra fija reducida, un solo `REFRESH_BUTTON_ID`, splash, avisos de error/límite de la vitrina, I1 no miembros).
- Archivos: `src/app/euw/[slug]/vitrina.tsx` (identidad y barra), `page.tsx` (`ProfileCabin`, `VitrinaGroupBlock`, `TrophyGrid`), `vitrina-ui.tsx` (`TrophyGrid`, `TrophyCard`), `league-trophy.tsx`, `group-ladder.tsx`, `title-list.tsx`, `god-trophy.tsx` (solo la versión compacta del pie: "Cuadra con el contador oficial" → ✓ de "oficial N"; no cambies la lógica del aviso), `sync-band.tsx` + `cabin.tsx` (slot `band`), `loading.tsx`, `src/components/hy/toast.tsx`/`notice.tsx`.
- Container queries sobre `.app` como el resto (`@max-[1000px]`, `@max-[900px]`, `@max-[640px]`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Identidad (D1, D2)**: avatar 64 px (52 en móvil); en la línea del nombre (`text-[44px]`, 28 en móvil): `#tag`, ★, chip de identidad, chip Deidad. Debajo, en miembros, la **línea de liga**: escudo (`LeagueShield`), nombre de liga, rating (`provisional` si toca), chips hoy/semana (los de `LeagueTrophy`, ocultos si `null`), "**Nº de N**" y "a N de X" / "líder por N" (de `facts`). El aviso de Arena fuera de rotación sigue debajo. Reduce el padding del banner (maqueta: 18/20/16 px) y deja la barra a la altura de la identidad. `LeagueTrophy` deja de usarse: bórralo si nadie más lo importa.
2. **Fila de trofeos (D3, D4)**: `TrophyGrid` con `grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]`, una columna `@max-[1000px]`. Primera tarjeta **El grupo hoy** (componente nuevo, p. ej. `group-today.tsx`, de servidor) con `group.today`: tabla `#`, escudo + nombre (enlace `/euw/<slug>`, `prefetch={false}` como en la escalera), Rating, Hoy (cambio, verde/rojo), Part., 1º (oro si > 0), Media (verde ≤ 3, rosa ≥ 3,75) y Últimas (retratos 22 px con su puesto en una esquina, el 1º en oro). Sin partidas hoy: celdas «—» y fila atenuada. Cabecera "El grupo hoy" + "N partidas" (o "sin partidas hoy"). **Sin desborde horizontal**: contenedor `min-w-0 overflow-hidden`, nombre truncado; en `@max-[640px]` ocultar Rating y Últimas. Segunda tarjeta Dios de Arena compacta (anillo ~78 px, cifra ~50 px). No miembros: solo Dios de Arena (como hoy). `GroupLadder` deja de usarse: bórralo si nadie más lo importa.
3. **Títulos (D5)**: `TitleList` a todo el ancho bajo el banner (sustituye a `VitrinaGroupBlock` de dos columnas), rejilla de 2 columnas (`@max-[1000px]` una), tarjetas alineadas arriba (sin estirarse). Cada tarjeta: icono, nombre + `metric` en pequeño; por cada `line`: chips de compañeros (icono 18 px + nombre en negrita, **`Link` a su perfil**), "+" entre chips de trío, y por cada periodo la marca HOY/SEM + `text` (con `title={why}`). Fuera el recuento; queda el enlace "Cómo funcionan los títulos". En `@max-[640px]` se oculta el texto del periodo (quedan las marcas). Estado vacío como hoy.
4. **Aviso flotante (D6)**: los modelos `paused` y `rate_limit` de `SyncBand` salen como aviso flotante fijo abajo a la derecha (ancho ~340 px; en móvil, de lado a lado con 12 px) con botón de cerrar (`aria-label="Cerrar aviso"`); cerrado no vuelve hasta que cambie el tipo de aviso. Va en portal sobre `<body>` como `ToastRegion` (el `container-type` de `.app` rompe `fixed`). El resto de modelos de la banda (progreso del backfill, cola) siguen en el flujo como hoy. No dupliques el aviso de límite de la vitrina: si ahora salen los dos, deja uno y explícalo.
5. **Carga**: `loading.tsx` con la forma nueva (identidad con dos líneas, fila de dos tarjetas, títulos).
6. Mide en el navegador (servidor de la rama ya en marcha en http://localhost:3005, BD local; **no lo pares ni arranques otro**) el `top` de `[role=tablist]` en `/euw/Hylimichi-EUW` a 1440×860 y a 375 px y ponlo en el informe (objetivo AC14: ≤ 700 y ≤ 1000). Comprueba también ~700 px sin scroll horizontal y `/euw/elruffles-6485` (no miembro).

Reglas comunes:
- Next.js 16 tiene cambios incompatibles: antes de escribir código de Next lee la guía en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas. Textos en español; comentarios con la densidad y el tono del código que tocas (los comentarios de cabecera de `vitrina.tsx` y `title-list.tsx` describen la propuesta: actualízalos a la v4).
- Si algo de la spec no se puede cumplir o contradice el código, **para y descríbelo**.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. Sin commit.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC14–AC18 de la spec.
- [ ] Componentes sin uso retirados (`LeagueTrophy`, `GroupLadder`) o justificados.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.
