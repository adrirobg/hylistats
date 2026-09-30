import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-line text-muted-foreground",
        // «Mi perfil»: oro apagado, como el sello del álbum.
        me: "border-won-deep text-place-1",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type ChipProps = ComponentProps<"span"> & VariantProps<typeof chipVariants>;

/** Etiqueta `.chip` de la maqueta. */
export function Chip({ variant, className, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ variant }), className)} {...props} />
  );
}
