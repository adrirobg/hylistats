import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const noticeVariants = cva(
  "flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border py-2 text-sm",
  {
    variants: {
      variant: {
        // Aviso sobre la fiabilidad del dato (azul acero).
        trust: "border-trust/35 bg-trust-bg px-3 text-foreground",
        // Todo en orden: sin caja, texto tenue.
        okay: "border-transparent px-0 text-muted-foreground",
        // Algo ha fallado: borde y fondo tenue con `--danger`.
        danger:
          "border-danger/35 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 text-foreground",
      },
    },
    defaultVariants: { variant: "trust" },
  },
);

const ICON_COLOR = {
  trust: "text-trust",
  okay: "text-ok",
  danger: "text-danger",
} as const;
const ICON_DEFAULT = { trust: "i", okay: "✓", danger: "!" } as const;

type NoticeProps = Omit<ComponentProps<"div">, "children"> &
  VariantProps<typeof noticeVariants> & {
    /** Marca a la izquierda; por defecto «i» (trust), «✓» (okay) o «!» (danger). */
    icon?: ReactNode;
    /** Botones o enlaces a la derecha (`.acts` de la maqueta). */
    actions?: ReactNode;
    children: ReactNode;
  };

/** Aviso `.notice` de la maqueta. */
export function Notice({
  variant = "trust",
  icon,
  actions,
  className,
  children,
  ...props
}: NoticeProps) {
  const tone = variant ?? "trust";
  return (
    <div className={cn(noticeVariants({ variant }), className)} {...props}>
      <span aria-hidden="true" className={cn("font-bold", ICON_COLOR[tone])}>
        {icon ?? ICON_DEFAULT[tone]}
      </span>
      <span>{children}</span>
      {actions != null && (
        <span className="ml-auto flex flex-wrap gap-1.5">{actions}</span>
      )}
    </div>
  );
}
