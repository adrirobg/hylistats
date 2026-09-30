import type { ReactNode } from "react";
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
 * Título de una `Box` con nota (`hint`): a la vista son dos textos separados, como en la maqueta;
 * el « · » oculto hace que el encabezado se lea entero («Marcador · 1º = victoria»). Lo comparten
 * el raíl y los bloques del Resumen.
 */
export function Titled({ children }: { children: string }) {
  return (
    <>
      {children}
      <span className="sr-only"> · </span>
    </>
  );
}
