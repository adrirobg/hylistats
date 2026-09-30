"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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
import type { CurvePoint } from "@/domain/summary";
import { formatShortDate } from "@/lib/format";
import {
  championsLabel,
  countAxis,
  curveDomain,
  thresholdLabel,
  xTicks,
} from "./won-curve-view";

// Curva de campeones ganados acumulados (brief §3.3, `renderChart` de la maqueta, D4): línea
// escalonada en oro con el umbral de Deidad de Arena como línea horizontal. Es cliente porque recharts
// mide el contenedor; los datos llegan preparados del servidor (`summaryTab.curve`). La gráfica
// es solo una ayuda visual: su equivalente en texto (`wonSummary`) va a su lado, así que el dibujo
// se oculta a los lectores de pantalla y no ofrece el foco por teclado (`accessibilityLayer`).
// Sin animación: la curva no tiene nada que contar al dibujarse y así respeta
// `prefers-reduced-motion` sin condiciones.

const CONFIG = {
  count: { label: "Campeones ganados", color: "var(--place-1)" },
} satisfies ChartConfig;

// Recharts pinta las marcas en `#666` (3,1:1 sobre la caja) y la regla de `ChartContainer` que las
// recolorea no las alcanza en recharts 3: el color de texto atenuado se pone aquí (6,5:1).
const TICK = { fill: "var(--text-muted)" } as const;

interface WonCurveChartProps {
  /** La curva del servidor (`wonCurve`): no vacía. */
  curve: CurvePoint[];
  /** Meta: campeones que pide Deidad de Arena. */
  threshold: number;
  /** Hora del servidor (ms): decide si las fechas llevan el año, igual en servidor y navegador. */
  nowMs: number;
}

export function WonCurveChart({ curve, threshold, nowMs }: WonCurveChartProps) {
  const [start, end] = curveDomain(curve);
  const last = curve[curve.length - 1];
  const axis = countAxis(last.count, threshold);
  const date = (ms: number) => formatShortDate(ms, nowMs);

  return (
    <ChartContainer
      config={CONFIG}
      aria-hidden="true"
      // La altura la fija la gráfica, no la proporción 16:9 que trae shadcn. El ancho inicial
      // (antes de medir) es el de un móvil ancho para no dar un salto de altura al hidratar.
      className="aspect-auto h-60 w-full font-mono"
      initialDimension={{ width: 320, height: 240 }}
    >
      <LineChart
        data={curve}
        accessibilityLayer={false}
        margin={{ top: 16, right: 18, bottom: 0, left: 0 }}
      >
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
          domain={[0, axis.max]}
          ticks={axis.ticks}
          allowDecimals={false}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <ReferenceLine
          y={threshold}
          stroke="var(--place-1)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          label={{
            value: thresholdLabel(threshold),
            position: "insideBottomRight",
            fill: "var(--place-1)",
            fontSize: 12,
          }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--text-faint)", strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_, payload) => date(payload[0].payload.at)}
              formatter={(value) => (
                <span className="font-medium text-foreground">
                  {championsLabel(Number(value))}
                </span>
              )}
            />
          }
        />
        <Line
          name="Campeones ganados"
          dataKey="count"
          type="stepAfter"
          stroke="var(--color-count)"
          strokeWidth={2.2}
          dot={false}
          activeDot={{
            r: 4,
            fill: "var(--color-count)",
            stroke: "var(--bg)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
        {/* El punto final, con el recuento encima (`circle` y `text` de la maqueta). */}
        <ReferenceDot
          x={last.at}
          y={last.count}
          r={4.5}
          fill="var(--color-count)"
          stroke="var(--bg)"
          strokeWidth={2}
          label={{
            value: last.count,
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
