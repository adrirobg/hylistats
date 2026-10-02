# Sesiones cloud de Claude Code

Cómo trabajar en hylistats desde [claude.ai/code](https://claude.ai/code) (sesiones en la nube) y qué cambia respecto a local. Guía oficial: <https://code.claude.com/docs/en/claude-code-on-the-web>.

## Qué es una sesión cloud

- Claude trabaja en un **contenedor efímero**: clona el repo al empezar y el contenedor se descarta tras un rato de inactividad. Lo que no esté commiteado y pusheado se pierde.
- La plataforma asigna a cada sesión una rama `claude/...` y no deja configurar el prefijo. Por convención (`AGENTS.md`) se trabaja en `cloud/tipo/N-slug`; para asegurarlo, indícalo también en el primer mensaje de la sesión. Los cambios llegan a `main` por PR, como siempre.
- No hay `.env.local` ni secretos: los tests no los necesitan.

## Preparación automática del contenedor

El hook `SessionStart` (`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`) deja el contenedor listo para `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`:

1. **Node 24**: la imagen trae Node 22; el hook instala la versión de `.node-version` con `n`.
2. **Postgres en el puerto 5433**, con las BD `hylistats` y `hylistats_test` y el usuario `hylistats`, igual que `docker compose` y CI. Docker no funciona en el contenedor, así que usa el Postgres 16 que trae la imagen (en local y producción es 17; los tests no dependen de la diferencia).
3. **Dependencias**: `npm ci`, solo si faltan o ha cambiado `package-lock.json`.

**En local no hace nada**: sale nada más empezar si `CLAUDE_CODE_REMOTE` no vale `true`, que solo se define en la nube.

El hook se lee de la rama con la que arranca la sesión: hasta que esté en `main`, solo lo usan las sesiones que partan de una rama que lo tenga.

## Configuración del entorno (claude.ai)

Menú del entorno en la barra de título de la sesión → **Edit**:

| Campo | Qué poner |
|---|---|
| Acceso a la red | **De confianza** basta para programar y pasar tests (npm funciona). Bloquea Riot (`*.api.riotgames.com`, `ddragon.leagueoflegends.com`, `raw.communitydragon.org`) y el MCP de Supabase (`mcp.supabase.com`); solo hay que añadirlos si se necesitan desde la nube |
| Credenciales de API | Vacío. La key de Riot vive en el entorno de producción (Render) y no se trae a la sesión |
| Script de configuración | Vacío: lo hace el hook, que está versionado en el repo |
| Variables de entorno | Vacío. Son visibles para cualquiera que use el entorno: **nunca secretos** |

## Limitaciones

- **Sin Riot API ni MCP de Supabase** con la red "De confianza" (ver arriba). Grabar fixtures (`npm run fixtures:record`) o sincronizar temporada se hace en local.
- **Sin URL propia para ver la app**: Claude puede arrancarla y hacer capturas con Playwright, pero para probarla a mano, mejor en local.
- **El MCP de Render** funciona porque es un conector de la cuenta de claude.ai, no del repo.
