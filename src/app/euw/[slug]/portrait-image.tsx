"use client";

import Image from "next/image";

/**
 * La imagen del retrato, aparte de `ChampionThumb` porque lleva `onError` (un manejador de eventos
 * solo puede vivir en un componente cliente): así `ChampionThumb` también se puede pintar desde un
 * componente de servidor (la pestaña Estadísticas), sin convertirlo en cliente a él ni a su padre.
 */
export function PortraitImage({
  src,
  name,
}: {
  src: string;
  /** Nombre del campeón: `alt` y `title`. */
  name: string;
}) {
  return (
    <Image
      src={src}
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
  );
}
