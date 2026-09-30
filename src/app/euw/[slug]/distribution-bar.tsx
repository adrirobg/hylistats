import { distributionSegments, TONE_BG } from "@/domain/scoreboard";
import { PLACEMENTS, type StatsSummary } from "@/domain/stats";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

// Barra apilada con la distribución de puestos 1º–6º (brief §4.6, `.dist` de la maqueta) y su
// leyenda. La comparten el marcador del raíl (todo el perfil) y el panel de campeón (un campeón).
// Con `detailed` la leyenda pasa de rótulos sueltos (1º…6º) a puesto y porcentaje de cada tramo,
// con su color: para el ancho de pestaña del Resumen, donde hay sitio y no hay que pasar el ratón
// por encima (`title`) para leerlos. Sin estado ni hooks: sirve igual en un componente de servidor
// que en uno cliente.

export function DistributionBar({
  summary,
  className,
  detailed = false,
}: {
  summary: Pick<StatsSummary, "distribution">;
  className?: string;
  detailed?: boolean;
}) {
  const segments = distributionSegments(summary);
  return (
    <div className={className}>
      {/* Sin partidas no hay segmentos: la pista queda vacía. Un puesto sin partidas (0 %) no
          ocupa sitio ni hueco, pero sigue en el árbol de accesibilidad (`sr-only`). */}
      <figure
        aria-label="Distribución de puestos"
        className={cn(
          "flex h-2.5 gap-0.5 overflow-hidden rounded-[3px]",
          segments.length === 0 && "bg-surface-2",
        )}
      >
        {segments.map((segment) => (
          <span
            key={segment.placement}
            role="img"
            aria-label={segment.label}
            title={segment.label}
            className={cn(
              "block",
              TONE_BG[segment.tone],
              segment.count === 0 && "sr-only",
            )}
            style={{ flex: segment.percent }}
          />
        ))}
      </figure>
      {/* Los segmentos ya se nombran solos: la leyenda es solo visual. */}
      {detailed ? (
        <ul
          aria-hidden="true"
          className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-xs @min-[640px]:grid-cols-6"
        >
          {segments.map((segment) => (
            <li key={segment.placement} className="flex items-center gap-1.5">
              <span
                className={cn("size-2 rounded-full", TONE_BG[segment.tone])}
              />
              <span className="text-muted-foreground">
                {segment.placement}º
              </span>
              <span>{formatPercent(segment.percent / 100)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between font-mono text-[11px] text-faint"
        >
          {PLACEMENTS.map((placement) => (
            <span key={placement}>{placement}º</span>
          ))}
        </div>
      )}
    </div>
  );
}
