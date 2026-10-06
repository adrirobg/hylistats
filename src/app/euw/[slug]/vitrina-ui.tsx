import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Piezas de maquetación de la vitrina (revisión v4, propuesta B de `.dev/research/cabecera`): la
// etiqueta de cada bloque (`.lbl`), la tarjeta translúcida de los trofeos (`.tw`) y la rejilla que
// los pone a la par. Sin estado: valen en servidor y en cliente.
//
// Rangos (container queries sobre `.app`): por debajo de 1000 px los trofeos se apilan (la tabla de
// El grupo hoy necesita el ancho); por debajo de 640 px la tarjeta y la rejilla se compactan como el
// resto de la cabecera.

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
 * Los trofeos a la par: El grupo hoy y Dios de Arena (≈ 1,75 : 1). Con uno solo (no miembros, I1:
 * Dios de Arena) ocupa la columna estrecha, el mismo ancho que junto a El grupo hoy; al apilarse
 * (< 1000 px) cualquiera ocupa el ancho.
 */
export function TrophyGrid({
  single = false,
  children,
}: {
  single?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-4 grid gap-3 @max-[1000px]:grid-cols-1 @max-[640px]:mt-3 @max-[640px]:gap-2",
        single
          ? "grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)]"
          : "grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]",
      )}
    >
      {children}
    </div>
  );
}

/** Tarjeta `.tw`: translúcida sobre el banner, con desenfoque del fondo. */
export function TrophyCard({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[10px] border border-[rgba(255,255,255,.09)] bg-[rgba(15,16,19,.6)] px-3.5 py-3 backdrop-blur-[4px] @max-[640px]:p-2.5">
      {children}
    </section>
  );
}
