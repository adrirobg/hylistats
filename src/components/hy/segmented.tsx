import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** `.seg-ctl`: botones pegados; las líneas entre ellos son el fondo (`gap-px`), también al partirse en filas. */
export function Segmented({
  label,
  children,
}: {
  /** Nombre del grupo para lectores de pantalla (no se ve). */
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="inline-flex min-w-0 flex-wrap gap-px overflow-hidden rounded-md border border-line bg-line">
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}

/** Botón de un `Segmented`: `aria-pressed` marca el activo. */
export function SegButton({
  pressed,
  tone = "gold",
  onClick,
  children,
}: {
  pressed: boolean;
  /** Color de la marca inferior del botón activo: naranja solo para objetivos. */
  tone?: "gold" | "target";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex grow cursor-pointer items-center justify-center gap-1.5 bg-surface-1 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground aria-pressed:bg-surface-2 aria-pressed:text-foreground",
        tone === "target"
          ? "aria-pressed:shadow-[inset_0_-2px_0_var(--target)]"
          : "aria-pressed:shadow-[inset_0_-2px_0_var(--place-1)]",
      )}
    >
      {children}
    </button>
  );
}
