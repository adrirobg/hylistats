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

/**
 * Esqueleto de la pestaña cuyo contenido aún no existe (Resumen, T07): la forma aproximada, con
 * huecos. Cuando llegue, la pestaña lo sustituye por su panel.
 */
export function PendingPanel({ tab }: { tab: "resumen" }) {
  return (
    <TabPanel tab={tab}>
      <div aria-busy="true" className="grid gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-56" />
        <Skeleton className="h-36" />
      </div>
    </TabPanel>
  );
}
