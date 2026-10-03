import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Piezas de maquetación de la vitrina (propuesta C2 de `.dev/research/cabecera`): la etiqueta de
// cada bloque (`.lbl`), la tarjeta translúcida de los trofeos (`.tw`) y la rejilla que los pone a
// la par. Sin estado: valen en servidor y en cliente.
//
// Rangos (container queries sobre `.app`): por debajo de 700 px los trofeos se apilan; por debajo
// de 640 px la tarjeta y la rejilla se compactan como el resto de la cabecera.

/** Etiqueta de un bloque de la vitrina ("Liga del grupo", "Títulos"…). */
export function VitrinaLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-display text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/**
 * Los trofeos a la par, mismo ancho de columna. Con uno solo (no miembros, I1) ocupa una columna y
 * no se estira; al apilarse (< 700 px) ocupa el ancho, como los dos de un miembro.
 */
export function TrophyGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3.5 pb-5 @max-[700px]:grid-cols-1 @max-[640px]:mt-3.5 @max-[640px]:gap-2.5 @max-[640px]:pb-3.5">
      {children}
    </div>
  );
}

/** Tarjeta `.tw`: translúcida sobre el banner, con desenfoque del fondo. */
export function TrophyCard({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[12px] border border-[rgba(255,255,255,.09)] bg-[rgba(15,16,19,.55)] px-[18px] py-4 backdrop-blur-[4px] @max-[640px]:p-3.5">
      {children}
    </section>
  );
}
