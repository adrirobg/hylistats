import Image from "next/image";
import type { CSSProperties } from "react";
import { CHIP_TEXT, placeTone, TONE_BG } from "@/domain/scoreboard";
import { cn } from "@/lib/utils";
import { initials } from "./view-model";

// Piezas que comparten la fila de una partida y su detalle 6×3 (y los destacados del Resumen): el
// retrato del campeón y el chip del puesto.

/** Tono estable por campeón para el degradado de las iniciales (`--h` de la maqueta). */
const hueOf = (championId: number) => (championId * 137) % 360;

const THUMB_SIZE = {
  // Fila de la lista (40 px; 36 en pantallas estrechas).
  row: "size-10 rounded-md text-sm @max-[640px]:size-9",
  // Jugador del detalle.
  player: "size-7 rounded text-[10px]",
  // Chip de los destacados del Resumen (22 px, redondo como el de la maqueta).
  chip: "size-[22px] rounded-full text-[9px]",
} as const;

/**
 * Retrato cuadrado del campeón. Debajo lleva las iniciales sobre un degradado: son el marcador
 * mientras carga la imagen y el retrato si no hay (catálogo caído o campeón ausente).
 */
export function ChampionThumb({
  championId,
  name,
  portraitUrl,
  size,
}: {
  championId: number;
  name: string;
  portraitUrl: string | null;
  size: keyof typeof THUMB_SIZE;
}) {
  return (
    <span
      style={{ "--h": hueOf(championId) } as CSSProperties}
      className={cn(
        "relative block flex-none overflow-hidden bg-[radial-gradient(120%_90%_at_30%_20%,hsl(var(--h)_45%_46%),hsl(calc(var(--h)_+_40)_40%_18%)_70%)]",
        THUMB_SIZE[size],
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center font-display font-extrabold text-white/90 [text-shadow:0_2px_8px_rgba(0,0,0,.4)]"
      >
        {initials(name)}
      </span>
      {portraitUrl && (
        <Image
          src={portraitUrl}
          alt={name}
          title={name}
          width={80}
          height={80}
          loading="lazy"
          draggable={false}
          // Si la imagen no llega (red, versión retirada) quedan las iniciales de debajo.
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

/**
 * Chip redondo con el puesto dentro, como los de la forma del raíl: 1º oro, 2º–3º verde agua,
 * 4º–6º pizarra (nunca rojo). El texto va oculto para que el número suelto no se lea sin contexto.
 */
export function PlaceChip({
  placement,
  className,
}: {
  placement: number;
  className?: string;
}) {
  const tone = placeTone(placement);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center rounded-full font-display leading-none font-extrabold",
        TONE_BG[tone],
        CHIP_TEXT[tone],
        className,
      )}
    >
      {placement}
    </span>
  );
}
