import {
  Bomb,
  Feather,
  Flame,
  Heart,
  HeartCrack,
  Laugh,
  type LucideIcon,
  Swords,
} from "lucide-react";
import Link from "next/link";
import type { TitleId } from "@/domain/group-titles";
import { cn } from "@/lib/utils";
import { VitrinaLabel } from "./vitrina-ui";
import {
  TITLES_LINK,
  type TitleRow,
  titleCounts,
  titleLineText,
  titlesMinimumText,
} from "./vitrina-view";

// Bloque Títulos de la vitrina (propuesta C2, `.tlist`/`.trw`): una fila por título que lleva el
// miembro, en el orden de `TITLE_DEFINITIONS` (I8), con su icono (I9) en un círculo del tono
// (honor en turquesa, vergüenza en rosa apagado), el nombre sin periodo, las marcas HOY y SEM y el
// «por qué» de cada periodo escrito ("Hoy: …", "Semana: …", "con X y Y" en dúos y tríos). Sin
// títulos, los mínimos (I5). Es de servidor: las filas llegan ya agrupadas (`titleRows`).
//
// Rangos (container queries sobre `.app`): desde 700 px el «por qué» va en la misma línea que el
// nombre y se recorta (completo en `title`); por debajo baja a su propia línea y se lee entero.

const ICONS: Record<TitleId, LucideIcon> = {
  troll: Laugh,
  pacifist: Feather,
  devil: Flame,
  brokenTrio: Swords,
  boomTrio: Bomb,
  brokenDuo: Heart,
  boomDuo: HeartCrack,
};

const TONE = {
  honor: {
    row: "border-[color-mix(in_srgb,var(--honor)_22%,transparent)] bg-[linear-gradient(90deg,var(--honor-bg),transparent_85%)]",
    icon: "bg-honor",
    name: "text-honor",
    pip: "text-honor",
    pipOn: "bg-[color-mix(in_srgb,var(--honor)_16%,transparent)]",
  },
  shame: {
    row: "border-[color-mix(in_srgb,var(--shame)_22%,transparent)] bg-[linear-gradient(90deg,var(--shame-bg),transparent_85%)]",
    icon: "bg-shame",
    name: "text-shame",
    pip: "text-shame",
    pipOn: "bg-[color-mix(in_srgb,var(--shame)_16%,transparent)]",
  },
} as const;

export function TitleList({ rows }: { rows: readonly TitleRow[] }) {
  const counts = titleCounts(rows);
  return (
    <section
      aria-labelledby="vitrina-titulos"
      className="grid content-start gap-2.5 px-6 pt-[18px] pb-5 @max-[640px]:p-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <VitrinaLabel>
          <span id="vitrina-titulos">Títulos</span>
        </VitrinaLabel>
        <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-faint">
          <span>
            {rows.length > 0
              ? `${counts.honor} de honor · ${counts.shame} de vergüenza`
              : "hoy y esta semana"}
          </span>
          <Link
            href={TITLES_LINK.href}
            className="text-foreground underline decoration-line underline-offset-2 hover:decoration-foreground"
          >
            {TITLES_LINK.label}
          </Link>
        </span>
      </div>
      {rows.length > 0 ? (
        <ul className="grid gap-1">
          {rows.map((row) => (
            <TitleItem key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <div className="grid gap-1 rounded-[10px] border border-dashed border-line p-[18px] text-[13px] text-faint">
          <p className="font-medium text-muted-foreground">
            Sin títulos hoy ni esta semana.
          </p>
          <p>{titlesMinimumText()}</p>
        </div>
      )}
    </section>
  );
}

function TitleItem({ row }: { row: TitleRow }) {
  const tone = TONE[row.tone];
  const Icon = ICONS[row.id];
  const lines = [
    ...row.day.map((line) => titleLineText(line)),
    ...row.week.map((line) => titleLineText(line)),
  ];
  return (
    <li
      className={cn(
        "grid grid-cols-[30px_minmax(150px,auto)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg border py-1.5 pr-2.5 pl-1.5 @max-[700px]:grid-cols-[30px_minmax(0,1fr)_auto] @max-[700px]:gap-y-1",
        tone.row,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[30px] place-items-center rounded-full text-background",
          tone.icon,
        )}
      >
        <Icon size={16} />
      </span>
      <span
        className={cn(
          "font-display text-[17px] leading-none font-extrabold tracking-[0.03em] whitespace-nowrap uppercase @max-[700px]:whitespace-normal",
          tone.name,
        )}
      >
        {row.name}
      </span>
      {/* Las marcas repiten lo que dicen las líneas ("Hoy: …"): el lector de pantalla las salta. */}
      <span aria-hidden="true" className="inline-flex gap-[3px]">
        <Pip on={row.day.length > 0} tone={row.tone}>
          HOY
        </Pip>
        <Pip on={row.week.length > 0} tone={row.tone}>
          SEM
        </Pip>
      </span>
      <span className="grid min-w-0 text-[13px] text-muted-foreground @max-[700px]:col-[2/-1]">
        {lines.map((line) => (
          <span
            key={line}
            title={line}
            className="truncate @max-[700px]:whitespace-normal"
          >
            {line}
          </span>
        ))}
      </span>
    </li>
  );
}

function Pip({
  on,
  tone,
  children,
}: {
  on: boolean;
  tone: TitleRow["tone"];
  children: string;
}) {
  return (
    <i
      className={cn(
        "rounded-[3px] border px-1 py-[3px] font-mono text-[9px] leading-none font-medium tracking-[0.08em] not-italic",
        TONE[tone].pip,
        on ? TONE[tone].pipOn : "opacity-30",
      )}
    >
      {children}
    </i>
  );
}
