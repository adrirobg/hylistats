import { scoreboardFigures } from "@/domain/scoreboard";
import type { StatsSummary } from "@/domain/stats";
import { cn } from "@/lib/utils";
import { DistributionBar } from "./distribution-bar";

// Marcador del perfil (brief §4.6, `.kpis` y `.dist` de la maqueta): cinco cifras y la
// distribución 1º–6º. Es un componente de servidor: las cifras salen de `data` y suben en vivo
// con el `router.refresh()` de `AutoRefresh` mientras dura el backfill. Lo del formato y los
// colores es `domain/scoreboard.ts`; aquí solo se pinta.
//
// `rail`: rejilla de cinco cifras de 30 px y la barra apilada (va en una `Box` del raíl).
// `strip`: la misma información reducida a una franja de cifras en una fila (que se parte en dos
// si no cabe), para cuando el raíl se oculta por debajo de 1100 px (`cabin.tsx`).

interface ScoreboardProps {
  summary: StatsSummary;
  variant: "rail" | "strip";
}

export function Scoreboard({ summary, variant }: ScoreboardProps) {
  const figures = scoreboardFigures(summary);

  // `dt` (rótulo) antes que `dd` (cifra) en el DOM, y la cifra por encima en pantalla.
  if (variant === "strip") {
    return (
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {figures.map((figure) => (
          <div key={figure.key} className="flex flex-col-reverse">
            <dt className="mt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
              {figure.label}
            </dt>
            <dd
              className={cn(
                "font-display text-[22px] leading-none font-extrabold tabular-nums",
                figure.gold && "text-place-1",
              )}
            >
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <>
      {/* Cada cifra ocupa lo suyo y el sobrante se reparte entre ellas: cinco columnas iguales
          (49 px en el raíl) no bastan para «16,5%» en display de 30 px, que mide unos 64 px. El
          `tracking-tight` y el hueco de 4 px hacen que quepan también 1000+ partidas y 100+ 1º. */}
      <dl className="flex justify-between gap-1">
        {figures.map((figure) => (
          <div key={figure.key} className="flex flex-col-reverse">
            <dt className="mt-1 text-[11px] text-muted-foreground">
              {figure.label}
            </dt>
            <dd
              className={cn(
                "font-display text-[30px] leading-none font-extrabold tracking-tight whitespace-nowrap tabular-nums",
                figure.gold && "text-place-1",
              )}
            >
              {/* Como la maqueta: en el raíl, «16,5%» sin espacio para ganar ancho. */}
              {figure.value.replace(/\s%$/, "%")}
            </dd>
          </div>
        ))}
      </dl>
      <DistributionBar summary={summary} className="mt-3.5" />
    </>
  );
}
