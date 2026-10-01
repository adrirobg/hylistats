"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  PERIODO_LABEL,
  PERIODOS,
  type Periodo,
  periodoHref,
} from "./group-view-model";

// Selector Hoy / Semana. El estado vive en la URL (`?periodo=`), no en el cliente: cada opción es un
// enlace que navega sin recargar ni saltar arriba (`replace` + `scroll={false}`) y el servidor
// pinta el periodo pedido. Los enlaces se calculan con la URL del momento (`useSearchParams`), así
// que en la pestaña Grupo del perfil conservan `?tab=grupo` y el resto de parámetros. Mismo aspecto
// que `Segmented`, pero con enlaces (se pueden abrir y compartir) y `aria-current` en vez de
// `aria-pressed`.

export function PeriodSelector({ active }: { active: Periodo }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <nav
      aria-label="Periodo del ranking"
      className="inline-flex min-w-0 gap-px overflow-hidden rounded-md border border-line bg-line"
    >
      {PERIODOS.map((periodo) => (
        <Link
          key={periodo}
          href={periodoHref(pathname, search, periodo)}
          replace
          scroll={false}
          aria-current={periodo === active ? "true" : undefined}
          className={cn(
            "inline-flex min-w-20 cursor-pointer items-center justify-center bg-surface-1 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
            "aria-[current=true]:bg-surface-2 aria-[current=true]:text-foreground aria-[current=true]:shadow-[inset_0_-2px_0_var(--place-1)]",
          )}
        >
          {PERIODO_LABEL[periodo]}
        </Link>
      ))}
    </nav>
  );
}
