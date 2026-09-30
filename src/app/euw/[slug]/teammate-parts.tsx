import Link from "next/link";
import { cn } from "@/lib/utils";
import { SMALL_SAMPLE_LABEL } from "./teammates-view";

// Piezas que comparten la tabla de Compañeros y la caja del raíl.

/**
 * Riot ID del compañero como enlace a su perfil en hylistats, con `#TAG` atenuado. Sin enlace si su
 * Riot ID no forma una URL de perfil válida (`href` nulo). Se recorta con puntos suspensivos, así
 * que hay que darle un contenedor que pueda encogerse (`min-w-0`).
 */
export function TeammateName({
  gameName,
  tagLine,
  href,
  className,
}: {
  gameName: string;
  tagLine: string;
  href: string | null;
  className?: string;
}) {
  const label = (
    <>
      {gameName}
      <span className="text-faint">#{tagLine}</span>
    </>
  );
  // `title`: el Riot ID entero cuando el recorte lo esconde.
  const title = `${gameName}#${tagLine}`;
  if (href === null) {
    return (
      <span title={title} className={cn("truncate", className)}>
        {label}
      </span>
    );
  }
  return (
    <Link
      // Sin prefetch: cada perfil es dinámico y consulta la BD, y la tabla puede traer cientos.
      prefetch={false}
      href={href}
      title={title}
      className={cn("truncate hover:underline", className)}
    >
      {label}
    </Link>
  );
}

/** «⚠ pocas»: muestra pequeña. `role="img"` hace que se lea la explicación entera, no «pocas». */
export function SmallSampleBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={SMALL_SAMPLE_LABEL}
      title={SMALL_SAMPLE_LABEL}
      className={cn("text-xs whitespace-nowrap text-trust", className)}
    >
      ⚠ pocas
    </span>
  );
}
