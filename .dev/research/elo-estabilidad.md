# Estabilidad del ELO del grupo (2026-10-06)

Investigación para el grill de "Mejoras del ELO". Origen: tras unos días de uso, el grupo ve que el ELO cambia demasiado rápido: en un día con muchas partidas se puede pasar por todas las ligas y volver. Es un análisis: las decisiones se toman en el grill y en la spec.

**Datos**: PRO (Supabase), 3013 filas de partidas de los 6 miembros en las colas 1750/1740 desde `SEASON_START` (2026-05-12) hasta el 2026-10-06. El ELO actual (F24, F25) se reproduce en Python sin reutilizar el TypeScript de la app. Las métricas por día se calculan desde el 2026-09-01, con días de 06:00 a 06:00 de Madrid como en la app.

**Propósito aceptado por el supervisor (2026-10-06)**: la Clasificación mide la **racha y la forma de los días**, no el nivel real. "Cada uno sabe cómo juega y cómo jugamos el resto". Estabilizar no consiste en medir mejor el nivel. Consiste en que la liga y el rating no oscilen dentro de un mismo día.

## 1. Cuánto se mueve hoy

Días-jugador con 10 o más partidas (85 desde septiembre):

| Métrica | Valor |
|---|---|
| Diferencia entre el rating más alto y el más bajo del día (mediana) | 65 puntos (más de 2 ligas de 30) |
| Ligas distintas por las que se pasa en el día | 3,3 de media; el 82 % de los días, 3 o más |
| Cambios de liga dentro del día | 5,5 |
| Liga al cerrar el día distinta de la del día anterior | 64 % |
| Cambios de líder de la Clasificación | 3,9 por día jugado |
| Recorrido de cada miembro en la temporada | ~1410 → ~1640 (unas 8 ligas) |
| Partidas por día jugado | 9,7 de media; p90 18; máximo 29 |

Desde el lanzamiento (2026-10-02) se ven días de 23 a 27 partidas con 6 o 7 cambios de liga.

## 2. Por qué

1. **El grupo está muy igualado.** Los miembros sacan de media entre −1,6 y +0,9 puntos de la tabla por partida (puesto medio entre 3,36 y 3,70). En el punto de equilibrio de la pendiente, eso son ratings de entre ~1475 y ~1515: unos 40 puntos de separación real.
2. **El ruido supera el ancho de una liga.** La desviación de los puntos de una partida es de ±14. Con ~10 partidas al día y una pendiente que corrige poco (unos 0,063 puntos por cada punto de rating), el rating de un jugador oscila alrededor de su equilibrio con ±38 de desviación. Las ligas tienen 30 puntos de ancho.
3. **Los desconocidos inflan.** A 1500 y con puestos al azar, el multiplicador actual suma de media +2,6 por partida con 1 desconocido y +5,2 con 2. En los datos reales, jugar con desconocidos sí empeora el puesto (puntos medios: +0,28 con 0, −0,91 con 1 y −1,47 con 2; desde septiembre, +0,61 / −0,65 / −3,10). Aun así, el multiplicador lo sobrecompensa: con él, se ganan de media +1,52 por partida con 1 desconocido y +3,57 con 2. Por eso todos están en Oro o Platino (media de 1535, inflación de +35). Hylimichi saca −1,03 puntos por partida y está en Platino (1559). Sin multiplicador, estaría en ~1509.
4. **Límite estadístico.** Separar con fiabilidad 1 punto por partida de diferencia entre dos jugadores exige unas 800 partidas por cabeza. Ningún ajuste convierte la Clasificación en una medida de nivel, y por eso se acepta como medida de forma (ver el propósito).

## 3. Alternativas simuladas

Mismos datos y métricas. La "diferencia en el día" es la mediana de la diferencia entre el rating más alto y el más bajo del día. El "ruido" es la mediana de la desviación del rating al cierre de cada día. La "inflación" es la media final menos 1500. K escala la tabla de puntos y la pendiente a la vez, así que el equilibrio de cada jugador no cambia.

| Opción | Diferencia en el día | Cambios de liga en el día | Liga distinta de un día a otro | Ruido | Inflación |
|---|---|---|---|---|---|
| Actual | 65 | 5,5 | 64 % | ±38 | +35 |
| Sin multiplicador | 68 | 5,8 | 62 % | ±38 | +8 |
| K×0,5 | 34 | 2,7 | 42 % | ±24 | +30 |
| K×0,5 sin multiplicador | 35 | 3,0 | 45 % | ±23 | +5 |
| K×0,35 sin multiplicador | 25 | 2,4 | 36 % | ±18 | +4 |
| K×0,5 y pendiente ×2 | 32 | 2,7 | 42 % | ±19 | +17 |
| Cálculo actual, liga según una media móvil del rating (α=0,1) | 21 | 0,9 | 41 % | ±29 | +35 |
| K×0,5 y ligas de 40 | 34 | 2,1 | 33 % | ±24 | +30 |
| Cálculo actual y ligas de 50 | 65 | 3,5 | 49 % | ±38 | +35 |

**Margen al cambiar de liga**: se sube al superar el corte en B puntos y se baja al caer B puntos por debajo del corte. Medido como cambios de liga en el día y liga distinta de un día a otro:

| | B = 0 | B = 5 | B = 10 | B = 15 |
|---|---|---|---|---|
| K×1 | 5,5 / 64 % | 4,0 / 61 % | 2,8 / 59 % | 2,1 / 55 % |
| K×0,5 | 2,7 / 42 % | 1,6 / 36 % | 0,9 / 37 % | 0,5 / 31 % |

Cambios de líder por día jugado: 3,9 con el cálculo actual y 2,6 con K×0,5.

Conclusiones:
- **K×0,5** es la palanca principal: reduce a la mitad lo que se mueve en un día y conserva el orden.
- **El margen al cambiar de liga** es el complemento barato: elimina casi todos los cambios de liga dentro del día sin tocar el cálculo.
- **El multiplicador por desconocidos** no afecta a la volatilidad, pero infla los ratings y sesga a quien más juega con desconocidos.
- Descartados:
  - Subir solo la pendiente: comprime a todos y empeora la separación.
  - Tope diario: no evita el ir y venir dentro del día.
  - K decreciente con las partidas jugadas: con cientos por cabeza, congela el rating.
  - Ensanchar las ligas sin más: si el ruido no baja, el problema sigue.

## 4. Ajuste del multiplicador por desconocidos (manteniéndolo)

Indicación del supervisor (2026-10-06): mantener el multiplicador, pero ajustarlo. Criterio usado: que siga premiando ganar y castigando menos perder con desconocidos, pero que compense poco más que el peor puesto real que se saca con ellos, en vez de duplicarlo o triplicarlo.

Ganancia media por partida con los datos reales (tabla sin pendiente; la referencia es +0,28 con 0 desconocidos):

| Ganancia / pérdida | 1 desconocido | 2 desconocidos |
|---|---|---|
| Actual: ×1,15/×0,75 y ×1,30/×0,50 | +1,52 | +3,57 |
| ×1,10 / ×0,90 | +0,28 (compensa justo) | −0,25 |
| ×1,10 / ×0,85 | **+0,60** | +0,09 |
| ×1,15 / ×0,90 | +0,55 | +0,02 |
| ×1,20 / ×0,80 | +1,47 | **+0,97** |
| ×1,30 / ×0,80 | +2,02 | +1,51 |

Candidato: **1 desconocido ×1,10/×0,85; 2 desconocidos ×1,20/×0,80**. Premio neto frente a jugar sin desconocidos de unos +0,3 y +0,7 por partida, frente a +1,2 y +3,3 hoy. Con K×0,5, la inflación baja de +30 a +18. Los valores se pueden revisar en el grill.

## 5. Multiplicador por victorias consecutivas

Idea del grupo (2026-10-06): premiar las victorias seguidas, que son muy difíciles. En la API, `win` es top 3 (puestos 1–3 → `true`). En el grupo, "victoria" es el 1º (como en el 602002 y en las rachas del CAPTURED de la v1).

Frecuencia en las 3013 partidas de la temporada:

| Racha de | Rachas de 2 o más | De 3 o más | De 4 o más | Máximo | Partidas con racha en curso de 2 o más |
|---|---|---|---|---|---|
| 1º | 48 | 14 | 4 | 4 | 2,2 % |
| top 2 | 213 | 65 | 20 | 4 | — |
| top 3 (`win`) | 396 | 196 | 110 | 10 | 26,9 % |

Si solo cuentan las del mismo día, las cifras apenas cambian (el 1º pasa de 48 a 44 rachas de 2 o más).

- **Racha de 1º**: muy rara (unas 8 por miembro en 5 meses), así que puede ser generosa sin desestabilizar. Es justo lo que el grupo describe como difícil.
- **Racha de top 3**: una de cada cuatro partidas, demasiado común. Añade volatilidad y no premia nada especial.

Simulación con K×0,5 y el multiplicador candidato. La bonificación solo se aplica a ganancias y la racha cuenta la partida actual:

| Opción | Diferencia en el día | Cambios de liga en el día | Liga distinta de un día a otro | Ruido | Inflación |
|---|---|---|---|---|---|
| Sin racha | 34 | 2,6 | 42 % | ±23 | +18 |
| Racha de 1º: ×1,5 el 2º seguido, ×2 desde el 3º | 36 | 2,9 | 46 % | ±26 | +24 |
| Racha de 1º: ×2 / ×3 | 37 | 3,3 | 47 % | ±29 | +30 |
| Racha de top 3: ×1,25 el 3º seguido, ×1,5 desde el 4º | 38 | 3,0 | 50 % | ±28 | +29 |

Con K×0,5, un 1º vale +12,5. Con ×2 a partir de la segunda victoria seguida vuelve a los +25 de hoy: es fácil de explicar ("la racha te devuelve el 1º entero"). Con ×2/×3 el reparto se distorsiona: Krill1nt sube de 1517 a 1558 con unas pocas rachas.

**Propuesta completa** (K×0,5, multiplicador candidato, racha de 1º ×1,5/×2 y margen de ±10 al cambiar de liga): **1,1 cambios de liga en el día** (5,5 hoy) y liga distinta de un día a otro el 36 % de los días (64 % hoy).

## 6. Preguntas para el grill

- ¿K×0,5, o algo intermedio (×0,6–0,7) si el grupo quiere que cada partida se note más?
- ¿Margen al cambiar de liga (±10) o liga según una media móvil del rating? El margen es más fácil de explicar.
- Valores finales del multiplicador por desconocidos.
- Racha: ¿1º seguidos o también top 2? ¿Cuenta solo dentro del mismo día? ¿Se muestra en el historial (🔥×2)? ¿Hay contrapartida para las rachas de 6º?
- ¿Recalcular toda la temporada con las reglas nuevas (P9: nada se guarda) o aplicarlas desde una fecha? Recalcular cambia la Clasificación de golpe.
- ¿Cambiar las ligas (ancho, cortes)? Con la propuesta, los ratings quedan entre ~1490 y ~1540, en Plata, Oro y Platino. Bronce, Hierro y Diamante quedarían para rachas fuertes.

## Reproducir

Scripts en `research/elo-estabilidad/` (Python 3, sin dependencias):
- `elo.py`: ELO actual con parámetros.
- `sim.py`: métricas.
- `run2.py`: multiplicador por racha.

Leen un `rows.json` que no está en el repo. Se genera con esta consulta a PRO (MCP de Supabase), extrayendo el array `json_agg`:

```sql
select json_agg(t order by ts, match_id, member) from (
 select m.match_id, m.game_start_timestamp ts, m.queue_id q, gm.profile_id member, p.placement pl, p.player_subteam_id st
 from group_members gm join profiles pr on pr.id=gm.profile_id
 join participants p on p.puuid=pr.puuid join matches m on m.match_id=p.match_id
 where m.queue_id in (1750,1740) and m.game_start_timestamp >= extract(epoch from timestamptz '2026-05-12T00:00:00Z')*1000
) t
```
