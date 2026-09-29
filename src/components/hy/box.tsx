import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BoxProps = Omit<ComponentProps<"div">, "title"> & {
  /** Rótulo en display, mayúsculas y con tracking (`.box h4` de la maqueta). */
  title?: ReactNode;
  /** Nota a la derecha del título, en cuerpo normal y color tenue. */
  hint?: ReactNode;
  /** Nivel del encabezado del título; la maqueta usa h4 en el raíl. */
  titleAs?: "h2" | "h3" | "h4";
};

/** Tarjeta `surface-1` con borde `line` y título opcional. */
export function Box({
  title,
  hint,
  titleAs: Title = "h3",
  className,
  children,
  ...props
}: BoxProps) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-line bg-surface-1 p-3.5",
        className,
      )}
      {...props}
    >
      {title != null && (
        <Title className="mb-2.5 flex justify-between font-display text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
          {hint != null && (
            <span className="font-body text-xs font-normal tracking-normal text-faint normal-case">
              {hint}
            </span>
          )}
        </Title>
      )}
      {children}
    </div>
  );
}
