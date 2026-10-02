"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
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
        margin={{ top: 16, right: 18, bottom: 0, left: 0 }}
      >
        {/* Franjas de liga: alternan un fondo suave y llevan su nombre arriba a la derecha. */}
        {leagues.map((league, index) => (
          <ReferenceArea
            key={league.id}
            y1={league.from}
            y2={league.to}
            ifOverflow="hidden"
            fill="var(--surface-2)"
            fillOpacity={index % 2 === 0 ? 0.7 : 0.25}
            stroke="none"
            label={{
              value: league.name,
              position: "insideTopRight",
              fill: "var(--text-faint)",
              fontSize: 11,
            }}
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
          type="number"
          domain={[axis.min, axis.max]}
          ticks={axis.ticks}
          allowDecimals={false}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={36}
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
        <Line
          name="Rating"
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
        {/* El punto final, con el rating de la cabecera encima. */}
        <ReferenceDot
          x={last.at}
          y={last.rating}
          r={4.5}
          fill="var(--color-rating)"
          stroke="var(--bg)"
          strokeWidth={2}
          label={{
            value: last.rounded,
            position: "top",
            fill: "var(--text)",
            fontSize: 13,
            fontWeight: 700,
          }}
        />
      </LineChart>
    </ChartContainer>
  );
}
