# Task T09 — noindex y descargo de Riot

**Owner**: worker:haiku
**Estado**: pending *(mirror legible — si diverge, manda `.dev/tasks/index.json`)*

*Artefacto de ejecucion*: esta task es una instancia derivada de `spec.md`/issue. Su nucleo es el par `Contexto` + `Prompt / instrucciones para worker` + criterios de aceptacion; no sustituye el source of truth superior.

## Objetivo <!-- MUST -->

La web no es indexable (robots, meta y cabecera `X-Robots-Tag`) y todas las páginas muestran en el footer el descargo "not endorsed by Riot Games".

## Contexto <!-- SHOULD -->

- spec.md: Alcance (último punto), Entregable 9.
- `.dev/research/stack.md` §7 fila "`noindex`" (tres capas: `robots.txt` con `Disallow: /`, meta `noindex,nofollow`, cabecera `X-Robots-Tag: noindex, nofollow` en `next.config.ts`).
- `.dev/research/riot-api.md` §11 (descargo legal obligatorio).
- Next.js 16: leer `node_modules/next/dist/docs/` (`robots.ts`, `metadata`, `headers` en `next.config.ts`).

## Prompt / instrucciones para worker <!-- MUST -->

Sin llamadas a la Riot API ni lectura de `.env.local`.

1. `src/app/robots.ts`: `rules: { userAgent: '*', disallow: '/' }`.
2. `src/app/layout.tsx`: `metadata.robots = { index: false, follow: false }` (conserva el resto del layout) y un `<footer>` con este texto exacto: "hylistats isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."
3. `next.config.ts`: `async headers()` que añade `X-Robots-Tag: noindex, nofollow` a `source: '/:path*'`, conservando `images.unoptimized`.
4. Tests: `robots()` devuelve `disallow: '/'`; `nextConfig.headers()` incluye la cabecera para `/:path*`.
5. `npm run lint && npm run typecheck && npm test && npm run build` en verde.

## Criterios de aceptacion <!-- MUST -->

- [ ] `/robots.txt` con `Disallow: /`, meta `noindex, nofollow` y cabecera `X-Robots-Tag` en todas las rutas.
- [ ] Footer con el descargo en todas las páginas.
- [ ] `lint`, `typecheck`, `test`, `build` en verde.

## Notas de implementacion <!-- MAY -->

## Evidencias <!-- MUST -->
