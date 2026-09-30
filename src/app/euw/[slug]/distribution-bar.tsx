import { distributionSegments, TONE_BG } from "@/domain/scoreboard";
import { PLACEMENTS, type StatsSummary } from "@/domain/stats";
import { cn } from "@/lib/utils";

// Barra apilada con la distribución de puestos 1º–6º (brief §4.6, `.dist` de la maqueta) y su
// leyenda. La comparten el marcador del raíl (todo el perfil) y el panel de campeón (un campeón).
// Sin estado ni hooks: sirve igual en un componente de servidor que en uno cliente.

export function DistributionBar({
  summary,
  className,
}: {
  summary: Pick<StatsSummary, "distribution">;
  className?: string;
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
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between font-mono text-[11px] text-faint"
      >
        {PLACEMENTS.map((placement) => (
          <span key={placement}>{placement}º</span>
        ))}
      </div>
    </div>
  );
}
