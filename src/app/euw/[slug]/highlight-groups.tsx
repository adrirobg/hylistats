"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { HighlightChip, Highlights } from "@/domain/summary";
import { championHref } from "./champion-panel-view";
import { ChampionThumb } from "./match-parts";

// Destacados del Resumen (brief §3.3, `.hl` y `.pill` de la maqueta): tres grupos de campeones
// como chips que abren su panel (`?campeon={slug}`). Es cliente para leer la URL del momento
// (`usePathname` y `useSearchParams`) y conservar el resto de la query —pestaña, filtros—, como el
// álbum y la lista de partidas. Un grupo vacío dice por qué, no se queda mudo.

const GROUPS: readonly {
  key: keyof Highlights;
  title: string;
  empty: string;
}[] = [
  {
    key: "firstTry",
    title: "Ganados a la primera",
    empty: "Aún ningún campeón ganado en su primera partida.",
  },
  {
    key: "mostTriedUnwon",
    title: "Más intentados sin ganar",
    empty: "Ningún campeón pendiente: has ganado con todos los que has jugado.",
  },
  {
    key: "bestFirstRate",
    title: "Mejor % 1º (3+)",
    empty: "Aún ningún campeón con 3+ partidas y algún 1º.",
  },
];

export function HighlightGroups({ highlights }: { highlights: Highlights }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <div className="grid gap-4">
      {GROUPS.map(({ key, title, empty }) => (
        <section key={key}>
          <h3 className="mb-1.5 text-[13px] text-muted-foreground">{title}</h3>
          {highlights[key].length === 0 ? (
            <p className="text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {highlights[key].map((chip) => (
                <li key={chip.championId}>
                  <Chip
                    href={championHref(pathname, search, chip.slug)}
                    chip={chip}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Chip({ href, chip }: { href: string; chip: HighlightChip }) {
  return (
    <Link
      // Sin prefetch: abrir el panel recarga la página dinámica y son hasta 24 enlaces.
      prefetch={false}
      scroll={false}
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-2.5 pl-1 text-[13px] hover:bg-line"
    >
      {/* El nombre ya está en el texto del enlace: el retrato es decoración. */}
      <span aria-hidden="true" className="flex">
        <ChampionThumb
          championId={chip.championId}
          name={chip.name}
          portraitUrl={chip.portraitUrl}
          size="chip"
        />
      </span>
      <span>{chip.name}</span>
      <span className="text-muted-foreground">{chip.detail}</span>
    </Link>
  );
}
