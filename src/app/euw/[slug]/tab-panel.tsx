import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type ProfileTab, panelId, tabId } from "./view-model";

/**
 * Panel de la pestaña activa: lleva el `id` que la pestaña referencia con `aria-controls` y el
 * nombre de la propia pestaña (`aria-labelledby`). Todos los paneles pasan por aquí, así el cruce
 * de ids con `tabs.tsx` vive en un único sitio.
 */
export function TabPanel({
  tab,
  className,
  children,
}: {
  tab: ProfileTab;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(tab)}
      aria-labelledby={tabId(tab)}
      className={cn("grid gap-4", className)}
    >
      {children}
    </div>
  );
}

const ROWS = (count: number) => Array.from({ length: count }, (_, i) => i);

/**
 * Esqueleto de las pestañas cuyo contenido aún no existe (Resumen, Compañeros y Partidas, T04–T07):
 * la forma aproximada de cada una, con huecos. Cada pestaña lo sustituye por su panel.
 */
export function PendingPanel({
  tab,
}: {
  tab: Exclude<ProfileTab, "campeones">;
}) {
  return (
    <TabPanel tab={tab}>
      <div aria-busy="true" className="grid gap-3">
        {tab === "resumen" && (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-56" />
            <Skeleton className="h-36" />
          </>
        )}
        {tab === "companeros" && (
          <>
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-10" />
            {ROWS(6).map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </>
        )}
        {tab === "partidas" && (
          <>
            <Skeleton className="h-9" />
            {ROWS(8).map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </>
        )}
      </div>
    </TabPanel>
  );
}
