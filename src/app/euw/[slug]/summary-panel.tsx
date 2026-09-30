import { Suspense } from "react";
import { Box } from "@/components/hy/box";
import { Skeleton } from "@/components/ui/skeleton";
import type { AlbumEntry, RecentGame } from "@/domain/album";
import type { StatsSummary, VerifiedChampion } from "@/domain/stats";
import { wonSummary } from "@/domain/summary";
import type { SummaryTabData } from "./data";
import { FormStrip } from "./form-strip";
import { HighlightGroups } from "./highlight-groups";
import { Scoreboard } from "./scoreboard";
import { Titled } from "./tab-panel";
import { WonCurveChart } from "./won-curve-chart";

// Pestaña Resumen (brief §3.3, `data-panel="resumen"` de la maqueta): cuatro bloques a ancho de
// pestaña —marcador con su distribución, forma, evolución de campeones ganados y destacados—.
// Es un componente de servidor: el marcador y la forma salen de `ProfileView` y suben en vivo con
// el `router.refresh()` de `AutoRefresh`; solo la gráfica y los chips son cliente.

interface SummaryPanelProps {
  summary: StatsSummary;
  form: RecentGame[];
  verifiedChampions: VerifiedChampion[];
  album: AlbumEntry[];
  /** La curva, los destacados y la meta (`ProfileView.summaryTab`). */
  tab: SummaryTabData;
  /** Segmento de la URL del perfil: de ahí salen los enlaces de la forma. */
  slug: string;
  /** Hora del servidor (ms). */
  nowMs: number;
}

export function SummaryPanel({
  summary,
  form,
  verifiedChampions,
  album,
  tab,
  slug,
  nowMs,
}: SummaryPanelProps) {
  const { curve, highlights, threshold } = tab;
  const caption = wonSummary(verifiedChampions, album, threshold, nowMs);
  return (
    <>
      <Box title={<Titled>Marcador</Titled>} hint="1º = victoria" titleAs="h2">
        <Scoreboard summary={summary} variant="full" />
      </Box>
      <Box title={<Titled>Forma</Titled>} hint="últimas 20" titleAs="h2">
        <FormStrip games={form} slug={slug} nowMs={nowMs} />
      </Box>
      <Box
        title={<Titled>Evolución</Titled>}
        hint="campeones ganados acumulados"
        titleAs="h2"
      >
        <figure>
          <figcaption className="mb-2.5 text-sm text-muted-foreground">
            {caption}
          </figcaption>
          {curve.length > 0 ? (
            <WonCurveChart curve={curve} threshold={threshold} nowMs={nowMs} />
          ) : (
            <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted-foreground">
              La curva empieza con tu primer 1º con un campeón: cada uno nuevo
              sube un escalón hacia los {threshold}.
            </p>
          )}
        </figure>
      </Box>
      <Box title="Destacados" titleAs="h2">
        {/* `HighlightGroups` lee la URL con `usePathname` y `useSearchParams`. */}
        <Suspense fallback={<HighlightsSkeleton />}>
          <HighlightGroups highlights={highlights} />
        </Suspense>
      </Box>
    </>
  );
}

/** Los tres grupos por rellenar mientras el cliente lee la URL. */
function HighlightsSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      {Array.from({ length: 3 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
