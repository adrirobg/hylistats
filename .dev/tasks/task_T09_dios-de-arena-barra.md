# Task T09 — Dios de Arena v5: barra con hitos y últimos conquistados

**Owner**: worker:opus
**Estado**: done *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: derivada de `spec.md` → "Revisión v5" (D7, AC21). Depende de T08 (que reordenó la tarjeta en no miembros y movió avisos).

## Objetivo <!-- MUST -->

Sustituir el anillo de `GodTrophy` por la **variante 1** de `.dev/research/cabecera/propuestas-v5-dios.html` (referencia visual: lee su CSS `.g5`, `.gbar`, `.facts`, `.recent` y el `<script>`), con los datos reales del perfil.

## Contexto <!-- SHOULD -->

- `src/app/euw/[slug]/god-trophy.tsx` (componente), `god-ring.ts` + `god-ring.test.ts` (geometría pura del anillo: capas verificados / manuales / oficial, meta 60 o catálogo), `arena-god-notice.tsx` (aviso y acciones: no cambia su lógica), `page.tsx` (props de `GodTrophy`: `verifiedIds`, `official`, `goal`, `goalName`…).
- `VerifiedChampion` (`src/domain/stats.ts:74`) tiene `firstWinAt`; `data.verifiedChampions` ya llega a `page.tsx`. Retratos y nombre visible: el `ChampionCatalog` (`portraitUrl`, nombre de Data Dragon) como en el álbum. Panel de campeón: `?campeon=` (`CHAMPION_PARAM` en `champion-panel-view.ts`; mira cómo enlaza el álbum o la tarjeta del álbum).
- Semana de juego: `periodKey("week", ts)` de `src/domain/group-titles.ts` (la misma semana que los títulos SEM).
- Fechas cortas: `formatShortDate` (como `periodLabel`).

## Prompt / instrucciones para worker <!-- MUST -->

1. **Geometría pura**: convierte (o amplía) `god-ring.ts` en la de una barra: posiciones en % de cada capa (verificados, manuales encima, marca del oficial), de la marca de la Deidad (60) y el final; misma semántica de capas y metas que hoy (los tests actuales del anillo pasan a la barra: mismos casos — manuales, oficial nulo, meta 60/173). Si el anillo deja de usarse, bórralo.
2. **Datos puros nuevos** (módulo de vista, p. ej. en `vitrina-view.ts` o `god-trophy-view.ts`, con tests): `recentConquests(verified, catalog, n = 5)` → `{ championId, name, portraitUrl, firstWinAt, dateText }[]` por `firstWinAt` desc (empate: `championId` desc); `newThisWeek(verified, now)` → número con primer 1º en la semana de juego de `now`.
3. **UI** (`GodTrophy`): cabecera como hoy ("Dios de Arena ?" · "temporada"); fila grande "N / meta" (`text-[50px]`, 36 en móvil) con el % a la derecha; la barra (12 px, marcas como en la maqueta, etiquetas "0", "♛ Deidad · 60 ✓" y "Dios · 173"; con meta 60 —«Deidad de Arena» como meta—, la etiqueta final es la meta); línea de datos: "faltan N", "+N esta semana" en verde (oculto si 0) y "✓ oficial N" cuando cuadra; si hay descuadre o sincronizando, el aviso de `ArenaGodNotice` como hoy (en miembros debajo; en no miembros a la derecha, como dejó T08). **Últimos conquistados**: etiqueta + 5 retratos de 36 px (borde `won-deep`, el más reciente en `place-1`) con la fecha corta debajo, cada uno `Link` a `?campeon=…` conservando la pestaña actual como hace el álbum, `title` "Nombre · primer 1º el …". Sin verificados: sin la fila de retratos.
4. Comprueba en el navegador (http://localhost:3005, servidor del orquestador: no lo pares ni arranques otro; BD local) Hylimichi a 1440 (la tarjeta no supera el alto de El grupo hoy), ~700 y 375 px, y `/euw/elruffles-6485` (no miembro con descuadre). Restaura el tamaño de ventana al terminar.

Reglas comunes:
- Next.js 16: antes de escribir código de Next lee la guía en `node_modules/next/dist/docs/`.
- Sin dependencias nuevas. Textos en español; comentarios con la densidad y el tono del código vecino (actualiza la cabecera de `god-trophy.tsx`).
- No hagas crecer `data.ts`. Si algo no encaja, **para y descríbelo**.
- Al terminar: `npm run lint && npm run typecheck && npm test && npm run build` en verde. Sin commit.

## Criterios de aceptacion <!-- MUST -->

- [ ] AC21 de la spec.
- [ ] Anillo retirado (o justificado) y tests de la barra con los casos del anillo.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` en verde.
