import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// `relative overflow-hidden` deja sitio a una barra de progreso interior.
const btnVariants = cva(
  "relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-line bg-surface-2 hover:border-faint",
        trust:
          // Borde de `trust` al 50 % sobre `line`, como en `.btn.trust` de la maqueta.
          "border-[color:color-mix(in_srgb,var(--trust)_50%,var(--line))] bg-transparent text-trust hover:border-[color:color-mix(in_srgb,var(--trust)_50%,var(--line))]",
      },
      size: {
        default: "px-3.5 py-2",
        small: "px-2.5 py-[5px] text-[13px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type BtnProps = ComponentProps<"button"> & VariantProps<typeof btnVariants>;

/** Botón `.btn` de la maqueta. `type="button"` por defecto. */
export function Btn({
  variant,
  size,
  type = "button",
  className,
  ...props
}: BtnProps) {
  return (
    <button
      type={type}
      className={cn(btnVariants({ variant, size }), className)}
      {...props}
    />
  );
}
