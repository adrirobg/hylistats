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
  type TitleMate,
  type TitleMateLine,
  type TitleRow,
  titlesMinimumText,
} from "./vitrina-view";

// Bloque Títulos de la vitrina (revisión v4, `.titles`/`.tc`): a todo el ancho bajo el banner, una
// tarjeta por título que lleva el miembro, en el orden de `TITLE_DEFINITIONS` (I8), con su icono
// (I9) en un círculo del tono (honor en turquesa, vergüenza en rosa apagado) y el nombre con la
// métrica en pequeño ("más 1º juntos"). Manda el compañero: una línea por compañeros (o equipo),
// que empieza por sus chips (icono y nombre en negrita, enlazados a su perfil; "+" entre los del
// trío) y sigue con la marca HOY/SEM y el texto corto de cada periodo (el «por qué» completo en su
// `title`). Los individuales no llevan chips. Sin títulos, los mínimos (I5). Es de servidor: las
// filas llegan ya agrupadas (`titleRows`).
//
// Rangos (container queries sobre `.app`): dos columnas, una por debajo de 1000 px; por debajo de
// 640 px se ocultan la métrica y el texto de los periodos (quedan las marcas; el lector lo lee).

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
    card: "border-[color-mix(in_srgb,var(--honor)_22%,transparent)] bg-[linear-gradient(90deg,var(--honor-bg),transparent_90%)]",
    icon: "bg-honor",
    name: "text-honor",
    pip: "text-honor bg-[color-mix(in_srgb,var(--honor)_14%,transparent)]",
  },
  shame: {
    card: "border-[color-mix(in_srgb,var(--shame)_22%,transparent)] bg-[linear-gradient(90deg,var(--shame-bg),transparent_90%)]",
    icon: "bg-shame",
    name: "text-shame",
    pip: "text-shame bg-[color-mix(in_srgb,var(--shame)_14%,transparent)]",
  },
} as const;

const PERIOD = {
  day: { mark: "HOY", long: "Hoy" },
  week: { mark: "SEM", long: "Semana" },
} as const;

export function TitleList({ rows }: { rows: readonly TitleRow[] }) {
  return (
    <section
      aria-labelledby="vitrina-titulos"
      className="grid content-start gap-2.5 px-5 pt-3.5 pb-4 @max-[640px]:p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
        <VitrinaLabel>
          <span id="vitrina-titulos">Títulos</span>
        </VitrinaLabel>
        <Link
          href={TITLES_LINK.href}
          className="text-xs text-foreground underline decoration-line underline-offset-2 hover:decoration-foreground"
        >
          {TITLES_LINK.label}
        </Link>
      </div>
      {rows.length > 0 ? (
        <ul className="grid grid-cols-2 items-start gap-1.5 @max-[1000px]:grid-cols-1 @max-[640px]:gap-1">
          {rows.map((row) => (
            <TitleCard key={row.id} row={row} />
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

function TitleCard({ row }: { row: TitleRow }) {
  const tone = TONE[row.tone];
  const Icon = ICONS[row.id];
  return (
    <li
      className={cn(
        "grid grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5 rounded-lg border pt-[7px] pr-2.5 pb-2 pl-[7px] @max-[640px]:grid-cols-[26px_minmax(0,1fr)] @max-[640px]:gap-2 @max-[640px]:pt-1.5 @max-[640px]:pr-2 @max-[640px]:pb-[7px] @max-[640px]:pl-1.5",
        tone.card,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[30px] place-items-center rounded-full text-background @max-[640px]:size-[26px]",
          tone.icon,
        )}
      >
        <Icon className="size-4 @max-[640px]:size-3.5" />
      </span>
      <div className="grid min-w-0 gap-1">
        <h3 className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "font-display text-base leading-none font-extrabold tracking-[0.03em] whitespace-nowrap uppercase",
              tone.name,
            )}
          >
            {row.name}
          </span>
          <span className="min-w-0 truncate text-[11px] font-normal text-faint @max-[640px]:hidden">
            {row.metric}
          </span>
        </h3>
        {row.lines.map((line) => (
          <TitleLine
            key={line.mates.map((m) => m.slug).join("|") || "solo"}
            line={line}
            pip={tone.pip}
          />
        ))}
      </div>
    </li>
  );
}

function TitleLine({ line, pip }: { line: TitleMateLine; pip: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 @max-[640px]:gap-x-1.5 @max-[640px]:gap-y-1">
      {line.mates.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1">
          {line.mates.map((mate, i) => (
            <span key={mate.slug} className="inline-flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="text-xs text-faint">
                  +
                </span>
              )}
              <MateChip mate={mate} />
            </span>
          ))}
        </span>
      )}
      {line.periods.map((period) => (
        <span
          key={period.kind}
          title={period.why}
          className="inline-flex items-center gap-[5px] text-xs whitespace-nowrap text-muted-foreground"
        >
          <i
            aria-hidden="true"
            className={cn(
              "rounded-[3px] border px-1 py-[3px] font-mono text-[9px] leading-none font-medium tracking-[0.08em] not-italic",
              pip,
            )}
          >
            {PERIOD[period.kind].mark}
          </i>
          <span className="sr-only">{PERIOD[period.kind].long}: </span>
          <span className="@max-[640px]:sr-only">{period.text}</span>
        </span>
      ))}
    </div>
  );
}

/** Chip del compañero: icono de 18 px (sin él, la inicial) y nombre, enlazado a su perfil. */
function MateChip({ mate }: { mate: TitleMate }) {
  return (
    <Link
      href={`/euw/${mate.slug}`}
      // Sin prefetch: los perfiles son dinámicos y cada título puede llevar varios compañeros.
      prefetch={false}
      className="inline-flex items-center gap-[5px] rounded-full border border-white/10 bg-white/6 py-px pr-2 pl-0.5 text-[13px] font-bold whitespace-nowrap text-foreground hover:border-white/25"
    >
      <span
        aria-hidden="true"
        className="relative grid size-[18px] flex-none place-items-center overflow-hidden rounded-full bg-surface-2 font-display text-[10px] text-faint"
      >
        {mate.name.charAt(0)}
        {mate.iconUrl !== null && (
          // Fondo y no `<img>`: si no carga queda la inicial, sin manejador de cliente.
          <span
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(mate.iconUrl)})` }}
          />
        )}
      </span>
      {mate.name}
    </Link>
  );
}
