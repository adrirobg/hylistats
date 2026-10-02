"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatEloChangeDetailed } from "@/domain/elo";
import type { EloSeriesPoint } from "@/domain/group-view";
import { formatDateTime, formatShortDate } from "@/lib/format";
import {
  leagueBoundaries,
  leagueLabels,
  ratingAxis,
  ratingDomain,
  ratingPoints,
  visibleLeagues,
} from "./rating-view";
import { xTicks } from "./won-curve-view";

// Evolución del rating de un miembro (iter-09, T06): una línea con el rating tras cada partida de
// la temporada y las ligas como franjas con su nombre. Como `won-curve-chart.tsx`: es cliente
// porque recharts mide el contenedor, los datos llegan preparados del servidor, el dibujo se oculta
// a los lectores de pantalla (su equivalente en texto va en el `figcaption`) y no hay animación.

const CONFIG = {
  rating: { label: "Rating", color: "var(--place-1)" },
} satisfies ChartConfig;

// Recharts pinta las marcas en `#666`: el color de texto atenuado se pone aquí (ver `won-curve-chart`).
const TICK = { fill: "var(--text-muted)" } as const;

/** Caja del punto, tal como la pasa recharts a la etiqueta. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RatingChartProps {
  /** `ProfileElo.series`: una entrada por partida que cuenta, no vacía. */
  series: EloSeriesPoint[];
  /** Hora del servidor (ms): decide si las fechas del eje llevan el año. */
  nowMs: number;
}

export function RatingChart({ series, nowMs }: RatingChartProps) {
  const points = ratingPoints(series);
  const [start, end] = ratingDomain(points);
  const last = points[points.length - 1];
  const axis = ratingAxis(points);
  const leagues = visibleLeagues(axis.min, axis.max);
  const labels = leagueLabels(leagues, axis.min, axis.max);
  const labelNames = new Map(labels.map((label) => [label.at, label.name]));
  const date = (ms: number) => formatShortDate(ms, nowMs);

  return (
    <ChartContainer
      config={CONFIG}
      aria-hidden="true"
      className="aspect-auto h-60 w-full font-mono"
      initialDimension={{ width: 320, height: 240 }}
    >
      <LineChart
        data={points}
        accessibilityLayer={false}
        margin={{ top: 16, right: 0, bottom: 0, left: 0 }}
      >
        {/* Franjas de liga: fondo alterno y una línea discontinua en cada frontera. Sus nombres van
            en el eje de la derecha, fuera del área de dibujo. */}
        {leagues.map((league, index) => (
          <ReferenceArea
            key={league.id}
            yAxisId="rating"
            y1={league.from}
            y2={league.to}
            ifOverflow="hidden"
            fill="var(--surface-2)"
            fillOpacity={index % 2 === 0 ? 0.7 : 0.25}
            stroke="none"
          />
        ))}
        {leagueBoundaries(leagues).map((y) => (
          <ReferenceLine
            key={y}
            yAxisId="rating"
            y={y}
            stroke="var(--text-faint)"
            strokeOpacity={0.6}
            strokeDasharray="3 3"
          />
        ))}
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="at"
          type="number"
          domain={[start, end]}
          ticks={xTicks(start, end)}
          tickFormatter={date}
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--line)" }}
          tickMargin={8}
        />
        <YAxis
          yAxisId="rating"
          type="number"
          domain={[axis.min, axis.max]}
          ticks={axis.ticks}
          allowDecimals={false}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        {/* Nombres de liga: una marca en el centro de cada franja con altura para su etiqueta. */}
        <YAxis
          yAxisId="leagues"
          orientation="right"
          type="number"
          domain={[axis.min, axis.max]}
          ticks={labels.map((label) => label.at)}
          tickFormatter={(value: number) => labelNames.get(value) ?? ""}
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={62}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--text-faint)", strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_, payload) =>
                formatDateTime(payload[0].payload.at)
              }
              formatter={(_value, _name, _item, _index, payload) => {
                const point = payload as unknown as (typeof points)[number];
                const change = formatEloChangeDetailed(point.delta);
                return (
                  <span className="font-medium text-foreground">
                    {point.rounded}{" "}
                    <span
                      className={
                        point.delta > 0
                          ? "text-ok"
                          : point.delta < 0
                            ? "text-danger"
                            : "text-muted-foreground"
                      }
                    >
                      ({change})
                    </span>
                  </span>
                );
              }}
            />
          }
        />
        {/* recharts solo pinta las marcas de un eje con alguna serie asociada: una invisible. */}
        <Line
          yAxisId="leagues"
          dataKey="rating"
          stroke="transparent"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          legendType="none"
          tooltipType="none"
        />
        <Line
          name="Rating"
          yAxisId="rating"
          dataKey="rating"
          type="linear"
          stroke="var(--color-rating)"
          strokeWidth={2.2}
          dot={false}
          activeDot={{
            r: 4,
            fill: "var(--color-rating)",
            stroke: "var(--bg)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
        {/* El punto final, con el rating de la cabecera a su izquierda y encima de la línea (arriba
            a la derecha chocaría con el eje de las ligas). */}
        <ReferenceDot
          yAxisId="rating"
          x={last.at}
          y={last.rating}
          r={4.5}
          fill="var(--color-rating)"
          stroke="var(--bg)"
          strokeWidth={2}
          label={(props: { viewBox?: Box }) => {
            const box = props.viewBox;
            if (!box) return null;
            return (
              <text
                x={box.x - 4}
                y={box.y - 8}
                textAnchor="end"
                fill="var(--text)"
                fontSize={13}
                fontWeight={700}
                stroke="var(--bg)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {last.rounded}
              </text>
            );
          }}
        />
      </LineChart>
    </ChartContainer>
  );
}
