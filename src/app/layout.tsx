import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Big_Shoulders,
} from "next/font/google";
import "./globals.css";

// Tres familias del brief §6.2. Las variables `--font-*` las consume
// `@theme inline` en globals.css (utilidades `font-display`, `font-body`,
// `font-mono`). `latin-ext` cubre los Riot ID con caracteres fuera de latin.

// "Big Shoulders Display" es hoy `Big Shoulders` con el eje óptico `opsz`
// (10–72): Display es el extremo 72, que fija globals.css. Solo se puede pedir
// como fuente variable (eje + peso completos); se usa 600–800.
const display = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  fallback: ["Arial Narrow", "sans-serif"],
});

const body = Atkinson_Hyperlegible_Next({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  fallback: ["system-ui", "sans-serif"],
});

const mono = Atkinson_Hyperlegible_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "hylistats",
  description: "Estadísticas de perfil de jugador para el modo Arena de LoL",
  robots: {
    index: false,
    follow: false,
  },
};

// `dark` activa las variantes `dark:` de los componentes de shadcn: el tema
// oscuro es el único (P9), no hay selector de tema.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${body.variable} ${mono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col px-4 pb-16">
          {children}
          <footer className="mt-16 border-t border-line py-4 text-center text-xs text-faint">
            hylistats isn't endorsed by Riot Games and doesn't reflect the views
            or opinions of Riot Games or anyone officially involved in producing
            or managing Riot Games properties. Riot Games, and all associated
            properties are trademarks or registered trademarks of Riot Games,
            Inc.
          </footer>
        </div>
      </body>
    </html>
  );
}
