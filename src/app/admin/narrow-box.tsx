import type { ReactNode } from "react";
import { TopBar } from "../euw/[slug]/top-bar";

/** Página de `/admin` sin sesión (login o deshabilitado): `Box` estrecho centrado bajo la `TopBar`. */
export function NarrowPage({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-sm min-w-0 pt-2 sm:pt-4">
        {/* El `Box` solo admite h2-h4: el h1 de la página va oculto. */}
        <h1 className="sr-only">Admin</h1>
        {children}
      </div>
    </main>
  );
}
