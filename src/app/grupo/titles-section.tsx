import { Box } from "@/components/hy/box";
import { TITLES_ANCHOR, titlesGuide } from "./group-view-model";

// Apartado "Títulos" (F21, P5): lista fija de los 7 títulos con qué mide cada uno, sus periodos y el
// mínimo, más las reglas comunes. Es el destino (`#titulos`) del enlace de la explicación de cada
// título. Todo el contenido sale de `titlesGuide()`, es decir, de `TITLE_DEFINITIONS`,
// `TITLE_RULES` y las constantes de `config.ts`: ninguna cifra escrita a mano.

export function TitlesSection() {
  const guide = titlesGuide();
  return (
    // `scroll-mt-4`: el ancla no pega el apartado al borde de la ventana.
    <section
      id={TITLES_ANCHOR}
      aria-labelledby="titulos-heading"
      className="scroll-mt-4"
    >
      <Box
        title={<span id="titulos-heading">Títulos</span>}
        hint="cómo se ganan"
        titleAs="h2"
      >
        <ul className="grid gap-2.5">
          {guide.titles.map((title) => (
            <li
              key={title.id}
              className="rounded-md border border-line bg-surface-2 px-3 py-2.5"
            >
              <p className="font-display text-[15px] font-bold tracking-[0.1em] text-place-1 uppercase">
                {title.name}
              </p>
              <dl className="mt-1 grid gap-0.5 text-sm">
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">Mide:</dt>
                  <dd>{title.measures}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">Periodos:</dt>
                  <dd>{title.periods.join(" · ")}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">Mínimo:</dt>
                  <dd>{title.minimum}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 mb-1.5 text-[13px] text-muted-foreground">
          Reglas comunes
        </h3>
        <ul className="grid list-disc gap-1 pl-5 text-sm marker:text-faint">
          {guide.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Box>
    </section>
  );
}
