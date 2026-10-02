# hylistats

Webapp de estadísticas de perfil de jugador para seguir el progreso en el modo Arena de LoL con la Riot API.

## Requisitos

- Node.js (LTS) y npm
- Docker (para Postgres en local)

## Puesta en marcha

```bash
docker compose up -d          # Postgres en el puerto 5433 (BD hylistats y hylistats_test)
cp .env.example .env.local    # completar RIOT_API_KEY y ADMIN_TOKEN
npm install
npm run db:migrate            # el esquema y este script llegan con la task de BD
npm run dev                   # http://localhost:3000
```

`.env.local` está ignorado por git: no lo commitees ni compartas la key de Riot.

En las sesiones cloud de Claude Code el contenedor se prepara solo: ver [`docs/cloud.md`](docs/cloud.md).

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo de Next |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción (tras `build`) |
| `npm run lint` | Biome (lint + formato + imports) |
| `npm run format` | Formatea el código con Biome |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests con Vitest (usan la BD `hylistats_test`, nunca la de desarrollo) |

> hylistats no está avalada por Riot Games ni refleja las opiniones de Riot Games.
