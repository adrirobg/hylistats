"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { type ProfileTab, tabHref } from "./view-model";

/**
 * Enlace a una pestaña del perfil desde fuera de la barra (los «Ver todos» del raíl). Calcula el
 * destino con la URL del momento, igual que `Tabs`: cambia `?tab`, quita los filtros de las otras
 * pestañas y conserva el resto.
 */
export function TabLink({
  tab,
  label,
  className,
  children,
}: {
  tab: ProfileTab;
  /** Nombre accesible si el texto visible no basta fuera de contexto. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <Link
      href={tabHref(pathname, search, tab)}
      scroll={false}
      aria-label={label}
      className={className}
    >
      {children}
    </Link>
  );
}
