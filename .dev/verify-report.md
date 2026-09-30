# Verify Report: hylistats — iter-04 stats personales y detalles rápidos
**Fecha**: 2026-09-30
**Consume**: commits de `feat/7-stats-personales` (T01–T09 y la corrección `77607d9`), AC1–AC11 de `.dev/spec.md` (issue [#7](https://github.com/adrirobg/hylistats/issues/7))
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

Los once criterios de `spec.md`. AC4 y AC5 se verificaron contra la app en local sobre la BD dev (1196 partidas) y AC7 contra Riot con la dev key vigente.

- spec.md AC1: columnas nuevas sin nulos, muestra contra el JSON crudo y relleno idempotente.
- spec.md AC2 y AC3: tests del dominio de estadísticas y de frío/calor.
- spec.md AC4: cruce SQL independiente frente a la app en los 6 perfiles del grupo (anexo A).
- spec.md AC5: `?tab=estadisticas` por URL, cada récord frente al detalle de su partida, 375 px, escritorio y teclado.
- spec.md AC6: badge, meta «Dios de Arena» y renombrado.
- spec.md AC7: icono de invocador con la API real y fallo simulado en test.
- spec.md AC8: menú ⋯ en todos los cromos, con los slugs límite.
- spec.md AC9: logo (3 propuestas, elección del supervisor, cabecera y favicon).
- spec.md AC10: checks locales. El CI queda pendiente del push.
- spec.md AC11: **gate de merge**, aceptación manual del supervisor.

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5.0), `next` 16.3.7 (Turbopack), `vitest`, Biome.
- Postgres en Docker (`hylistats-postgres-1`, puerto 5433): la BD `hylistats` (dev) para E2E y AC4, y `hylistats_test` para los tests.
- Preview `hylistats-dev-noworker` (`next dev`, `WORKER_ENABLED=false`) para UI y AC4. El preview `hylistats-dev` (con worker) solo se usó para AC7 contra Riot.
- Dev key renovada a las 15:07 UTC. Se usó sin errores a las 21:26 UTC.
- Navegador integrado del desktop app (Chromium), con viewport emulado por `resize_window`.

## Checks ejecutados <!-- MUST -->

```bash
# AC10 (sobre 77607d9)
npm run lint && npm run typecheck && npm test && npm run build

# AC1
docker exec hylistats-postgres-1 psql -U hylistats -d hylistats -tAc \
  "select count(*), (select count(*) from matches where raw_gz is null), (select count(*) from participants),
          (select count(*) from participants where total_damage_taken is null or largest_killing_spree is null) from matches"
npm run db:backfill-columns          # 2.ª ejecución (y siguientes): 0 filas
# Muestra: 25 partidas (order by md5(match_id)), raw_gz → gunzip → JSON, frente a participants por (match_id, puuid)

# AC4: SQL propio (anexo A) frente al HTML de /euw/<slug>?tab=estadisticas y ?tab=campeones&filtro=todos&orden=calor
# AC5: fetch del HTML de cada récord → detalle de su partida → fila del propio jugador (30 récords, 6 perfiles)

# AC7
select game_name, profile_icon_id from profiles;
select id, status, kind, last_error from sync_jobs order by updated_at desc limit 8;
```

## Resultados observados <!-- MUST -->

- **AC1**:
  - 1196 partidas, 0 sin `raw_gz`, 21 528 filas de `participants` y **0 nulos** en `total_damage_taken` y `largest_killing_spree`.
  - La muestra de 25 partidas da 450/450 participantes iguales al JSON crudo.
  - 1.ª ejecución del relleno (T01): 21 456 filas. Las siguientes: `Filas actualizadas: 0`.
  - Las 4 partidas que entraron por el sync real de AC7 ya llegaron rellenadas por la ingesta.
- **AC2** (`records.test.ts`, 32 tests): empate de récord (gana la más antigua), racha en curso, 01:30 en el día anterior, día con 2 partidas excluido, jugador sin ningún 1º, y 05:30/06:30 los días 2026-03-29 y 2026-10-25.
  - El día de juego toma la hora **local** de Madrid, no `gameStartTimestamp − 6 h`: la resta sobre el instante falla en los cambios de hora (T02).
- **AC3** (`heat.test.ts`, 11 tests): 4 partidas → sin marca; justo ±0,4 → hot/cold; algún 1º → sin marca; media global con todas las partidas (el resultado cambia si se excluyen). Con 2 tests más, un cromo con marca manual se trata como neutral (T05).
- **AC4**: **90/90 comparaciones cuadran, 0 discrepancias** (anexo A).
  - 🔥 SQL = app = 1 (Blitzcrank, BEJITO MAMBO).
  - ❄️ SQL = app = 16, con los nombres uno a uno: Hylimichi 2, Azpekaa 3, BEJITO MAMBO 2, Krill1nt 2, zapas14 3, TheCIutch 4.
  - Los desempates se probaron con empates reales en 5 perfiles.
- **AC5**:
  - `?tab=estadisticas` abre por URL directa y la pestaña está entre Resumen y Compañeros.
  - **30/30 récords** (5 × 6 perfiles) enlazan a una partida cuyo detalle, en la fila del propio jugador, muestra el mismo valor: daño y recibido exactos (en `title`), kills y muertes en K/D/A y «racha N». Esto requirió la corrección `77607d9` (ver Hallazgos).
  - A 375 px, `scrollWidth` es 375 en Estadísticas y en el detalle.
  - Con el teclado, el foco llega de la pestaña a las tarjetas con `:focus-visible` (2 px).
  - «Campeón con más 1º» abre su panel sobre Estadísticas. Sin errores en consola.
- **AC6**:
  - Azpekaa (63): badge «Deidad de Arena» y «DIOS DE ARENA · 63 de 173», con escala `0 40 80 120 173 · Dios de Arena`.
  - Hylimichi (107) a 375 px: badge visible y 107 de 173.
  - TheCIutch (30): sin badge y «DEIDAD DE ARENA · 30 de 60».
  - El tooltip se abre con Enter y la condición está en `aria-describedby`.
  - «Arena God» no aparece en el texto de ninguna página, y hay un test sobre los textos del dominio y de los componentes.
  - La spec escribe «Dios de Arena: X / N» y la barra dice «Dios de Arena · temporada actual» y «X de N»: misma información, en el formato actual de la barra.
- **AC7**:
  - Los incrementales 95–98, con la dev key, cerraron `done` sin `last_error` y guardaron `profile_icon_id` (Azpekaa 539, BEJITO MAMBO 7176, Hylimichi 7146, TheCIutch 4070, zapas14 7027).
  - La cabecera carga `ddragon…/16.19.1/img/profileicon/7146.png`. Un perfil sin icono muestra el placeholder de iniciales.
  - En los tests del worker, un 500 deja el job `done` con `summoner: …` en `lastError`, y un 403 pausa como hoy.
  - Krill1nt y elruffles tendrán icono en su próximo sync.
- **AC8**:
  - El ⋯ aparece en cromos ganados, sin ganar y sin jugar: 173/173 en un perfil ajeno, que antes no tenía menú.
  - Builds (op.gg, LoLalytics, METAsrc, u.gg, Blitz) se abren en pestaña nueva (`noopener noreferrer`), con slugs `kaisa` y `Kaisa` en Kai'Sa.
  - Los 5 slugs límite tienen test (menú = panel).
  - «Marcar como ganado a mano…» solo aparece en «mi perfil» y donde `manualActionFor` lo daba.
  - Esc devuelve el foco al ⋯ sin abrir el panel.
- **AC9**:
  - Las 3 propuestas y sus capturas están en `.dev/research/logo/`.
  - El supervisor eligió la **A · Sello 1º** en la sesión del 2026-09-30.
  - El logo está en la barra superior y en la landing, y el favicon es `src/app/icon.svg` (`image/svg+xml`). Se retiró el `favicon.ico` de serie.
- **AC10**:
  - En local: lint limpio (169 ficheros), typecheck OK, **50 ficheros y 1110 tests** en verde, y build OK.
  - **CI: pendiente**. La rama aún no está en origin; se confirma al abrir la PR.
- **AC11**: no lo puede cerrar el orquestador (ver Conclusión).

## Juicio de coherencia y sentido <!-- MUST -->

- **Canon ↔ instancias**:
  - Los 10 entregables tienen una task (T01–T09, más T10 que es este informe), y sus Evidencias cuadran con lo observado aquí.
  - Se respetan F15 (orden: personal ahora, grupo en iter-05), F16 (fórmula, K = 5, mínimo 5 y umbral 0,4 en `config.ts`) y F17 (corte a las 06:00 de Madrid con `Intl`, sin librerías nuevas).
  - Nombres del supervisor: «Deidad de Arena», «Dios de Arena», «Modo diablo» y «Nevera».
  - No entra nada de «No incluye»: ni capa de grupo, ni pestaña de stats de campeones, ni evolución del frío/calor.
- **Sentido en el dominio**:
  - Hay más ❄️ que 🔥 (16 frente a 1). Tiene sentido: 🔥 exige un campeón **sin ningún 1º** que aun así rinda 0,4 puestos mejor que la media, y quien juega bien con un campeón suele acabar ganando con él.
  - Si al grupo le parecen pocos 🔥, las constantes están marcadas como revisables.
  - En el álbum, «Nevera» sirve para descartar campeones. «Modo diablo» señala objetivos cercanos.
- **Mismatch spec ↔ código**:
  - Formato «Dios de Arena: X / N» (ver AC6): se aceptó el formato de la barra.
  - El prompt de T02 decía «`gameStartTimestamp − 6 h`», y el código aplica la regla de la spec (06:00 hora local). La spec manda.
  - Las fechas de las partidas se pintan en UTC (convención de `@/lib/format`), y los días de juego en Madrid (F17). Una partida a las 00:58 de Madrid sale «5 ago» (fecha UTC) y cuenta en el día de juego del 5. Es coherente con la lista de Partidas.

## Revision de calidad del codigo <!-- SHOULD -->

Pasada sobre el diff de la rama: 63 ficheros de `src/` y `tests/`, unas 4500 líneas añadidas, de ellas unas 1900 de tests.

- **Lógica pura aparte y probada**: `records.ts`, `heat.ts`, `arenaGodGoal`, `stats-panel-view.ts`, `cardMenuContent` y `effectiveHeat`. Cada una tiene sus tests.
- **Una sola definición compartida**:
  - `firstTryMatches` (Resumen y Estadísticas);
  - `championLinks` (panel y menú ⋯);
  - `computeHeat`, calculado una vez en `data.ts` para el álbum y el panel;
  - la condición del badge, solo en el dominio.
- **Contenido nuevo reutilizable**:
  - `components/hy/badge.tsx` es genérico, para iter-05.
  - `formatCount` pasa a `@/lib/format`: lo usaba `match-detail.tsx` desde la vista de otra pestaña.
- **Large module**, a vigilar:
  - `data.ts` pasa de 621 a 679 líneas, con carga por pestaña (`records`), `heat` y `arenaGod`. Sigue la deuda de iter-03 de partirlo.
  - `album-card.tsx` tiene 549 líneas.
- **Test que lee código fuente**: el test de renombrado de `arena-god.test.ts` lee los `.tsx` sin comentarios para buscar «Arena God». Es frágil ante refactors, pero barato y explícito.
- Sin generalidad especulativa ni middle man. El `Badge` es genérico a propósito: la spec lo pide como primera pieza de iter-05.

## Replay / validacion independiente <!-- SHOULD -->

- **AC4**: lo validó un actor distinto al que escribió el código, con SQL propio, sin reutilizar el TS de la app y comparando con el HTML servido.
- **AC5**: se comprobó siguiendo los 30 enlaces reales, no con tests.
- **AC1**: muestra contra el JSON crudo descomprimido fuera de la app (Python, `gzip`).
- **AC7**: API real de Riot. El fallo 500 se cubre con test, porque no se puede provocar contra Riot.
- **No aplica** un replay de sync masivo: los incrementales son idempotentes y la spec no pide backfill.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| El detalle de partida no mostraba daño recibido ni racha de kills, y el daño salía abreviado: 2 de los 5 récords no cumplían AC5 | resuelto | N/A | `77607d9`: `MatchPlayer.damageTaken` y `killingSpree`, `title` con la cifra exacta. 30/30 récords verificados |
| El récord pintaba la fecha en Madrid y la fila de Partidas en UTC («6 ago» frente a «5 ago») | resuelto | N/A | T04: `formatGameDate` en UTC, como `@/lib/format` |
| Un cromo con marca manual de «ganado» podía mostrar 🔥/❄️ | resuelto | N/A | T05: `effectiveHeat`, con 2 tests |
| La escala de la barra se solapaba con la meta 173 («1573 · Dios de Arena 180») | resuelto | N/A | T06: paso 40 con `scaleMax` > 100 y sin ticks a < 20 de la meta, con tests y captura |
| Sin datos reales de racha «en curso» ni de victoria sin morir en ningún perfil | diferido | Supervisor | Cubierto por tests unitarios. Se verá en AC11 si se da |
| El tooltip del badge no se abre solo con el foco (sí con Enter, clic y hover) | diferido | Supervisor | La descripción se anuncia por `aria-describedby`. Hilo «Pulido UI» si molesta |
| `data.ts` sigue creciendo (679 líneas) | diferido | Orquestador | `learn.md` → Deuda (ya registrada en iter-03) |
| Krill1nt y elruffles sin icono hasta su próximo sync | diferido | N/A | Comportamiento esperado: el icono se rellena en `closeJob` |

## Conclusion <!-- MUST -->

**PASS** (CI pendiente de confirmar al abrir la PR)

- **AC1**: 0 nulos, 450/450 contra el JSON y relleno idempotente.
- **AC2 y AC3**: 32 + 11 tests con todos los casos pedidos.
- **AC4**: 90/90 y ❄️/🔥 17/17.
- **AC5**: 30/30 récords iguales en su partida, 375 px, teclado.
- **AC6 a AC9**: verificados en el navegador (AC7 además con la API real).
- **AC10**: 1110 tests y build en verde en local.
- **Gate de merge (aceptación manual del supervisor)**:
  - **AC11**: en una sesión real de Arena, el grupo abre Estadísticas y el álbum con las marcas, y nadie encuentra un valor que contradiga su partida.
  - En la misma sesión: **AC5 de #3** (criterio de terminado de la v1: elegir campeón y consultar stats y compañeros sin otra web; el recuento cuadra con el oficial o la app lo explica) y **AC8 de #2** (elegir campeón desde «Objetivos sin ganar»).

## Anexo A — AC4: cruce SQL frente a la app

Fecha de ejecución: 2026-09-30 (SQL y HTML de la app capturados seguidos; worker parado). BD: `participants` = 21528 filas (0 con `total_damage_taken`/`largest_killing_spree` nulos), `matches` = 1196 (1034 en cola 1750, 162 en cola 1740).
`SEASON_START=2026-05-12T00:00:00Z` en `.env.local` = 1778544000000 ms (confirmado). Universo por perfil: participants ⨝ matches, `queue_id in (1750,1740)`, `game_creation >= 1778544000000`, `placement between 1 and 6`.

Criterios y decisiones de interpretación del lado SQL:
- Orden cronológico = `(game_creation, match_id)`. Desempates: récords y «victoria con más muertes» → la más antigua; rachas (1º y sequía) y mejor/peor día → la más reciente; campeón con más 1º → más partidas, luego nombre.
- Día de juego: `((to_timestamp(game_start_timestamp/1000.0) at time zone 'Europe/Madrid') - interval '6 hours')::date`, mín. 3 partidas.
- La app muestra fechas de partida en UTC (`game_creation`); el SQL las convierte igual para comparar (`at time zone 'UTC'`). Las fechas de mejor/peor día son fechas de juego (Madrid-6h), sin conversión.
- Nombres: la app usa el nombre localizado (Bel'Veth, Aurelion Sol, K'Sante, Miss Fortune, Kog'Maw, **Wukong**, **Maestro Yi**); la BD guarda el id de Data Dragon (Belveth, AurelionSol, KSante, MissFortune, KogMaw, **MonkeyKing**, **MasterYi**). Se comparan con alias; no cuenta como discrepancia.
- Lado app: HTML de `/euw/<slug>?tab=estadisticas` y `/euw/<slug>?tab=campeones&filtro=todos&orden=calor` (173 cromos por perfil) parseado con `html.parser`; «en curso» se detecta por el chip con ese texto (ninguno aparece en los 6 perfiles).
- Comparación automatizada con un script local de uso único (no versionado): ejecuta los `.sql` por `psql --csv` y las regex sobre el HTML; las tablas de abajo salen de ese script.

### 1. Consultas SQL

Todas usan el mismo CTE `base` (cubre los 6 perfiles a la vez, por `profiles.game_name/tag_line` → `puuid`):

```sql
with base as (
  select pr.game_name||'#'||pr.tag_line as player, p.puuid, p.match_id, p.champion_name champ, p.placement pl,
         p.kills, p.deaths, p.total_damage_dealt_to_champions dmg, p.total_damage_taken taken,
         p.largest_killing_spree spree, m.game_creation gc, m.game_start_timestamp gs,
         ((to_timestamp(m.game_start_timestamp/1000.0) at time zone 'Europe/Madrid') - interval '6 hours')::date as dia
  from profiles pr
  join participants p on p.puuid = pr.puuid
  join matches m on m.match_id = p.match_id
  where m.queue_id in (1750,1740) and m.game_creation >= 1778544000000 and p.placement between 1 and 6
    and (pr.game_name, pr.tag_line) in (('Hylimichi','EUW'),('Azpekaa','EUW'),('BEJITO MAMBO','1991'),('Krill1nt','EUW'),('zapas14','EUW'),('TheCIutch','EUW'))
)
```

#### Q1 — Cinco récords (desempate: más antigua)

```sql
-- (CTE base arriba)
, rec as (
  select player, 'dmg' k, dmg v, champ, match_id, gc, row_number() over (partition by player order by dmg desc, gc, match_id) rn from base
  union all select player,'taken', taken, champ, match_id, gc, row_number() over (partition by player order by taken desc, gc, match_id) from base
  union all select player,'kills', kills, champ, match_id, gc, row_number() over (partition by player order by kills desc, gc, match_id) from base
  union all select player,'spree', spree, champ, match_id, gc, row_number() over (partition by player order by spree desc, gc, match_id) from base
  union all select player,'deaths', deaths, champ, match_id, gc, row_number() over (partition by player order by deaths desc, gc, match_id) from base
)
select player, k, v, champ, to_char(to_timestamp(gc/1000.0) at time zone 'UTC','DD Mon YYYY') fecha_utc, match_id
from rec where rn=1 order by player, k;
```

#### Q1b — Marcador, victorias sin morir, victoria con más muertes

```sql
-- (CTE base arriba)
, w as (
  select player, count(*) n, count(*) filter (where pl=1) firsts,
         round(100.0*count(*) filter (where pl<=3)/count(*)) top3, round(avg(pl),2) media,
         count(*) filter (where pl=1 and deaths=0) sin_morir
  from base group by player
),
wd as (
  select player, deaths, champ, match_id, to_char(to_timestamp(gc/1000.0) at time zone 'UTC','DD Mon YYYY') fecha_utc,
         row_number() over (partition by player order by deaths desc, gc, match_id) rn
  from base where pl=1
)
select w.*, wd.deaths vic_mas_muertes, wd.champ, wd.fecha_utc, wd.match_id
from w left join wd on wd.player=w.player and wd.rn=1 order by w.player;
```

#### Q2 — Rachas (gaps-and-islands), mejor/peor día, a la primera, campeón con más 1º

```sql
-- (CTE base arriba)
, ord as (
  select *, row_number() over (partition by player order by gc, match_id) rn,
         row_number() over (partition by player, (pl=1) order by gc, match_id) rn_grp,
         count(*) over (partition by player) total
  from base
),
isl as (
  select player, (pl=1) es_win, rn - rn_grp as g, count(*) len, min(rn) ini, max(rn) fin, max(total) total,
         min(gc) gc_ini, max(gc) gc_fin,
         (array_agg(match_id order by rn))[1] m_ini, (array_agg(match_id order by rn desc))[1] m_fin
  from ord group by player, (pl=1), rn - rn_grp
),
racha as (   -- en_curso = la isla termina en la última partida del jugador; empate -> la más reciente
  select player, case when es_win then 'racha_1o' else 'sequia' end k, len, fin=total as en_curso,
         to_char(to_timestamp(gc_ini/1000.0) at time zone 'UTC','DD Mon YYYY') d_ini,
         to_char(to_timestamp(gc_fin/1000.0) at time zone 'UTC','DD Mon YYYY') d_fin, m_ini, m_fin,
         row_number() over (partition by player, es_win order by len desc, fin desc) r
  from isl
),
dias as (
  select player, dia, count(*) n, round(avg(pl),2) media, avg(pl) media_raw
  from base group by player, dia having count(*)>=3
),
mejor as (select player,'mejor_dia' k, dia, n, media, row_number() over (partition by player order by media_raw asc,  dia desc) r from dias),
peor  as (select player,'peor_dia'  k, dia, n, media, row_number() over (partition by player order by media_raw desc, dia desc) r from dias),
prim as (select distinct on (player, champ) player, champ, pl from base order by player, champ, gc, match_id),
cw as (select player, champ, count(*) filter (where pl=1) wins, count(*) n from base group by player, champ),
alap as (
  select p.player, count(*) filter (where p.pl=1 and c.wins>0) primera1, count(*) filter (where c.wins>0) ganados,
         round(100.0*count(*) filter (where p.pl=1)/count(*) filter (where c.wins>0),1) pct
  from prim p join cw c using (player, champ) group by p.player
),
topc as (select player, champ, wins, n, row_number() over (partition by player order by wins desc, n desc, champ) r from cw)
select player, k, len::text a, en_curso::text b, d_ini||' -> '||d_fin c, m_ini||' / '||m_fin d from racha where r=1
union all select player, k, dia::text, media::text, n::text, null from (select * from mejor union all select * from peor) x where r=1
union all select player, 'a_la_primera', primera1::text, ganados::text, pct::text, null from alap
union all select player, 'campeon_mas_1o', champ, wins::text, n::text, null from topc where r=1
order by player, k;
```

#### Q3 — Frío/calor (F16)

```sql
-- (CTE base arriba)
, g as (select player, avg(pl) glob from base group by player),                       -- media global: todas las partidas del universo
c as (select player, champ, count(*) n, avg(pl) med, count(*) filter (where pl=1) wins from base group by player, champ),
adj as (
  select c.player, c.champ, c.n, round(c.med,3) med, round(g.glob,3) glob,
         (c.n*c.med + 5*g.glob)/(c.n+5) aj, g.glob - (c.n*c.med + 5*g.glob)/(c.n+5) diff
  from c join g using (player) where c.wins=0 and c.n>=5                                 -- sin 1º y >=5 partidas
)
select player, champ, n, med, glob, round(aj,3) aj, round(diff,4) diff,
       case when diff >= 0.4 then 'CALOR' when -diff >= 0.4 then 'FRIO' else '-' end marca
from adj where abs(diff) >= 0.35 order by player, diff;
```

#### Q4 — Empates en el máximo (¿se ejercitan los desempates?)

Cuenta, por perfil y métrica, cuántas filas/islas/días empatan en el máximo (mismo CTE `base`; consulta completa en `q4.sql`). Resultado: hay empates reales en varios casos (abajo, sección 4).

### 2. Estadísticas por perfil (SQL vs app)


#### Hylimichi#EUW

| Métrica | SQL | App | ¿Cuadra? |
|---|---|---|---|
| Más daño a campeones | 156312 · Ahri · 2026-07-28 · EUW1_7932690931 | 156312 · Ahri · 2026-07-28 · EUW1_7932690931 | sí |
| Más daño recibido | 182585 · Zaahen · 2026-08-05 · EUW1_7941668205 | 182585 · Zaahen · 2026-08-05 · EUW1_7941668205 | sí |
| Más kills | 29 · Corki · 2026-09-19 · EUW1_7989233112 | 29 · Corki · 2026-09-19 · EUW1_7989233112 | sí |
| Mayor racha de kills | 20 · Swain · 2026-06-30 · EUW1_7904774891 | 20 · Swain · 2026-06-30 · EUW1_7904774891 | sí |
| Más muertes | 21 · Cassiopeia · 2026-07-05 · EUW1_7910152748 | 21 · Cassiopeia · 2026-07-05 · EUW1_7910152748 | sí |
| Victorias sin morir (nº de 1º con 0 muertes) | 0 | 0 (mensaje «Ningún 1º sin morir todavía») | sí |
| Victoria con más muertes | 15 muertes · Trundle · 2026-09-01 · EUW1_7970278717 | 15 muertes · Trundle · 2026-09-01 · EUW1_7970278717 | sí |
| Racha de 1º (longitud · en curso · fechas UTC · 1ª/última) | 4 · no · 2026-08-24→2026-08-24 · EUW1_7960793096 / EUW1_7960932005 | 4 · no · 2026-08-24→2026-08-24 · EUW1_7960793096 / EUW1_7960932005 | sí |
| Sequía (partidas sin 1º) (longitud · en curso · fechas UTC · 1ª/última) | 38 · no · 2026-09-06→2026-09-09 · EUW1_7974682682 / EUW1_7978289943 | 38 · no · 2026-09-06→2026-09-09 · EUW1_7974682682 / EUW1_7978289943 | sí |
| Mejor día (día · puesto medio · partidas) | 2026-08-03 · 2.64 · 11 | 2026-08-03 · 2.64 · 11 | sí |
| Peor día (día · puesto medio · partidas) | 2026-07-27 · 5.11 · 9 | 2026-07-27 · 5.11 · 9 | sí |
| A la primera (nº · sobre ganados · %) | 13 · 108 · 12.0 % | 13 · 108 · 12.0 % | sí |
| Campeón con más 1º (nombre · 1º · partidas) | Cassiopeia · 3 · 20 | Cassiopeia · 3 · 20 | sí |
| (extra) Marcador: partidas · 1º · top3 % · puesto medio | 911 · 113 · 47 · 3.60 | 911 · 113 · 47 · 3,60 | sí |

#### Azpekaa#EUW

| Métrica | SQL | App | ¿Cuadra? |
|---|---|---|---|
| Más daño a campeones | 157482 · Brand · 2026-06-12 · EUW1_7885412389 | 157482 · Brand · 2026-06-12 · EUW1_7885412389 | sí |
| Más daño recibido | 174582 · Alistar · 2026-09-10 · EUW1_7979875621 | 174582 · Alistar · 2026-09-10 · EUW1_7979875621 | sí |
| Más kills | 29 · Belveth · 2026-08-23 · EUW1_7960100766 | 29 · Bel'Veth · 2026-08-23 · EUW1_7960100766 | sí |
| Mayor racha de kills | 27 · Belveth · 2026-08-23 · EUW1_7960100766 | 27 · Bel'Veth · 2026-08-23 · EUW1_7960100766 | sí |
| Más muertes | 17 · Azir · 2026-09-18 · EUW1_7988030151 | 17 · Azir · 2026-09-18 · EUW1_7988030151 | sí |
| Victorias sin morir (nº de 1º con 0 muertes) | 0 | 0 (mensaje «Ningún 1º sin morir todavía») | sí |
| Victoria con más muertes | 15 muertes · Talon · 2026-09-28 · EUW1_7998035501 | 15 muertes · Talon · 2026-09-28 · EUW1_7998035501 | sí |
| Racha de 1º (longitud · en curso · fechas UTC · 1ª/última) | 4 · no · 2026-08-24→2026-08-24 · EUW1_7960793096 / EUW1_7960932005 | 4 · no · 2026-08-24→2026-08-24 · EUW1_7960793096 / EUW1_7960932005 | sí |
| Sequía (partidas sin 1º) (longitud · en curso · fechas UTC · 1ª/última) | 21 · no · 2026-09-08→2026-09-12 · EUW1_7976967395 / EUW1_7980976455 | 21 · no · 2026-09-08→2026-09-12 · EUW1_7976967395 / EUW1_7980976455 | sí |
| Mejor día (día · puesto medio · partidas) | 2026-09-27 · 1.33 · 3 | 2026-09-27 · 1.33 · 3 | sí |
| Peor día (día · puesto medio · partidas) | 2026-07-27 · 6.00 · 4 | 2026-07-27 · 6.00 · 4 | sí |
| A la primera (nº · sobre ganados · %) | 9 · 63 · 14.3 % | 9 · 63 · 14.3 % | sí |
| Campeón con más 1º (nombre · 1º · partidas) | Brand · 5 · 23 | Brand · 5 · 23 | sí |
| (extra) Marcador: partidas · 1º · top3 % · puesto medio | 488 · 75 · 50 · 3.47 | 488 · 75 · 50 · 3,47 | sí |

#### BEJITO MAMBO#1991

| Métrica | SQL | App | ¿Cuadra? |
|---|---|---|---|
| Más daño a campeones | 175057 · AurelionSol · 2026-07-22 · EUW1_7926916560 | 175057 · Aurelion Sol · 2026-07-22 · EUW1_7926916560 | sí |
| Más daño recibido | 224805 · Zac · 2026-09-17 · EUW1_7986856513 | 224805 · Zac · 2026-09-17 · EUW1_7986856513 | sí |
| Más kills | 32 · Smolder · 2026-08-04 · EUW1_7940629369 | 32 · Smolder · 2026-08-04 · EUW1_7940629369 | sí |
| Mayor racha de kills | 19 · Sivir · 2026-08-11 · EUW1_7947189945 | 19 · Sivir · 2026-08-11 · EUW1_7947189945 | sí |
| Más muertes | 18 · Vayne · 2026-06-17 · EUW1_7890681824 | 18 · Vayne · 2026-06-17 · EUW1_7890681824 | sí |
| Victorias sin morir (nº de 1º con 0 muertes) | 0 | 0 (mensaje «Ningún 1º sin morir todavía») | sí |
| Victoria con más muertes | 13 muertes · AurelionSol · 2026-07-01 · EUW1_7905749342 | 13 muertes · Aurelion Sol · 2026-07-01 · EUW1_7905749342 | sí |
| Racha de 1º (longitud · en curso · fechas UTC · 1ª/última) | 4 · no · 2026-08-24→2026-08-24 · EUW1_7960793096 / EUW1_7960932005 | 4 · no · 2026-08-24→2026-08-24 · EUW1_7960793096 / EUW1_7960932005 | sí |
| Sequía (partidas sin 1º) (longitud · en curso · fechas UTC · 1ª/última) | 27 · no · 2026-09-07→2026-09-10 · EUW1_7976510658 / EUW1_7979403105 | 27 · no · 2026-09-07→2026-09-10 · EUW1_7976510658 / EUW1_7979403105 | sí |
| Mejor día (día · puesto medio · partidas) | 2026-07-21 · 1.67 · 3 | 2026-07-21 · 1.67 · 3 | sí |
| Peor día (día · puesto medio · partidas) | 2026-07-27 · 5.20 · 10 | 2026-07-27 · 5.20 · 10 | sí |
| A la primera (nº · sobre ganados · %) | 18 · 77 · 23.4 % | 18 · 77 · 23.4 % | sí |
| Campeón con más 1º (nombre · 1º · partidas) | AurelionSol · 8 · 23 | Aurelion Sol · 8 · 23 | sí |
| (extra) Marcador: partidas · 1º · top3 % · puesto medio | 601 · 86 · 55 · 3.36 | 601 · 86 · 55 · 3,36 | sí |

#### Krill1nt#EUW

| Métrica | SQL | App | ¿Cuadra? |
|---|---|---|---|
| Más daño a campeones | 130293 · Aphelios · 2026-09-11 · EUW1_7980380080 | 130293 · Aphelios · 2026-09-11 · EUW1_7980380080 | sí |
| Más daño recibido | 243038 · Sion · 2026-07-05 · EUW1_7910152748 | 243038 · Sion · 2026-07-05 · EUW1_7910152748 | sí |
| Más kills | 25 · Swain · 2026-09-20 · EUW1_7989892627 | 25 · Swain · 2026-09-20 · EUW1_7989892627 | sí |
| Mayor racha de kills | 17 · Swain · 2026-09-20 · EUW1_7989892627 | 17 · Swain · 2026-09-20 · EUW1_7989892627 | sí |
| Más muertes | 16 · Annie · 2026-09-25 · EUW1_7994613885 | 16 · Annie · 2026-09-25 · EUW1_7994613885 | sí |
| Victorias sin morir (nº de 1º con 0 muertes) | 0 | 0 (mensaje «Ningún 1º sin morir todavía») | sí |
| Victoria con más muertes | 15 muertes · Yunara · 2026-09-27 · EUW1_7996717153 | 15 muertes · Yunara · 2026-09-27 · EUW1_7996717153 | sí |
| Racha de 1º (longitud · en curso · fechas UTC · 1ª/última) | 3 · no · 2026-09-19→2026-09-20 · EUW1_7989233112 / EUW1_7989266290 | 3 · no · 2026-09-19→2026-09-20 · EUW1_7989233112 / EUW1_7989266290 | sí |
| Sequía (partidas sin 1º) (longitud · en curso · fechas UTC · 1ª/última) | 26 · no · 2026-06-17→2026-08-27 · EUW1_7890515797 / EUW1_7964511614 | 26 · no · 2026-06-17→2026-08-27 · EUW1_7890515797 / EUW1_7964511614 | sí |
| Mejor día (día · puesto medio · partidas) | 2026-09-27 · 2.50 · 4 | 2026-09-27 · 2.50 · 4 | sí |
| Peor día (día · puesto medio · partidas) | 2026-09-18 · 4.83 · 6 | 2026-09-18 · 4.83 · 6 | sí |
| A la primera (nº · sobre ganados · %) | 10 · 27 · 37.0 % | 10 · 27 · 37.0 % | sí |
| Campeón con más 1º (nombre · 1º · partidas) | Ornn · 1 · 16 | Ornn · 1 · 16 | sí |
| (extra) Marcador: partidas · 1º · top3 % · puesto medio | 181 · 27 · 45 · 3.71 | 181 · 27 · 45 · 3,71 | sí |

#### zapas14#EUW

| Métrica | SQL | App | ¿Cuadra? |
|---|---|---|---|
| Más daño a campeones | 140208 · MasterYi · 2026-08-25 · EUW1_7962126334 | 140208 · Maestro Yi · 2026-08-25 · EUW1_7962126334 | sí |
| Más daño recibido | 243048 · Garen · 2026-08-30 · EUW1_7967539387 | 243048 · Garen · 2026-08-30 · EUW1_7967539387 | sí |
| Más kills | 25 · Udyr · 2026-09-17 · EUW1_7986700616 | 25 · Udyr · 2026-09-17 · EUW1_7986700616 | sí |
| Mayor racha de kills | 17 · Udyr · 2026-09-17 · EUW1_7986700616 | 17 · Udyr · 2026-09-17 · EUW1_7986700616 | sí |
| Más muertes | 17 · MasterYi · 2026-07-09 · EUW1_7913465088 | 17 · Maestro Yi · 2026-07-09 · EUW1_7913465088 | sí |
| Victorias sin morir (nº de 1º con 0 muertes) | 0 | 0 (mensaje «Ningún 1º sin morir todavía») | sí |
| Victoria con más muertes | 13 muertes · Leona · 2026-09-17 · EUW1_7986856513 | 13 muertes · Leona · 2026-09-17 · EUW1_7986856513 | sí |
| Racha de 1º (longitud · en curso · fechas UTC · 1ª/última) | 2 · no · 2026-09-27→2026-09-27 · EUW1_7997222696 / EUW1_7997266811 | 2 · no · 2026-09-27→2026-09-27 · EUW1_7997222696 / EUW1_7997266811 | sí |
| Sequía (partidas sin 1º) (longitud · en curso · fechas UTC · 1ª/última) | 45 · no · 2026-07-18→2026-08-28 · EUW1_7922478129 / EUW1_7965598465 | 45 · no · 2026-07-18→2026-08-28 · EUW1_7922478129 / EUW1_7965598465 | sí |
| Mejor día (día · puesto medio · partidas) | 2026-09-01 · 2.57 · 7 | 2026-09-01 · 2.57 · 7 | sí |
| Peor día (día · puesto medio · partidas) | 2026-09-15 · 5.00 · 3 | 2026-09-15 · 5.00 · 3 | sí |
| A la primera (nº · sobre ganados · %) | 4 · 28 · 14.3 % | 4 · 28 · 14.3 % | sí |
| Campeón con más 1º (nombre · 1º · partidas) | MasterYi · 2 · 10 | Maestro Yi · 2 · 10 | sí |
| (extra) Marcador: partidas · 1º · top3 % · puesto medio | 283 · 29 · 49 · 3.55 | 283 · 29 · 49 · 3,55 | sí |

#### TheCIutch#EUW

| Métrica | SQL | App | ¿Cuadra? |
|---|---|---|---|
| Más daño a campeones | 161003 · Belveth · 2026-09-20 · EUW1_7989726795 | 161003 · Bel'Veth · 2026-09-20 · EUW1_7989726795 | sí |
| Más daño recibido | 166589 · Shyvana · 2026-09-27 · EUW1_7996938702 | 166589 · Shyvana · 2026-09-27 · EUW1_7996938702 | sí |
| Más kills | 26 · Belveth · 2026-09-20 · EUW1_7989726795 | 26 · Bel'Veth · 2026-09-20 · EUW1_7989726795 | sí |
| Mayor racha de kills | 16 · Shyvana · 2026-09-27 · EUW1_7996938702 | 16 · Shyvana · 2026-09-27 · EUW1_7996938702 | sí |
| Más muertes | 25 · Yone · 2026-09-11 · EUW1_7980871496 | 25 · Yone · 2026-09-11 · EUW1_7980871496 | sí |
| Victorias sin morir (nº de 1º con 0 muertes) | 0 | 0 (mensaje «Ningún 1º sin morir todavía») | sí |
| Victoria con más muertes | 14 muertes · Tristana · 2026-09-10 · EUW1_7979427424 | 14 muertes · Tristana · 2026-09-10 · EUW1_7979427424 | sí |
| Racha de 1º (longitud · en curso · fechas UTC · 1ª/última) | 4 · no · 2026-09-05→2026-09-05 · EUW1_7974281288 / EUW1_7974457396 | 4 · no · 2026-09-05→2026-09-05 · EUW1_7974281288 / EUW1_7974457396 | sí |
| Sequía (partidas sin 1º) (longitud · en curso · fechas UTC · 1ª/última) | 44 · no · 2026-06-24→2026-09-03 · EUW1_7897887537 / EUW1_7971855988 | 44 · no · 2026-06-24→2026-09-03 · EUW1_7897887537 / EUW1_7971855988 | sí |
| Mejor día (día · puesto medio · partidas) | 2026-09-28 · 2.33 · 6 | 2026-09-28 · 2.33 · 6 | sí |
| Peor día (día · puesto medio · partidas) | 2026-07-30 · 5.00 · 5 | 2026-07-30 · 5.00 · 5 | sí |
| A la primera (nº · sobre ganados · %) | 5 · 31 · 16.1 % | 5 · 31 · 16.1 % | sí |
| Campeón con más 1º (nombre · 1º · partidas) | Shyvana · 1 · 21 | Shyvana · 1 · 21 | sí |
| (extra) Marcador: partidas · 1º · top3 % · puesto medio | 262 · 31 · 54 · 3.44 | 262 · 31 · 54 · 3,44 | sí |

Los valores se comparan campo a campo (valor, campeón, fecha UTC, `match_id` del enlace de la app, longitud, 1ª/última partida de la racha, fecha, puesto medio, nº de partidas). Todos coinciden.

### 3. Frío/calor por perfil (álbum `orden=calor`, filtro `todos`)

| Perfil | 🔥 SQL | 🔥 app | ❄️ SQL | ❄️ app | Nombres SQL | Nombres app | ¿Cuadra? |
|---|---|---|---|---|---|---|---|
| Hylimichi#EUW | 0 | 0 | 2 | 2 | 🔥 - ❄️ MonkeyKing, Nocturne | 🔥 - ❄️ Wukong, Nocturne | sí |
| Azpekaa#EUW | 0 | 0 | 3 | 3 | 🔥 - ❄️ Twitch, Vi, Zeri | 🔥 - ❄️ Zeri, Twitch, Vi | sí |
| BEJITO MAMBO#1991 | 1 | 1 | 2 | 2 | 🔥 Blitzcrank ❄️ Ekko, KogMaw | 🔥 Blitzcrank ❄️ Ekko, Kog'Maw | sí |
| Krill1nt#EUW | 0 | 0 | 2 | 2 | 🔥 - ❄️ Jinx, Sett | 🔥 - ❄️ Jinx, Sett | sí |
| zapas14#EUW | 0 | 0 | 3 | 3 | 🔥 - ❄️ AurelionSol, Sett, Singed | 🔥 - ❄️ Aurelion Sol, Sett, Singed | sí |
| TheCIutch#EUW | 0 | 0 | 4 | 4 | 🔥 - ❄️ Aurora, KSante, MissFortune, Naafiri | 🔥 - ❄️ Naafiri, Aurora, K'Sante, Miss Fortune | sí |

Detalle de los casos cercanos al umbral (Q3, `|global − ajustada|` ≥ 0,35), para comprobar que no hay marcas erróneas por redondeo:

| Perfil | Campeón | n | media | global | ajustada | diff (global − ajustada) | SQL | App |
|---|---|---|---|---|---|---|---|---|
| Hylimichi | MonkeyKing (Wukong) | 5 | 4,400 | 3,598 | 3,999 | −0,4009 | ❄️ (borde) | ❄️ |
| Azpekaa | Akali | 6 | 4,167 | 3,469 | 3,850 | −0,3804 | neutro | sin marca |
| TheCIutch | Naafiri | 7 | 4,143 | 3,443 | 3,851 | −0,4084 | ❄️ | ❄️ |
| BEJITO MAMBO | Blitzcrank | 5 | 2,400 | 3,364 | 2,882 | +0,4822 | 🔥 | 🔥 |

Resto de marcas: todas con |diff| ≥ 0,42 (ver Q3). Los 6 perfiles tienen exactamente 173 cromos en el álbum; los marcados son solo los que pide F16 (campeones sin 1º y ≥5 partidas). Totales: 🔥 SQL = app = 1 (Blitzcrank, BEJITO MAMBO); ❄️ SQL = app = 2+3+2+2+3+4 = 16.

### 4. Empates ejercitados (los desempates de la app coinciden)

Q4 muestra que los desempates reales cuentan en estos casos, todos resueltos igual por SQL y app:
- Hylimichi: «Más kills» empatado en 2 partidas (gana la más antigua, Corki 19 sep) y «victoria con más muertes» en 3; campeón con más 1º: Cassiopeia y Galio empatan a 3 1º (gana Cassiopeia, 20 partidas frente a 11).
- zapas14: «Mayor racha de kills» en 2 partidas y «Más muertes» en 2 (gana la más antigua); racha de 1º: 3 rachas de 2 empatadas (gana la más reciente, 27 sep).
- Krill1nt: 2 rachas de 1º de longitud 3 empatadas (gana la más reciente, 19-20 sep); 27 campeones con 1 × 1º (gana Ornn, el de más partidas, 16).
- Azpekaa: 2 sequías de 21 empatadas (gana la más reciente, 8-12 sep).
- TheCIutch: 31 campeones con 1 × 1º (gana Shyvana, 21 partidas).

No ejercitado con datos reales: ninguna racha (de 1º ni sequía) está «en curso» en los 6 perfiles (SQL: ninguna isla máxima termina en la última partida; app: no aparece el chip «en curso»), así que ese caso solo está cubierto por los tests unitarios (AC2). Tampoco hay ningún 1º con 0 muertes en ningún perfil (la lista de «victorias sin morir» solo se comprueba vacía). Los empates en mejor/peor día no se dan (Q4: 1 candidato por extremo).

### 5. Veredicto

**AC4: CUADRA. 0 discrepancias** entre la pestaña Estadísticas / recuento ❄️🔥 y las consultas SQL directas, en los 6 perfiles (15 métricas por perfil, incluido el marcador; 90 comparaciones de Estadísticas y 6 de frío/calor, todas OK).

Observaciones (no son discrepancias):
1. Nombres localizados: la app muestra «Maestro Yi» y «Wukong» (Data Dragon en español) donde la BD guarda `MasterYi`/`MonkeyKing`; igual con Bel'Veth, Aurelion Sol, K'Sante, Miss Fortune, Kog'Maw. Comparado con alias; es el comportamiento esperado.
2. Las fechas de la app van en UTC (`game_creation`), no en día de juego; 108 de las 1196 partidas caen en un día distinto según UTC o día de juego (06:00 Madrid). Solo afecta a cómo se etiquetan las fechas de partida; mejor/peor día usa la fecha de juego correctamente.
3. Huecos de cobertura con datos reales: racha «en curso» y victorias sin morir con lista no vacía (ningún perfil tiene estos casos hoy).
4. Hylimichi/Wukong queda a 0,0009 del umbral (−0,4009): la app marca ❄️, coherente con el SQL en `numeric` exacto.

Ficheros auxiliares en el mismo directorio: `base.sql`, `q1.sql`, `q1b.sql`, `q2.sql`, `q3.sql`, `q4.sql`, `gen.py`, `app/*.html`.
