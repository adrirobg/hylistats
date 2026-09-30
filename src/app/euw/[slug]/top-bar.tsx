import Link from "next/link";
import { Logo } from "@/components/hy/logo";

/**
 * Rótulo «hylistats» sobre la cabina. Enlaza a `/?inicio`: un enlace a `/` redirigiría de vuelta
 * al perfil si hay «mi perfil» guardado, y `?inicio` fuerza la landing.
 */
export function TopBar() {
  return (
    <header className="flex items-center justify-between py-4">
      <Link
        href="/?inicio"
        className="inline-flex items-center gap-2.5 font-display text-[28px] leading-none font-extrabold tracking-[0.02em] uppercase"
      >
        <Logo />
        hylistats
      </Link>
    </header>
  );
}
